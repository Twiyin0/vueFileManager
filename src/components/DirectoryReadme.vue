<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from '@/composables/useI18n'
import Icon from '@/components/Icon.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'

const props = defineProps<{
  src?: string
  title?: string
}>()

const { t } = useI18n()

const loading = ref(false)
const error = ref('')
const markdown = ref('')
const collapsed = ref(true)

const heading = computed(() => props.title || t('directoryReadme.title', 'Directory README'))

watchEffect(async () => {
  if (!props.src) {
    markdown.value = ''
    error.value = ''
    return
  }

  loading.value = true
  error.value = ''

  try {
    const response = await fetch(props.src)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    markdown.value = await response.text()
  } catch (err: any) {
    error.value = err.message || t('directoryReadme.loadFailed', 'Failed to load README')
    markdown.value = ''
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="card mb-4 overflow-hidden">
    <button
      class="flex w-full items-center gap-2 border-b px-4 py-3 text-left transition-colors"
      style="border-color: var(--border-color)"
      @click="collapsed = !collapsed"
    >
      <Icon name="file-alt" class="h-4 w-4" style="color: var(--accent-color)" />
      <span class="flex-1 text-sm font-semibold" style="color: var(--text-color)">{{ heading }}</span>
      <span v-if="collapsed" class="text-xs" style="color: var(--text-secondary-color)">
        {{ t('directoryReadme.collapsedHint', 'README collapsed') }}
      </span>
      <Icon :name="collapsed ? 'chevron-down' : 'chevron-up'" class="h-4 w-4" style="color: var(--text-secondary-color)" />
    </button>

    <div v-if="!collapsed && loading" class="px-4 py-6 text-sm" style="color: var(--text-secondary-color)">
      {{ t('directoryReadme.loading', 'Loading README...') }}
    </div>
    <div v-else-if="!collapsed && error" class="px-4 py-6 text-sm text-red-500">
      {{ error }}
    </div>
    <div v-else-if="!collapsed" class="px-4 py-4">
      <MarkdownContent :source="markdown" />
    </div>
  </section>
</template>
