import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

export interface UserSettings {
  guestEnabled: boolean
  guestPath: string
  theme: string
  language?: 'zh-CN' | 'en-US'
  uploadConcurrency: number
  serverDefaultUploadConcurrency?: number
}

export interface User {
  id: number
  username: string
  role: 'admin' | 'user'
  registerIp?: string
  lastLoginIp?: string
  lastLoginAt?: string
  createdAt?: string
  settings?: UserSettings
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
      const nextUser = await fetchUser()
      return {
        token: res.token,
        user: nextUser || res.user
      }
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
      const nextUser = await fetchUser()
      return {
        token: res.token,
        user: nextUser || res.user
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchUser() {
    try {
      const res = await api.get<{ user: User }>('/auth/me')
      user.value = res.user
      if (!localStorage.getItem('theme') && res.user.settings?.theme) {
        applyTheme(res.user.settings.theme)
      }
      return res.user
    } catch {
      logout()
      return null
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore logout request failures and clear local auth state
    } finally {
      user.value = null
      token.value = null
      localStorage.removeItem('token')
    }
  }

  function applyTheme(theme: string) {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  return {
    user,
    token,
    loading,
    isLoggedIn,
    isAdmin,
    login,
    register,
    fetchUser,
    logout,
    applyTheme
  }
})
