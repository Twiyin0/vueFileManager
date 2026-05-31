import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../db.js'
import config from '../config.js'
import { generateToken, AuthRequest } from '../middleware/auth.js'

const JWT_SECRET = config.server.jwt_secret

const router = Router()

// 获取客户端 IP
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return (forwarded as string).split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

// 注册
router.post('/register', (req: Request, res: Response) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在 3-20 之间' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于 6 位' })
    }

    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' })
    }

    // 使用 MD5 哈希密码
    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    const ip = getClientIp(req)

    const result = db.prepare(
      'INSERT INTO users (username, password, register_ip, last_login_ip) VALUES (?, ?, ?, ?)'
    ).run(username, hashedPassword, ip, ip)

    // 创建默认设置
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(result.lastInsertRowid)

    const token = generateToken(result.lastInsertRowid as number)

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

    // 更新最后登录 IP
    const ip = getClientIp(req)
    db.prepare('UPDATE users SET last_login_ip = ? WHERE id = ?').run(ip, user.id)

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

    const user = db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.created_at,
             s.storage_type, s.local_path, s.guest_enabled, s.guest_path, s.theme,
             s.upyun_operator, s.upyun_bucket, s.upyun_endpoint
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
          storageType: user.storage_type,
          localPath: user.local_path,
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme,
          upyunOperator: user.upyun_operator,
          upyunBucket: user.upyun_bucket,
          upyunEndpoint: user.upyun_endpoint
        }
      }
    })
  } catch (err: any) {
    res.status(401).json({ error: 'Token 无效' })
  }
})

export default router
