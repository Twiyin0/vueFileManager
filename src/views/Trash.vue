<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

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

function getFileIcon(name: string, type: string): { icon: string; color: string } {
  if (type === 'folder') return fileIconMap.folder
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return fileIconMap.image
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return fileIconMap.video
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return fileIconMap.audio
  if (['pdf'].includes(ext)) return fileIconMap.pdf
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return fileIconMap.archive
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return fileIconMap.code
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return fileIconMap.text
  return fileIconMap.file
}

const loading = ref(false)
const items = ref<any[]>([])
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

onMounted(() => { loadTrash() })

async function loadTrash() {
  loading.value = true
  try {
    const res = await api.get<{ items: any[] }>('/trash')
    items.value = res.items
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}

async function restoreItem(item: any) {
  try {
    await api.post(`/trash/${item.id}/restore`)
    showMsg('已恢复', 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function deleteItem(item: any) {
  if (!confirm(`确定永久删除 "${item.file_name}"？`)) return
  try {
    await api.delete(`/trash/${item.id}`)
    showMsg('已永久删除', 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function emptyTrash() {
  if (!confirm('确定清空回收站？此操作不可恢复。')) return
  try {
    await api.delete('/trash')
    showMsg('回收站已清空', 'success')
    await loadTrash()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<template>
  <Layout>
    <div class="px-4 pt-4">
      <div v-if="items.length > 0" class="flex justify-end mb-4">
        <button @click="emptyTrash" class="btn-danger text-sm">清空回收站</button>
      </div>

      <div v-if="message" class="mb-4 p-3 rounded-lg text-sm"
        :class="messageType === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'"
      >{{ message }}</div>

      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <div v-else-if="items.length > 0" class="space-y-2">
        <div v-for="item in items" :key="item.id"
          class="card flex items-center justify-between p-4">
          <div class="flex items-center gap-3">
            <Icon :name="getFileIcon(item.file_name, item.file_type).icon" :class="['w-6 h-6', getFileIcon(item.file_name, item.file_type).color]" />
            <div>
              <p class="font-medium dark:text-dark-text text-light-text">
                {{ item.file_name }}
                <span v-if="item.deleted_by" class="ml-2 px-1.5 py-0.5 text-xs rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                  {{ item.deleted_by }}
                </span>
              </p>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                原路径: {{ item.original_path }} | 删除于: {{ formatDate(item.deleted_at) }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button @click="restoreItem(item)" class="btn-secondary text-sm px-3 py-1.5">恢复</button>
            <button @click="deleteItem(item)" class="btn-danger text-sm px-3 py-1.5">永久删除</button>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-20">
        <Icon name="trash" class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
        <h3 class="text-lg font-semibold dark:text-dark-text text-light-text mb-2">回收站为空</h3>
        <p class="text-gray-500 dark:text-dark-text-secondary">删除的文件会出现在这里</p>
      </div>
    </div>
  </Layout>
</template>
