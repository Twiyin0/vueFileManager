import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import config from '../config'
import { ipBlacklistMiddleware } from '../middleware/auth'
import type { AppContext } from './types'

const SENSITIVE_FILES = ['.env', '.env.example', 'config.yml', 'package.json', 'tsconfig.json', '.gitignore']
const HASHED_ASSET_PATTERN = /\.[A-Za-z0-9_-]{8,}\.(?:js|css|mjs|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/i

function setStaticCacheHeaders(res: express.Response, filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const filename = path.basename(normalizedPath)

  if (normalizedPath.endsWith('/index.html')) {
    res.setHeader('Cache-Control', 'no-cache')
    return
  }

  if (normalizedPath.includes('/dist/assets/') && HASHED_ASSET_PATTERN.test(filename)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return
  }

  if (normalizedPath.includes('/i18n/')) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
    return
  }

  if (
    normalizedPath.endsWith('.md') ||
    normalizedPath.endsWith('.png') ||
    normalizedPath.endsWith('.svg') ||
    normalizedPath.endsWith('.jpg') ||
    normalizedPath.endsWith('.jpeg') ||
    normalizedPath.endsWith('.gif') ||
    normalizedPath.endsWith('.webp') ||
    normalizedPath.endsWith('.ico')
  ) {
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return
  }

  res.setHeader('Cache-Control', 'public, max-age=3600')
}

export function registerAppMiddleware(app: express.Express, context: AppContext) {
  app.use((req, res, next) => {
    if (req.path === '/dav' || req.path.startsWith('/dav/')) {
      return next()
    }
    return cors({
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      credentials: true
    })(req, res, next)
  })
  app.use(express.json({ limit: `${config.upload_limit}mb` }))
  app.use(express.urlencoded({ extended: true, limit: `${config.upload_limit}mb` }))

  app.use('/api', ipBlacklistMiddleware)

  app.use((req, res, next) => {
    const filename = req.path.split('/').pop() || ''
    if (SENSITIVE_FILES.includes(filename) || filename.startsWith('.env') || filename.startsWith('._')) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  })

  app.use(express.static(path.join(context.rootDir, 'dist'), {
    setHeaders: (res, filePath) => {
      setStaticCacheHeaders(res, filePath)
    }
  }))

  const pluginsDir = path.resolve(config.plugins?.dir || './plugins')
  if (config.plugins?.enabled && fs.existsSync(pluginsDir)) {
    app.use('/plugins', express.static(pluginsDir, {
      setHeaders: (res, filePath) => {
        setStaticCacheHeaders(res, filePath)
      }
    }))
  }
}
