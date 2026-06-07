import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import config from './config'

// 初始化数据库（确保建表和默认管理员）
import './db'

// 加载主题插件
import { loadPlugins, getThemeStyles, getAllThemes, toggleTheme } from './plugins/loader'
loadPlugins()

import authRoutes from './routes/auth'
import filesRoutes from './routes/files'
import userRoutes from './routes/user'
import adminRoutes from './routes/admin'
import guestRoutes from './routes/guest'
import shareRoutes from './routes/share'
import storagePoolsRoutes from './routes/storage-pools'
import trashRoutes from './routes/trash'
import favouritesRoutes from './routes/favourites'
import publicRoutes from './routes/public'
import { ipBlacklistMiddleware } from './middleware/auth'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || config.server.port
const HOST = process.env.HOST || config.server.host || 'localhost'

// 中间件
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// IP 黑名单检查（在所有路由之前）
app.use('/api', ipBlacklistMiddleware)

// 拦截敏感文件访问
const SENSITIVE_FILES = ['.env', '.env.example', 'config.yml', 'package.json', 'tsconfig.json', '.gitignore']
app.use((req, res, next) => {
  const filename = req.path.split('/').pop() || ''
  if (SENSITIVE_FILES.includes(filename) || filename.startsWith('.env') || filename.startsWith('._')) {
    return res.status(403).json({ error: '禁止访问' })
  }
  next()
})

// 静态文件服务（生产模式）
app.use(express.static(path.join(__dirname, '..', 'dist')))

// 插件静态文件
const pluginsDir = path.resolve(config.plugins?.dir || './plugins')
if (config.plugins?.enabled && fs.existsSync(pluginsDir)) {
  app.use('/plugins', express.static(pluginsDir))
}

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/user', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/guest', guestRoutes)
app.use('/api/share', shareRoutes)
app.use('/api/storage-pools', storagePoolsRoutes)
app.use('/api/trash', trashRoutes)
app.use('/api/favourites', favouritesRoutes)

// 公开访问路由（无需认证）
app.use('/f', publicRoutes)

// 站点配置（公开，无需认证）
app.get('/api/site-config', (_req, res) => {
  res.json({
    icp_beian: config.site?.icp_beian || '',
    police_beian: config.site?.police_beian || '',
    smtp_enabled: config.smtp?.enabled || false,
    themes_enabled: config.plugins?.enabled || false,
  })
})

// 主题样式列表（公开）
app.get('/api/themes/styles', (_req, res) => {
  res.json({ styles: getThemeStyles() })
})

// 主题列表（公开）
app.get('/api/themes/list', (_req, res) => {
  res.json({ themes: getAllThemes() })
})

// 切换主题启用/禁用（需认证）
import jwt from 'jsonwebtoken'
app.put('/api/themes/:name/toggle', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    jwt.verify(token, config.server.jwt_secret)
  } catch {
    return res.status(401).json({ error: 'Token 无效' })
  }

  const { name } = req.params
  const { enabled } = req.body
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled 必须为布尔值' })
  }

  const success = toggleTheme(name, enabled)
  if (!success) return res.status(404).json({ error: '主题不存在' })

  res.json({ message: enabled ? '主题已启用（重启后生效）' : '主题已禁用（重启后生效）' })
})

// 启动服务
async function startServer() {
  // SPA fallback
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }
  })

  const server = app.listen(PORT, HOST, () => {
    const displayHost = HOST === '0.0.0.0' ? '0.0.0.0 (all interfaces)' : HOST
    console.log(`\n🚀 VueFileManager 服务器已启动`)
    console.log(`📡 生产环境: http://${displayHost}:${PORT}`)
    console.log(`📡 API: http://${HOST}:${PORT}/api`)
    console.log(`🌐 开发环境: http://localhost:5173\n`)
  })

  // 优雅关闭
  function shutdown() {
    console.log('\n🛑 正在关闭服务器...')
    server.close(() => {
      console.log('✅ 服务器已关闭')
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 3000)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startServer()

export default app
