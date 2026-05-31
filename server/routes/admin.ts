import { Router, Response } from 'express'
import db from '../db.js'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// 获取所有用户
router.get('/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.created_at,
             s.storage_type, s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all()
    res.json({ users })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 修改用户角色
router.put('/users/:id/role', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' })
    }

    const userId = parseInt(req.params.id)
    if (userId === req.userId && role !== 'admin') {
      return res.status(400).json({ error: '不能降级自己的管理员权限' })
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
    res.json({ message: '角色已更新' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除用户
router.delete('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id)
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能删除自己' })
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    res.json({ message: '用户已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
