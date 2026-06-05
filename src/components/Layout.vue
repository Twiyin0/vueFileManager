<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Sidebar from './Sidebar.vue'
import ThemeToggle from './ThemeToggle.vue'
import Icon from '@/components/Icon.vue'

const authStore = useAuthStore()
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
watch(sidebarCollapsed, (v) => localStorage.setItem('sidebarCollapsed', String(v)))
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b" style="background-color: var(--surface-color); border-color: var(--border-color)">
      <div class="flex items-center gap-3">
        <router-link to="/" class="flex items-center gap-2 font-bold text-lg">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 34px; height: 34px;" />
          <span style="color: var(--text-color)">VueFileManager</span>
        </router-link>
      </div>

      <div class="flex items-center gap-3">
        <ThemeToggle />
        <template v-if="authStore.isLoggedIn">
          <router-link to="/settings" class="p-2 rounded-lg hover:opacity-80" title="设置" style="color: var(--text-color)">
            <Icon name="gear" class="w-5 h-5" />
          </router-link>
          <div class="flex items-center gap-2">
            <span class="text-sm" style="color: var(--text-secondary-color)">
              {{ authStore.user?.username }}
            </span>
            <button @click="authStore.logout()" class="text-sm text-red-500 hover:text-red-600">
              退出
            </button>
          </div>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-primary text-sm">登录</router-link>
        </template>
      </div>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <!-- 侧边栏 -->
      <Sidebar v-if="authStore.isLoggedIn" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />

      <!-- 主内容区 -->
      <main class="flex-1 overflow-auto p-4">
        <slot />
      </main>
    </div>
  </div>
</template>
