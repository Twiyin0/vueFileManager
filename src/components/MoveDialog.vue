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
    <div v-if="show" class="dialog-overlay">
      <div class="dialog-backdrop" @click="emit('close')" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-lg">
        <div class="dialog-section">
        <h3 class="dialog-title mb-4">{{ t('move.title', 'Move To') }}</h3>

        <div class="mb-3">
          <label class="dialog-form-label text-xs">{{ t('move.targetPool', 'Target Storage Pool') }}</label>
          <select v-model="selectedPoolId" class="input-field text-sm">
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">{{ pool.name }}</option>
          </select>
        </div>

        <div class="mb-3 flex items-center gap-2 text-sm">
          <span style="color: var(--text-secondary-color)">{{ t('common.path', 'Path') }}{{ t('common.colon', ': ') }}</span>
          <span class="font-mono" style="color: var(--text-color)">{{ navigatePath || '/' }}</span>
          <button
            v-if="navigatePath"
            class="ml-auto rounded px-2 py-1 text-xs transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            style="color: var(--accent-color)"
            @click="goUp"
          >
            {{ t('move.goUp', 'Go Up') }}
          </button>
        </div>

        <div class="dialog-muted-block-strong mb-4 max-h-60 overflow-y-auto !p-0">
          <div v-if="loadingFolders" class="flex items-center justify-center py-8">
            <svg class="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <div v-else-if="folders.length === 0" class="py-6 text-center text-sm" style="color: var(--text-secondary-color)">
            {{ t('move.noSubfolders', 'No subfolders in the current directory') }}
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

        <div class="dialog-muted-block mb-4 text-xs">
          {{ t('move.targetSummary', 'Target: {pool} / {path}')
            .replace('{pool}', currentPoolName || '-')
            .replace('{path}', navigatePath || t('upload.rootPath', 'Root Directory')) }}
          <button
            class="ml-2 rounded px-2 py-0.5 text-xs transition-colors hover:bg-gray-200 dark:hover:bg-dark-hover"
            style="color: var(--accent-color)"
            @click="selectCurrent"
          >
            {{ t('move.selectCurrent', 'Select Current Directory') }}
          </button>
        </div>

        <div class="dialog-footer mt-0">
          <button class="btn-secondary text-sm" @click="emit('close')">{{ t('common.cancel', 'Cancel') }}</button>
          <button class="btn-primary text-sm" :disabled="!selectedPoolId" @click="handleConfirm">
            {{ t('move.confirmHere', 'Move Here') }}
          </button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
