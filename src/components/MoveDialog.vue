<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '@/api'

const props = defineProps<{
  show: boolean
  pools: { id: number; name: string }[]
  currentPoolId?: number
  currentPath?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [destPoolId: number, destPath: string]
}>()

const selectedPoolId = ref<number | undefined>(undefined)
const folderPath = ref('')
const folders = ref<{ name: string; path: string }[]>([])
const loadingFolders = ref(false)
const navigatePath = ref('')

watch(() => props.show, (val) => {
  if (val) {
    selectedPoolId.value = props.currentPoolId || props.pools[0]?.id
    navigatePath.value = ''
    folderPath.value = ''
    loadFolders()
  }
})

watch(selectedPoolId, () => {
  navigatePath.value = ''
  folderPath.value = ''
  loadFolders()
})

async function loadFolders() {
  if (!selectedPoolId.value) return
  loadingFolders.value = true
  try {
    const params = new URLSearchParams({ poolId: String(selectedPoolId.value) })
    if (navigatePath.value) params.set('path', navigatePath.value)
    const res = await api.get<{ files: any[] }>(`/files/list?${params}`)
    folders.value = res.files
      .filter((f: any) => f.type === 'folder')
      .map((f: any) => ({ name: f.name, path: f.path }))
  } catch {
    folders.value = []
  } finally {
    loadingFolders.value = false
  }
}

function enterFolder(folder: { name: string; path: string }) {
  navigatePath.value = folder.path
  folderPath.value = folder.path
  loadFolders()
}

function goUp() {
  const segments = navigatePath.value.split('/').filter(Boolean)
  segments.pop()
  navigatePath.value = segments.join('/')
  folderPath.value = navigatePath.value
  loadFolders()
}

function selectCurrent() {
  folderPath.value = navigatePath.value
}

function handleConfirm() {
  if (!selectedPoolId.value) return
  emit('confirm', selectedPoolId.value, folderPath.value)
}

const currentPoolName = ref('')
watch([selectedPoolId, () => props.pools], () => {
  const pool = props.pools.find(p => p.id === selectedPoolId.value)
  currentPoolName.value = pool?.name || ''
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')"/>
      <div class="relative card w-full max-w-lg max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">移动到</h3>

        <!-- 存储池选择 -->
        <div class="mb-3">
          <label class="text-xs mb-1 block" style="color: var(--text-secondary-color)">目标存储池</label>
          <select v-model="selectedPoolId" class="input-field text-sm">
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">{{ pool.name }}</option>
          </select>
        </div>

        <!-- 当前路径 -->
        <div class="flex items-center gap-2 mb-3 text-sm">
          <span style="color: var(--text-secondary-color)">路径：</span>
          <span class="font-mono" style="color: var(--text-color)">{{ navigatePath || '/' }}</span>
          <button v-if="navigatePath" @click="goUp"
            class="ml-auto text-xs px-2 py-1 rounded transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            style="color: var(--accent-color)">返回上级</button>
        </div>

        <!-- 文件夹列表 -->
        <div class="border rounded-lg overflow-hidden mb-4 max-h-60 overflow-y-auto" style="border-color: var(--border-color)">
          <div v-if="loadingFolders" class="flex items-center justify-center py-8">
            <svg class="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
          <div v-else-if="folders.length === 0" class="py-6 text-center text-sm" style="color: var(--text-secondary-color)">
            当前目录无子文件夹
          </div>
          <div v-else>
            <button
              v-for="folder in folders"
              :key="folder.path"
              @click="enterFolder(folder)"
              class="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover border-b last:border-0"
              style="border-color: var(--border-color); color: var(--text-color)"
            >
              <svg class="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              <span class="truncate">{{ folder.name }}</span>
              <svg class="w-4 h-4 ml-auto flex-shrink-0" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 选中的目标 -->
        <div class="mb-4 p-2 rounded text-xs" style="background-color: var(--hover-color); color: var(--text-secondary-color)">
          目标：{{ currentPoolName }} / {{ navigatePath || '根目录' }}
          <button @click="selectCurrent" class="ml-2 px-2 py-0.5 rounded text-xs transition-colors hover:bg-gray-200 dark:hover:bg-dark-hover" style="color: var(--accent-color)">
            选择当前目录
          </button>
        </div>

        <div class="flex justify-end gap-3">
          <button @click="emit('close')" class="btn-secondary text-sm">取消</button>
          <button @click="handleConfirm" class="btn-primary text-sm" :disabled="!selectedPoolId">移动到此</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
