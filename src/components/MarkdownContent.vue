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
.markdown-content {
  --md-heading-color: color-mix(in srgb, var(--accent-color) 72%, var(--text-color) 28%);
  --md-heading-strong-color: color-mix(in srgb, var(--accent-color) 88%, var(--text-color) 12%);
  --md-muted-color: var(--text-secondary-color);
  --md-code-bg: color-mix(in srgb, var(--accent-color) 8%, var(--surface-color) 92%);
  --md-code-text: color-mix(in srgb, var(--accent-color) 65%, var(--text-color) 35%);
  --md-pre-bg: color-mix(in srgb, var(--accent-color) 6%, var(--surface-color) 94%);
  --md-quote-bg: color-mix(in srgb, var(--accent-color) 8%, transparent);
  --md-table-head-bg: color-mix(in srgb, var(--accent-color) 12%, var(--surface-color) 88%);
}

.markdown-content :deep(*) {
  box-sizing: border-box;
}

.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4) {
  color: var(--md-heading-color);
  margin-bottom: 0.75rem;
  font-weight: 700;
  line-height: 1.3;
}

.markdown-content :deep(h1) {
  font-size: 1.5rem;
  color: var(--md-heading-strong-color);
  margin-top: 0;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid color-mix(in srgb, var(--accent-color) 24%, var(--border-color) 76%);
}

.markdown-content :deep(h2) {
  font-size: 1.2rem;
  margin-top: 1.25rem;
  padding-left: 0.7rem;
  border-left: 4px solid color-mix(in srgb, var(--accent-color) 70%, transparent);
}

.markdown-content :deep(h3) {
  font-size: 1.05rem;
  margin-top: 1.1rem;
}

.markdown-content :deep(h4) {
  font-size: 0.98rem;
  margin-top: 1rem;
}

.markdown-content :deep(p),
.markdown-content :deep(li),
.markdown-content :deep(blockquote) {
  color: var(--text-color);
  line-height: 1.75;
}

.markdown-content :deep(p) {
  margin: 0.8rem 0;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.85rem 0;
  padding-left: 1.4rem;
}

.markdown-content :deep(li)::marker {
  color: var(--accent-color);
}

.markdown-content :deep(strong) {
  color: var(--md-heading-strong-color);
}

.markdown-content :deep(em) {
  color: var(--md-muted-color);
}

.markdown-content :deep(pre) {
  overflow-x: auto;
  margin: 1rem 0;
  padding: 1rem 1.1rem;
  border-radius: 0.9rem;
  background: var(--md-pre-bg);
  border: 1px solid color-mix(in srgb, var(--accent-color) 18%, var(--border-color) 82%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 28%, transparent);
}

.markdown-content :deep(code) {
  padding: 0.12rem 0.35rem;
  border-radius: 0.35rem;
  background: var(--md-code-bg);
  color: var(--md-code-text);
  font-weight: 600;
}

.markdown-content :deep(pre code) {
  padding: 0;
  background: transparent;
  color: var(--text-color);
  font-weight: 500;
}

.markdown-content :deep(a) {
  color: var(--accent-color);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent-color) 45%, transparent);
  text-underline-offset: 0.16em;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
  overflow: hidden;
  border-radius: 0.9rem;
  border-style: hidden;
  box-shadow: 0 0 0 1px var(--border-color);
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 0.5rem 0.75rem;
  color: var(--text-color);
}

.markdown-content :deep(th) {
  background: var(--md-table-head-bg);
  font-weight: 600;
  color: var(--md-heading-color);
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid var(--accent-color);
  padding: 0.8rem 1rem;
  margin: 1rem 0;
  border-radius: 0 0.8rem 0.8rem 0;
  background: var(--md-quote-bg);
  color: var(--md-muted-color);
}

.markdown-content :deep(hr) {
  margin: 1.25rem 0;
  border: 0;
  border-top: 1px dashed color-mix(in srgb, var(--accent-color) 26%, var(--border-color) 74%);
}

.markdown-content :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
}
</style>
