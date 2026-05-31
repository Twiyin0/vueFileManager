<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'

const authStore = useAuthStore()
const route = useRoute()

const navItems = [
  { path: '/', label: '文件管理', icon: 'folder' },
  { path: '/settings', label: '存储设置', icon: 'settings' },
  { path: '/apikeys', label: 'API Keys', icon: 'key' },
  { path: '/my-shares', label: '我的分享', icon: 'share' },
]

const adminItems = [
  { path: '/admin', label: '管理面板', icon: 'admin' },
]

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <aside class="w-56 border-r flex flex-col py-3" style="background-color: var(--surface-color); border-color: var(--border-color)">
    <nav class="flex-1 px-2 space-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
        :style="isActive(item.path)
          ? 'background-color: var(--accent-soft-color); color: var(--accent-color)'
          : 'color: var(--text-secondary-color)'"
        @mouseenter="$event.currentTarget.style.backgroundColor = isActive(item.path) ? '' : 'var(--hover-color)'"
        @mouseleave="$event.currentTarget.style.backgroundColor = isActive(item.path) ? 'var(--accent-soft-color)' : ''"
      >
        <!-- 文件图标 -->
        <svg v-if="item.icon === 'folder'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <!-- 设置图标 -->
        <svg v-if="item.icon === 'settings'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <!-- Key 图标 -->
        <svg v-if="item.icon === 'key'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
        </svg>
        <!-- 分享图标 -->
        <svg v-if="item.icon === 'share'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
        </svg>
        {{ item.label }}
      </router-link>

      <template v-if="authStore.isAdmin">
        <div class="pt-3 mt-3 border-t" style="border-color: var(--border-color)">
          <p class="px-3 py-1 text-xs uppercase" style="color: var(--text-secondary-color)">管理</p>
        </div>
        <router-link
          v-for="item in adminItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          :style="isActive(item.path)
            ? 'background-color: var(--accent-soft-color); color: var(--accent-color)'
            : 'color: var(--text-secondary-color)'"
          @mouseenter="$event.currentTarget.style.backgroundColor = isActive(item.path) ? '' : 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = isActive(item.path) ? 'var(--accent-soft-color)' : ''"
        >
          <svg v-if="item.icon === 'admin'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
          </svg>
          {{ item.label }}
        </router-link>
      </template>

      <!-- 访客模式入口 -->
      <div class="pt-3 mt-3 border-t" style="border-color: var(--border-color)">
        <router-link
          to="/guest"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style="color: var(--text-secondary-color)"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          访客模式
        </router-link>
      </div>
    </nav>
  </aside>
</template>
