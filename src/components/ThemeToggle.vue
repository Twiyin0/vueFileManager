<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useThemeStore, ThemeMode } from '@/stores/theme'
import Icon from '@/components/Icon.vue'

const themeStore = useThemeStore()
const showDropdown = ref(false)
const dropdownRef = ref<HTMLDivElement>()

const themes: { mode: ThemeMode; label: string; icon: string; activeColor: string }[] = [
  { mode: 'light', label: '亮色', icon: 'sun', activeColor: '#eab308' },
  { mode: 'dark', label: '暗色', icon: 'moon', activeColor: '#60a5fa' },
  { mode: 'system', label: '跟随系统', icon: 'monitor', activeColor: '#22c55e' },
]

const currentTheme = computed(() => themes.find(t => t.mode === themeStore.mode) || themes[2])

function handleClickOutside(e: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

function selectTheme(mode: ThemeMode) {
  themeStore.setTheme(mode)
  showDropdown.value = false
}
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <button
      @click.stop="showDropdown = !showDropdown"
      class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
      :title="currentTheme.label"
      style="color: var(--text-secondary-color)"
    >
      <Icon :name="currentTheme.icon" class="w-5 h-5 flex-shrink-0" :style="{ color: currentTheme.activeColor }" />
      <span class="text-xs hidden sm:inline">{{ currentTheme.label }}</span>
    </button>
    <!-- 下拉菜单 -->
    <Transition name="dropdown">
      <div v-if="showDropdown"
        class="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-lg border py-1 shadow-sm"
        style="background-color: var(--card-color); border-color: var(--border-color)">
        <button
          v-for="theme in themes"
          :key="theme.mode"
          @click.stop="selectTheme(theme.mode)"
          class="w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
          :style="{ color: themeStore.mode === theme.mode ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: themeStore.mode === theme.mode ? '500' : 'normal' }"
        >
          <Icon :name="theme.icon" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? theme.activeColor : 'var(--text-secondary-color)' }" />
          {{ theme.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
