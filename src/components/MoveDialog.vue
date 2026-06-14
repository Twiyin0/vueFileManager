<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

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

const { t } = useI18n()
const selectedPoolId = ref<number | undefined>(undefined)
const folderPath = ref('')
const folders = ref<{ name: string; path: string }[]>([])
const loadingFolders = ref(false)
const navigatePath = ref('')
const currentPoolName = ref('')

watch(
  () => props.show,
  (value) => {
    if (value) {
      selectedPoolId.value = props.currentPoolId || props.pools[0]?.id
      navigatePath.value = ''
      folderPath.value = ''
      void loadFolders()
    }
  }
)

watch(selectedPoolId, () => {
  navigatePath.value = ''
  folderPath.value = ''
  void loadFolders()
})

watch(
  [selectedPoolId, () => props.pools],
  () => {
    const pool = props.pools.find((item) => item.id === selectedPoolId.value)
    currentPoolName.value = pool?.name || ''
  },
  { immediate: true }
)

async function loadFolders() {
  if (!selectedPoolId.value) return
  loadingFolders.value = true
  try {
    const params = new URLSearchParams({ poolId: String(selectedPoolId.value) })
    if (navigatePath.value) params.set('path', navigatePath.value)
    const res = await api.get<{ files: any[] }>(`/files/list?${params}`)
    folders.value = res.files
      .filter((file: any) => file.type === 'folder')
      .map((file: any) => ({ name: file.name, path: file.path }))
  } catch {
    folders.value = []
  } finally {
    loadingFolders.value = false
  }
}

function enterFolder(folder: { name: string; path: string }) {
  navigatePath.value = folder.path
  folderPath.value = folder.path
  void loadFolders()
}

function goUp() {
  const segments = navigatePath.value.split('/').filter(Boolean)
  segments.pop()
  navigatePath.value = segments.join('/')
  folderPath.value = navigatePath.value
  void loadFolders()
}

function selectCurrent() {
  folderPath.value = navigatePath.value
}

function handleConfirm() {
  if (!selectedPoolId.value) return
  emit('confirm', selectedPoolId.value, folderPath.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')" />
      <div class="relative card max-h-[90vh] w-full max-w-lg overflow-y-auto" style="padding: 1.5rem">
        <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('move.title', '移动到') }}</h3>

        <div class="mb-3">
          <label class="mb-1 block text-xs" style="color: var(--text-secondary-color)">{{ t('move.targetPool', '目标存储池') }}</label>
          <select v-model="selectedPoolId" class="input-field text-sm">
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">{{ pool.name }}</option>
          </select>
        </div>

        <div class="mb-3 flex items-center gap-2 text-sm">
          <span style="color: var(--text-secondary-color)">{{ t('common.path', '路径') }}：</span>
          <span class="font-mono" style="color: var(--text-color)">{{ navigatePath || '/' }}</span>
          <button
            v-if="navigatePath"
            class="ml-auto rounded px-2 py-1 text-xs transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            style="color: var(--accent-color)"
            @click="goUp"
          >
            {{ t('move.goUp', '返回上级') }}
          </button>
        </div>

        <div class="mb-4 max-h-60 overflow-y-auto rounded-lg border" style="border-color: var(--border-color)">
          <div v-if="loadingFolders" class="flex items-center justify-center py-8">
            <svg class="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div v-else-if="folders.length === 0" class="py-6 text-center text-sm" style="color: var(--text-secondary-color)">
            {{ t('move.noSubfolders', '当前目录没有子文件夹') }}
          </div>
          <div v-else>
            <button
              v-for="folder in folders"
              :key="folder.path"
              class="flex w-full items-center gap-2 border-b px-4 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover"
              style="border-color: var(--border-color); color: var(--text-color)"
              @click="enterFolder(folder)"
            >
              <Icon name="folder" class="h-4 w-4 flex-shrink-0 text-blue-500" />
              <span class="truncate">{{ folder.name }}</span>
              <Icon name="chevron-right" class="ml-auto h-4 w-4 flex-shrink-0" style="color: var(--text-secondary-color)" />
            </button>
          </div>
        </div>

        <div class="mb-4 rounded p-2 text-xs" style="background-color: var(--hover-color); color: var(--text-secondary-color)">
          {{ t('move.targetSummary', '目标：{pool} / {path}')
            .replace('{pool}', currentPoolName || '-')
            .replace('{path}', navigatePath || t('upload.rootPath', '根目录')) }}
          <button
            class="ml-2 rounded px-2 py-0.5 text-xs transition-colors hover:bg-gray-200 dark:hover:bg-dark-hover"
            style="color: var(--accent-color)"
            @click="selectCurrent"
          >
            {{ t('move.selectCurrent', '选择当前目录') }}
          </button>
        </div>

        <div class="flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="emit('close')">{{ t('common.cancel', '取消') }}</button>
          <button class="btn-primary text-sm" :disabled="!selectedPoolId" @click="handleConfirm">
            {{ t('move.confirmHere', '移动到此') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
