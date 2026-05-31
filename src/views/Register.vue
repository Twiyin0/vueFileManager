<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function handleRegister() {
  error.value = ''

  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    await authStore.register(username.value, password.value)
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
        <div class="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center mb-4">
          <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold" style="color: var(--text-color)">创建账户</h1>
        <p class="text-sm mt-1" style="color: var(--text-secondary-color)">注册 VueFileManager 账户</p>
      </div>

      <!-- 错误提示 -->
      <div v-if="error" class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
        {{ error }}
      </div>

      <!-- 注册表单 -->
      <form @submit.prevent="handleRegister" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">用户名</label>
          <input
            v-model="username"
            type="text"
            class="input-field"
            placeholder="3-20 个字符"
            required
            minlength="3"
            maxlength="20"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">密码</label>
          <input
            v-model="password"
            type="password"
            class="input-field"
            placeholder="至少 6 位"
            required
            minlength="6"
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">确认密码</label>
          <input
            v-model="confirmPassword"
            type="password"
            class="input-field"
            placeholder="再次输入密码"
            required
          />
        </div>
        <button
          type="submit"
          class="btn-primary w-full py-2.5"
          :disabled="loading"
        >
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            注册中...
          </span>
          <span v-else>注册</span>
        </button>
      </form>

      <!-- 登录链接 -->
      <p class="mt-6 text-center text-sm" style="color: var(--text-secondary-color)">
        已有账户？
        <router-link to="/login" class="text-blue-500 hover:text-blue-600">登录</router-link>
      </p>
    </div>
  </div>
</template>
