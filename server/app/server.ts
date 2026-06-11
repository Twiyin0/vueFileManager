import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '../config'
import { bootstrapApp } from './bootstrap'
import { createPublicPlatformRouter } from './features'
import { registerAppMiddleware } from './middleware'
import { protectedRouteModules, publicRouteModules } from './routes'
import { registerSpaFallback } from './spa'
import { watchConfigFile } from './watch-config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createServerApp() {
  bootstrapApp()

  const app = express()
  const rootDir = path.join(__dirname, '..', '..')
  const serverEntryPath = path.join(rootDir, 'server', 'index.ts')

  watchConfigFile(rootDir, serverEntryPath)
  registerAppMiddleware(app, { rootDir })

  for (const routeModule of protectedRouteModules) {
    app.use(routeModule.path, routeModule.router)
  }

  for (const routeModule of publicRouteModules) {
    app.use(routeModule.path, routeModule.router)
  }

  app.use('/api', createPublicPlatformRouter())
  registerSpaFallback(app, rootDir)

  return app
}

export function startServer(app: express.Express) {
  const port = Number(process.env.PORT) || config.server.port
  const host = process.env.HOST || config.server.host || 'localhost'

  function logServerReady(listenHost: string) {
    const displayHost = listenHost === '0.0.0.0' ? '0.0.0.0 (所有网络接口)' : listenHost
    console.log(`\n🚀 VueFileManager 服务器已启动`)
    console.log(`📡 监听地址: ${displayHost}:${port}`)
    console.log(`📡 API: http://${listenHost === '0.0.0.0' ? 'localhost' : listenHost}:${port}/api`)
    console.log(`🌐 开发环境: http://localhost:5173\n`)
  }

  function attachShutdown(server: ReturnType<typeof app.listen>) {
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

  function listenWithHost(listenHost: string, allowFallback: boolean) {
    const server = app.listen(port, listenHost, () => {
      logServerReady(listenHost)
    })

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (allowFallback && listenHost === '0.0.0.0' && (error.code === 'EPERM' || error.code === 'EACCES')) {
        console.warn(`⚠️  无法监听 ${listenHost}:${port}（${error.code}），正在回退到 127.0.0.1:${port}`)
        listenWithHost('127.0.0.1', false)
        return
      }

      console.error(`❌ 服务器启动失败: ${error.code || error.message}`)
      console.error(error)
      process.exit(1)
    })

    attachShutdown(server)
    return server
  }

  return listenWithHost(host, host === '0.0.0.0')
}
