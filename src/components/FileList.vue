<script setup lang="ts">
import { ref } from 'vue'
import { FileItem } from '@/stores/files'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'
import type { FileSortDirection, FileSortKey } from '@/utils/fileSort'

const { t, language } = useI18n()

const fileIconMap: Record<string, { icon: string; color: string }> = {
  folder: { icon: 'folder', color: 'text-blue-500' },
  image: { icon: 'image', color: 'text-green-500' },
  video: { icon: 'video', color: 'text-purple-500' },
  audio: { icon: 'music', color: 'text-pink-500' },
  pdf: { icon: 'file-alt', color: 'text-red-500' },
  archive: { icon: 'box-archive', color: 'text-yellow-500' },
  code: { icon: 'code', color: 'text-cyan-500' },
  text: { icon: 'text', color: 'text-gray-500' },
  file: { icon: 'file-alt', color: 'text-gray-400' },
}

function getFileIcon(file: FileItem): string {
  if (file.type === 'folder') return 'folder'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getFileIconInfo(file: FileItem) {
  return fileIconMap[getFileIcon(file)] || fileIconMap.file
}

const props = withDefaults(defineProps<{
  files: FileItem[]
  loading: boolean
  showActions?: boolean
  readOnlyActions?: boolean
  selectMode?: boolean
  selectedFiles?: Set<string>
  viewMode?: 'list' | 'grid'
  currentPoolId?: number
  guestBaseUrl?: string
  sortKey?: FileSortKey
  sortDirection?: FileSortDirection
}>(), {
  viewMode: 'list'
})

const emit = defineEmits<{
  open: [file: FileItem]
  download: [file: FileItem]
  delete: [file: FileItem]
  contextmenu: [e: MouseEvent, file?: FileItem]
  toggleSelect: [path: string]
  detail: [file: FileItem]
  sort: [key: FileSortKey]
}>()

let longPressTimer: ReturnType<typeof setTimeout> | null = null
const longPressThreshold = 500
const contextHighlighted = ref<string | null>(null)

function handleTouchStart(e: TouchEvent, file: FileItem) {
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    const touch = e.touches[0]
    const syntheticEvent = new MouseEvent('contextmenu', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: false
    }) as MouseEvent
    contextHighlighted.value = file.path
    emit('contextmenu', syntheticEvent, file)
  }, longPressThreshold)
}

function handleTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleTouchMove() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleItemContext(e: MouseEvent, file: FileItem) {
  contextHighlighted.value = file.path
  emit('contextmenu', e, file)
}

