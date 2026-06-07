<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const email = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)
const smtpEnabled = ref(false)
const codeSending = ref(false)
const codeCountdown = ref(0)
let countdownTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    const res = await fetch('/api/site-config')
    if (res.ok) {
      const data = await res.json()
      smtpEnabled.value = data.smtp_enabled
    }
  } catch {}
})

async function sendCode() {
  if (!email.value.trim()) {
    error.value = '请输入邮箱'
    return
  }
  error.value = ''
  codeSending.value = true
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim() })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    // 60 秒倒计时
    codeCountdown.value = 60
    countdownTimer = setInterval(() => {
      codeCountdown.value--
      if (codeCountdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  } catch (err: any) {
    error.value = err.message
  } finally {
    codeSending.value = false
  }
}

async function handleRegister() {
  error.value = ''

  if (password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }

  loading.value = true
  try {
    const body: any = { username: username.value, password: password.value }
    if (smtpEnabled.value) {
      body.email = email.value.trim()
      body.code = code.value.trim()
    }
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('token', data.token)
    await authStore.fetchUser()
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
          <input v-model="username" type="text" class="input-field" placeholder="3-20 个字符" required minlength="3" maxlength="20" />
        </div>

        <!-- 邮箱 -->
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">
            邮箱
            <span v-if="!smtpEnabled" class="text-xs font-normal" style="color: var(--text-secondary-color)">（可选）</span>
          </label>
          <div v-if="smtpEnabled" class="flex gap-2">
            <input v-model="email" type="email" class="input-field flex-1" placeholder="your@email.com" required />
            <button type="button" @click="sendCode" :disabled="codeSending || codeCountdown > 0"
              class="btn-secondary text-sm whitespace-nowrap px-3">
              {{ codeCountdown > 0 ? `${codeCountdown}s` : codeSending ? '发送中...' : '发送验证码' }}
            </button>
          </div>
          <input v-else v-model="email" type="email" class="input-field" placeholder="your@email.com" />
        </div>

        <!-- 验证码（SMTP 启用时显示） -->
        <div v-if="smtpEnabled">
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">验证码</label>
          <input v-model="code" type="text" class="input-field" placeholder="6 位验证码" required maxlength="6" />
        </div>

        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">密码</label>
          <input v-model="password" type="password" class="input-field" placeholder="至少 6 位" required minlength="6" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">确认密码</label>
          <input v-model="confirmPassword" type="password" class="input-field" placeholder="再次输入密码" required />
        </div>
        <button type="submit" class="btn-primary w-full py-2.5" :disabled="loading">
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
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
