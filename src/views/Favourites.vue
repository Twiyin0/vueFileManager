<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/api'
import FilePreview from '@/components/FilePreview.vue'
import Icon from '@/components/Icon.vue'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { useI18n } from '@/composables/useI18n'

interface FavouriteItem {
  id: number
  file_path: string
  file_name: string
  file_type: 'file' | 'folder'
  storage_pool_id: number
  pool_name?: string
}

const router = useRouter()
const { t } = useI18n()
const loading = ref(false)
const items = ref<FavouriteItem[]>([])
const showPreview = ref(false)
const fileToPreview = ref<{ path: string; name: string; poolId: number } | null>(null)

const fileIconMap: Record<string, { icon: string; color: string }> = {
  folder: { icon: 'folder', color: 'text-blue-500' },
  image: { icon: 'image', color: 'text-green-500' },
  video: { icon: 'video', color: 'text-purple-500' },
  audio: { icon: 'music', color: 'text-pink-500' },
  pdf: { icon: 'file-alt', color: 'text-red-500' },
  archive: { icon: 'box-archive', color: 'text-yellow-500' },
  code: { icon: 'code', color: 'text-cyan-500' },
  text: { icon: 'text', color: 'text-gray-500' },
  file: { icon: 'file-alt', color: 'text-gray-400' }
}

useKeepAliveRefresh(loadFavourites)

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getIconInfo(name: string, type: string) {
  const fileType = type === 'folder' ? 'folder' : getFileType(name)
  return fileIconMap[fileType] || fileIconMap.file
}

async function loadFavourites() {
  loading.value = true
  try {
    const res = await api.get<{ items: FavouriteItem[] }>('/favourites')
    items.value = res.items
  } finally {
    loading.value = false
  }
}

async function removeFav(item: FavouriteItem) {
  try {
    await api.delete(`/favourites?filePath=${encodeURIComponent(item.file_path)}&storagePoolId=${item.storage_pool_id}`)
    await loadFavourites()
  } catch (err) {
    console.error(err)
  }
}

function handleClick(item: FavouriteItem) {
  if (item.file_type === 'folder') {
    router.push({ path: '/', query: { path: item.file_path, pool: String(item.storage_pool_id) } })
    return
  }

  fileToPreview.value = {
    path: item.file_path,
    name: item.file_name,
    poolId: item.storage_pool_id
  }
  showPreview.value = true
}

async function handleDownload(item: FavouriteItem) {
  try {
    const params = new URLSearchParams({
      path: item.file_path,
      poolId: String(item.storage_pool_id)
    })
    const token = localStorage.getItem('token')
    if (token) params.set('token', token)

    const response = await fetch(`/api/files/download?${params.toString()}`)
    if (!response.ok) throw new Error(t('file.download', 'Download') + t('upload.statusFailed', 'Failed'))

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = item.file_name
    link.click()
    URL.revokeObjectURL(objectUrl)
  } catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <div class="px-4 pt-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <div v-else-if="items.length > 0" class="space-y-1">
      <div
        v-for="item in items"
        :key="item.id"
        class="group flex cursor-pointer items-center justify-between rounded-lg px-4 py-2.5 transition-colors"
        @click="handleClick(item)"
        @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
        @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
      >
        <div class="flex min-w-0 items-center gap-3">
          <Icon :name="getIconInfo(item.file_name, item.file_type).icon" :class="['h-5 w-5 flex-shrink-0', getIconInfo(item.file_name, item.file_type).color]" />
          <div class="min-w-0">
            <p class="truncate text-sm" style="color: var(--text-color)">{{ item.file_name }}</p>
            <p class="truncate text-xs" style="color: var(--text-secondary-color)">
              {{ item.pool_name || item.storage_pool_id }}{{ t('common.separator', ' | ') }}{{ item.file_path }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            v-if="item.file_type !== 'folder'"
            class="rounded p-1.5 transition-colors hover:bg-gray-200 dark:hover:bg-dark-hover"
            :title="t('file.download', 'Download')"
            @click.stop="handleDownload(item)"
          >
            <Icon name="download" class="h-4 w-4" style="color: var(--text-secondary-color)" />
          </button>
          <button
            class="rounded p-1.5 transition-colors hover:bg-yellow-100 dark:hover:bg-yellow-900/20"
            :title="t('favourites.remove', 'Remove Favourite')"
            @click.stop="removeFav(item)"
          >
            <Icon name="star-sharp" class="h-4 w-4 text-yellow-500" />
          </button>
        </div>
      </div>
    </div>

    <div v-else class="py-20 text-center">
      <Icon name="star-sharp" class="mx-auto mb-4 h-16 w-16" style="color: var(--text-secondary-color)" />
      <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('favourites.emptyTitle', 'No favourites yet') }}</h3>
      <p style="color: var(--text-secondary-color)">{{ t('favourites.emptyDescription', 'Click the star icon in the file list to add favourites.') }}</p>
    </div>
  </div>

  <FilePreview
    v-if="fileToPreview"
    :show="showPreview"
    :file-path="fileToPreview.path"
    :file-name="fileToPreview.name"
    :pool-id="fileToPreview.poolId"
    @close="showPreview = false; fileToPreview = null"
  />
</template>
