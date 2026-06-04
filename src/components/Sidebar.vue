<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'

const props = defineProps<{
  collapsed?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const authStore = useAuthStore()
const route = useRoute()

const navItems = [
  { path: '/', label: '文件管理', icon: 'folder' },
  { path: '/favourites', label: '我的收藏', icon: 'star' },
  { path: '/my-shares', label: '我的分享', icon: 'share' },
  { path: '/trash', label: '回收站', icon: 'trash' },
  { path: '/storage-pools', label: '存储池', icon: 'storage' },
  { path: '/settings', label: '设置', icon: 'settings' },
  { path: '/apikeys', label: 'API Keys', icon: 'key' },
]

const adminItems = [
  { path: '/admin', label: '管理面板', icon: 'admin' },
]

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <aside
    class="border-r flex flex-col py-3 flex-shrink-0 transition-all duration-300 overflow-hidden"
    :class="collapsed ? 'w-16' : 'w-56'"
    style="background-color: var(--surface-color); border-color: var(--border-color)"
  >
    <nav class="flex-1 px-2 space-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center rounded-lg text-sm transition-colors"
        :class="collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'"
        :style="isActive(item.path)
          ? 'background-color: var(--accent-soft-color); color: var(--accent-color)'
          : 'color: var(--text-secondary-color)'"
        :title="collapsed ? item.label : undefined"
        @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', isActive(item.path) ? '' : 'var(--hover-color)')"
        @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', isActive(item.path) ? 'var(--accent-soft-color)' : '')"
      >
        <!-- 文件图标 -->
        <svg v-if="item.icon === 'folder'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <!-- 收藏图标 -->
        <svg v-if="item.icon === 'star'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
        </svg>
        <!-- 回收站图标 -->
        <svg v-if="item.icon === 'trash'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        <!-- 存储池图标 -->
        <svg v-if="item.icon === 'storage'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
        </svg>
        <!-- 设置图标 -->
        <svg v-if="item.icon === 'settings'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <!-- Key 图标 -->
        <svg v-if="item.icon === 'key'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
        </svg>
        <!-- 分享图标 -->
        <svg v-if="item.icon === 'share'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
        </svg>
        <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
      </router-link>

      <template v-if="authStore.isAdmin">
        <div class="pt-3 mt-3 border-t" style="border-color: var(--border-color)">
          <p v-if="!collapsed" class="px-3 py-1 text-xs uppercase" style="color: var(--text-secondary-color)">管理</p>
        </div>
        <router-link
          v-for="item in adminItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center rounded-lg text-sm transition-colors"
          :class="collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'"
          :style="isActive(item.path)
            ? 'background-color: var(--accent-soft-color); color: var(--accent-color)'
            : 'color: var(--text-secondary-color)'"
          :title="collapsed ? item.label : undefined"
          @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', isActive(item.path) ? '' : 'var(--hover-color)')"
          @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', isActive(item.path) ? 'var(--accent-soft-color)' : '')"
        >
          <svg v-if="item.icon === 'admin'" class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
          </svg>
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </router-link>
      </template>

      <!-- 访客模式入口 -->
      <div class="pt-3 mt-3 border-t" style="border-color: var(--border-color)">
        <router-link
          to="/guest"
          class="flex items-center rounded-lg text-sm transition-colors"
          :class="collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'"
          style="color: var(--text-secondary-color)"
          :title="collapsed ? '访客模式' : undefined"
          @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
          @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
        >
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
          </svg>
          <span v-if="!collapsed" class="truncate">访客模式</span>
        </router-link>
      </div>
    </nav>

    <!-- 收缩按钮 -->
    <div class="px-2 pt-2 border-t" style="border-color: var(--border-color)">
      <button
        @click="emit('toggle')"
        class="w-full flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
        style="color: var(--text-secondary-color)"
        :title="collapsed ? '展开侧边栏' : '收缩侧边栏'"
      >
        <svg class="w-4 h-4 transition-transform duration-300" :class="collapsed ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/>
        </svg>
      </button>
    </div>
  </aside>
</template>
