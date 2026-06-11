<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import Icon from '@/components/Icon.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'

const props = defineProps<{
  src?: string
  title?: string
}>()

const loading = ref(false)
const error = ref('')
const markdown = ref('')
const collapsed = ref(true)

const heading = computed(() => props.title || '目录说明')

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
    error.value = err.message || '加载 README 失败'
    markdown.value = ''
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="card mb-4 overflow-hidden">
    <button
      class="flex w-full items-center gap-2 px-4 py-3 border-b text-left transition-colors"
      style="border-color: var(--border-color)"
      @click="collapsed = !collapsed"
    >
      <Icon name="file-alt" class="w-4 h-4" style="color: var(--accent-color)" />
      <span class="text-sm font-semibold flex-1" style="color: var(--text-color)">{{ heading }}</span>
      <span v-if="collapsed" class="text-xs" style="color: var(--text-secondary-color)">README 已收起</span>
      <Icon :name="collapsed ? 'chevron-down' : 'chevron-up'" class="w-4 h-4" style="color: var(--text-secondary-color)" />
    </button>
    <div v-if="!collapsed && loading" class="px-4 py-6 text-sm" style="color: var(--text-secondary-color)">
      正在加载 README...
    </div>
    <div v-else-if="!collapsed && error" class="px-4 py-6 text-sm text-red-500">
      {{ error }}
    </div>
    <div v-else-if="!collapsed" class="px-4 py-4">
      <MarkdownContent :source="markdown" />
    </div>
  </section>
</template>
