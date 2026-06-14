<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { useI18n } from '@/composables/useI18n'

interface TrashItem {
  id: number
  original_path: string
  file_name: string
  file_type: 'file' | 'folder'
  storage_pool_id: number
  pool_name?: string
  deleted_at: string
  deleted_by?: string
}

const { t } = useI18n()
const loading = ref(false)
const items = ref<TrashItem[]>([])
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

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

useKeepAliveRefresh(loadTrash)

function getFileIcon(name: string, type: string): { icon: string; color: string } {
  if (type === 'folder') return fileIconMap.folder

  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return fileIconMap.image
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return fileIconMap.video
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return fileIconMap.audio
  if (ext === 'pdf') return fileIconMap.pdf
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return fileIconMap.archive
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return fileIconMap.code
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return fileIconMap.text
  return fileIconMap.file
}

async function loadTrash() {
  loading.value = true
  try {
    const res = await api.get<{ items: TrashItem[] }>('/trash')
    items.value = res.items
  } catch (err: any) {
    showMsg(err.message || t('trash.loadFailed', '加载回收站失败'), 'error')
  } finally {
    loading.value = false
  }
}

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  window.setTimeout(() => {
    if (message.value === text) {
      message.value = ''
    }
  }, 3000)
}

async function restoreItem(item: TrashItem) {
  try {
    await api.post(`/trash/${item.id}/restore`)
    showMsg(t('trash.restored', '已恢复'), 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message || t('trash.restoreFailed', '恢复失败'), 'error')
  }
}

async function deleteItem(item: TrashItem) {
  if (!window.confirm(t('trash.deleteConfirm', '确定永久删除“{name}”吗？此操作不可恢复。').replace('{name}', item.file_name))) {
    return
  }

  try {
    await api.delete(`/trash/${item.id}`)
    showMsg(t('trash.deleted', '已永久删除'), 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message || t('trash.deleteFailed', '删除失败'), 'error')
  }
}

async function emptyTrash() {
  if (!window.confirm(t('trash.emptyConfirm', '确定清空回收站吗？此操作不可恢复。'))) {
    return
  }

  try {
    await api.delete('/trash')
    showMsg(t('trash.emptied', '回收站已清空'), 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message || t('trash.emptyFailed', '清空失败'), 'error')
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<template>
  <div class="px-4 pt-4">
    <div v-if="items.length > 0" class="mb-4 flex justify-end">
      <button class="btn-danger text-sm" @click="emptyTrash">{{ t('trash.emptyAction', '清空回收站') }}</button>
    </div>

    <div
      v-if="message"
      class="mb-4 rounded-lg border p-3 text-sm"
      :class="messageType === 'success'
        ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
        : 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'"
    >
      {{ message }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <div v-else-if="items.length > 0" class="space-y-2">
      <div v-for="item in items" :key="item.id" class="card flex items-center justify-between p-4">
        <div class="flex min-w-0 items-center gap-3">
          <Icon :name="getFileIcon(item.file_name, item.file_type).icon" :class="['h-6 w-6 flex-shrink-0', getFileIcon(item.file_name, item.file_type).color]" />
          <div class="min-w-0">
            <p class="font-medium text-light-text dark:text-dark-text">
              {{ item.file_name }}
              <span
                v-if="item.deleted_by"
                class="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
              >
                {{ item.deleted_by }}
              </span>
            </p>
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ t('trash.originalPath', '原路径：{path}').replace('{path}', item.original_path) }}
            </p>
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ t('trash.metaLine', '存储池：{pool} · 删除时间：{time}')
                .replace('{pool}', String(item.pool_name || item.storage_pool_id))
                .replace('{time}', formatDate(item.deleted_at)) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary px-3 py-1.5 text-sm" @click="restoreItem(item)">{{ t('trash.restore', '恢复') }}</button>
          <button class="btn-danger px-3 py-1.5 text-sm" @click="deleteItem(item)">{{ t('trash.deletePermanent', '永久删除') }}</button>
        </div>
      </div>
    </div>

    <div v-else class="py-20 text-center">
      <Icon name="trash" class="mx-auto mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
      <h3 class="mb-2 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('trash.emptyTitle', '回收站为空') }}</h3>
      <p class="text-gray-500 dark:text-dark-text-secondary">{{ t('trash.emptyDescription', '删除的文件和文件夹会显示在这里。') }}</p>
    </div>
  </div>
</template>
