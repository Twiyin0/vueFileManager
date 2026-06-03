import { Router, Response } from 'express'
import crypto from 'crypto'
import db, { syncStoragePoolsFromConfig } from '../db'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'

const router = Router()

// 获取所有用户
router.get('/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all()
    res.json({ users })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取单个用户详情
router.get('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id)
    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(userId) as any

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 获取用户的存储池
    const pools = db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(userId).map((p: any) => ({
      id: p.id,
      name: p.name,
      storageType: p.storage_type,
      isDefault: !!p.is_default,
      config: (() => { const c = JSON.parse(p.config); delete c.upyunPassword; return c })(),
      createdAt: p.created_at
    }))

    // 统计
    const trashCount = (db.prepare('SELECT COUNT(*) as c FROM trash WHERE user_id = ?').get(userId) as any).c
    const favCount = (db.prepare('SELECT COUNT(*) as c FROM favourites WHERE user_id = ?').get(userId) as any).c
    const shareCount = (db.prepare('SELECT COUNT(*) as c FROM shares WHERE user_id = ?').get(userId) as any).c
    const apiKeyCount = (db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?').get(userId) as any).c

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        banned: !!user.banned,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme
        },
        pools,
        stats: { trashCount, favCount, shareCount, apiKeyCount }
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 创建用户
router.post('/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { username, password, role } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在 3-20 之间' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' })
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const result = db.prepare(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
    ).run(username, hashedPassword, role || 'user')

    const userId = result.lastInsertRowid as number
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId)

    // 同步配置文件中的存储池
    syncStoragePoolsFromConfig(userId)

    res.json({
      message: '用户创建成功',
      user: { id: userId, username, role: role || 'user' }
    })
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

// 封禁/解封用户
router.put('/users/:id/ban', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id)
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能封禁自己' })
    }

    const user = db.prepare('SELECT banned FROM users WHERE id = ?').get(userId) as any
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const newBanned = user.banned ? 0 : 1
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(newBanned, userId)

    res.json({ message: newBanned ? '用户已封禁' : '用户已解封', banned: !!newBanned })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 重置用户密码
router.put('/users/:id/password', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }

    const userId = parseInt(req.params.id)
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId)

    res.json({ message: '密码已重置' })
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
    clearStorageCache(userId)

    res.json({ message: '用户已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
