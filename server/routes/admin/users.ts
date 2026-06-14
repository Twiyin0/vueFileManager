import { Router } from 'express'
import crypto from 'crypto'
import db, { syncStoragePoolsFromConfig } from '../../db'
import { authMiddleware, adminMiddleware, type AuthRequest } from '../../middleware/auth'
import { clearStorageCache } from '../../services/factory'
import { getUserQuota } from '../../services/quota'
import { sendServerError } from './shared'

const router = Router()

router.get('/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const users = await db.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.storage_quota, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all() as any[]

    const usersWithUsage = await Promise.all(users.map(async (user) => {
      const quota = await getUserQuota(user.id)
      return { ...user, storage_used: quota.used }
    }))

    res.json({ users: usersWithUsage })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to load admin user list' })
  }
})

router.get('/users/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id)
    const user = await db.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(userId) as any

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const pools = (await db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(userId) as any[]).map((pool: any) => {
      const cfg = JSON.parse(pool.config || '{}')
      delete cfg.upyunPassword
      delete cfg.ftpPassword
      delete cfg.s3SecretAccessKey
      delete cfg.sftpPassword
      delete cfg.sftpPrivateKey
      return {
        id: pool.id,
        name: pool.name,
        storageType: pool.storage_type,
        isDefault: !!pool.is_default,
        config: cfg,
        createdAt: pool.created_at
      }
    })

    const trashCount = (await db.prepare('SELECT COUNT(*) as c FROM trash WHERE user_id = ?').get(userId) as any).c
    const favCount = (await db.prepare('SELECT COUNT(*) as c FROM favourites WHERE user_id = ?').get(userId) as any).c
    const shareCount = (await db.prepare('SELECT COUNT(*) as c FROM shares WHERE user_id = ?').get(userId) as any).c
    const apiKeyCount = (await db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?').get(userId) as any).c
    const quota = await getUserQuota(userId)

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        verified: !!user.verified,
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
        stats: { trashCount, favCount, shareCount, apiKeyCount },
        storage: { quota: quota.quota, used: quota.used, remaining: quota.remaining }
      }
    })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to load admin user detail' })
  }
})

router.post('/users', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { username, password, role } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在 3 到 20 个字符之间' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }
    if (role && !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' })
    }

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const result = await db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
      username,
      hashedPassword,
      role || 'user'
    )

    const userId = result.lastInsertRowid as number
    await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId)
    await syncStoragePoolsFromConfig(userId)

    res.json({
      message: '用户创建成功',
      user: { id: userId, username, role: role || 'user' }
    })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to create admin user' })
  }
})

router.put('/users/:id/role', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { role } = req.body
    const userId = Number(req.params.id)

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' })
    }
    if (userId === req.userId && role !== 'admin') {
      return res.status(400).json({ error: '不能降低自己的管理员权限' })
    }

    await db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
    res.json({ message: '角色已更新' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to update user role' })
  }
})

router.put('/users/:id/ban', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id)
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能封禁自己' })
    }

    const user = await db.prepare('SELECT banned, role FROM users WHERE id = ?').get(userId) as any
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: '不能封禁管理员账号' })
    }

    const newBanned = user.banned ? 0 : 1
    await db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(newBanned, userId)
    res.json({ message: newBanned ? '用户已封禁' : '用户已解封', banned: !!newBanned })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to update user ban status' })
  }
})

router.put('/users/:id/password', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { password } = req.body
    const userId = Number(req.params.id)

    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }

    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId)
    res.json({ message: '密码已重置' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to reset user password' })
  }
})

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id)
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能删除自己' })
    }

    await db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    clearStorageCache(userId)
    res.json({ message: '用户已删除' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to delete user' })
  }
})

router.put('/users/:id/quota', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id)
    const rawQuota = req.body?.quota ?? (typeof req.body?.quotaMB !== 'undefined' ? Number(req.body.quotaMB) * 1024 * 1024 : undefined)
    const quota = typeof rawQuota === 'string' ? Number(rawQuota) : rawQuota

    if (typeof quota !== 'number' || !Number.isFinite(quota) || quota < 0) {
      return res.status(400).json({ error: '配额值无效' })
    }

    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    await db.prepare('UPDATE users SET storage_quota = ? WHERE id = ?').run(quota, userId)
    res.json({ message: '配额已更新', quota })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to update user quota' })
  }
})

router.put('/users/:id/verify', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.params.id)
    const user = await db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    await db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(userId)
    res.json({ message: '用户已验证' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'users.ts', message: 'Failed to verify user' })
  }
})

export default router
