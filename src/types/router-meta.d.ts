import 'vue-router'

export interface AppNavMeta {
  label: string
  labelKey?: string
  icon: string
  section?: 'main' | 'admin'
  order?: number
}

declare module 'vue-router' {
  interface RouteMeta {
    noLayout?: boolean
    requiresAuth?: boolean
    requiresAdmin?: boolean
    pageTitle?: string
    pageTitleKey?: string
    nav?: AppNavMeta
  }
}
