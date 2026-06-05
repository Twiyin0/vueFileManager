import { Router, Response } from 'express'
import multer from 'multer'
import db from '../db'
import { getStorageByPoolId } from '../services/factory'
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
const upload = multer({ storage: multer.memoryStorage() })

// 权限检查
function hasPermission(permissions: string, action: string): boolean {
  if (!permissions) return false
  return permissions.split(',').map(s => s.trim()).includes(action)
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
    const result = files
      .filter(f => !/^\._/.test(f.name) && f.name !== '.DS_Store')
      .map(f => ({
        ...f,
        path: basePath ? f.path.replace(basePath + '/', '').replace(basePath, '') : f.path
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

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const filePath = basePath
      ? (dirPath ? `${basePath}/${dirPath}/${req.file.originalname}` : `${basePath}/${req.file.originalname}`)
      : (dirPath ? `${dirPath}/${req.file.originalname}` : req.file.originalname)

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

export default router
