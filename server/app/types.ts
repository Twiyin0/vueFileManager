import type express from 'express'

export interface AppContext {
  rootDir: string
}

export interface RouteModule {
  path: string
  router: express.Router
}
