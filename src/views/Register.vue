<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'

const router = useRouter()
const authStore = useAuthStore()
const { t, format, setLanguage } = useI18n()

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

const sendCodeButtonLabel = computed(() => {
  if (codeCountdown.value > 0) {
    return format('register.countdown', `${codeCountdown.value}s`, { count: codeCountdown.value })
  }
  if (codeSending.value) {
    return t('register.sendingCode', 'Sending...')
  }
  return t('register.sendCode', 'Send Code')
})

function normalizeLanguage(language: unknown): 'zh-CN' | 'en-US' {
  return language === 'en-US' ? 'en-US' : 'zh-CN'
}

onMounted(async () => {
  try {
    const res = await fetch('/api/site-config')
    if (res.ok) {
      const data = await res.json()
      smtpEnabled.value = data.smtp_enabled
    }
  } catch {}
})

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

async function sendCode() {
  if (!email.value.trim()) {
    error.value = t('register.emailRequired', 'Please enter your email')
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

    codeCountdown.value = 60
    countdownTimer = setInterval(() => {
      codeCountdown.value -= 1
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
    error.value = t('register.passwordMismatch', 'Passwords do not match')
    return
  }

  loading.value = true

  try {
    const body: Record<string, string> = { username: username.value, password: password.value }
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
    await setLanguage(normalizeLanguage(authStore.user?.settings?.language))
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
      <div class="mb-6 flex flex-col items-center">
        <h1 class="text-2xl font-bold" style="color: var(--text-color)">{{ t('register.title', 'Create Account') }}</h1>
        <p class="mt-1 text-sm" style="color: var(--text-secondary-color)">{{ t('register.subtitle', 'Register your VueFileManager account') }}</p>
      </div>

      <div
        v-if="error"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleRegister">
        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('common.username', 'Username') }}</label>
          <input
            v-model="username"
            type="text"
            class="input-field"
            :placeholder="t('register.usernamePlaceholder', '3-20 characters')"
            required
            minlength="3"
            maxlength="20"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">
            {{ t('common.email', 'Email') }}
            <span v-if="!smtpEnabled" class="text-xs font-normal" style="color: var(--text-secondary-color)">
              ({{ t('register.optional', 'Optional') }})
            </span>
          </label>

          <div v-if="smtpEnabled" class="flex gap-2">
            <input
              v-model="email"
              type="email"
              class="input-field flex-1"
              :placeholder="t('register.emailPlaceholder', 'your@email.com')"
              required
            />
            <button
              type="button"
              class="btn-secondary whitespace-nowrap px-3 text-sm"
              :disabled="codeSending || codeCountdown > 0"
              @click="sendCode"
            >
              {{ sendCodeButtonLabel }}
            </button>
          </div>

          <input
            v-else
            v-model="email"
            type="email"
            class="input-field"
            :placeholder="t('register.emailPlaceholder', 'your@email.com')"
          />
        </div>

        <div v-if="smtpEnabled">
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('register.code', 'Verification Code') }}</label>
          <input
            v-model="code"
            type="text"
            class="input-field"
            :placeholder="t('register.codePlaceholder', '6-digit code')"
            required
            maxlength="6"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('common.password', 'Password') }}</label>
          <input
            v-model="password"
            type="password"
            class="input-field"
            :placeholder="t('register.passwordPlaceholder', 'At least 6 characters')"
            required
            minlength="6"
          />
        </div>

        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('register.confirmPassword', 'Confirm Password') }}</label>
          <input
            v-model="confirmPassword"
            type="password"
            class="input-field"
            :placeholder="t('register.confirmPasswordPlaceholder', 'Enter your password again')"
            required
          />
        </div>

        <button type="submit" class="btn-primary w-full py-2.5" :disabled="loading">
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ t('register.submitting', 'Creating account...') }}
          </span>
          <span v-else>{{ t('register.submit', 'Register') }}</span>
        </button>
      </form>

      <p class="mt-6 text-center text-sm" style="color: var(--text-secondary-color)">
        {{ t('register.hasAccount', 'Already have an account?') }}
        <router-link to="/login" class="text-blue-500 hover:text-blue-600">{{ t('app.login', 'Login') }}</router-link>
      </p>
    </div>
  </div>
</template>
