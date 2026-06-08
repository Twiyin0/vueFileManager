<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import { useRouter } from 'vue-router'
import FilePreview from '@/components/FilePreview.vue'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const loading = ref(false)
const items = ref<any[]>([])

// 预览
const showPreview = ref(false)
const fileToPreview = ref<any>(null)

// 文件图标映射
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

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getIconInfo(name: string, type: string) {
  const fileType = type === 'folder' ? 'folder' : getFileType(name)
  return fileIconMap[fileType] || fileIconMap.file
}

onMounted(() => { loadFavourites() })

async function loadFavourites() {
  loading.value = true
  try {
    const res = await api.get<{ items: any[] }>('/favourites')
    items.value = res.items
  } catch {} finally {
    loading.value = false
  }
}

async function removeFav(item: any) {
  try {
    await api.delete(`/favourites?filePath=${encodeURIComponent(item.file_path)}&storagePoolId=${item.storage_pool_id}`)
    await loadFavourites()
  } catch {}
}

function handleClick(item: any) {
  if (item.file_type === 'folder') {
    router.push({ path: '/', query: { path: item.file_path, pool: String(item.storage_pool_id) } })
  } else {
    // 打开预览
    fileToPreview.value = {
      path: item.file_path,
      name: item.file_name,
      poolId: item.storage_pool_id,
    }
    showPreview.value = true
  }
}

async function handleDownload(item: any) {
  try {
    const params = new URLSearchParams({ path: item.file_path, poolId: String(item.storage_pool_id) })
    const token = localStorage.getItem('token')
    if (token) params.set('token', token)
    const response = await fetch(`/api/files/download?${params}`)
    if (!response.ok) throw new Error('下载失败')
    const blob = await response.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = item.file_name
    a.click()
    URL.revokeObjectURL(a.href)
  } catch {}
}

function formatSize(size: number) {
  if (!size) return '-'
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
  return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}
</script>

<template>
    <div class="px-4 pt-4">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <div v-else-if="items.length > 0" class="space-y-1">
        <div v-for="item in items" :key="item.id"
          class="flex items-center justify-between px-4 py-2.5 rounded-lg cursor-pointer transition-colors group"
          @click="handleClick(item)"
          @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
          @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
        >
          <div class="flex items-center gap-3 min-w-0">
            <Icon :name="getIconInfo(item.file_name, item.file_type).icon" :class="['w-5 h-5 flex-shrink-0', getIconInfo(item.file_name, item.file_type).color]" />
            <div class="min-w-0">
              <p class="text-sm truncate" style="color: var(--text-color)">{{ item.file_name }}</p>
              <p class="text-xs" style="color: var(--text-secondary-color)">{{ item.pool_name }} · {{ item.file_path }}</p>
            </div>
          </div>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button v-if="item.file_type !== 'folder'" @click.stop="handleDownload(item)" class="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors" title="下载">
              <Icon name="download" class="w-4 h-4" style="color: var(--text-secondary-color)" />
            </button>
            <button @click.stop="removeFav(item)" class="p-1.5 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors" title="取消收藏">
              <Icon name="star-sharp" class="w-4 h-4 text-yellow-500" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-20">
        <Icon name="star-sharp" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">还没有收藏</h3>
        <p style="color: var(--text-secondary-color)">在文件列表中点击星标添加收藏</p>
      </div>
    </div>

    <!-- 文件预览 -->
    <FilePreview
      v-if="fileToPreview"
      :show="showPreview"
      :file-path="fileToPreview.path"
      :file-name="fileToPreview.name"
      :pool-id="fileToPreview.poolId"
      @close="showPreview = false; fileToPreview = null"
    />
</template>
