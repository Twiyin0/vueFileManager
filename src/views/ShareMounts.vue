<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FileList from '@/components/FileList.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FilePreview from '@/components/FilePreview.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import { api } from '@/api'
import type { FileItem } from '@/stores/files'
import { useI18n } from '@/composables/useI18n'

const route = useRoute()
const router = useRouter()
const { t, format } = useI18n()

const loading = ref(false)
const files = ref<FileItem[]>([])
const contextMenu = ref({ visible: false, x: 0, y: 0, item: null as FileItem | null })
const fileToPreview = ref<FileItem | null>(null)
const showPreview = ref(false)
const detailItem = ref<FileItem | null>(null)
const showDetailPanel = ref(false)
const mountToRemove = ref<FileItem | null>(null)
const showUnmountConfirm = ref(false)
const error = ref('')

const currentPath = computed(() => ((route.query.path as string) || '').replace(/\\/g, '/'))
const pathSegments = computed(() => currentPath.value ? currentPath.value.split('/').filter(Boolean) : [])

async function fetchFiles(path = '') {
  loading.value = true
  error.value = ''

  try {
    const params = new URLSearchParams()
    if (path) params.set('path', path)

    const query = params.toString() ? `?${params.toString()}` : ''
    const res = await api.get<{ files: FileItem[] }>(`/share-mounts/list${query}`)

    files.value = res.files
  } catch (err: any) {
    files.value = []
    error.value = err.message || t('shareMount.loadFailed', 'Failed to load share mounts')
  } finally {
    loading.value = false
  }
}

function navigateToPath(path: string) {
  void router.push({ path: '/share-mounts', query: path ? { path } : {} })
}

function goUp() {
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  navigateToPath(segments.join('/'))
}

function openFile(file: FileItem) {
  if (file.type === 'folder') {
    navigateToPath(file.path)
    return
  }

  fileToPreview.value = file
  showPreview.value = true
}

function downloadFile(file: FileItem) {
  if (!file.directUrl) return
  const separator = file.directUrl.includes('?') ? '&' : '?'
  window.open(`${file.directUrl}${separator}download=true`, '_blank')
}

function handleContextMenu(event: MouseEvent, file?: FileItem) {
  event.preventDefault()
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, item: file || null }
}

function canUnmountMount(file?: FileItem | null) {
  return !!file && file.type === 'folder' && (!!file.mountId || !!file.isVirtual)
}

function startUnmount(file: FileItem) {
  if (!canUnmountMount(file)) return
  mountToRemove.value = file
  showUnmountConfirm.value = true
}

function closeUnmountConfirm() {
  showUnmountConfirm.value = false
  mountToRemove.value = null
}

async function confirmUnmount() {
  if (!mountToRemove.value) return

  try {
    if (mountToRemove.value.mountId) {
      await api.post('/share-mounts/unmount', { mountId: mountToRemove.value.mountId })
    } else if (mountToRemove.value.isVirtual) {
      await api.post('/share-mounts/unmount', { path: mountToRemove.value.path })
    } else {
      return
    }
    closeUnmountConfirm()
    await fetchFiles(currentPath.value)
  } catch (err: any) {
    error.value = err.message || t('shareMount.unmountFailed', 'Failed to unmount share mount')
    closeUnmountConfirm()
  }
}

function handleContextAction(action: string, item?: FileItem) {
  switch (action) {
    case 'open':
      if (item) openFile(item)
      break
    case 'preview':
      if (item) {
        fileToPreview.value = item
        showPreview.value = true
      }
      break
    case 'download':
      if (item) downloadFile(item)
      break
    case 'info':
      if (item) {
        detailItem.value = item
        showDetailPanel.value = true
      }
      break
    case 'unmount':
      if (item) startUnmount(item)
      break
    case 'refresh':
      void fetchFiles(currentPath.value)
      break
  }
}

function goHome() {
  void router.push('/')
}

onMounted(() => {
  void fetchFiles(currentPath.value)
})

watch(currentPath, (path) => {
  void fetchFiles(path)
})
</script>

<template>
  <div class="px-4 pt-4">
    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-1.5 text-sm">
        <button
          class="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
          style="color: var(--accent-color); font-weight: 500"
          @click="navigateToPath('')"
        >
          <Icon name="hard-drive" class="h-4 w-4" />
          <span>{{ t('nav.shareMounts', 'Cross-Pool Shared Mounts') }}</span>
        </button>

        <template v-for="(segment, index) in pathSegments" :key="segment + index">
          <Icon name="chevron-right" class="h-4 w-4" style="color: var(--text-secondary-color)" />
          <button
            class="rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            :style="{ color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === pathSegments.length - 1 ? '500' : 'normal' }"
            @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
          >
            {{ segment }}
          </button>
        </template>
      </div>

      <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <button class="btn-secondary flex items-center gap-1 text-sm" @click="fetchFiles(currentPath)">
          <Icon name="refresh-cw" class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('common.refresh', 'Refresh') }}</span>
        </button>

        <button v-if="currentPath" class="btn-secondary flex items-center gap-1 text-sm" @click="goUp">
          <Icon name="arrow-up" class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('file.goUp', 'Up') }}</span>
        </button>

        <button class="btn-secondary flex items-center gap-1 text-sm" @click="goHome">
          <Icon name="folder" class="h-4 w-4" />
          <span class="hidden sm:inline">{{ t('nav.fileManager', 'File Manager') }}</span>
        </button>
      </div>
    </div>

    <FileList
      :files="files"
      :loading="loading"
      :show-actions="true"
      :read-only-actions="true"
      @open="openFile"
      @download="downloadFile"
      @delete="() => {}"
      @contextmenu="handleContextMenu"
      @detail="(file) => { detailItem = file; showDetailPanel = true }"
    />

    <div
      v-if="error"
      class="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
    >
      {{ error }}
    </div>
  </div>

  <ContextMenu
    :visible="contextMenu.visible"
    :x="contextMenu.x"
    :y="contextMenu.y"
    :item="contextMenu.item"
    :read-only="true"
    :show-unmount-action="true"
    :allowed-actions="canUnmountMount(contextMenu.item) ? ['open', 'download', 'info', 'unmount'] : ['open', 'download', 'info']"
    @close="contextMenu.visible = false"
    @action="handleContextAction"
  />

  <FilePreview
    v-if="fileToPreview"
    :show="showPreview"
    :file-path="fileToPreview.path"
    :file-name="fileToPreview.name"
    :file-url="fileToPreview.directUrl || fileToPreview.fileUrl"
    :file-list="files"
    @close="showPreview = false; fileToPreview = null"
  />

  <FileDetailPanel
    :visible="showDetailPanel"
    :item="detailItem"
    @close="showDetailPanel = false"
    @favourite="() => {}"
  />

  <ConfirmDialog
    :show="showUnmountConfirm"
    :title="t('shareMount.unmountTitle', 'Unmount Share Mount')"
    :message="format('shareMount.unmountMessage', 'Are you sure you want to unmount {name}?', { name: mountToRemove?.name || '' })"
    :confirm-text="t('shareMount.unmountConfirm', 'Unmount')"
    :danger="true"
    @confirm="confirmUnmount"
    @cancel="closeUnmountConfirm"
  />
</template>
