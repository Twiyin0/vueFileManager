import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import db from '../db'
import config from '../config'
import { Logger } from '../services/logger'
import { getRequestTranslator } from '../services/server-i18n'

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

let ipTableState:
  | null
  | {
      checkedAt: number
      hasConfig: boolean
      hasBlacklist: boolean
      hasWhitelist: boolean
    } = null

async function getIpTableState() {
  const now = Date.now()
  if (ipTableState && now - ipTableState.checkedAt < 30_000) {
    return ipTableState
  }

  const [hasConfig, hasBlacklist, hasWhitelist] = await Promise.all([
    db.tableExists('ip_list_config'),
    db.tableExists('ip_blacklist'),
    db.tableExists('ip_whitelist')
  ])

  ipTableState = {
    checkedAt: now,
    hasConfig,
    hasBlacklist,
    hasWhitelist
  }

  return ipTableState
}

export function ipBlacklistMiddleware(req: Request, res: Response, next: NextFunction) {
  ;(async () => {
    try {
      const state = await getIpTableState()
      if (!state.hasConfig || (!state.hasBlacklist && !state.hasWhitelist)) {
        return next()
      }

      const clientIp = getClientIp(req)
      const cleanIp = clientIp.replace(/^::ffff:/, '')
      const configRow = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
      const mode = configRow?.mode || 'blacklist'
      const t = getRequestTranslator(req)

      if (mode === 'whitelist') {
        if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
          return next()
        }
        if (!state.hasWhitelist) {
          return next()
        }

        const entries = await db.prepare('SELECT ip_pattern FROM ip_whitelist').all<{ ip_pattern: string }>()
        for (const entry of entries) {
          if (matchIp(clientIp, entry.ip_pattern)) {
            return next()
          }
        }
        return res.status(403).json({ error: t('IP 不在白名单中') })
      }

      if (!state.hasBlacklist) {
        return next()
      }

      const entries = await db.prepare('SELECT ip_pattern FROM ip_blacklist').all<{ ip_pattern: string }>()
      for (const entry of entries) {
        if (matchIp(clientIp, entry.ip_pattern)) {
          return res.status(403).json({ error: t('IP 已被封禁') })
        }
      }

      return next()
    } catch (err: any) {
      await Logger.error('system', 'auth.ts', 'IP list middleware fallback to allow request', err)
      return next()
    }
  })().catch(async (err: any) => {
    await Logger.error('system', 'auth.ts', 'IP list middleware unexpected failure', err)
    return next()
  })
}

const JWT_SECRET = config.server.jwt_secret

export interface AuthRequest extends Request {
  userId?: number
  userRole?: string
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  const t = getRequestTranslator(req)
  if (!token) {
    return res.status(401).json({ error: t('未登录') })
  }

  ;(async () => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: number }
      const user = await db.prepare('SELECT id, role, banned FROM users WHERE id = ?').get(decoded.userId) as any
      if (!user) {
        return res.status(401).json({ error: t('用户不存在') })
      }
      if (user.banned) {
        return res.status(403).json({ error: t('账号已被封禁') })
      }
      req.userId = user.id
      req.userRole = user.role
      return next()
    } catch {
      return res.status(401).json({ error: t('Token 无效或已过期') })
    }
  })().catch(async (err: any) => {
    await Logger.error('api', 'auth.ts', 'Authentication middleware failed', err)
    res.status(500).json({ error: t(err.message || '认证失败') })
  })
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const t = getRequestTranslator(req)
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: t('需要管理员权限') })
  }
  next()
}

export function generateToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
}
