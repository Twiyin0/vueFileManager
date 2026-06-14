import type { RouteRecordRaw } from 'vue-router'
import type { AppNavMeta } from '@/types/router-meta'

export interface HeaderLink {
  label: string
  labelKey?: string
  icon: string
  to: string
  order: number
}

export interface SidebarSection {
  id: 'main' | 'admin'
  title?: string
  titleKey?: string
  items: Array<{
    path: string
    label: string
    labelKey?: string
    icon: string
    order: number
  }>
}

function nav(labelKey: string, fallback: string, icon: string, section: 'main' | 'admin', order: number): AppNavMeta {
  return { label: fallback, labelKey, icon, section, order }
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
      pageTitleKey: 'nav.fileManager',
      nav: nav('nav.fileManager', '文件管理', 'folder', 'main', 10)
    }
  },
  {
    path: '/offline-tasks',
    name: 'OfflineTasks',
    component: () => import('@/views/OfflineTasks.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '离线任务',
      pageTitleKey: 'nav.offlineTasks',
      nav: nav('nav.offlineTasks', '离线任务', 'download', 'main', 20)
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
      pageTitleKey: 'nav.favourites',
      nav: nav('nav.favourites', '我的收藏', 'star-sharp', 'main', 30)
    }
  },
  {
    path: '/my-shares',
    name: 'MyShares',
    component: () => import('@/views/MyShares.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '我的分享',
      pageTitleKey: 'nav.myShares',
      nav: nav('nav.myShares', '我的分享', 'link', 'main', 40)
    }
  },
  {
    path: '/trash',
    name: 'Trash',
    component: () => import('@/views/Trash.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '回收站',
      pageTitleKey: 'nav.trash',
      nav: nav('nav.trash', '回收站', 'trash', 'main', 50)
    }
  },
  {
    path: '/storage-pools',
    name: 'StoragePools',
    component: () => import('@/views/StoragePools.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '存储池',
      pageTitleKey: 'nav.storagePools',
      nav: nav('nav.storagePools', '存储池', 'server', 'main', 60)
    }
  },
  {
    path: '/webdav',
    name: 'WebDAV',
    component: () => import('@/views/WebDav.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: 'WebDAV',
      pageTitleKey: 'nav.webdav',
      nav: nav('nav.webdav', 'WebDAV', 'globe', 'main', 70)
    }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/UserSettings.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '设置',
      pageTitleKey: 'nav.settings',
      nav: nav('nav.settings', '设置', 'gear', 'main', 80)
    }
  },
  {
    path: '/apikeys',
    name: 'ApiKeys',
    component: () => import('@/views/ApiKeys.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: 'API Keys',
      pageTitleKey: 'nav.apiKeys',
      nav: nav('nav.apiKeys', 'API Keys', 'key', 'main', 90)
    }
  },
  {
    path: '/themes',
    name: 'Themes',
    component: () => import('@/views/Themes.vue'),
    meta: {
      requiresAuth: true,
      pageTitle: '插件',
      pageTitleKey: 'nav.plugins',
      nav: nav('nav.plugins', '插件', 'palette', 'main', 100)
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
      pageTitleKey: 'nav.admin',
      nav: nav('nav.admin', '管理面板', 'users', 'admin', 10)
    }
  },
  { path: '/s/:code', name: 'Share', component: () => import('@/views/Share.vue'), meta: { noLayout: true } },
  { path: '/api-docs', name: 'ApiDocs', component: () => import('@/views/ApiDocs.vue'), meta: { pageTitle: 'API 文档', pageTitleKey: 'nav.apiDocs' } },
  { path: '/theme-docs', name: 'ThemeDocs', component: () => import('@/views/ThemeDocs.vue'), meta: { pageTitle: '插件开发', pageTitleKey: 'nav.themeDocs' } },
  { path: '/plugin-docs', name: 'PluginDocs', component: () => import('@/views/ThemeDocs.vue'), meta: { pageTitle: '插件开发', pageTitleKey: 'nav.themeDocs' } }
]

export const appRoutes: RouteRecordRaw[] = appRouteModules

export const headerLinks: HeaderLink[] = [
  { label: 'API 文档', labelKey: 'nav.apiDocs', icon: 'book-open', to: '/api-docs', order: 10 },
  { label: '插件开发', labelKey: 'nav.themeDocs', icon: 'palette', to: '/theme-docs', order: 20 }
]

export function getSidebarSections(isAdmin: boolean): SidebarSection[] {
  const items = appRouteModules
    .filter((route) => route.meta?.nav)
    .filter((route) => isAdmin || !route.meta?.requiresAdmin)
    .map((route) => ({
      path: route.path,
      label: route.meta!.nav!.label,
      labelKey: route.meta!.nav!.labelKey,
      icon: route.meta!.nav!.icon,
      section: route.meta!.nav!.section || 'main',
      order: route.meta!.nav!.order || 999
    }))
    .sort((a, b) => a.order - b.order)

  const sections: SidebarSection[] = [
    {
      id: 'main',
      items: items
        .filter((item) => item.section === 'main')
        .map(({ path, label, labelKey, icon, order }) => ({ path, label, labelKey, icon, order }))
    },
    {
      id: 'admin',
      title: '管理',
      titleKey: 'nav.admin',
      items: items
        .filter((item) => item.section === 'admin')
        .map(({ path, label, labelKey, icon, order }) => ({ path, label, labelKey, icon, order }))
    }
  ]

  return sections.filter((section) => section.items.length > 0)
}
