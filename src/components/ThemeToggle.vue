<script setup lang="ts">
import { useThemeStore, ThemeMode } from '@/stores/theme'
import Icon from '@/components/Icon.vue'

const themeStore = useThemeStore()

const themes: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: '亮色', icon: 'sun' },
  { mode: 'dark', label: '暗色', icon: 'moon' },
  { mode: 'system', label: '跟随系统', icon: 'system' },
]
</script>

<template>
  <div class="flex items-center gap-1 p-1 rounded-lg" style="background-color: var(--hover-color)">
    <button
      v-for="theme in themes"
      :key="theme.mode"
      @click="themeStore.setTheme(theme.mode)"
      class="p-1.5 rounded-md transition-all"
      :style="themeStore.mode === theme.mode
        ? 'background-color: var(--surface-color); box-shadow: 0 1px 2px rgba(0,0,0,0.1)'
        : ''"
      :title="theme.label"
    >
      <!-- 太阳 -->
      <Icon v-if="theme.icon === 'sun'" name="sun" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#eab308' : 'var(--text-secondary-color)' }" />
      <!-- 月亮 -->
      <Icon v-if="theme.icon === 'moon'" name="moon" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#60a5fa' : 'var(--text-secondary-color)' }" />
      <!-- 系统 -->
      <Icon v-if="theme.icon === 'system'" name="monitor" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#22c55e' : 'var(--text-secondary-color)' }" />
    </button>
  </div>
</template>
