import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db.js'
import config from '../config.js'

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
    const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(decoded.userId) as any
    if (!user) {
      return res.status(401).json({ error: '用户不存在' })
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
