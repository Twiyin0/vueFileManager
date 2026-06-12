import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db'
import config from '../config'

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return (forwarded as string).split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function matchIp(clientIp: string, pattern: string): boolean {
  const cleanIp = clientIp.replace(/^::ffff:/, '')
  const cleanPattern = pattern.trim()

  if (cleanPattern.includes('/')) {
    const [network, maskStr] = cleanPattern.split('/')
    const mask = parseInt(maskStr, 10)
    if (mask < 0 || mask > 32) return false
    const networkInt = ipToInt(network)
    const clientInt = ipToInt(cleanIp)
    const maskInt = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0
    return (clientInt & maskInt) === (networkInt & maskInt)
  }

  return cleanIp === cleanPattern
}

export function ipBlacklistMiddleware(req: Request, res: Response, next: NextFunction) {
  ;(async () => {
    const clientIp = getClientIp(req)
    const cleanIp = clientIp.replace(/^::ffff:/, '')

    const configRow = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
    const mode = configRow?.mode || 'blacklist'

    if (mode === 'whitelist') {
      if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
        return next()
      }
      const entries = await db.prepare('SELECT ip_pattern FROM ip_whitelist').all<{ ip_pattern: string }>()
      for (const entry of entries) {
        if (matchIp(clientIp, entry.ip_pattern)) {
          return next()
        }
      }
      return res.status(403).json({ error: 'IP 不在白名单中' })
    }

    const entries = await db.prepare('SELECT ip_pattern FROM ip_blacklist').all<{ ip_pattern: string }>()
    for (const entry of entries) {
      if (matchIp(clientIp, entry.ip_pattern)) {
        return res.status(403).json({ error: 'IP 已被封禁' })
      }
    }
    return next()
  })().catch((err: any) => {
    res.status(500).json({ error: err.message || 'IP 访问控制校验失败' })
  })
}

const JWT_SECRET = config.server.jwt_secret

export interface AuthRequest extends Request {
  userId?: number
  userRole?: string
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: '未登录' })
  }

  ;(async () => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
      const user = await db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(decoded.userId) as any
      if (!user) {
        return res.status(401).json({ error: '用户不存在' })
      }
      if (user.banned) {
        return res.status(403).json({ error: '账号已被封禁' })
      }
      req.userId = user.id
      req.userRole = user.role
      return next()
    } catch {
      return res.status(401).json({ error: 'Token 无效或已过期' })
    }
  })().catch((err: any) => {
    res.status(500).json({ error: err.message || '认证失败' })
  })
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  next()
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}
