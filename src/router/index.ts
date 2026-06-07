import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/Login.vue')
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/Register.vue')
    },
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/Home.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/guest',
      name: 'GuestList',
      component: () => import('@/views/GuestList.vue')
    },
    {
      path: '/guest/:username',
      name: 'Guest',
      component: () => import('@/views/Guest.vue')
    },
    {
      path: '/guest/:username/:shareId',
      name: 'GuestFolder',
      component: () => import('@/views/Guest.vue')
    },
    {
      path: '/storage-pools',
      name: 'StoragePools',
      component: () => import('@/views/StoragePools.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/UserSettings.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/apikeys',
      name: 'ApiKeys',
      component: () => import('@/views/ApiKeys.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',
      name: 'Admin',
      component: () => import('@/views/Admin.vue'),
      meta: { requiresAuth: true, requiresAdmin: true }
    },
    {
      path: '/s/:code',
      name: 'Share',
      component: () => import('@/views/Share.vue')
    },
    {
      path: '/my-shares',
      name: 'MyShares',
      component: () => import('@/views/MyShares.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/trash',
      name: 'Trash',
      component: () => import('@/views/Trash.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/favourites',
      name: 'Favourites',
      component: () => import('@/views/Favourites.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/api-docs',
      name: 'ApiDocs',
      component: () => import('@/views/ApiDocs.vue')
    }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // 尝试恢复会话
  if (!authStore.user && localStorage.getItem('token')) {
    await authStore.fetchUser()
  }

  if (to.meta.requiresAuth && !authStore.user) {
    return { name: 'GuestList' }
  }

  if (to.meta.requiresAdmin && authStore.user?.role !== 'admin') {
    return { name: 'Home' }
  }
})

export default router