function handleContainerContext(e: MouseEvent) {
  contextHighlighted.value = null
  emit('contextmenu', e)
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.toLocaleDateString(language.value || 'zh-CN')} ${date.toLocaleTimeString(language.value || 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })}`
}

function getPreviewUrl(file: FileItem): string {
  if (file.directUrl) return file.directUrl
  if (file.fileUrl) return file.fileUrl
  if (props.guestBaseUrl) {
    return `${props.guestBaseUrl}?path=${encodeURIComponent(file.path)}`
  }
  const params = new URLSearchParams({ path: file.path })
  const poolId = file.poolId || props.currentPoolId
  if (poolId) params.set('poolId', String(poolId))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `/api/files/preview?${params.toString()}`
}

function isActiveSort(key: FileSortKey) {
  return props.sortKey === key
}

function sortIconName(key: FileSortKey) {
  if (!isActiveSort(key)) return 'chevron-down'
  return props.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'
}
</script>

<template>
  <div class="card overflow-hidden" style="padding: 0" @contextmenu.prevent="handleContainerContext">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <div
      v-else-if="files.length === 0"
      class="flex flex-col items-center justify-center py-12"
      style="color: var(--text-secondary-color)"
    >
      <Icon name="folder" class="mb-3 h-16 w-16" />
      <p>{{ t('file.empty', 'No files yet') }}</p>
    </div>

    <div v-else-if="viewMode === 'grid'" class="p-3">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <div
          v-for="file in files"
          :key="file.path"
          class="file-grid-item group cursor-pointer overflow-hidden rounded-lg border transition-all"
          :class="[
            selectedFiles?.has(file.path) ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-600' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600',
            contextHighlighted === file.path ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
          ]"
          style="background-color: var(--hover-color); touch-action: manipulation"
          @click.prevent="emit('open', file)"
          @contextmenu.prevent.stop="handleItemContext($event, file)"
          @touchstart.passive="handleTouchStart($event, file)"
          @touchend="handleTouchEnd"
          @touchmove="handleTouchMove"
        >
          <div class="thumb-container relative">
            <div v-if="selectMode" class="absolute left-1.5 top-1.5 z-10" @click.stop>
              <input type="checkbox" :checked="selectedFiles?.has(file.path)" @change="emit('toggleSelect', file.path)" />
            </div>

            <img
              v-if="getFileIcon(file) === 'image'"
              :src="getPreviewUrl(file)"
              :alt="file.name"
              class="thumb-img"
              loading="lazy"
              draggable="false"
            />

            <div v-else class="thumb-icon">
              <Icon :name="getFileIconInfo(file).icon" :class="['h-10 w-10', getFileIconInfo(file).color]" />
            </div>
          </div>

          <div class="px-2 py-1.5">
            <p class="truncate text-center text-xs" style="color: var(--text-color)" :title="file.name">{{ file.name }}</p>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div
        class="grid grid-cols-12 gap-2 border-b px-4 py-2 text-xs font-medium"
        style="color: var(--text-secondary-color); border-color: var(--border-color)"
      >
        <button class="col-span-8 flex items-center gap-1 text-left sm:col-span-5" @click="emit('sort', 'name')">
          <span>{{ t('file.name', 'Name') }}</span>
          <Icon :name="sortIconName('name')" class="h-3.5 w-3.5" :class="isActiveSort('name') ? '' : 'opacity-40'" />
        </button>
        <button class="col-span-2 hidden items-center justify-end gap-1 text-right sm:flex" @click="emit('sort', 'size')">
          <span>{{ t('file.size', 'Size') }}</span>
          <Icon :name="sortIconName('size')" class="h-3.5 w-3.5" :class="isActiveSort('size') ? '' : 'opacity-40'" />
        </button>
        <button class="col-span-3 hidden items-center justify-end gap-1 text-right md:flex" @click="emit('sort', 'modified')">
          <span>{{ t('file.modified', 'Modified') }}</span>
          <Icon :name="sortIconName('modified')" class="h-3.5 w-3.5" :class="isActiveSort('modified') ? '' : 'opacity-40'" />
        </button>
        <div v-if="showActions" class="col-span-4 text-right sm:col-span-2">{{ t('common.actions', 'Actions') }}</div>
      </div>

      <div
        v-for="file in files"
        :key="file.path"
        class="file-row grid grid-cols-12 items-center gap-2 border-b px-4 py-2.5 last:border-0"
        :class="[
          selectedFiles?.has(file.path) ? 'bg-blue-50 dark:bg-blue-900/20' : '',
          contextHighlighted === file.path ? 'bg-blue-50/70 dark:bg-blue-900/30' : '',
          'cursor-pointer'
        ]"
        style="border-color: var(--border-color); touch-action: manipulation"
        @click.prevent="emit('open', file)"
        @contextmenu.prevent.stop="handleItemContext($event, file)"
        @touchstart.passive="handleTouchStart($event, file)"
        @touchend="handleTouchEnd"
        @touchmove="handleTouchMove"
      >
        <div class="col-span-8 flex min-w-0 items-center gap-1.5 sm:col-span-5">
          <input
            v-if="selectMode"
            type="checkbox"
            :checked="selectedFiles?.has(file.path)"
            @change="emit('toggleSelect', file.path)"
            @click.stop
          />
          <Icon :name="getFileIconInfo(file).icon" :class="['h-5 w-5 flex-shrink-0', getFileIconInfo(file).color]" />
          <span class="truncate text-sm" style="color: var(--text-color)">{{ file.name }}</span>
        </div>

        <div class="col-span-2 hidden text-right text-xs sm:block" style="color: var(--text-secondary-color)">
          {{ file.type === 'folder' ? '-' : formatSize(file.size) }}
        </div>

        <div class="col-span-3 hidden text-right text-xs md:block" style="color: var(--text-secondary-color)">
          {{ formatDate(file.modified) }}
        </div>

          <div v-if="showActions" class="col-span-4 flex items-center justify-end gap-0.5 sm:col-span-2 sm:gap-1" @click.stop>
            <button
              class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
              :title="t('common.details', 'Details')"
              @click="emit('detail', file)"
            >
              <Icon name="circle-information" class="h-4 w-4" style="color: var(--text-secondary-color)" />
            </button>

            <button
              v-if="file.type === 'file'"
            class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
            :title="t('file.download', 'Download')"
              @click="emit('download', file)"
            >
              <Icon name="download" class="h-4 w-4" style="color: var(--text-secondary-color)" />
            </button>

            <button
              v-if="!readOnlyActions"
              class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
              :title="t('common.delete', 'Delete')"
              @click="emit('delete', file)"
            >
              <Icon name="trash" class="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
