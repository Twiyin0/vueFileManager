<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const authStore = useAuthStore()
const { t, setLanguage } = useI18n()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function normalizeLanguage(language: unknown): 'zh-CN' | 'en-US' {
  return language === 'en-US' ? 'en-US' : 'zh-CN'
}

async function handleLogin() {
  error.value = ''
  loading.value = true

  try {
    await authStore.login(username.value, password.value)
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
      <div class="mb-8 flex flex-col items-center">
        <img src="/logo-long.png" alt="VueFileManager" class="mb-4 h-16" />
        <h1 class="text-2xl font-bold" style="color: var(--text-color)">VueFileManager</h1>
        <p class="mt-1 text-sm" style="color: var(--text-secondary-color)">{{ t('login.subtitle', 'Sign in to your account') }}</p>
      </div>

      <div
        v-if="error"
        class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('common.username', 'Username') }}</label>
          <input
            v-model="username"
            type="text"
            class="input-field"
            :placeholder="t('login.usernamePlaceholder', 'Enter your username')"
            required
          />
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('common.password', 'Password') }}</label>
          <input
            v-model="password"
            type="password"
            class="input-field"
            :placeholder="t('login.passwordPlaceholder', 'Enter your password')"
            required
          />
        </div>
        <button type="submit" class="btn-primary w-full py-2.5" :disabled="loading">
          <span v-if="loading" class="flex items-center justify-center gap-2">
            <svg class="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ t('login.loggingIn', 'Signing in...') }}
          </span>
          <span v-else>{{ t('app.login', 'Login') }}</span>
        </button>
      </form>

      <p class="mt-6 text-center text-sm" style="color: var(--text-secondary-color)">
        {{ t('login.noAccount', 'Don\'t have an account yet?') }}
        <router-link to="/register" class="text-blue-500 hover:text-blue-600">{{ t('register.submit', 'Register') }}</router-link>
      </p>

      <div class="mt-4 border-t pt-4" style="border-color: var(--border-color)">
        <router-link
          to="/guest"
          class="flex items-center justify-center gap-2 text-sm hover:text-blue-500"
          style="color: var(--text-secondary-color)"
        >
          <Icon name="globe" class="h-4 w-4" />
          {{ t('login.guestEntry', 'Browse as guest') }}
        </router-link>
      </div>
    </div>
  </div>
</template>
