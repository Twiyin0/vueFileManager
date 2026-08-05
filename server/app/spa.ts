import express from 'express'
import path from 'path'

function isAppFallbackPath(pathname: string) {
  return !(
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/dav' ||
    pathname.startsWith('/dav/') ||
    pathname === '/f' ||
    pathname.startsWith('/f/') ||
    pathname === '/plugins' ||
    pathname.startsWith('/plugins/')
  )
}

export function registerSpaFallback(app: express.Express, rootDir: string) {
  app.get('*', (req, res) => {
    if (isAppFallbackPath(req.path)) {
      res.sendFile(path.join(rootDir, 'dist', 'index.html'))
    }
  })
}
