<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useI18n } from '@/composables/useI18n'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Icon from '@/components/Icon.vue'
import { useAuthStore } from '@/stores/auth'

interface GuestUser {
  username: string
  share_count: number
}

const { t, format } = useI18n()

const users = ref<GuestUser[]>([])
const loading = ref(true)
const authStore = useAuthStore()

onMounted(async () => {
  if (!authStore.user && localStorage.getItem('token')) {
    await authStore.fetchUser()
  }

  try {
    const res = await api.get<{ users: GuestUser[] }>('/guest')
    users.value = res.users
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="flex min-h-screen flex-col" style="background-color: var(--bg-color)">
    <header class="flex h-11 flex-shrink-0 items-center justify-between border-b px-4" style="background-color: var(--surface-color); border-color: var(--border-color)">
      <div class="min-w-0 flex items-center gap-3">
        <router-link to="/" class="flex flex-shrink-0 items-center gap-2 text-lg font-bold">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
          <span style="color: var(--text-color)">VueFileManager</span>
        </router-link>
        <span class="truncate text-sm font-medium" style="color: var(--text-secondary-color)">/ {{ t('guest.mode', 'Guest Mode') }}</span>
      </div>
      <div class="flex flex-shrink-0 items-center gap-3">
        <ThemeToggle />
        <router-link v-if="authStore.isLoggedIn" to="/" class="btn-primary text-sm">{{ t('guest.userMode', 'User Mode') }}</router-link>
        <router-link v-else to="/login" class="btn-primary text-sm">{{ t('app.login', 'Login') }}</router-link>
      </div>
    </header>

    <main class="flex flex-1 flex-col overflow-auto">
      <div class="flex-1 px-4 pt-4">
        <div class="mb-6">
          <h1 class="text-2xl font-bold text-light-text dark:text-dark-text">{{ t('guest.mode', 'Guest Mode') }}</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('guest.browsePublicFiles', 'Browse publicly shared files') }}</p>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-20">
          <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>

        <div v-else-if="users.length === 0" class="card flex flex-col items-center justify-center py-20 text-gray-400 dark:text-dark-text-secondary">
          <Icon name="globe" class="mb-4 h-20 w-20" />
          <p class="text-lg">{{ t('guest.noPublicFiles', 'No public files yet') }}</p>
          <p class="mt-1 text-sm">{{ t('guest.noPublicFilesHint', 'Users can enable guest mode and share folders from settings.') }}</p>
        </div>

        <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <router-link
            v-for="user in users"
            :key="user.username"
            :to="`/guest/${user.username}`"
            class="card group flex cursor-pointer items-center gap-4"
          >
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 dark:bg-dark-accent-soft">
              <Icon name="user" class="h-6 w-6 text-blue-500 dark:text-dark-accent" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="font-medium text-light-text transition-colors group-hover:text-blue-500 dark:text-dark-text dark:group-hover:text-blue-400">
                {{ user.username }}
              </h3>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                {{ format('guest.sharedFoldersCount', '{count} shared folders', { count: user.share_count }) }}
              </p>
            </div>
            <Icon name="chevron-right" class="h-5 w-5 text-gray-400 transition-colors group-hover:text-blue-500 dark:text-dark-text-secondary dark:group-hover:text-blue-400" />
          </router-link>
        </div>
      </div>

      <footer class="flex-shrink-0 px-4 py-3 text-center" style="color: var(--text-secondary-color)">
        <p class="text-xs opacity-60" style="line-height: 1.4">
          (c) {{ new Date().getFullYear() }}
          <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">VueFileManager</a>
          by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">Twiyin0</a>
          {{ t('common.separator', ' | ') }}MIT License
        </p>
      </footer>
    </main>
  </div>
</template>
