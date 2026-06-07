import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db, { syncStoragePoolsFromConfig } from '../db'
import config from '../config'
import { generateToken, AuthRequest, getClientIp } from '../middleware/auth'
import { sendVerificationCode, verifyCode } from '../services/mail'

const JWT_SECRET = config.server.jwt_secret

const router = Router()

// 发送注册验证码
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    if (!config.smtp.enabled) {
      return res.status(400).json({ error: '邮箱注册未启用' })
    }

    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' })
    }

    // 检查邮箱是否已被注册
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return res.status(409).json({ error: '该邮箱已被注册' })
    }

    await sendVerificationCode(email)
    res.json({ message: '验证码已发送' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, email, code } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在 3-20 之间' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }

    // SMTP 启用时必须验证邮箱
    if (config.smtp.enabled) {
      if (!email || !code) {
        return res.status(400).json({ error: '请输入邮箱和验证码' })
      }
      if (!verifyCode(email, code)) {
        return res.status(400).json({ error: '验证码无效或已过期' })
      }
    }

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    // 检查邮箱是否已被注册
    if (email) {
      const emailExists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (emailExists) {
        return res.status(409).json({ error: '该邮箱已被注册' })
      }
    }

    // 使用 MD5 哈希密码
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const ip = getClientIp(req)
    // SMTP 启用且有验证码时已验证，否则默认已验证（SMTP 未启用不需要验证）
    const verified = (config.smtp.enabled && email && code) ? 1 : (config.smtp.enabled ? 0 : 1)

    const result = db.prepare(
      'INSERT INTO users (username, password, email, verified, register_ip, last_login_ip) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, email || null, verified, ip, ip)

    // 创建默认设置
    const userId = result.lastInsertRowid as number
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId)

    // 从配置文件同步存储池
    syncStoragePoolsFromConfig(userId)

    const token = generateToken(userId)

    res.json({
      message: '注册成功',
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        role: 'user'
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 登录
router.post('/login', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    // 使用 MD5 验证密码
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    if (hashedPassword !== user.password) {
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    // 检查账号是否被封禁
    if (user.banned) {
      return res.status(403).json({ error: '账号已被封禁' })
    }

    // 检查邮箱验证状态
    if (config.smtp.enabled && !user.verified) {
      return res.status(403).json({ error: '账号未验证，请等待管理员验证或检查邮箱验证码' })
    }

    // 更新最后登录 IP 和时间
    const ip = getClientIp(req)
    db.prepare('UPDATE users SET last_login_ip = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(ip, user.id)

    const token = generateToken(user.id)

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取当前用户信息
router.get('/me', (req: AuthRequest, res: Response) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: '未登录' })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }

    // 检查封禁
    const banCheck = db.prepare('SELECT banned FROM users WHERE id = ?').get(decoded.userId) as any
    if (banCheck?.banned) {
      return res.status(403).json({ error: '账号已被封禁' })
    }

    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(decoded.userId) as any

    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme
        }
      }
    })
  } catch (err: any) {
    res.status(401).json({ error: 'Token 无效' })
  }
})

export default router
