<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Icon from '@/components/Icon.vue'
import { getSidebarSections } from '@/app/modules'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  collapsed?: boolean
  mobile?: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

const authStore = useAuthStore()
const route = useRoute()
const { t } = useI18n()

const sidebarWidth = ref(Number(localStorage.getItem('sidebarWidth')) || 224)
const isDragging = ref(false)
const MIN_WIDTH = 160
const MAX_WIDTH = 400

function onDragStart(event: MouseEvent) {
  event.preventDefault()
  isDragging.value = true
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onDragMove(event: MouseEvent) {
  if (!isDragging.value) return
  sidebarWidth.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, event.clientX))
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
    class="sidebar-aside relative flex flex-shrink-0 flex-col overflow-hidden transition-all duration-300"
    :class="collapsed ? 'w-16' : ''"
    :style="collapsed ? '' : { width: `${sidebarWidth}px` }"
  >
    <div class="px-2 pb-1 pt-2">
      <button
        class="w-full rounded-md p-2 transition-colors"
        style="color: var(--text-secondary-color)"
        :title="collapsed ? t('common.expand', 'Expand') : t('common.collapse', 'Collapse')"
        @click="emit('toggle')"
      >
        <div class="flex items-center justify-center">
          <Icon name="chevron-left-double" class="h-4 w-4 transition-transform duration-300" :class="collapsed ? 'rotate-180' : ''" />
        </div>
      </button>
    </div>

    <nav class="flex-1 space-y-0.5 overflow-y-auto px-2 py-1">
      <template v-for="section in sections" :key="section.id">
        <div v-if="section.title" class="sidebar-divider mx-1 my-2">
          <p v-if="!collapsed" class="px-2 pb-0.5 pt-1 text-xs uppercase tracking-wider" style="color: var(--text-secondary-color); opacity: 0.6">
            {{ section.titleKey ? t(section.titleKey, section.title) : section.title }}
          </p>
        </div>

        <router-link
          v-for="item in section.items"
          :key="item.path"
          :to="item.path"
          class="sidebar-item relative flex items-center text-sm transition-all duration-150"
          :class="[
            collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-1.5',
            isActive(item.path) ? 'sidebar-item-active' : ''
          ]"
          :title="collapsed ? (item.labelKey ? t(item.labelKey, item.label) : item.label) : undefined"
        >
          <Icon :name="item.icon" class="h-5 w-5 flex-shrink-0" />
          <span v-if="!collapsed" class="truncate">{{ item.labelKey ? t(item.labelKey, item.label) : item.label }}</span>
        </router-link>
      </template>

      <div class="sidebar-divider mx-1 my-2" />
      <router-link
        to="/guest"
        class="sidebar-item relative flex items-center text-sm transition-all duration-150"
        :class="collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-1.5'"
        :title="collapsed ? t('app.guestMode', 'Guest Mode') : undefined"
      >
        <Icon name="globe" class="h-5 w-5 flex-shrink-0" />
        <span v-if="!collapsed" class="truncate">{{ t('app.guestMode', 'Guest Mode') }}</span>
      </router-link>
    </nav>

    <div class="h-12 flex-shrink-0" />

    <div
      v-if="!collapsed && !mobile"
      class="group absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize"
      @mousedown="onDragStart"
    >
      <div class="absolute right-0 top-0 h-full w-0.5 transition-colors" :class="isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-400'" />
    </div>
  </aside>
</template>

<style scoped>
.sidebar-aside {
  background-color: var(--surface-color);
  border-right: 1px solid var(--border-color);
  border-radius: 0.5rem;
}

.sidebar-divider {
  border-top: 1px solid var(--border-color);
  opacity: 0.6;
}

.sidebar-item {
  color: var(--text-secondary-color);
  border-radius: 0.375rem;
  background-color: transparent;
}

.sidebar-item:hover {
  background-color: var(--hover-color);
  color: var(--text-color);
}

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
