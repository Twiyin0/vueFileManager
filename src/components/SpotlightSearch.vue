<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { api } from '@/api'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const visible = ref(false)
const query = ref('')
const results = ref<any[]>([])
const loading = ref(false)
const selectedIndex = ref(0)
const searchTimeout = ref<number>()

const emit = defineEmits<{
  (e: 'navigate', path: string, poolId?: number): void
}>()

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

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter' && results.value[selectedIndex.value]) {
    selectResult(results.value[selectedIndex.value])
  } else if (e.key === 'Escape') {
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

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
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
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/50"
      @click.self="visible = false">
      <div class="w-full max-w-lg bg-white dark:bg-dark-card rounded-xl shadow-2xl overflow-hidden">
        <div class="flex items-center px-4 border-b dark:border-dark-border border-light-border">
          <Icon name="search" class="w-5 h-5 text-gray-400" />
          <input v-model="query" @keydown="handleKeydown"
            class="flex-1 px-3 py-4 bg-transparent outline-none dark:text-dark-text text-light-text"
            placeholder="搜索文件和文件夹... (Ctrl+K)" autofocus />
          <kbd class="text-xs text-gray-400 bg-gray-100 dark:bg-dark-hover px-2 py-1 rounded">ESC</kbd>
        </div>

        <div v-if="loading" class="p-4 text-center text-gray-500 dark:text-dark-text-secondary">
          搜索中...
        </div>

        <div v-else-if="results.length > 0" class="max-h-[300px] overflow-y-auto">
          <button v-for="(item, index) in results" :key="item.path"
            @click="selectResult(item)"
            @mouseenter="selectedIndex = index"
            class="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
            :class="selectedIndex === index ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'">
            <Icon :name="item.type === 'folder' ? 'folder' : 'file-alt'" :class="['w-5 h-5', item.type === 'folder' ? 'text-blue-500' : 'text-gray-400']" />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium dark:text-dark-text text-light-text truncate">{{ item.name }}</p>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary truncate">{{ item.path }}</p>
            </div>
          </button>
        </div>

        <div v-else-if="query" class="p-8 text-center text-gray-500 dark:text-dark-text-secondary">
          未找到匹配结果
        </div>

        <div v-else class="p-8 text-center text-gray-400 dark:text-dark-text-secondary text-sm">
          输入关键词搜索文件和文件夹
        </div>
      </div>
    </div>
  </Teleport>
</template>
