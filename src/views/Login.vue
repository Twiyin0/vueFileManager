<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true
  try {
    await authStore.login(username.value, password.value)
    router.push('/')
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4" style="background-color: var(--bg-color)">
    <div class="card w-full max-w-md" style="padding: 2rem">
      <!-- Logo -->
      <div class="flex flex-col items-center mb-8">
        <img src="/logo-long.png" alt="VueFileManager" class="h-16 mb-4" />
        <h1 class="text-2xl font-bold" style="color: var(--text-color)">VueFileManager</h1>
        <p class="text-sm mt-1" style="color: var(--text-secondary-color)">登录到您的账户</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
        {{ error }}
      </div>

      <!-- 登录表单 -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">用户名</label>
          <input
            v-model="username"
            type="text"
            class="input-field"
            placeholder="请输入用户名"
            required
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">密码</label>
          <input
            v-model="password"
            type="password"
            class="input-field"
            placeholder="请输入密码"
            required
          />
        </div>
        <button
          type="submit"
          class="btn-primary w-full py-2.5"
          :disabled="loading"
        >
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            登录中...
          </span>
          <span v-else>登录</span>
        </button>
      </form>

      <!-- 注册链接 -->
      <p class="mt-6 text-center text-sm" style="color: var(--text-secondary-color)">
        还没有账户？
        <router-link to="/register" class="text-blue-500 hover:text-blue-600">注册</router-link>
      </p>

      <!-- 访客入口 -->
      <div class="mt-4 pt-4 border-t" style="border-color: var(--border-color)">
        <router-link to="/guest" class="flex items-center justify-center gap-2 text-sm hover:text-blue-500" style="color: var(--text-secondary-color)">
          <Icon name="globe" class="w-4 h-4" />
          以访客身份浏览
        </router-link>
      </div>
    </div>
  </div>
</template>
