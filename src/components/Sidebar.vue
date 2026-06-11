<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { getSidebarSections } from '@/app/modules'

const props = defineProps<{
  collapsed?: boolean
  mobile?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const authStore = useAuthStore()
const route = useRoute()

// 侧边栏宽度（可拖拽调节）
const sidebarWidth = ref(Number(localStorage.getItem('sidebarWidth')) || 224)
const isDragging = ref(false)
const MIN_WIDTH = 160
const MAX_WIDTH = 400

function onDragStart(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return
  const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX))
  sidebarWidth.value = newWidth
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  localStorage.setItem('sidebarWidth', String(sidebarWidth.value))
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

const sections = computed(() => getSidebarSections(authStore.isAdmin))

function isActive(path: string) {
  return route.path === path
}
</script>

<template>
  <aside
    class="sidebar-aside flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden relative"
    :class="collapsed ? 'w-16' : ''"
    :style="collapsed ? '' : { width: sidebarWidth + 'px' }"
  >
    <!-- 收缩按钮 -->
    <div class="px-2 pt-2 pb-1">
      <button
        @click="emit('toggle')"
        class="w-full flex items-center justify-center p-2 transition-colors rounded-md"
        style="color: var(--text-secondary-color)"
        :title="collapsed ? '展开侧边栏' : '收缩侧边栏'"
      >
        <Icon name="chevron-left-double" class="w-4 h-4 transition-transform duration-300" :class="collapsed ? 'rotate-180' : ''" />
      </button>
    </div>

    <nav class="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
      <template v-for="section in sections" :key="section.id">
        <div v-if="section.title" class="sidebar-divider my-2 mx-1">
          <p v-if="!collapsed" class="px-2 pt-1 pb-0.5 text-xs uppercase tracking-wider" style="color: var(--text-secondary-color); opacity: 0.6">{{ section.title }}</p>
        </div>

        <router-link
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          class="sidebar-item flex items-center text-sm transition-all duration-150 relative"
          :class="[
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-1.5',
            isActive(item.path) ? 'sidebar-item-active' : ''
          ]"
          :title="collapsed ? item.label : undefined"
        >
          <Icon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </router-link>
      </template>

      <!-- 访客模式入口 -->
      <div class="sidebar-divider my-2 mx-1" />
      <router-link
        to="/guest"
        class="sidebar-item flex items-center text-sm transition-all duration-150 relative"
        :class="collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-1.5'"
        :title="collapsed ? '访客模式' : undefined"
      >
        <Icon name="globe" class="w-5 h-5 flex-shrink-0" />
        <span v-if="!collapsed" class="truncate">访客模式</span>
      </router-link>
    </nav>

    <!-- 底部留白（给 APlayer 收缩图标留空间） -->
    <div class="h-12 flex-shrink-0" />

    <!-- 拖拽调节条（桌面端展开时显示） -->
    <div
      v-if="!collapsed && !mobile"
      class="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 group"
      @mousedown="onDragStart"
    >
      <div class="absolute top-0 right-0 w-0.5 h-full transition-colors"
        :class="isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-400'" />
    </div>
  </aside>
</template>

<style scoped>
.sidebar-aside {
  background-color: var(--surface-color);
  border-right: 1px solid var(--border-color);
  border-radius: 0.5rem;
}

/* 分隔线 */
.sidebar-divider {
  border-top: 1px solid var(--border-color);
  opacity: 0.6;
}

/* 导航项基础样式 */
.sidebar-item {
  color: var(--text-secondary-color);
  border-radius: 0.375rem;
  background-color: transparent;
}

.sidebar-item:hover {
  background-color: var(--hover-color);
  color: var(--text-color);
}

/* 激活项：左侧竖条 + 背景高亮 */
.sidebar-item-active {
  background-color: var(--accent-soft-color);
  color: var(--accent-color) !important;
  transition: background-color 0.25s ease, color 0.25s ease;
}

.sidebar-item-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.25rem;
  bottom: 0.25rem;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background-color: var(--accent-color);
  animation: accent-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  transform-origin: top center;
}

@keyframes accent-slide-in {
  0% {
    opacity: 0;
    transform: scaleY(0);
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 1;
    transform: scaleY(1);
  }
}
</style>
