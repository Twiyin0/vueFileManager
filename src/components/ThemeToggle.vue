<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useThemeStore, ThemeMode } from '@/stores/theme'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const themeStore = useThemeStore()
const { t } = useI18n()
const showDropdown = ref(false)
const dropdownRef = ref<HTMLDivElement>()

const themes = computed<{ mode: ThemeMode; label: string; icon: string; activeColor: string }[]>(() => [
  { mode: 'light', label: t('theme.light', '亮色'), icon: 'sun', activeColor: '#eab308' },
  { mode: 'dark', label: t('theme.dark', '暗色'), icon: 'moon', activeColor: '#60a5fa' },
  { mode: 'system', label: t('theme.system', '跟随系统'), icon: 'monitor', activeColor: '#22c55e' }
])

const currentTheme = computed(() => themes.value.find((theme) => theme.mode === themeStore.mode) || themes.value[2])

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showDropdown.value = false
  }
}

function selectTheme(mode: ThemeMode) {
  themeStore.setTheme(mode)
  showDropdown.value = false
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <button
      class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-opacity hover:opacity-80"
      :title="currentTheme.label"
      style="color: var(--text-secondary-color)"
      @click.stop="showDropdown = !showDropdown"
    >
      <Icon :name="currentTheme.icon" class="h-5 w-5 flex-shrink-0" :style="{ color: currentTheme.activeColor }" />
      <span class="hidden text-xs sm:inline">{{ currentTheme.label }}</span>
    </button>

    <Transition name="dropdown">
      <div
        v-if="showDropdown"
        class="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border py-1 shadow-sm"
        style="background-color: var(--card-color); border-color: var(--border-color)"
      >
        <button
          v-for="theme in themes"
          :key="theme.mode"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
          :style="{ color: themeStore.mode === theme.mode ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: themeStore.mode === theme.mode ? '500' : 'normal' }"
          @click.stop="selectTheme(theme.mode)"
        >
          <Icon :name="theme.icon" class="h-4 w-4" :style="{ color: themeStore.mode === theme.mode ? theme.activeColor : 'var(--text-secondary-color)' }" />
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
