import { Router, Response } from 'express'
import db from '../db'
import { getStorageByPoolId } from '../services/factory'
import { Request } from 'express'

const router = Router()

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
    const user = getUserByUsername(req.params.username)
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
      SELECT gs.id, gs.folder_path, gs.label, gs.created_at, sp.name as pool_name
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
    const user = getUserByUsername(req.params.username)
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
    const basePath = share.folder_path
    const fullPath = basePath ? (relativePath ? `${basePath}/${relativePath}` : basePath) : relativePath

    const files = await storage.list(fullPath)

    // 过滤路径前缀，返回给访客的是相对于 basePath 的路径
    const result = files.map(f => ({
      ...f,
      path: basePath ? f.path.replace(basePath + '/', '').replace(basePath, '') : f.path
    }))

    res.json({ files: result, owner: user.username, shareLabel: share.label })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客下载文件
router.get('/:username/:shareId/download', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username)
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

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const basePath = share.folder_path
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath
    const data = await storage.download(fullPath)
    const fileName = relativePath.split('/').pop() || 'download'

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
