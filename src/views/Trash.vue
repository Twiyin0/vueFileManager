<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'

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
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-dark-text text-light-text">回收站</h1>
        <button v-if="items.length > 0" @click="emptyTrash" class="btn-danger text-sm">清空回收站</button>
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
            <span class="text-2xl">{{ item.file_type === 'folder' ? '📁' : '📄' }}</span>
            <div>
              <p class="font-medium dark:text-dark-text text-light-text">{{ item.file_name }}</p>
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
        <div class="text-6xl mb-4">🗑️</div>
        <h3 class="text-lg font-semibold dark:text-dark-text text-light-text mb-2">回收站为空</h3>
        <p class="text-gray-500 dark:text-dark-text-secondary">删除的文件会出现在这里</p>
      </div>
    </div>
  </Layout>
</template>
