import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './config'

// 初始化数据库（确保建表和默认管理员）
import './db'

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
app.use('/api/storage-pools', storagePoolsRoutes)
app.use('/api/trash', trashRoutes)
app.use('/api/favourites', favouritesRoutes)

// 公开访问路由（无需认证）
app.use('/f', publicRoutes)

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
