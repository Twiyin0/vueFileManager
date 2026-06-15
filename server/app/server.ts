import express from 'express'
import config, { configWriteMarkerPath } from '../config'
import { bootstrapApp } from './bootstrap'
import { createPublicPlatformRouter } from './features'
import { registerAppMiddleware } from './middleware'
import { protectedRouteModules, publicRouteModules } from './routes'
import { registerSpaFallback } from './spa'
import { appRoot, resolveFromRoot } from '../runtime-paths'
import { watchConfigFile } from './watch-config'

export function createServerApp() {
  bootstrapApp()

  const app = express()
  const rootDir = appRoot
  const serverEntryPath = resolveFromRoot('server', 'index.ts')
  const watchEnabled = process.env.NODE_ENV !== 'production'

  watchConfigFile(rootDir, serverEntryPath, {
    enabled: watchEnabled,
    internalWriteMarkerPath: configWriteMarkerPath
  })

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
    const displayHost = listenHost === '0.0.0.0' ? '0.0.0.0 (all network interfaces)' : listenHost
    console.log(`\nVueFileManager server started`)
    console.log(`Listening on: ${displayHost}:${port}`)
    console.log(`📡 API: http://${listenHost === '0.0.0.0' ? 'localhost' : listenHost}:${port}/api`)
    console.log(`Development UI: http://localhost:5173\n`)
  }

  function attachShutdown(server: ReturnType<typeof app.listen>) {
    function shutdown() {
      console.log('\nShutting down server...')
      server.close(() => {
        console.log('Server closed')
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
        console.warn(`Unable to listen on ${listenHost}:${port} (${error.code}), falling back to 127.0.0.1:${port}`)
        listenWithHost('127.0.0.1', false)
        return
      }

      console.error(`Server failed to start: ${error.code || error.message}`)
      console.error(error)
      process.exit(1)
    })

    attachShutdown(server)
    return server
  }

  return listenWithHost(host, host === '0.0.0.0')
}
