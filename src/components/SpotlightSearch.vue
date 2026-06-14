<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const emit = defineEmits<{
  (e: 'navigate', path: string, poolId?: number): void
}>()

const { t } = useI18n()
const visible = ref(false)
const query = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const selectedIndex = ref(0)
const searchTimeout = ref<number>()

function toggle() {
  visible.value = !visible.value
  if (visible.value) {
    query.value = ''
    results.value = []
    selectedIndex.value = 0
  }
}

async function search() {
  if (!query.value.trim()) {
    results.value = []
    return
  }
  loading.value = true
  try {
    const res = await api.get<{ files: any[] }>(`/files/search?q=${encodeURIComponent(query.value)}`)
    results.value = res.files.slice(0, 20)
    selectedIndex.value = 0
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (event.key === 'Enter' && results.value[selectedIndex.value]) {
    selectResult(results.value[selectedIndex.value])
  } else if (event.key === 'Escape') {
    visible.value = false
  }
}

function selectResult(item: any) {
  if (item.type === 'folder') {
    const parentPath = item.path.substring(0, item.path.lastIndexOf('/'))
    emit('navigate', parentPath || '')
  }
  visible.value = false
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
    event.preventDefault()
    toggle()
  }
}

watch(query, () => {
  clearTimeout(searchTimeout.value)
  searchTimeout.value = window.setTimeout(search, 300)
})

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 pt-[20vh]" @click.self="visible = false">
      <div class="w-full max-w-lg overflow-hidden rounded-xl border border-light-border bg-white shadow-sm dark:border-dark-border dark:bg-dark-card">
        <div class="flex items-center border-b border-light-border px-4 dark:border-dark-border">
          <Icon name="search" class="h-5 w-5 text-gray-400" />
          <input
            v-model="query"
            class="flex-1 bg-transparent px-3 py-4 text-light-text outline-none dark:text-dark-text"
            :placeholder="t('spotlight.placeholder', '搜索文件和文件夹... (Ctrl+K)')"
            autofocus
            @keydown="handleKeydown"
          />
          <kbd class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-400 dark:bg-dark-hover">ESC</kbd>
        </div>

        <div v-if="loading" class="p-4 text-center text-gray-500 dark:text-dark-text-secondary">
          {{ t('spotlight.loading', '搜索中...') }}
        </div>

        <div v-else-if="results.length > 0" class="max-h-[300px] overflow-y-auto">
          <button
            v-for="(item, index) in results"
            :key="item.path"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
            :class="selectedIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'"
            @click="selectResult(item)"
            @mouseenter="selectedIndex = index"
          >
            <Icon :name="item.type === 'folder' ? 'folder' : 'file-alt'" :class="['h-5 w-5', item.type === 'folder' ? 'text-blue-500' : 'text-gray-400']" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-light-text dark:text-dark-text">{{ item.name }}</p>
              <p class="truncate text-xs text-gray-500 dark:text-dark-text-secondary">{{ item.path }}</p>
            </div>
          </button>
        </div>

        <div v-else-if="query" class="p-8 text-center text-gray-500 dark:text-dark-text-secondary">
          {{ t('spotlight.noResults', '未找到匹配结果') }}
        </div>

        <div v-else class="p-8 text-center text-sm text-gray-400 dark:text-dark-text-secondary">
          {{ t('spotlight.emptyHint', '输入关键词搜索文件和文件夹') }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
