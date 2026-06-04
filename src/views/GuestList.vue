<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'

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
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--surface-color)">
      <router-link to="/" class="flex items-center gap-2 font-bold text-lg">
        <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <span class="dark:text-dark-text text-light-text">VueFileManager</span>
      </router-link>
      <div class="flex items-center gap-3">
        <ThemeToggle />
        <router-link to="/login" class="btn-primary text-sm">登录</router-link>
      </div>
    </header>

    <!-- 内容 -->
    <main class="flex-1 p-4">
      <div class="max-w-4xl mx-auto">
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
          <svg class="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          <p class="text-lg">暂无公开分享的文件</p>
          <p class="text-sm mt-1">用户可以在设置中开启访客模式并分享文件夹</p>
        </div>

        <!-- 用户列表 -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <router-link
            v-for="user in users"
            :key="user.username"
            :to="`/guest/${user.username}`"
            class="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-dark-accent-soft flex items-center justify-center">
              <svg class="w-6 h-6 text-blue-500 dark:text-dark-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium dark:text-dark-text text-light-text group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                {{ user.username }}
              </h3>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                {{ user.share_count }} 个共享文件夹
              </p>
            </div>
            <svg class="w-5 h-5 text-gray-400 dark:text-dark-text-secondary group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </router-link>
        </div>
      </div>
    </main>
  </div>
</template>
