<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import { useRouter } from 'vue-router'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

const router = useRouter()
const loading = ref(false)
const items = ref<any[]>([])

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

function navigateTo(item: any) {
  if (item.file_type === 'folder') {
    router.push({ path: '/', query: { path: item.file_path, pool: item.storage_pool_id } })
  }
}

function formatSize(size: number) {
  if (size < 1024) return size + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB'
  return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}
</script>

<template>
  <Layout>
    <div class="max-w-4xl mx-auto">
      <h1 class="text-2xl font-bold mb-6 dark:text-dark-text text-light-text">我的收藏</h1>

      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <div v-else-if="items.length > 0" class="space-y-2">
        <div v-for="item in items" :key="item.id"
          class="card flex items-center justify-between p-4 cursor-pointer hover:shadow-md transition-shadow"
          @click="navigateTo(item)">
          <div class="flex items-center gap-3">
            <Icon :name="item.file_type === 'folder' ? 'folder' : 'file-alt'" :class="['w-6 h-6', item.file_type === 'folder' ? 'text-blue-500' : 'text-gray-400']" />
            <div>
              <p class="font-medium dark:text-dark-text text-light-text">{{ item.file_name }}</p>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                {{ item.pool_name }} | {{ item.file_path }}
              </p>
            </div>
          </div>
          <button @click.stop="removeFav(item)" class="p-1.5 rounded-md hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors" title="取消收藏">
            <Icon name="star-sharp" class="w-5 h-5 text-yellow-500" />
          </button>
        </div>
      </div>

      <div v-else class="text-center py-20">
        <Icon name="star-sharp" class="w-16 h-16 mx-auto mb-4 text-yellow-400" />
        <h3 class="text-lg font-semibold dark:text-dark-text text-light-text mb-2">还没有收藏</h3>
        <p class="text-gray-500 dark:text-dark-text-secondary">在文件列表中点击星标添加收藏</p>
      </div>
    </div>
  </Layout>
</template>
