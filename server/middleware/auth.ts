import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db'
import config from '../config'

// 获取客户端真实 IP
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) return (forwarded as string).split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

// IPv4 转 32 位整数
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// 检查 IP 是否匹配（精确 IP 或 CIDR 网段）
function matchIp(clientIp: string, pattern: string): boolean {
  // 去除 IPv6 前缀 ::ffff:
  const cleanIp = clientIp.replace(/^::ffff:/, '')
  const cleanPattern = pattern.trim()

  if (cleanPattern.includes('/')) {
    // CIDR 匹配
    const [network, maskStr] = cleanPattern.split('/')
    const mask = parseInt(maskStr, 10)
    if (mask < 0 || mask > 32) return false
    const networkInt = ipToInt(network)
    const clientInt = ipToInt(cleanIp)
    const maskInt = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0
    return (clientInt & maskInt) === (networkInt & maskInt)
  }

  // 精确匹配
  return cleanIp === cleanPattern
}

// IP 黑名单/白名单中间件
export function ipBlacklistMiddleware(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req)
  const cleanIp = clientIp.replace(/^::ffff:/, '')

  // 读取模式
  const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
  const mode = configRow?.mode || 'blacklist'

  if (mode === 'whitelist') {
    // 白名单模式：仅允许白名单表中的 IP（本地回环始终放行）
    if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
      return next()
    }
    const entries = db.prepare('SELECT ip_pattern FROM ip_whitelist').all() as { ip_pattern: string }[]
    for (const entry of entries) {
      if (matchIp(clientIp, entry.ip_pattern)) {
        return next()
      }
    }
    return res.status(403).json({ error: 'IP 不在白名单中' })
  }

  // 黑名单模式：拦截黑名单表中的 IP
  const entries = db.prepare('SELECT ip_pattern FROM ip_blacklist').all() as { ip_pattern: string }[]
  for (const entry of entries) {
    if (matchIp(clientIp, entry.ip_pattern)) {
      return res.status(403).json({ error: 'IP 已被封禁' })
    }
  }
  next()
}

const JWT_SECRET = config.server.jwt_secret

export interface AuthRequest extends Request {
  userId?: number
  userRole?: string
}

// JWT 认证中间件
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: '未登录' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
    const user = db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(decoded.userId) as any
    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
    }
    if (user.banned) {
      return res.status(403).json({ error: '账号已被封禁' })
    }
    req.userId = user.id
    req.userRole = user.role
    next()
  } catch {
    return res.status(401).json({ error: 'Token 无效或已过期' })
  }
}

// 管理员中间件
export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' })
  }
  next()
}

// 生成 JWT
export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}
