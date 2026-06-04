<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { FileItem } from '@/stores/files'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FileList from '@/components/FileList.vue'

const route = useRoute()
const router = useRouter()

const files = ref<FileItem[]>([])
const loading = ref(false)
const error = ref('')
const owner = ref('')
const shares = ref<any[]>([])
const shareLabel = ref('')
const loadingShares = ref(false)

const username = computed(() => route.params.username as string)
const shareId = computed(() => route.params.shareId as string)
const currentPath = computed(() => (route.query.path as string) || '')

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

const isFolderView = computed(() => !!shareId.value)

async function fetchShares() {
  loadingShares.value = true
  error.value = ''
  try {
    const res = await api.get<{ shares: any[]; owner: string }>(
      `/guest/${username.value}/list`
    )
    shares.value = res.shares
    owner.value = res.owner
  } catch (err: any) {
    error.value = err.message
    shares.value = []
  } finally {
    loadingShares.value = false
  }
}

async function fetchFiles() {
  if (!shareId.value) return
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (currentPath.value) params.set('path', currentPath.value)
    const query = params.toString() ? `?${params}` : ''
    const res = await api.get<{ files: FileItem[]; owner: string; shareLabel: string }>(
      `/guest/${username.value}/${shareId.value}/list${query}`
    )
    files.value = res.files
    owner.value = res.owner
    shareLabel.value = res.shareLabel
  } catch (err: any) {
    error.value = err.message
    files.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (shareId.value) {
    fetchFiles()
  } else {
    fetchShares()
  }
})

watch(shareId, () => {
  if (shareId.value) {
    fetchFiles()
  } else {
    fetchShares()
  }
})

watch(currentPath, () => {
  if (shareId.value) {
    fetchFiles()
  }
})

function navigateToPath(path: string) {
  router.push({ path: `/guest/${username.value}/${shareId.value}`, query: path ? { path } : {} })
}

function navigateToShare(id: number) {
  router.push({ path: `/guest/${username.value}/${id}` })
}

function goBackToShares() {
  router.push({ path: `/guest/${username.value}` })
}

function openFile(file: FileItem) {
  if (file.type === 'folder') {
    navigateToPath(file.path)
  }
}

function goUp() {
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  navigateToPath(segments.join('/'))
}

async function handleDownload(file: FileItem) {
  const token = localStorage.getItem('token')
  const url = `/api/guest/${username.value}/${shareId.value}/download?path=${encodeURIComponent(file.path)}`
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  URL.revokeObjectURL(a.href)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--surface-color)">
      <router-link to="/guest" class="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        返回访客列表
      </router-link>
      <div class="flex items-center gap-3">
        <ThemeToggle />
        <router-link to="/login" class="btn-primary text-sm">登录</router-link>
      </div>
    </header>

    <!-- 内容 -->
    <main class="flex-1 p-4">
      <div class="max-w-6xl mx-auto">
        <!-- 标题 -->
        <div class="mb-4">
          <h1 class="text-xl font-bold dark:text-dark-text text-light-text">
            {{ owner }} 的公开文件
          </h1>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
            访客模式 · 只读访问
          </p>
        </div>

        <!-- 加载中 -->
        <div v-if="loadingShares || loading" class="flex items-center justify-center py-20">
          <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>

        <!-- 错误提示 -->
        <div v-else-if="error" class="card p-6 text-center">
          <svg class="w-16 h-16 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
          <p class="text-red-500 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- 文件夹列表视图（无 shareId） -->
        <template v-else-if="!isFolderView">
          <div v-if="shares.length === 0" class="card flex flex-col items-center justify-center py-20 text-gray-400 dark:text-dark-text-secondary">
            <svg class="w-16 h-16 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
            <p>暂无分享的文件夹</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="share in shares"
              :key="share.id"
              @click="navigateToShare(share.id)"
              class="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer group"
            >
              <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-dark-accent-soft flex items-center justify-center flex-shrink-0">
                <svg class="w-6 h-6 text-blue-500 dark:text-dark-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium dark:text-dark-text text-light-text group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors truncate">
                  {{ share.label || share.folder_path }}
                </h3>
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                  {{ share.pool_name }} · {{ formatDate(share.created_at) }}
                </p>
              </div>
              <svg class="w-5 h-5 text-gray-400 dark:text-dark-text-secondary group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </div>
          </div>
        </template>

        <!-- 文件浏览视图（有 shareId） -->
        <template v-else>
          <!-- 返回文件夹列表 + 路径导航 -->
          <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
            <button
              @click="goBackToShares()"
              class="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              style="color: var(--accent-color)"
            >
              {{ shareLabel || '返回文件夹列表' }}
            </button>
            <template v-for="(segment, index) in pathSegments" :key="index">
              <svg class="w-4 h-4 text-gray-400 dark:text-dark-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <button
                @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
                class="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                :class="index === pathSegments.length - 1 ? 'dark:text-dark-text text-light-text font-medium' : 'text-blue-500 dark:text-blue-400'"
              >
                {{ segment }}
              </button>
            </template>
          </div>

          <!-- 返回上级 -->
          <div v-if="currentPath" class="mb-3">
            <button @click="goUp" class="btn-secondary text-sm flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
              </svg>
              上级
            </button>
          </div>

          <!-- 文件列表 -->
          <FileList
            :files="files"
            :loading="loading"
            :show-actions="false"
            @open="openFile"
            @download="handleDownload"
          />
        </template>
      </div>
    </main>
  </div>
</template>
