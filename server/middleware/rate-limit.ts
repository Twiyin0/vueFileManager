import type { Request, Response, NextFunction } from 'express'
import { getClientIp } from './auth'

interface RateLimitOptions {
  windowMs: number
  max: number
  message?: string
}

interface Bucket {
  count: number
  resetAt: number
}

/**
 * Minimal in-memory fixed-window rate limiter keyed by client IP.
 * Intended for sensitive endpoints (login, register, verification codes) to slow
 * brute-force attempts. State is per-process; behind multiple instances pair it
 * with a shared reverse-proxy limit.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  // Opportunistic cleanup so the map does not grow unbounded.
  function sweep(now: number) {
    if (buckets.size < 5000) return
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key)
    }
  }

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    const key = `${getClientIp(req)}:${req.baseUrl}${req.path}`
    sweep(now)

    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }

    bucket.count += 1

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      // Return the raw i18n key; the global response wrapper translates it server-side.
      return res.status(429).json({ error: options.message || 'auth.tooManyRequests' })
    }

    next()
  }
}
