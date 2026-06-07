import { Router, Response } from 'express'
import crypto from 'crypto'
import db, { syncStoragePoolsFromConfig } from '../db'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'
import { getUserQuota } from '../services/quota'

const router = Router()

// 获取所有用户
router.get('/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.storage_quota, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all() as any[]

    // 计算每个用户的存储用量
    const usersWithUsage = users.map(u => {
      const quota = getUserQuota(u.id)
      return { ...u, storage_used: quota.used }
    })

    res.json({ users: usersWithUsage })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取单个用户详情
router.get('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string)
    const user = db.prepare(`
      SELECT u.id, u.username, u.email, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
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

    // 存储配额
    const quota = getUserQuota(userId)

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        banned: !!user.banned,
        verified: !!user.verified,
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

    const userId = parseInt(req.params.id as string)
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
    const userId = parseInt(req.params.id as string)
    if (userId === req.userId) {
      return res.status(400).json({ error: '不能封禁自己' })
    }

    const user = db.prepare('SELECT banned, role FROM users WHERE id = ?').get(userId) as any
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: '不能封禁管理员账户' })
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

    const userId = parseInt(req.params.id as string)
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
    const userId = parseInt(req.params.id as string)
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

// ============ 用户验证 ============

// 调整用户存储配额
router.put('/users/:id/quota', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string)
    const { quota } = req.body // 字节数

    if (typeof quota !== 'number' || quota < 0) {
      return res.status(400).json({ error: '配额值无效' })
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    db.prepare('UPDATE users SET storage_quota = ? WHERE id = ?').run(quota, userId)
    res.json({ message: '配额已更新', quota })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 手动验证用户（SMTP 无法收取验证码时管理员手动验证）
router.put('/users/:id/verify', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string)
    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(userId)
    res.json({ message: '用户已验证' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ============ IP 黑名单 ============

// IPv4 格式校验
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/

function isValidIpPattern(pattern: string): boolean {
  const p = pattern.trim()
  if (CIDR_RE.test(p)) {
    const [ip, mask] = p.split('/')
    const maskNum = parseInt(mask, 10)
    if (maskNum < 0 || maskNum > 32) return false
    return isValidIpv4(ip)
  }
  return isValidIpv4(p)
}

function isValidIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false
  return ip.split('.').every(p => {
    const n = parseInt(p, 10)
    return n >= 0 && n <= 255
  })
}

// 获取当前模式对应的表名
function getIpTableName(): string {
  const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
  return configRow?.mode === 'whitelist' ? 'ip_whitelist' : 'ip_blacklist'
}

// 查询 IP 列表
router.get('/ip-blacklist', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const entries = db.prepare(`
      SELECT t.*, u.username as created_by_name
      FROM ${table} t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `).all()
    res.json({ entries })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 添加 IP 条目
router.post('/ip-blacklist', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const { ip_pattern, reason } = req.body
    if (!ip_pattern || !isValidIpPattern(ip_pattern)) {
      return res.status(400).json({ error: '无效的 IP 地址或 CIDR 网段格式' })
    }

    const existing = db.prepare(`SELECT id FROM ${table} WHERE ip_pattern = ?`).get(ip_pattern.trim())
    if (existing) {
      return res.status(409).json({ error: '该 IP/网段已在列表中' })
    }

    const result = db.prepare(
      `INSERT INTO ${table} (ip_pattern, reason, created_by) VALUES (?, ?, ?)`
    ).run(ip_pattern.trim(), reason || '', req.userId)

    res.json({
      message: 'IP 添加成功',
      entry: { id: result.lastInsertRowid, ip_pattern: ip_pattern.trim(), reason: reason || '' }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除 IP 条目
router.delete('/ip-blacklist/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const id = parseInt(req.params.id as string)
    const entry = db.prepare(`SELECT id, ip_pattern FROM ${table} WHERE id = ?`).get(id) as any
    if (!entry) {
      return res.status(404).json({ error: '条目不存在' })
    }

    // 白名单模式下 127.0.0.1 不可删除
    const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (configRow?.mode === 'whitelist' && entry.ip_pattern === '127.0.0.1') {
      return res.status(400).json({ error: '127.0.0.1 在白名单模式下不可删除' })
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    res.json({ message: 'IP 条目已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取 IP 列表模式
router.get('/ip-list/mode', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    res.json({ mode: configRow?.mode || 'blacklist' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 切换 IP 列表模式
router.put('/ip-list/mode', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { mode } = req.body
    if (!['blacklist', 'whitelist'].includes(mode)) {
      return res.status(400).json({ error: '无效的模式，仅支持 blacklist 或 whitelist' })
    }

    const current = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (current?.mode === mode) {
      return res.json({ message: '模式未变更', mode })
    }

    db.prepare('UPDATE ip_list_config SET mode = ? WHERE id = 1').run(mode)

    // 切换到白名单时，自动补缺本地默认 IP 到 ip_whitelist
    if (mode === 'whitelist') {
      const defaults = [
        { ip: '127.0.0.1', reason: '本地回环地址' },
        { ip: '::1', reason: 'IPv6 本地回环' },
        { ip: 'localhost', reason: '本地主机名' }
      ]
      const existing = new Set(
        (db.prepare('SELECT ip_pattern FROM ip_whitelist').all() as { ip_pattern: string }[]).map(r => r.ip_pattern)
      )
      const insert = db.prepare('INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)')
      for (const d of defaults) {
        if (!existing.has(d.ip)) {
          insert.run(d.ip, d.reason, req.userId)
        }
      }
    }

    res.json({ message: `已切换为${mode === 'whitelist' ? '白名单' : '黑名单'}模式`, mode })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
