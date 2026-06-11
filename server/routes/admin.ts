import { Router, Response } from 'express'
import crypto from 'crypto'
import db, { syncStoragePoolsFromConfig } from '../db'
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'
import config, { updateConfigFile } from '../config'
import { getUserQuota } from '../services/quota'
import { getDatabaseStatus, testDatabaseConnection } from '../services/database'

const router = Router()

router.get('/users', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  try {
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.storage_quota, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all() as any[]

    const usersWithUsage = users.map((user) => {
      const quota = getUserQuota(user.id)
      return { ...user, storage_used: quota.used }
    })

    res.json({ users: usersWithUsage })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id)
    const user = db.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(userId) as any

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const pools = db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(userId).map((pool: any) => {
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

    const trashCount = (db.prepare('SELECT COUNT(*) as c FROM trash WHERE user_id = ?').get(userId) as any).c
    const favCount = (db.prepare('SELECT COUNT(*) as c FROM favourites WHERE user_id = ?').get(userId) as any).c
    const shareCount = (db.prepare('SELECT COUNT(*) as c FROM shares WHERE user_id = ?').get(userId) as any).c
    const apiKeyCount = (db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?').get(userId) as any).c
    const quota = getUserQuota(userId)

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
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/users', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
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

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const result = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(
      username,
      hashedPassword,
      role || 'user'
    )

    const userId = result.lastInsertRowid as number
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId)
    syncStoragePoolsFromConfig(userId)

    res.json({
      message: '用户创建成功',
      user: { id: userId, username, role: role || 'user' }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/users/:id/role', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body
    const userId = Number(req.params.id)

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' })
    }
    if (userId === req.userId && role !== 'admin') {
      return res.status(400).json({ error: '不能降低自己的管理员权限' })
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId)
    res.json({ message: '角色已更新' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/users/:id/ban', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id)
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

router.put('/users/:id/password', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body
    const userId = Number(req.params.id)

    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }

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

router.delete('/users/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id)
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

router.put('/users/:id/quota', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id)
    const { quota } = req.body

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

router.put('/users/:id/verify', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const userId = Number(req.params.id)
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(userId)
    res.json({ message: '用户已验证' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/

function isValidIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false
  return ip.split('.').every(part => {
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function isValidIpPattern(pattern: string): boolean {
  const value = pattern.trim()
  if (CIDR_RE.test(value)) {
    const [ip, mask] = value.split('/')
    const maskNum = Number(mask)
    return maskNum >= 0 && maskNum <= 32 && isValidIpv4(ip)
  }
  return isValidIpv4(value)
}

function getIpTableName() {
  const row = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
  return row?.mode === 'whitelist' ? 'ip_whitelist' : 'ip_blacklist'
}

router.get('/ip-blacklist', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
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

router.post('/ip-blacklist', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const { ip_pattern, reason } = req.body

    if (!ip_pattern || !isValidIpPattern(ip_pattern)) {
      return res.status(400).json({ error: '无效的 IP 或 CIDR 格式' })
    }

    const existing = db.prepare(`SELECT id FROM ${table} WHERE ip_pattern = ?`).get(ip_pattern.trim())
    if (existing) {
      return res.status(409).json({ error: '该 IP 或网段已存在' })
    }

    const result = db.prepare(`INSERT INTO ${table} (ip_pattern, reason, created_by) VALUES (?, ?, ?)`).run(
      ip_pattern.trim(),
      reason || '',
      req.userId
    )

    res.json({
      message: 'IP 条目添加成功',
      entry: { id: result.lastInsertRowid, ip_pattern: ip_pattern.trim(), reason: reason || '' }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/ip-blacklist/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const id = Number(req.params.id)
    const entry = db.prepare(`SELECT id, ip_pattern FROM ${table} WHERE id = ?`).get(id) as any

    if (!entry) {
      return res.status(404).json({ error: '条目不存在' })
    }

    const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (configRow?.mode === 'whitelist' && entry.ip_pattern === '127.0.0.1') {
      return res.status(400).json({ error: '白名单模式下不能删除 127.0.0.1' })
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    res.json({ message: 'IP 条目已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/ip-list/mode', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  try {
    const row = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    res.json({ mode: row?.mode || 'blacklist' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/ip-list/mode', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { mode } = req.body
    if (!['blacklist', 'whitelist'].includes(mode)) {
      return res.status(400).json({ error: '仅支持 blacklist 或 whitelist' })
    }

    const current = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (current?.mode === mode) {
      return res.json({ message: '模式未变化', mode })
    }

    db.prepare('UPDATE ip_list_config SET mode = ? WHERE id = 1').run(mode)

    if (mode === 'whitelist') {
      const defaults = [
        { ip: '127.0.0.1', reason: '本地回环地址' },
        { ip: '::1', reason: 'IPv6 本地回环' },
        { ip: 'localhost', reason: '本地主机名' }
      ]
      const existing = new Set((db.prepare('SELECT ip_pattern FROM ip_whitelist').all() as { ip_pattern: string }[]).map(row => row.ip_pattern))
      const insert = db.prepare('INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)')
      for (const item of defaults) {
        if (!existing.has(item.ip)) {
          insert.run(item.ip, item.reason, req.userId)
        }
      }
    }

    res.json({ message: `已切换为 ${mode} 模式`, mode })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/upload-limit', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({ upload_limit: config.upload_limit })
})

router.put('/upload-limit', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const { upload_limit } = req.body
  if (typeof upload_limit !== 'number' || upload_limit < 1 || upload_limit > 10240) {
    return res.status(400).json({ error: '上传限制必须在 1 到 10240 MB 之间' })
  }

  config.upload_limit = upload_limit
  updateConfigFile((rawConfig) => {
    rawConfig.upload_limit = upload_limit
  })

  res.json({ upload_limit, message: '上传限制已更新，重启后完全生效' })
})

router.get('/database', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  res.json({
    database: {
      type: config.database.type,
      sqlite: { ...config.database.sqlite },
      mysql: { ...config.database.mysql, password: config.database.mysql.password ? '******' : '' },
      postgres: { ...config.database.postgres, password: config.database.postgres.password ? '******' : '' }
    },
    status: getDatabaseStatus()
  })
})

router.put('/database', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  const payload = req.body?.database
  if (!payload || !['sqlite', 'mysql', 'postgres'].includes(payload.type)) {
    return res.status(400).json({ error: '无效的数据库配置' })
  }

  const nextDatabase = {
    type: payload.type,
    sqlite: {
      path: payload.sqlite?.path || config.database.sqlite.path
    },
    mysql: {
      host: payload.mysql?.host || config.database.mysql.host,
      port: Number(payload.mysql?.port || config.database.mysql.port),
      user: payload.mysql?.user || config.database.mysql.user,
      password: payload.mysql?.password === '******' ? config.database.mysql.password : (payload.mysql?.password ?? ''),
      database: payload.mysql?.database || config.database.mysql.database,
      ssl: !!payload.mysql?.ssl
    },
    postgres: {
      host: payload.postgres?.host || config.database.postgres.host,
      port: Number(payload.postgres?.port || config.database.postgres.port),
      user: payload.postgres?.user || config.database.postgres.user,
      password: payload.postgres?.password === '******' ? config.database.postgres.password : (payload.postgres?.password ?? ''),
      database: payload.postgres?.database || config.database.postgres.database,
      ssl: !!payload.postgres?.ssl
    }
  }

  updateConfigFile((rawConfig) => {
    rawConfig.database = nextDatabase
  })

  res.json({
    message: '数据库配置已保存，重启后会按新配置加载',
    status: getDatabaseStatus()
  })
})

router.post('/database/test', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const payload = req.body?.database || config.database
    const database = {
      type: payload.type,
      sqlite: {
        path: payload.sqlite?.path || config.database.sqlite.path
      },
      mysql: {
        host: payload.mysql?.host || config.database.mysql.host,
        port: Number(payload.mysql?.port || config.database.mysql.port),
        user: payload.mysql?.user || config.database.mysql.user,
        password: payload.mysql?.password === '******' ? config.database.mysql.password : (payload.mysql?.password ?? ''),
        database: payload.mysql?.database || config.database.mysql.database,
        ssl: !!payload.mysql?.ssl
      },
      postgres: {
        host: payload.postgres?.host || config.database.postgres.host,
        port: Number(payload.postgres?.port || config.database.postgres.port),
        user: payload.postgres?.user || config.database.postgres.user,
        password: payload.postgres?.password === '******' ? config.database.postgres.password : (payload.postgres?.password ?? ''),
        database: payload.postgres?.database || config.database.postgres.database,
        ssl: !!payload.postgres?.ssl
      }
    } as typeof config.database

    const result = await testDatabaseConnection(database)
    res.json({
      ...result,
      status: database.type === 'sqlite'
        ? getDatabaseStatus()
        : {
            ...getDatabaseStatus(),
            type: database.type,
            message: `${result.message}。当前业务数据仍运行在 SQLite，完整切换还需要迁移数据访问层。`
          }
    })
  } catch (err: any) {
    res.json({ success: false, message: err.message })
  }
})

export default router
