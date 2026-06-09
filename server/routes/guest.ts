import { Router, Response } from 'express'
import multer from 'multer'
import db from '../db'
import { getStorageByPoolId } from '../services/factory'
import config from '../config'
import { Request } from 'express'

const router = Router()

// MIME 类型映射（与 public.ts 一致）
const mimeTypes: Record<string, string> = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
  'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
  'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
  'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
  'pdf': 'application/pdf',
  'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
  'js': 'text/javascript', 'ts': 'text/typescript', 'html': 'text/html',
  'css': 'text/css', 'xml': 'text/xml', 'yaml': 'text/yaml', 'yml': 'text/yml',
  'py': 'text/x-python', 'java': 'text/x-java', 'go': 'text/x-go',
  'rs': 'text/x-rust', 'vue': 'text/x-vue', 'sh': 'text/x-shellscript',
}

// multer 配置
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.upload_limit * 1024 * 1024 } })

// 权限别名映射：高级权限包含低级权限
const permissionAliases: Record<string, string[]> = {
  read: ['preview', 'download'],
  write: ['upload'],
  edit: ['rename'],
}

// 权限检查（支持别名：read 包含 preview/download，write 包含 upload，edit 包含 rename）
function hasPermission(permissions: string, action: string): boolean {
  if (!permissions) return false
  const perms = permissions.split(',').map(s => s.trim())
  if (perms.includes(action)) return true
  // 检查别名：如果请求的 action 是某个高级权限的别名
  for (const [parent, aliases] of Object.entries(permissionAliases)) {
    if (aliases.includes(action) && perms.includes(parent)) return true
  }
  return false
}

// 安全检查：防止路径越权
function isPathSafe(targetPath: string): boolean {
  if (!targetPath) return true
  if (/\.\./.test(targetPath)) return false
  return true
}

// 获取用户信息（根据用户名）
function getUserByUsername(username: string) {
  return db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as any
}

