import { Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../db'
import config from '../config'

const JWT_SECRET = config.server.jwt_secret

export interface ApiKeyRequest extends Request {
  userId?: number
  userRole?: string
  apiKeyPermissions?: string[]
}

function isWebDavRequest(req: Request) {
  return req.baseUrl === '/dav' || req.originalUrl.startsWith('/dav')
}

function sendUnauthorized(req: Request, res: Response, error: string) {
  if (isWebDavRequest(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="VueFileManager WebDAV", charset="UTF-8"')
    return res.status(401).type('text/plain; charset=utf-8').send(error)
  }
  return res.status(401).json({ error })
}

function authenticateWithBasicAuth(req: ApiKeyRequest) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) return null

  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex < 0) return null

    const username = decoded.slice(0, separatorIndex)
    const password = decoded.slice(separatorIndex + 1)
    if (!username || !password) return null

    const user = db.prepare('SELECT id, role, banned, password FROM users WHERE username = ?').get(username) as any
    if (!user || user.banned) return null

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    if (hashedPassword !== user.password) return null

    return {
      userId: user.id as number,
      userRole: user.role as string,
      permissions: ['read', 'write', 'delete']
    }
  } catch {
    return null
  }
}

// API Key 认证中间件
export function apiKeyMiddleware(req: ApiKeyRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string

  if (!apiKey) {
    return sendUnauthorized(req, res, '缺少 API Key')
  }

  const keyRecord = db.prepare(`
    SELECT ak.*, u.role, u.banned FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.key = ?
  `).get(apiKey) as any

  if (!keyRecord) {
    return sendUnauthorized(req, res, 'API Key 无效')
  }

  if (keyRecord.banned) {
    return res.status(403).json({ error: '账号已被封禁' })
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
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '') || req.query.token as string

  if (apiKey) {
    return apiKeyMiddleware(req, res, next)
  }

  const basicAuthUser = authenticateWithBasicAuth(req)
  if (basicAuthUser) {
    req.userId = basicAuthUser.userId
    req.userRole = basicAuthUser.userRole
    req.apiKeyPermissions = basicAuthUser.permissions
    return next()
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
      const user = db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(decoded.userId) as any
      if (!user) {
        return sendUnauthorized(req, res, '用户不存在')
      }
      if (user.banned) {
        return res.status(403).json({ error: '账号已被封禁' })
      }
      req.userId = user.id
      req.userRole = user.role
      req.apiKeyPermissions = ['read', 'write', 'delete']
      return next()
    } catch {
      return sendUnauthorized(req, res, 'Token 无效')
    }
  }

  return sendUnauthorized(req, res, '未认证')
}
