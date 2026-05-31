import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import { useRouter } from 'vue-router'

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  registerIp?: string
  lastLoginIp?: string
  createdAt?: string
  settings?: {
    storageType: string
    localPath: string
    guestEnabled: boolean
    guestPath: string
    theme: string
    upyunOperator: string
    upyunBucket: string
    upyunEndpoint: string
  }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const loading = ref(false)

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/login', { username, password })
      token.value = res.token
      localStorage.setItem('token', res.token)
      user.value = res.user
      return res
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string) {
    loading.value = true
    try {
      const res = await api.post<{ token: string; user: User }>('/auth/register', { username, password })
      token.value = res.token
      localStorage.setItem('token', res.token)
      user.value = res.user
      return res
    } finally {
      loading.value = false
    }
  }

  async function fetchUser() {
    try {
      const res = await api.get<{ user: User }>('/auth/me')
      user.value = res.user
      // 应用用户主题设置
      if (res.user.settings?.theme) {
        applyTheme(res.user.settings.theme)
      }
    } catch {
      logout()
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  function applyTheme(theme: string) {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      // 跟随系统
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }
  }

  return {
    user, token, loading,
    isLoggedIn, isAdmin,
    login, register, fetchUser, logout, applyTheme
  }
})
