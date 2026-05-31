import { Router, Response } from 'express'
import db from '../db.js'
import { getGuestStorage } from '../services/factory.js'
import { Request } from 'express'

const router = Router()

// 获取用户信息（根据用户名）
function getUserByUsername(username: string) {
  return db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as any
}

// 访客文件列表
router.get('/:username/list', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const guestConfig = getGuestStorage(user.id)
    if (!guestConfig) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const { storage, basePath } = guestConfig
    const relativePath = (req.query.path as string) || ''
    const fullPath = basePath ? (relativePath ? `${basePath}/${relativePath}` : basePath) : relativePath

    const files = await storage.list(fullPath)

    // 过滤路径前缀，返回给访客的是相对于 basePath 的路径
    const result = files.map(f => ({
      ...f,
      path: basePath ? f.path.replace(basePath + '/', '').replace(basePath, '') : f.path
    }))

    res.json({ files: result, owner: user.username })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访客下载文件
router.get('/:username/download', async (req: Request, res: Response) => {
  try {
    const user = getUserByUsername(req.params.username)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const guestConfig = getGuestStorage(user.id)
    if (!guestConfig) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const { storage, basePath } = guestConfig
    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

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

// 获取所有开启访客模式的用户列表
router.get('/', (req: Request, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.username
      FROM users u
      JOIN user_settings s ON u.id = s.user_id
      WHERE s.guest_enabled = 1
    `).all()
    res.json({ users })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
