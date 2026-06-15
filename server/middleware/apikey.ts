import type { NextFunction, Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../db'
import config from '../config'
import { Logger } from '../services/logger'
import { getRequestTranslator } from '../services/server-i18n'

const JWT_SECRET = config.server.jwt_secret

export interface ApiKeyRequest extends Request {
  userId?: number
  userRole?: string
  apiKeyPermissions?: string[]
}

function isWebDavRequest(req: Request) {
  return req.baseUrl === '/dav' || req.originalUrl.startsWith('/dav')
}

function sendUnauthorized(req: Request, res: Response, error: string, fallback?: string) {
  const t = getRequestTranslator(req)
  const translated = t(error, fallback)
  if (isWebDavRequest(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="VueFileManager WebDAV"')
    res.setHeader('DAV', '1')
    res.setHeader('MS-Author-Via', 'DAV')
    return res.status(401).type('text/plain; charset=utf-8').send(translated)
  }
  return res.status(401).json({ error: translated })
}

async function authenticateWithBasicAuth(req: ApiKeyRequest) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Basic ')) return null

  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8')
    const separatorIndex = decoded.indexOf(':')
    if (separatorIndex < 0) return null

    const username = decoded.slice(0, separatorIndex)
    const password = decoded.slice(separatorIndex + 1)
    if (!username || !password) return null

    const user = await db.prepare('SELECT id, role, banned, password FROM users WHERE username = ?').get(username) as any
    if (!user || user.banned) return null

    const hashedPassword = crypto.createHash('md5').update(password).digest('hex')
    if (hashedPassword !== user.password) return null

    return {
      userId: user.id as number,
      userRole: user.role as string,
      permissions: ['read', 'write', 'delete'],
      username
    }
  } catch {
    return null
  }
}

export function apiKeyMiddleware(req: ApiKeyRequest, res: Response, next: NextFunction) {
  ;(async () => {
    const apiKey = req.headers['x-api-key'] as string
    const t = getRequestTranslator(req)
    if (!apiKey) {
      return sendUnauthorized(req, res, 'auth.missingApiKey', 'Missing API key')
    }

    const keyRecord = await db.prepare(`
      SELECT ak.*, u.role, u.banned, u.username
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key = ?
    `).get(apiKey) as any

    if (!keyRecord) {
      return sendUnauthorized(req, res, 'auth.invalidApiKey', 'Invalid API key')
    }

    if (keyRecord.banned) {
      return res.status(403).json({ error: t('auth.accountBanned', 'Account has been banned') })
    }

    req.userId = keyRecord.user_id
    req.userRole = keyRecord.role
    req.apiKeyPermissions = keyRecord.permissions.split(',').map((p: string) => p.trim())
    return next()
  })().catch(async (err: any) => {
    await Logger.error('api', 'apikey.ts', 'API key authentication failed', err)
    res.status(500).json({ error: getRequestTranslator(req)(err.message || 'auth.apiKeyAuthFailed', 'API key authentication failed') })
  })
}

export function requirePermission(permission: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes(permission)) {
      return res.status(403).json({
        error: getRequestTranslator(req)('auth.apiKeyMissingPermission', 'API key is missing {permission} permission', { permission })
      })
    }
    next()
  }
}

export function flexibleAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  ;(async () => {
    const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '') || req.query.token as string

    if (apiKey) {
      return apiKeyMiddleware(req, res, next)
    }

    const basicAuthUser = await authenticateWithBasicAuth(req)
    if (basicAuthUser) {
      req.userId = basicAuthUser.userId
      req.userRole = basicAuthUser.userRole
      req.apiKeyPermissions = basicAuthUser.permissions
      return next()
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
        const user = await db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(decoded.userId) as any
        if (!user) {
          return sendUnauthorized(req, res, 'auth.userNotFound', 'User not found')
        }
        if (user.banned) {
          return res.status(403).json({ error: getRequestTranslator(req)('auth.accountBanned', 'Account has been banned') })
        }
        req.userId = user.id
        req.userRole = user.role
        req.apiKeyPermissions = ['read', 'write', 'delete']
        return next()
      } catch {
        return sendUnauthorized(req, res, 'auth.invalidToken', 'Invalid token')
      }
    }

    return sendUnauthorized(req, res, 'auth.unauthenticated', 'Unauthenticated')
  })().catch(async (err: any) => {
    await Logger.error('api', 'apikey.ts', 'Flexible authentication failed', err)
    res.status(500).json({ error: getRequestTranslator(req)(err.message || 'auth.authFailed', 'Authentication failed') })
  })
}
