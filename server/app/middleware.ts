import cors from 'cors'
import express from 'express'
import fs from 'fs'
import path from 'path'
import config from '../config'
import { ipBlacklistMiddleware } from '../middleware/auth'
import type { AppContext } from './types'

const SENSITIVE_FILES = ['.env', '.env.example', 'config.yml', 'package.json', 'tsconfig.json', '.gitignore']

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
      return res.status(403).json({ error: '禁止访问' })
    }
    next()
  })

  app.use(express.static(path.join(context.rootDir, 'dist')))

  const pluginsDir = path.resolve(config.plugins?.dir || './plugins')
  if (config.plugins?.enabled && fs.existsSync(pluginsDir)) {
    app.use('/plugins', express.static(pluginsDir))
  }
}
