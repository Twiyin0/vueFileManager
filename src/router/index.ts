import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { appRoutes } from '@/app/modules'

const router = createRouter({
  history: createWebHistory(),
  routes: appRoutes
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
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
