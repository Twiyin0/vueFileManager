<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import Sidebar from './Sidebar.vue'
import ThemeToggle from './ThemeToggle.vue'

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
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
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
