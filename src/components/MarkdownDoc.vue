<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useI18n } from '@/composables/useI18n'
import Icon from '@/components/Icon.vue'
import { getCodeLanguageLabel, highlightMarkdownCode } from '@/utils/markdownSyntaxHighlight'

const props = defineProps<{
  src: string
  linkMap?: Record<string, string>
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

onMounted(async () => {
  await loadMarkdown()
})

onUnmounted(() => {})

watch(() => props.src, async () => {
  await loadMarkdown()
})

async function loadMarkdown() {
  loading.value = true
  error.value = ''
  toc.value = []
  html.value = ''

  try {
    const res = await fetch(props.src)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const md = await res.text()

    const headings: TocItem[] = []
    const slugCount: Record<string, number> = {}

    const renderer = new marked.Renderer()
    renderer.code = function ({ text, lang }: { text: string; lang?: string }) {
      const language = (lang || '').trim()
      const languageLabel = escapeHtml(getCodeLanguageLabel(language))
      const highlightedCode = highlightMarkdownCode(text, language)
      const normalizedLang = escapeHtml((language || 'text').trim().toLowerCase() || 'text')
      return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-language">${languageLabel}</span></div><pre><code class="language-${normalizedLang}">${highlightedCode}</code></pre></div>`
    }
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
    renderer.link = function ({ href, title, tokens }: { href: string; title?: string | null; tokens?: any[] }) {
      const rawText = tokens?.map((token) => token.raw || token.text || '').join('') || href || ''
      const mappedHref = mapDocLink(href)
      const escapedHref = escapeHtml(mappedHref)
      const escapedTitle = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapedHref}"${escapedTitle}>${rawText}</a>`
    }

    const rawHtml = await marked(md, { renderer })
    html.value = DOMPurify.sanitize(rawHtml)
    toc.value = headings
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function mapDocLink(href?: string | null) {
  if (!href) return '#'
  const trimmed = href.trim()
  const directMatch = props.linkMap?.[trimmed]
  if (directMatch) return directMatch

  const normalized = trimmed.replace(/^\.\//, '/').replace(/^\/public\//, '/')
  return props.linkMap?.[normalized] || trimmed
}

function scrollTo(id: string) {
  const el = document.getElementById(id)
  const mainEl = document.querySelector('main.flex-1.overflow-auto') as HTMLElement | null
  if (el && mainEl) {
    const mainRect = mainEl.getBoundingClientRect()
    const targetTop = mainEl.scrollTop + el.getBoundingClientRect().top - mainRect.top - 80
    mainEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
  }
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
            :class="['toc-link', `toc-level-${item.level}`]"
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

.toc-level-2 {
  font-size: 0.75rem;
}

.prose :deep(h1) { font-size: 1.75rem; font-weight: 700; margin-bottom: 1rem; color: var(--text-color); scroll-margin-top: 5rem; }
.prose :deep(h2) { font-size: 1.35rem; font-weight: 600; margin-top: 2rem; margin-bottom: 0.75rem; color: var(--text-color); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; scroll-margin-top: 5rem; }
.prose :deep(h3) { font-size: 1.1rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--text-color); scroll-margin-top: 5rem; }
.prose :deep(p) { margin-bottom: 0.75rem; line-height: 1.7; color: var(--text-color); }
.prose :deep(ul), .prose :deep(ol) { margin: 0 0 1rem; padding-left: 1.5rem; color: var(--text-color); }
.prose :deep(li) { margin-bottom: 0.35rem; line-height: 1.7; }
.prose :deep(li)::marker { color: var(--accent-color); }
.prose :deep(a) { color: var(--accent-color); text-decoration: underline; text-underline-offset: 0.16em; }
.prose :deep(table) { width: 100%; margin: 1rem 0; border-collapse: collapse; overflow: hidden; border-radius: 0.9rem; box-shadow: 0 0 0 1px var(--border-color); }
.prose :deep(th), .prose :deep(td) { padding: 0.7rem 0.85rem; border: 1px solid var(--border-color); text-align: left; color: var(--text-color); }
.prose :deep(th) { background: color-mix(in srgb, var(--accent-color) 10%, var(--surface-color) 90%); font-weight: 700; }
.prose :deep(blockquote) { margin: 1rem 0; padding: 0.9rem 1rem; border-left: 4px solid var(--accent-color); border-radius: 0 0.8rem 0.8rem 0; background: color-mix(in srgb, var(--accent-color) 8%, transparent); color: var(--text-secondary-color); }
.prose :deep(hr) { margin: 1.5rem 0; border: 0; border-top: 1px dashed color-mix(in srgb, var(--accent-color) 30%, var(--border-color) 70%); }
.prose :deep(code) { padding: 0.12rem 0.38rem; border-radius: 0.4rem; background: color-mix(in srgb, var(--accent-color) 10%, var(--surface-color) 90%); color: color-mix(in srgb, var(--accent-color) 68%, var(--text-color) 32%); font-weight: 600; }
.prose :deep(.md-code-block) { margin: 1rem 0 1.25rem; overflow: hidden; border-radius: 1rem; border: 1px solid color-mix(in srgb, var(--accent-color) 16%, var(--border-color) 84%); background: color-mix(in srgb, var(--accent-color) 5%, var(--surface-color) 95%); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06); }
.prose :deep(.md-code-header) { display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.9rem; border-bottom: 1px solid color-mix(in srgb, var(--accent-color) 12%, var(--border-color) 88%); background: color-mix(in srgb, var(--accent-color) 12%, var(--surface-color) 88%); }
.prose :deep(.md-code-language) { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-color); }
.prose :deep(.md-code-block pre) { margin: 0; overflow-x: auto; padding: 1rem 1.1rem 1.15rem; background: transparent; }
.prose :deep(.md-code-block pre code) { display: block; min-width: max-content; padding: 0; background: transparent; color: var(--text-color); font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 0.9rem; font-weight: 500; line-height: 1.7; }
.prose :deep(pre:not(.md-code-block pre)) { overflow-x: auto; margin: 1rem 0; padding: 1rem 1.1rem; border-radius: 0.9rem; background: color-mix(in srgb, var(--accent-color) 6%, var(--surface-color) 94%); border: 1px solid color-mix(in srgb, var(--accent-color) 18%, var(--border-color) 82%); }
.prose :deep(.tok-keyword) { color: #b42318; font-weight: 700; }
.prose :deep(.tok-type) { color: #7c3aed; }
.prose :deep(.tok-preproc) { color: #c2410c; }
.prose :deep(.tok-variable) { color: #0f172a; }
.prose :deep(.tok-variable-def) { color: #1d4ed8; }
.prose :deep(.tok-builtin) { color: #0369a1; }
.prose :deep(.tok-property) { color: #1d4ed8; }
.prose :deep(.tok-attribute) { color: #7c3aed; }
.prose :deep(.tok-tag) { color: #047857; }
.prose :deep(.tok-constant) { color: #0f766e; }
.prose :deep(.tok-number) { color: #0ea5e9; }
.prose :deep(.tok-string) { color: #166534; }
.prose :deep(.tok-string-special) { color: #15803d; }
.prose :deep(.tok-regexp) { color: #0891b2; }
.prose :deep(.tok-escape) { color: #dc2626; }
.prose :deep(.tok-comment) { color: #64748b; font-style: italic; }
.prose :deep(.tok-comment-doc) { color: #0f766e; font-style: italic; }
.prose :deep(.tok-meta) { color: #9333ea; }
.prose :deep(.tok-annotation) { color: #c026d3; }
.prose :deep(.tok-punctuation) { color: color-mix(in srgb, var(--text-color) 72%, transparent); }
.prose :deep(.tok-bracket) { color: color-mix(in srgb, var(--accent-color) 55%, var(--text-color) 45%); }
.prose :deep(.tok-separator) { color: #64748b; }
.prose :deep(.tok-operator) { color: #c2410c; }

:global(.dark) .prose :deep(.tok-keyword) { color: #f472b6; }
:global(.dark) .prose :deep(.tok-type) { color: #a78bfa; }
:global(.dark) .prose :deep(.tok-preproc) { color: #fb923c; }
:global(.dark) .prose :deep(.tok-variable) { color: #e2e8f0; }
:global(.dark) .prose :deep(.tok-variable-def) { color: #7dd3fc; }
:global(.dark) .prose :deep(.tok-builtin) { color: #38bdf8; }
:global(.dark) .prose :deep(.tok-property) { color: #93c5fd; }
:global(.dark) .prose :deep(.tok-attribute) { color: #c4b5fd; }
:global(.dark) .prose :deep(.tok-tag) { color: #34d399; }
:global(.dark) .prose :deep(.tok-constant) { color: #2dd4bf; }
:global(.dark) .prose :deep(.tok-number) { color: #7dd3fc; }
:global(.dark) .prose :deep(.tok-string) { color: #86efac; }
:global(.dark) .prose :deep(.tok-string-special) { color: #4ade80; }
:global(.dark) .prose :deep(.tok-regexp) { color: #22d3ee; }
:global(.dark) .prose :deep(.tok-escape) { color: #fda4af; }
:global(.dark) .prose :deep(.tok-comment) { color: #94a3b8; }
:global(.dark) .prose :deep(.tok-comment-doc) { color: #5eead4; }
:global(.dark) .prose :deep(.tok-meta) { color: #d8b4fe; }
:global(.dark) .prose :deep(.tok-annotation) { color: #f0abfc; }
:global(.dark) .prose :deep(.tok-punctuation) { color: rgba(226, 232, 240, 0.72); }
:global(.dark) .prose :deep(.tok-bracket) { color: #cbd5e1; }
:global(.dark) .prose :deep(.tok-separator) { color: #94a3b8; }
:global(.dark) .prose :deep(.tok-operator) { color: #fdba74; }
</style>
