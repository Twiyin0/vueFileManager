<script setup lang="ts">
import { useThemeStore, ThemeMode } from '@/stores/theme'

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
      <svg v-if="theme.icon === 'sun'" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#eab308' : 'var(--text-secondary-color)' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
      </svg>
      <!-- 月亮 -->
      <svg v-if="theme.icon === 'moon'" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#60a5fa' : 'var(--text-secondary-color)' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
      </svg>
      <!-- 系统 -->
      <svg v-if="theme.icon === 'system'" class="w-4 h-4" :style="{ color: themeStore.mode === theme.mode ? '#22c55e' : 'var(--text-secondary-color)' }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
    </button>
  </div>
</template>
