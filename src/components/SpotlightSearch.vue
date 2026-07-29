<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'
import type { FileItem } from '@/stores/files'

const emit = defineEmits<{
  (e: 'navigate', path: string, poolId?: number, highlightPath?: string): void
}>()

const props = withDefaults(defineProps<{
  currentPath?: string
  currentPoolId?: number
}>(), {
  currentPath: '',
  currentPoolId: undefined
})

const { t } = useI18n()
const visible = ref(false)
const query = ref('')
const results = ref<FileItem[]>([])
const loading = ref(false)
const error = ref('')
const selectedIndex = ref(0)
const searchTimeout = ref<number>()
const inputRef = ref<HTMLInputElement | null>(null)

function clearPendingSearch() {
  if (searchTimeout.value !== undefined) {
    window.clearTimeout(searchTimeout.value)
    searchTimeout.value = undefined
  }
}

function focusInput() {
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function open() {
  visible.value = true
  query.value = ''
  results.value = []
  error.value = ''
  selectedIndex.value = 0
  focusInput()
}

function close() {
  visible.value = false
  loading.value = false
  clearPendingSearch()
}

function toggle() {
  if (visible.value) {
    close()
    return
  }
  open()
}

async function search() {
  if (!query.value.trim()) {
    results.value = []
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    params.set('q', query.value)
    if (props.currentPath) params.set('path', props.currentPath)
    if (props.currentPoolId) params.set('poolId', String(props.currentPoolId))
    const res = await api.get<{ files: FileItem[] }>(`/files/search?${params.toString()}`)
    results.value = res.files.slice(0, 20)
    selectedIndex.value = 0
  } catch (err: any) {
    results.value = []
    error.value = err?.message === 'common.invalidRegexPattern'
      ? t('search.invalidRegex', 'Invalid regular expression')
      : ''
  } finally {
    loading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value) return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (event.key === 'Enter' && results.value[selectedIndex.value]) {
    event.preventDefault()
    selectResult(results.value[selectedIndex.value])
  }
}

function selectResult(item: FileItem) {
  const targetPoolId = item.poolId ?? props.currentPoolId
  const targetPath = item.path.split('/').slice(0, -1).join('/')

  emit('navigate', targetPath, targetPoolId, item.path)
  close()
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault()
    toggle()
    return
  }

  if (visible.value && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(query, () => {
  clearPendingSearch()
  searchTimeout.value = window.setTimeout(search, 300)
})

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  clearPendingSearch()
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay-top backdrop-blur-[2px]" style="padding-top: 18vh">
      <div class="dialog-backdrop bg-black/45 dark:bg-black/55" @click="close" />
      <div class="dialog-panel dialog-panel-2xl overflow-hidden">
        <div class="dialog-section pb-4">
          <div
            class="flex items-center gap-3 rounded-2xl border px-4 py-3"
            style="background-color: var(--surface-color); border-color: color-mix(in srgb, var(--accent-color) 10%, var(--border-color) 90%)"
          >
            <Icon name="search" class="h-5 w-5 flex-shrink-0" style="color: var(--text-secondary-color)" />
            <input
              ref="inputRef"
              v-model="query"
              class="flex-1 bg-transparent text-base outline-none sm:text-lg"
              style="color: var(--text-color)"
              :placeholder="t('spotlight.placeholder', 'Search files and folders... (Ctrl+K, //regex)')"
              @keydown="handleKeydown"
            />
            <kbd
              class="rounded-xl px-2.5 py-1.5 text-xs font-medium"
              style="background-color: var(--hover-color); color: var(--text-secondary-color)"
            >
              ESC
            </kbd>
          </div>

          <div
            class="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm"
            style="background-color: color-mix(in srgb, var(--accent-color) 7%, var(--surface-color) 93%); color: var(--text-secondary-color)"
          >
            <Icon name="circle-information" class="h-4 w-4 flex-shrink-0" style="color: var(--accent-color)" />
            <span>{{ t('spotlight.regexHint', 'Prefix with // to enable regular expression search') }}</span>
          </div>
        </div>

        <div class="min-h-[10rem] border-t" style="border-color: color-mix(in srgb, var(--text-color) 8%, var(--border-color) 92%)">
          <div v-if="loading" class="p-6 text-center text-sm" style="color: var(--text-secondary-color)">
          {{ t('spotlight.loading', 'Searching...') }}
          </div>

          <div v-else-if="error" class="p-8 text-center text-sm text-red-500 dark:text-red-400">
            {{ error }}
          </div>

          <div v-else-if="results.length > 0" class="max-h-[320px] overflow-y-auto px-2 py-2 sm:px-3">
            <button
              v-for="(item, index) in results"
              :key="item.path"
              class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors"
              :style="selectedIndex === index
                ? 'background-color: color-mix(in srgb, var(--accent-color) 10%, var(--surface-color) 90%)'
                : 'background-color: transparent'"
              @click="selectResult(item)"
              @mouseenter="selectedIndex = index"
            >
              <Icon :name="item.type === 'folder' ? 'folder' : 'file-alt'" :class="['h-5 w-5', item.type === 'folder' ? 'text-blue-500' : 'text-gray-400']" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium" style="color: var(--text-color)">{{ item.name }}</p>
                <p class="truncate text-xs" style="color: var(--text-secondary-color)">{{ item.path }}</p>
              </div>
            </button>
          </div>

          <div v-else-if="query" class="flex min-h-[10rem] items-center justify-center p-8 text-center text-sm" style="color: var(--text-secondary-color)">
            {{ t('spotlight.noResults', 'No matching results') }}
          </div>

          <div v-else class="flex min-h-[10rem] items-center justify-center p-8 text-center text-sm" style="color: var(--text-secondary-color)">
            {{ t('spotlight.emptyHint', 'Type keywords to search files and folders') }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
