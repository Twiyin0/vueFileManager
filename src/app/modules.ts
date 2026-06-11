import type { RouteRecordRaw } from 'vue-router'
import type { AppNavMeta } from '@/types/router-meta'

export interface HeaderLink {
  label: string
  icon: string
  to: string
  order: number
}

export interface SidebarSection {
  id: 'main' | 'admin'
  title?: string
  items: Array<{
    path: string
    label: string
    icon: string
    order: number
  }>
}

const appRouteModules: RouteRecordRaw[] = [
  { path: '/login', name: 'Login', component: () => import('@/views/Login.vue'), meta: { noLayout: true } },
  { path: '/register', name: 'Register', component: () => import('@/views/Register.vue'), meta: { noLayout: true } },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '文件管理',
      nav: { label: '文件管理', icon: 'folder', section: 'main', order: 10 }
    }
  },
  {
    path: '/offline-tasks',
    name: 'OfflineTasks',
    component: () => import('@/views/OfflineTasks.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '离线任务',
      nav: { label: '离线任务', icon: 'download', section: 'main', order: 20 }
    }
  },
  { path: '/guest', name: 'GuestList', component: () => import('@/views/GuestList.vue'), meta: { noLayout: true } },
  { path: '/guest/:username', name: 'Guest', component: () => import('@/views/Guest.vue'), meta: { noLayout: true } },
  { path: '/guest/:username/:shareId', name: 'GuestFolder', component: () => import('@/views/Guest.vue'), meta: { noLayout: true } },
  {
    path: '/favourites',
    name: 'Favourites',
    component: () => import('@/views/Favourites.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '我的收藏',
      nav: { label: '我的收藏', icon: 'star-sharp', section: 'main', order: 30 }
    }
  },
  {
    path: '/my-shares',
    name: 'MyShares',
    component: () => import('@/views/MyShares.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '我的分享',
      nav: { label: '我的分享', icon: 'link', section: 'main', order: 40 }
    }
  },
  {
    path: '/trash',
    name: 'Trash',
    component: () => import('@/views/Trash.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '回收站',
      nav: { label: '回收站', icon: 'trash', section: 'main', order: 50 }
    }
  },
  {
    path: '/storage-pools',
    name: 'StoragePools',
    component: () => import('@/views/StoragePools.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '存储池管理',
      nav: { label: '存储池', icon: 'server', section: 'main', order: 60 }
    }
  },
  {
    path: '/webdav',
    name: 'WebDAV',
    component: () => import('@/views/WebDav.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: 'WebDAV',
      nav: { label: 'WebDAV', icon: 'globe', section: 'main', order: 70 }
    }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/UserSettings.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '设置',
      nav: { label: '设置', icon: 'gear', section: 'main', order: 80 }
    }
  },
  {
    path: '/apikeys',
    name: 'ApiKeys',
    component: () => import('@/views/ApiKeys.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: 'API Keys',
      nav: { label: 'API Keys', icon: 'key', section: 'main', order: 90 }
    }
  },
  {
    path: '/themes',
    name: 'Themes',
    component: () => import('@/views/Themes.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '插件中心',
      nav: { label: '插件', icon: 'palette', section: 'main', order: 100 }
    }
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('@/views/Admin.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      pageTitle: '管理面板',
      nav: { label: '管理面板', icon: 'users', section: 'admin', order: 10 }
    }
  },
  { path: '/s/:code', name: 'Share', component: () => import('@/views/Share.vue'), meta: { noLayout: true } },
  { path: '/api-docs', name: 'ApiDocs', component: () => import('@/views/ApiDocs.vue'), meta: { pageTitle: 'API 文档' } },
  { path: '/theme-docs', name: 'ThemeDocs', component: () => import('@/views/ThemeDocs.vue'), meta: { pageTitle: '插件开发文档' } },
  { path: '/plugin-docs', name: 'PluginDocs', component: () => import('@/views/ThemeDocs.vue'), meta: { pageTitle: '插件开发文档' } },
]

export const appRoutes: RouteRecordRaw[] = appRouteModules

export const headerLinks: HeaderLink[] = [
  { label: 'API 文档', icon: 'book-open', to: '/api-docs', order: 10 },
  { label: '插件开发', icon: 'palette', to: '/theme-docs', order: 20 }
]

export function getSidebarSections(isAdmin: boolean): SidebarSection[] {
  const items = appRouteModules
    .filter((route) => route.meta?.nav)
    .filter((route) => isAdmin || !route.meta?.requiresAdmin)
    .map((route) => ({
      path: route.path,
      label: route.meta!.nav!.label,
      icon: route.meta!.nav!.icon,
      section: route.meta!.nav!.section || 'main',
      order: route.meta!.nav!.order || 999
    }))
    .sort((a, b) => a.order - b.order)

  return [
    {
      id: 'main' as const,
      items: items.filter((item) => item.section === 'main')
    },
    {
      id: 'admin' as const,
      title: '管理',
      items: items.filter((item) => item.section === 'admin')
    }
  ].filter((section) => section.items.length > 0)
}
