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

const username = computed(() => route.params.username as string)
const currentPath = computed(() => (route.query.path as string) || '')

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

async function fetchFiles() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get<{ files: FileItem[]; owner: string }>(
      `/guest/${username.value}/list?path=${encodeURIComponent(currentPath.value)}`
    )
    files.value = res.files
    owner.value = res.owner
  } catch (err: any) {
    error.value = err.message
    files.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchFiles)
watch(currentPath, fetchFiles)

function navigateToPath(path: string) {
  router.push({ path: `/guest/${username.value}`, query: path ? { path } : {} })
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
  const url = `/api/guest/${username.value}/download?path=${encodeURIComponent(file.path)}`
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

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--color-light-bg)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--color-light-surface)">
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

        <!-- 路径导航 -->
        <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
          <button
            @click="navigateToPath('')"
            class="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
            :class="currentPath ? 'text-blue-500 dark:text-blue-400' : 'dark:text-dark-text text-light-text font-medium'"
          >
            根目录
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

        <!-- 错误提示 -->
        <div v-if="error" class="card p-6 text-center">
          <svg class="w-16 h-16 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
          <p class="text-red-500 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- 文件列表 -->
        <FileList
          v-else
          :files="files"
          :loading="loading"
          :show-actions="false"
          @open="openFile"
        />
      </div>
    </main>
  </div>
</template>
