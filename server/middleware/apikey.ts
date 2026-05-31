import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db.js'
import config from '../config.js'

const JWT_SECRET = config.server.jwt_secret

export interface ApiKeyRequest extends Request {
  userId?: number
  userRole?: string
  apiKeyPermissions?: string[]
}

// API Key 认证中间件
export function apiKeyMiddleware(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string

  if (!apiKey) {
    return res.status(401).json({ error: '缺少 API Key' })
  }

  const keyRecord = db.prepare(`
    SELECT ak.*, u.role FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.key = ?
  `).get(apiKey) as any

  if (!keyRecord) {
    return res.status(401).json({ error: 'API Key 无效' })
  }

  req.userId = keyRecord.user_id
  req.userRole = keyRecord.role
  req.apiKeyPermissions = keyRecord.permissions.split(',').map((p: string) => p.trim())

  next()
}

// API Key 权限检查
export function requirePermission(permission: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes(permission)) {
      return res.status(403).json({ error: `API Key 缺少 ${permission} 权限` })
    }
    next()
  }
}

// 统一认证：支持 JWT 或 API Key
export function flexibleAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

  if (apiKey) {
    return apiKeyMiddleware(req, res, next)
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
      const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(decoded.userId) as any
      if (!user) {
        return res.status(401).json({ error: '用户不存在' })
      }
      req.userId = user.id
      req.userRole = user.role
      req.apiKeyPermissions = ['read', 'write', 'delete']
      return next()
    } catch {
      return res.status(401).json({ error: 'Token 无效' })
    }
  }

  return res.status(401).json({ error: '未认证' })
}
