<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  src?: string
  title?: string
}>()

const loading = ref(false)
const error = ref('')
const html = ref('')

const heading = computed(() => props.title || '目录说明')

watchEffect(async () => {
  if (!props.src) {
    html.value = ''
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
    const markdown = await response.text()
    const rendered = await marked(markdown)
    html.value = DOMPurify.sanitize(rendered)
  } catch (err: any) {
    error.value = err.message || '加载 README 失败'
    html.value = ''
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="card mb-4 overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-3 border-b" style="border-color: var(--border-color)">
      <Icon name="file-alt" class="w-4 h-4" style="color: var(--accent-color)" />
      <span class="text-sm font-semibold" style="color: var(--text-color)">{{ heading }}</span>
    </div>
    <div v-if="loading" class="px-4 py-6 text-sm" style="color: var(--text-secondary-color)">
      正在加载 README...
    </div>
    <div v-else-if="error" class="px-4 py-6 text-sm text-red-500">
      {{ error }}
    </div>
    <article v-else class="readme-content px-4 py-4" v-html="html" />
  </section>
</template>

<style scoped>
.readme-content :deep(h1),
.readme-content :deep(h2),
.readme-content :deep(h3) {
  color: var(--text-color);
  margin-bottom: 0.75rem;
}

.readme-content :deep(h1) {
  font-size: 1.5rem;
}

.readme-content :deep(h2) {
  font-size: 1.2rem;
  margin-top: 1.25rem;
}

.readme-content :deep(p),
.readme-content :deep(li),
.readme-content :deep(blockquote) {
  color: var(--text-color);
  line-height: 1.75;
}

.readme-content :deep(pre) {
  overflow-x: auto;
  padding: 0.9rem;
  border-radius: 0.75rem;
  background: var(--surface-color);
}

.readme-content :deep(code) {
  padding: 0.12rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--hover-color);
}

.readme-content :deep(a) {
  color: var(--accent-color);
}
</style>
