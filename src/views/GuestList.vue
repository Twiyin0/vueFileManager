<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Icon from '@/components/Icon.vue'

interface GuestUser {
  username: string
  share_count: number
}

const users = ref<GuestUser[]>([])
const loading = ref(true)

onMounted(async () => {
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
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- 顶部导航 -->
    <header class="h-11 flex items-center justify-between px-4 border-b flex-shrink-0" style="background-color: var(--surface-color); border-color: var(--border-color)">
      <div class="flex items-center gap-3 min-w-0">
        <router-link to="/" class="flex items-center gap-2 font-bold text-lg flex-shrink-0">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
          <span style="color: var(--text-color)">VueFileManager</span>
        </router-link>
        <span class="text-sm font-medium truncate" style="color: var(--text-secondary-color)">/ 访客模式</span>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <ThemeToggle />
        <router-link to="/login" class="btn-primary text-sm">登录</router-link>
      </div>
    </header>

    <main class="flex-1 overflow-auto flex flex-col">
      <div class="px-4 pt-4 flex-1">
        <div class="mb-6">
          <h1 class="text-2xl font-bold dark:text-dark-text text-light-text">访客模式</h1>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">浏览公开分享的文件</p>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex items-center justify-center py-20">
          <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>

        <!-- 空状态 -->
        <div v-else-if="users.length === 0" class="card flex flex-col items-center justify-center py-20 text-gray-400 dark:text-dark-text-secondary">
          <Icon name="globe" class="w-20 h-20 mb-4" />
          <p class="text-lg">暂无公开分享的文件</p>
          <p class="text-sm mt-1">用户可以在设置中开启访客模式并分享文件夹</p>
        </div>

        <!-- 用户列表 -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <router-link
            v-for="user in users"
            :key="user.username"
            :to="`/guest/${user.username}`"
            class="card flex items-center gap-4 cursor-pointer group"
          >
            <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-dark-accent-soft flex items-center justify-center">
              <Icon name="user" class="w-6 h-6 text-blue-500 dark:text-dark-accent" />
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium dark:text-dark-text text-light-text group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                {{ user.username }}
              </h3>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                {{ user.share_count }} 个共享文件夹
              </p>
            </div>
            <Icon name="chevron-right" class="w-5 h-5 text-gray-400 dark:text-dark-text-secondary group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
          </router-link>
        </div>
      </div>
      <footer class="px-4 py-3 text-center flex-shrink-0" style="color: var(--text-secondary-color)">
        <p class="text-xs opacity-60" style="line-height: 1.4">
          © {{ new Date().getFullYear() }}
          <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">VueFileManager</a>
          by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">Twiyin0</a>
          · MIT License
        </p>
      </footer>
    </main>
  </div>
</template>
