<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useI18n } from '@/composables/useI18n'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  src: string
}>()

interface TocItem {
  id: string
  text: string
  level: number
}

const { t } = useI18n()

const html = ref('')
const toc = ref<TocItem[]>([])
const loading = ref(true)
const error = ref('')
const activeId = ref('')

let observer: IntersectionObserver | null = null

onMounted(async () => {
  try {
    const res = await fetch(props.src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()

    const headings: TocItem[] = []
    const slugCount: Record<string, number> = {}

    const renderer = new marked.Renderer()
    renderer.heading = function ({ text, depth }: { text: string; depth: number }) {
      if (depth <= 2) {
        const rawText = text.replace(/<[^>]*>/g, '')
        let id = rawText.toLowerCase().replace(/[^a-z0-9_:-]+/g, '-').replace(/^-|-$/g, '')
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

onUnmounted(() => {
  observer?.disconnect()
})

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

function isScrolledIntoView(id: string) {
  return activeId.value === id
}
</script>

<template>
  <div class="doc-container">
    <div class="doc-content">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      <div v-else-if="error" class="card p-6 text-center">
        <Icon name="exclamation" class="mx-auto mb-3 h-12 w-12 text-red-400" />
        <p class="text-red-500">{{ error }}</p>
      </div>
      <div v-else class="prose" v-html="html" />
    </div>

    <aside v-if="toc.length > 0" class="doc-toc">
      <div class="toc-inner">
        <p class="toc-title">{{ t('markdownDoc.tocTitle', 'Table of Contents') }}</p>
        <nav class="toc-list">
          <a
            v-for="item in toc"
            :key="item.id"
            :class="['toc-link', `toc-level-${item.level}`, { 'toc-active': isScrolledIntoView(item.id) }]"
            :style="{ paddingLeft: (item.level - 1) * 0.75 + 'rem' }"
            @click.prevent="scrollTo(item.id)"
          >
            {{ item.text }}
          </a>
        </nav>
      </div>
    </aside>
  </div>
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
  .doc-toc {
    display: none;
  }
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

.prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-color); scroll-margin-top: 5rem; }
.prose :deep(h2) { font-size: 1.35rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; color: var(--text-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; scroll-margin-top: 5rem; }
.prose :deep(h3) { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--text-color); scroll-margin-top: 5rem; }
.prose :deep(p) { margin-bottom: 0.75rem; line-height: 1.7; color: var(--text-color); }
</style>
