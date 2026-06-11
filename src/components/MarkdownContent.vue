<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps<{
  source: string
}>()

const html = ref('')

const sanitizedSource = computed(() => props.source || '')

watch(sanitizedSource, async (value) => {
  const rendered = await marked(value)
  html.value = DOMPurify.sanitize(rendered)
}, { immediate: true })
</script>

<template>
  <article class="markdown-content" v-html="html" />
</template>

<style scoped>
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
  color: var(--text-color);
  margin-bottom: 0.75rem;
}

.markdown-content :deep(h1) {
  font-size: 1.5rem;
}

.markdown-content :deep(h2) {
  font-size: 1.2rem;
  margin-top: 1.25rem;
}

.markdown-content :deep(p),
.markdown-content :deep(li),
.markdown-content :deep(blockquote) {
  color: var(--text-color);
  line-height: 1.75;
}

.markdown-content :deep(pre) {
  overflow-x: auto;
  padding: 0.9rem;
  border-radius: 0.75rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
}

.markdown-content :deep(code) {
  padding: 0.12rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--hover-color);
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
}

.markdown-content :deep(a) {
  color: var(--accent-color);
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5rem 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(th) {
  background: var(--hover-color);
  font-weight: 600;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  padding-left: 1rem;
  margin: 1rem 0;
}

.markdown-content :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
}
</style>
