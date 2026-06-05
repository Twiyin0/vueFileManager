<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Icon from '@/components/Icon.vue'

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
  { path: '/favourites', label: '我的收藏', icon: 'star-sharp' },
  { path: '/my-shares', label: '我的分享', icon: 'link' },
  { path: '/trash', label: '回收站', icon: 'trash' },
  { path: '/storage-pools', label: '存储池', icon: 'server' },
  { path: '/settings', label: '设置', icon: 'gear' },
  { path: '/apikeys', label: 'API Keys', icon: 'key' },
]

const adminItems = [
  { path: '/admin', label: '管理面板', icon: 'users' },
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
        <Icon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
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
          <Icon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
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
          <Icon name="globe" class="w-5 h-5 flex-shrink-0" />
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
        <Icon name="chevron-left-double" class="w-4 h-4 transition-transform duration-300" :class="collapsed ? 'rotate-180' : ''" />
      </button>
    </div>
  </aside>
</template>