// 获取所有有访客分享的用户列表
router.get('/', (req: Request, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.username, COUNT(gs.id) as share_count
      FROM users u
      JOIN user_settings s ON u.id = s.user_id
      JOIN guest_shares gs ON u.id = gs.user_id
      WHERE s.guest_enabled = 1
      GROUP BY u.id
    `).all()
    res.json({ users })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取用户的访客文件夹列表
router.get('/:username/list', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 检查访客模式是否开启
    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    // 获取该用户的所有访客分享
    const shares = db.prepare(`
      SELECT gs.id, gs.folder_path, gs.label, gs.permissions, gs.created_at, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.user_id = ?
      ORDER BY gs.created_at DESC
    `).all(user.id)

    res.json({ shares, owner: user.username })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 列出某个分享文件夹内的文件
router.get('/:username/:shareId/list', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 检查访客模式是否开启
    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    // 获取分享记录
    const share = db.prepare(`
      SELECT gs.*, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.id = ? AND gs.user_id = ?
    `).get(req.params.shareId, user.id) as any

    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const relativePath = (req.query.path as string) || ''
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? (relativePath ? `${basePath}/${relativePath}` : basePath) : relativePath

    const files = await storage.list(fullPath)

    // 过滤路径前缀，返回给访客的是相对于 basePath 的路径
    const prefix = basePath ? basePath + '/' : ''
    const result = files
      .filter(f => !/^\._/.test(f.name) && f.name !== '.DS_Store')
      .map(f => ({
        ...f,
        path: prefix ? (f.path.startsWith(prefix) ? f.path.slice(prefix.length) : f.path) : f.path
      }))

    res.json({ files: result, owner: user.username, shareLabel: share.label, permissions: share.permissions })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客预览文件
router.get('/:username/:shareId/preview', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'preview')) {
      return res.status(403).json({ error: '该分享未开启预览权限' })
    }

    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath

    // 获取文件信息确认是文件
    const fileInfo = await storage.info(fullPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: '不支持预览文件夹' })
    }

    const data = await storage.download(fullPath)
    const ext = relativePath.split('.').pop()?.toLowerCase() || ''
    const fileName = relativePath.split('/').pop() || 'file'

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Cache-Control', 'public, max-age=3600')

    res.send(data)
  } catch (err: any) {
    if (err.message === '文件不存在' || err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

// 访客下载文件
router.get('/:username/:shareId/download', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'download')) {
      return res.status(403).json({ error: '该分享未开启下载权限' })
    }

    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath
    const data = await storage.download(fullPath)
    const fileName = relativePath.split('/').pop() || 'download'

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    if (err.message === '文件不存在' || err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

// 访客上传文件
router.post('/:username/:shareId/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'upload')) {
      return res.status(403).json({ error: '该分享未开启上传权限' })
    }

    if (!req.file) {
      return res.status(400).json({ error: '缺少文件' })
    }

    // 过滤 macOS 系统文件
    if (/^\._/.test(req.file.originalname) || req.file.originalname === '.DS_Store') {
      return res.status(400).json({ error: '不支持的文件类型' })
    }

    const dirPath = (req.body.dirPath as string) || ''
    if (dirPath && !isPathSafe(dirPath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const normalizedName = req.file.originalname.normalize('NFC')
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const filePath = basePath
      ? (dirPath ? `${basePath}/${dirPath}/${normalizedName}` : `${basePath}/${normalizedName}`)
      : (dirPath ? `${dirPath}/${normalizedName}` : normalizedName)

    await storage.upload(filePath, req.file.buffer)

    const relativePath = basePath ? filePath.replace(basePath + '/', '').replace(basePath, '') : filePath
    res.json({ message: '上传成功', path: relativePath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客编辑文件内容
router.post('/:username/:shareId/write', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'edit')) {
      return res.status(403).json({ error: '该分享未开启编辑权限' })
    }

    const { path: filePath, content } = req.body
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: '缺少文件路径或内容' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    // 限制内容大小 10MB
    if (content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '文件内容不能超过 10MB' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath

    // 上传新内容
    await storage.upload(fullPath, Buffer.from(content, 'utf-8'))

    res.json({ success: true, path: filePath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客删除文件
router.post('/:username/:shareId/delete', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'delete')) {
      return res.status(403).json({ error: '该分享未开启删除权限' })
    }

    const { path: filePath } = req.body
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath

    // 获取文件信息
    const stat = await storage.info(fullPath).catch(() => ({ type: 'file' as const }))
    const fileName = filePath.split('/').pop() || filePath

    // 移入回收站（标注访客删除）
    const trashPath = `/.trash/${fileName}_${Date.now()}`
    try {
      const data = await storage.download(fullPath)
      await storage.upload(trashPath, data)
    } catch {}
    db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(user.id, fullPath, fileName, stat.type, share.storage_pool_id, `访客: ${req.params.username}`)

    await storage.remove(fullPath)

    res.json({ message: '删除成功' })
  } catch (err: any) {
    if (err.message === '文件不存在' || err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

// 访客创建文件夹
router.post('/:username/:shareId/mkdir', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'upload')) {
      return res.status(403).json({ error: '该分享未开启写入权限' })
    }

    const { path: dirPath } = req.body
    if (!dirPath) {
      return res.status(400).json({ error: '缺少文件夹路径' })
    }

    if (!isPathSafe(dirPath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${dirPath}` : dirPath

    await storage.mkdir(fullPath)

    res.json({ message: '创建成功', path: dirPath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客重命名文件
router.post('/:username/:shareId/rename', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const settings = db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(user.id) as any
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const share = db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(req.params.shareId, user.id) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    if (!hasPermission(share.permissions, 'rename')) {
      return res.status(403).json({ error: '该分享未开启重命名权限' })
    }

    const { path: filePath, newName: rawNewName } = req.body
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: '缺少文件路径或新名称' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    const newName = rawNewName.normalize('NFC')

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath

    await storage.rename(fullPath, newName)

    res.json({ message: '重命名成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
