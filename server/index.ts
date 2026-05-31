import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './config.js'

// 初始化数据库（确保建表和默认管理员）
import './db.js'

import authRoutes from './routes/auth.js'
import filesRoutes from './routes/files.js'
import userRoutes from './routes/user.js'
import adminRoutes from './routes/admin.js'
import guestRoutes from './routes/guest.js'
import shareRoutes from './routes/share.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || config.server.port

// 中间件
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 静态文件服务（生产模式）
app.use(express.static(path.join(__dirname, '..', 'dist')))

// API 路由
app.use('/api/auth', authRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/user', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/guest', guestRoutes)
app.use('/api/share', shareRoutes)

// SPA fallback（生产模式）
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
})

app.listen(PORT, () => {
  console.log(`\n🚀 VueFileManager 服务器已启动`)
  console.log(`📡 API: http://localhost:${PORT}/api`)
  console.log(`🌐 前端: http://localhost:5173\n`)
})

export default app
