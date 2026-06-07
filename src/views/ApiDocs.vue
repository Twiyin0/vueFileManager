<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { marked } from 'marked'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

const html = ref('')
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await fetch('/API.md')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()
    html.value = await marked(md)
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <Layout>
    <div class="px-4 pt-4 pb-8">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
      <div v-else-if="error" class="card p-6 text-center">
        <Icon name="exclamation" class="w-12 h-12 mx-auto mb-3 text-red-400" />
        <p class="text-red-500">{{ error }}</p>
      </div>
      <div v-else class="prose max-w-none" v-html="html" />
    </div>
  </Layout>
</template>

<style scoped>
.prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-color); }
.prose :deep(h2) { font-size: 1.35rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; color: var(--text-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
.prose :deep(h3) { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--text-color); }
.prose :deep(p) { margin-bottom: 0.75rem; line-height: 1.7; color: var(--text-color); }
.prose :deep(a) { color: var(--accent-color); text-decoration: none; }
.prose :deep(a:hover) { text-decoration: underline; }
.prose :deep(code) { background: var(--hover-color); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.85em; font-family: monospace; color: var(--accent-color); }
.prose :deep(pre) { background: var(--surface-color); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; overflow-x: auto; margin-bottom: 1rem; }
.prose :deep(pre code) { background: none; padding: 0; color: var(--text-color); }
.prose :deep(table) { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.875rem; }
.prose :deep(th) { background: var(--hover-color); padding: 0.5rem 0.75rem; text-align: left; font-weight: 600; border: 1px solid var(--border-color); color: var(--text-color); }
.prose :deep(td) { padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); color: var(--text-color); }
.prose :deep(tr:hover) { background: var(--hover-color); }
.prose :deep(blockquote) { border-left: 3px solid var(--accent-color); padding-left: 1rem; margin: 1rem 0; color: var(--text-secondary-color); }
.prose :deep(ul), .prose :deep(ol) { padding-left: 1.5rem; margin-bottom: 0.75rem; color: var(--text-color); }
.prose :deep(li) { margin-bottom: 0.25rem; }
.prose :deep(hr) { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }
.prose :deep(img) { max-width: 100%; border-radius: 0.5rem; }
</style>
