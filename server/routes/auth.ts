import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db, { syncStoragePoolsFromConfig } from '../db'
import config from '../config'
import { generateToken, type AuthRequest, getClientIp, authMiddleware } from '../middleware/auth'
import { Logger } from '../services/logger'
import { sendVerificationCode, verifyCode } from '../services/mail'
import { getRequestTranslator } from '../services/server-i18n'
import { sendServerError } from './admin/shared'

const JWT_SECRET = config.server.jwt_secret
const router = Router()

function normalizeLanguage(language: unknown) {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function getDefaultLanguage() {
  return normalizeLanguage(config.default_language)
}

router.post('/send-code', async (req: Request, res: Response) => {
  const t = getRequestTranslator(req)
  try {
    if (!config.smtp.enabled) {
      return res.status(400).json({ error: t('邮箱注册未启用') })
    }

    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: t('邮箱不能为空') })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: t('邮箱格式不正确') })
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return res.status(409).json({ error: t('该邮箱已被注册') })
    }

    await sendVerificationCode(email)
    res.json({ message: t('验证码已发送') })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'auth.ts',
      message: 'Failed to send verification code',
      context: { email: req.body?.email }
    })
  }
})

router.post('/register', async (req: Request, res: Response) => {
  const t = getRequestTranslator(req)
  try {
    const { username, password, email, code } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: t('用户名和密码不能为空') })
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: t('用户名长度需在 3-20 之间') })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: t('密码长度不能少于 6 位') })
    }

    if (config.smtp.enabled) {
      if (!email || !code) {
        return res.status(400).json({ error: t('请输入邮箱和验证码') })
      }
      if (!await verifyCode(email, code)) {
        return res.status(400).json({ error: t('验证码无效或已过期') })
      }
    }

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: t('用户名已存在') })
    }

    if (email) {
      const emailExists = await db.prepare('SELECT id FROM users WHERE email = ?').get(email)
      if (emailExists) {
        return res.status(409).json({ error: t('该邮箱已被注册') })
      }
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const ip = getClientIp(req)
    const verified = (config.smtp.enabled && email && code) ? 1 : (config.smtp.enabled ? 0 : 1)

    const result = await db.prepare(
      'INSERT INTO users (username, password, email, verified, register_ip, last_login_ip) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(username, hashedPassword, email || null, verified, ip, ip)

    const userId = result.lastInsertRowid as number
    await db.prepare('INSERT INTO user_settings (user_id, language) VALUES (?, ?)').run(userId, getDefaultLanguage())
    await syncStoragePoolsFromConfig(userId)

    const token = generateToken(userId)
    await Logger.info('web', 'auth.ts', `User ${username} registered from ${ip}`)

    res.json({
      message: t('注册成功'),
      token,
      user: {
        id: userId,
        username,
        role: 'user'
      }
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'web',
      fileName: 'auth.ts',
      message: 'User registration failed',
      context: { username: req.body?.username, email: req.body?.email }
    })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  const t = getRequestTranslator(req)
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: t('用户名和密码不能为空') })
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any
    if (!user) {
      await Logger.info('web', 'auth.ts', `Failed login for unknown user ${username}`)
      return res.status(401).json({ error: t('用户名或密码错误') })
    }

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    if (hashedPassword !== user.password) {
      await Logger.info('web', 'auth.ts', `Failed login for user ${username}`)
      return res.status(401).json({ error: t('用户名或密码错误') })
    }

    if (user.banned) {
      return res.status(403).json({ error: t('账号已被封禁') })
    }

    if (config.smtp.enabled && !user.verified) {
      return res.status(403).json({ error: t('账号未验证，请检查邮箱验证码或等待管理员处理') })
    }

    const ip = getClientIp(req)
    await db.prepare('UPDATE users SET last_login_ip = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(ip, user.id)

    const token = generateToken(user.id)
    await Logger.info('web', 'auth.ts', `User ${user.username} login success from ${ip}`)

    res.json({
      message: t('登录成功'),
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'web',
      fileName: 'auth.ts',
      message: 'User login failed',
      context: { username: req.body?.username }
    })
  }
})

router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
    await Logger.info('web', 'auth.ts', `User ${user?.username || req.userId} logout`)
    res.json({ message: 'Logged out' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'web',
      fileName: 'auth.ts',
      message: 'User logout failed',
      context: { userId: req.userId }
    })
  }
})

router.get('/me', async (req: AuthRequest, res: Response) => {
  const t = getRequestTranslator(req)
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ error: t('未登录') })
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
    const banCheck = await db.prepare('SELECT banned FROM users WHERE id = ?').get(decoded.userId) as any
    if (banCheck?.banned) {
      return res.status(403).json({ error: t('账号已被封禁') })
    }

    const user = await db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.created_at,
             s.guest_enabled, s.guest_path, s.theme, s.language, s.upload_concurrency
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(decoded.userId) as any

    if (!user) {
      return res.status(401).json({ error: t('用户不存在') })
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
          theme: user.theme,
          language: normalizeLanguage(user.language || getDefaultLanguage()),
          uploadConcurrency: Number(user.upload_concurrency || 0),
          serverDefaultUploadConcurrency: Number(config.max_concurrent_uploads || 3)
        }
      }
    })
  } catch {
    res.status(401).json({ error: t('Token 无效') })
  }
})

export default router
