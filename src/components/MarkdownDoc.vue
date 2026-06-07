<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  src: string
}>()

interface TocItem {
  id: string
  text: string
  level: number
}

const html = ref('')
const toc = ref<TocItem[]>([])
const loading = ref(true)
const error = ref('')
const activeId = ref('')

onMounted(async () => {
  try {
    const res = await fetch(props.src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()

    // 收集标题
    const headings: TocItem[] = []
    const slugCount: Record<string, number> = {}

    const renderer = new marked.Renderer()
    renderer.heading = function ({ text, depth }: { text: string; depth: number }) {
      // 只收集 h1 和 h2
      if (depth <= 2) {
        const rawText = text.replace(/<[^>]*>/g, '')
        let id = rawText.toLowerCase().replace(/[^\w一-鿿]+/g, '-').replace(/^-|-$/g, '')
        if (slugCount[id]) {
          slugCount[id]++
          id = `${id}-${slugCount[id]}`
        } else {
          slugCount[id] = 1
        }
        headings.push({ id, text: rawText, level: depth })
        return `<h${depth} id="${id}">${text}</h${depth}>`
      }
      return `<h${depth}>${text}</h${depth}>`
    }

    const rawHtml = await marked(md, { renderer })
    html.value = DOMPurify.sanitize(rawHtml)
    toc.value = headings

    await nextTick()
    observeHeadings()
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})

let observer: IntersectionObserver | null = null

function observeHeadings() {
  const main = document.querySelector('main.flex-1.overflow-auto')
  if (!main) return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeId.value = entry.target.id
        }
      }
    },
    { root: main, rootMargin: '-80px 0px -70% 0px', threshold: 0 }
  )

  for (const item of toc.value) {
    const el = document.getElementById(item.id)
    if (el) observer.observe(el)
  }
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  const main = document.querySelector('main.flex-1.overflow-auto')
  if (el && main) {
    main.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' })
  }
}

function isScrolledIntoView(id: string): boolean {
  return activeId.value === id
}

import { onUnmounted } from 'vue'
onUnmounted(() => { observer?.disconnect() })
</script>

<template>
  <Layout>
    <div class="doc-container">
      <!-- 文档内容 -->
      <div class="doc-content">
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
        <div v-else class="prose" v-html="html" />
      </div>

      <!-- 右侧目录 -->
      <aside v-if="toc.length > 0" class="doc-toc">
        <div class="toc-inner">
          <p class="toc-title">目录</p>
          <nav class="toc-list">
            <a
              v-for="item in toc"
              :key="item.id"
              @click.prevent="scrollTo(item.id)"
              :class="['toc-link', `toc-level-${item.level}`, { 'toc-active': isScrolledIntoView(item.id) }]"
              :style="{ paddingLeft: (item.level - 1) * 0.75 + 'rem' }"
            >
              {{ item.text }}
            </a>
          </nav>
        </div>
      </aside>
    </div>
  </Layout>
</template>

<style scoped>
.doc-container {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 1.5rem 2rem;
  max-width: 100%;
}

.doc-content {
  flex: 1;
  min-width: 0;
}

.doc-toc {
  width: 220px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  align-self: flex-start;
  max-height: calc(100vh - 5rem);
  overflow-y: auto;
}

@media (max-width: 1024px) {
  .doc-toc { display: none; }
}

.toc-inner {
  border-left: 2px solid var(--border-color);
  padding-left: 0.75rem;
}

.toc-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
  color: var(--text-secondary-color);
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.toc-link {
  display: block;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--text-secondary-color);
  text-decoration: none;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  transition: all 0.15s;
  border-left: 2px solid transparent;
  margin-left: -2px;
}

.toc-link:hover {
  color: var(--text-color);
  background: var(--hover-color);
}

.toc-link.toc-active {
  color: var(--accent-color);
  border-left-color: var(--accent-color);
  background: var(--accent-soft-color);
}

.toc-level-2 {
  font-size: 0.75rem;
}

/* Prose styles */
.prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-color); scroll-margin-top: 5rem; }
.prose :deep(h2) { font-size: 1.35rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; color: var(--text-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; scroll-margin-top: 5rem; }
.prose :deep(h3) { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--text-color); scroll-margin-top: 5rem; }
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
