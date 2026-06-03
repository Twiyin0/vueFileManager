<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFilesStore, FileItem } from '@/stores/files'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import FileList from '@/components/FileList.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilePreview from '@/components/FilePreview.vue'
import ShareDialog from '@/components/ShareDialog.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import FolderTree from '@/components/FolderTree.vue'
import SpotlightSearch from '@/components/SpotlightSearch.vue'

const route = useRoute()
const router = useRouter()
const filesStore = useFilesStore()

// 基础状态
const showUpload = ref(false)
const showCreateFolder = ref(false)
const newFolderName = ref('')
const showDeleteConfirm = ref(false)
const fileToDelete = ref<FileItem | null>(null)
const showRename = ref(false)
const fileToRename = ref<FileItem | null>(null)
const newFileName = ref('')
const showPreview = ref(false)
const fileToPreview = ref<FileItem | null>(null)
const showShare = ref(false)
const fileToShare = ref<FileItem | null>(null)

// 搜索
const searchQuery = ref('')
const searchResults = ref<FileItem[]>([])
const isSearching = ref(false)
const showSearch = ref(false)

// 右键菜单
const contextMenu = ref({ visible: false, x: 0, y: 0, item: null as any })

// 批量选择
const selectedFiles = ref<Set<string>>(new Set())
const isSelectMode = ref(false)

// 视图模式
const viewMode = ref<'list' | 'grid'>((localStorage.getItem('viewMode') as 'list' | 'grid') || 'list')
watch(viewMode, (v) => localStorage.setItem('viewMode', v))

// 文件详情面板
const showDetailPanel = ref(false)
const detailItem = ref<any>(null)

// 文件夹树
const showFolderTree = ref(true)

// 远程上传
const showRemoteUpload = ref(false)
const remoteUrl = ref('')
const remoteUploading = ref(false)

// 拖拽上传
const isDragging = ref(false)
let dragCounter = 0

// 上传进度
const uploadProgress = ref<{ file: string; percent: number }[]>([])
const showUploadProgress = ref(false)

// 存储池
const currentPoolId = computed(() => {
  const pool = route.query.pool as string
  return pool ? parseInt(pool) : undefined
})
const pools = ref<{ id: number; name: string }[]>([])

const currentPath = computed(() => (route.query.path as string) || '')

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

onMounted(async () => {
  // 加载存储池列表
  try {
    const res = await api.get<{ pools: any[] }>('/storage-pools')
    pools.value = res.pools.map(p => ({ id: p.id, name: p.name }))
  } catch {}
  filesStore.fetchFiles(currentPath.value, currentPoolId.value)
})

watch([currentPath, currentPoolId], ([newPath]) => {
  filesStore.fetchFiles(newPath, currentPoolId.value)
  showSearch.value = false
  searchQuery.value = ''
  selectedFiles.value.clear()
  isSelectMode.value = false
})

function navigateToPath(path: string, poolId?: number) {
  const query: Record<string, string> = {}
  if (poolId) query.pool = String(poolId)
  if (path) query.path = path
  router.push({ path: '/', query })
}

function openFile(file: FileItem) {
  if (file.isPool && file.poolId) {
    // 点击存储池虚拟文件夹，进入该池
    navigateToPath('', file.poolId)
  } else if (file.type === 'folder') {
    navigateToPath(file.path, currentPoolId.value)
  } else {
    fileToPreview.value = file
    showPreview.value = true
  }
}

function goUp() {
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  const newPath = segments.join('/')
  if (!newPath && currentPoolId.value) {
    // 在池根目录点上级，退回存储池列表
    goBackToPools()
  } else {
    navigateToPath(newPath, currentPoolId.value)
  }
}

// 返回存储池列表（从池内退回根目录）
function goBackToPools() {
  router.push({ path: '/' })
}

// 上传（带进度）
async function handleUpload(files: FileList, uploadPoolId?: number) {
  const targetPoolId = uploadPoolId || currentPoolId.value
  showUploadProgress.value = true
  uploadProgress.value = Array.from(files).map(f => ({ file: f.name, percent: 0 }))

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const formData = new FormData()
      formData.append('file', file)

      const xhr = new XMLHttpRequest()
      const token = localStorage.getItem('token')

      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            uploadProgress.value[i].percent = Math.round((e.loaded / e.total) * 100)
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadProgress.value[i].percent = 100
            resolve()
          } else {
            reject(new Error(xhr.statusText))
          }
        }
        xhr.onerror = () => reject(new Error('上传失败'))

        const dirPath = currentPath.value || ''
        const params = new URLSearchParams()
        if (dirPath) params.set('path', dirPath)
        if (targetPoolId) params.set('poolId', String(targetPoolId))
        const query = params.toString() ? `?${params}` : ''
        xhr.open('POST', `/api/files/upload${query}`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })
    } catch (err: any) {
      console.error(`上传失败: ${file.name}`, err)
    }
  }

  await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
  setTimeout(() => { showUploadProgress.value = false }, 2000)
}

// 拖拽上传
function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter++
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter--
  if (dragCounter === 0) isDragging.value = false
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter = 0
  isDragging.value = false
  if (e.dataTransfer?.files.length) {
    handleUpload(e.dataTransfer.files)
  }
}

// 远程上传
async function handleRemoteUpload() {
  if (!remoteUrl.value.trim()) return
  remoteUploading.value = true
  try {
    await api.post('/files/remote-upload', { url: remoteUrl.value, dirPath: currentPath.value, poolId: currentPoolId.value })
    await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    showRemoteUpload.value = false
    remoteUrl.value = ''
  } catch (err: any) {
    alert(err.message)
  } finally {
    remoteUploading.value = false
  }
}

// 批量选择
function toggleSelectMode() {
  isSelectMode.value = !isSelectMode.value
  if (!isSelectMode.value) selectedFiles.value.clear()
}

function toggleSelectFile(path: string) {
  if (selectedFiles.value.has(path)) {
    selectedFiles.value.delete(path)
  } else {
    selectedFiles.value.add(path)
  }
}

function selectAll() {
  const files = showSearch.value ? searchResults.value : filesStore.files
  if (selectedFiles.value.size === files.length) {
    selectedFiles.value.clear()
  } else {
    files.forEach(f => selectedFiles.value.add(f.path))
  }
}

// 批量删除
async function handleBatchDelete() {
  if (selectedFiles.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${selectedFiles.value.size} 个项目吗？`)) return
  try {
    await api.post('/files/batch-delete', { paths: Array.from(selectedFiles.value), poolId: currentPoolId.value })
    selectedFiles.value.clear()
    isSelectMode.value = false
    await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
  } catch (err: any) {
    alert(err.message)
  }
}

// 批量ZIP下载
async function handleBatchDownload() {
  if (selectedFiles.value.size === 0) return
  try {
    const response = await fetch('/api/files/download-zip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ paths: Array.from(selectedFiles.value), poolId: currentPoolId.value })
    })

    if (!response.ok) throw new Error('下载失败')

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'download.zip'
    a.click()
    URL.revokeObjectURL(url)
  } catch (err: any) {
    alert(err.message)
  }
}

// 收藏
async function toggleFavourite(file: any) {
  try {
    const res = await api.get<{ isFavourited: boolean }>(`/favourites/check?filePath=${encodeURIComponent(file.path)}&storagePoolId=${currentPoolId.value || 1}`)
    if (res.isFavourited) {
      await api.delete(`/favourites?filePath=${encodeURIComponent(file.path)}&storagePoolId=${currentPoolId.value || 1}`)
    } else {
      await api.post('/favourites', {
        filePath: file.path,
        fileName: file.name,
        fileType: file.type,
        storagePoolId: currentPoolId.value || 1
      })
    }
  } catch {}
}

// 创建文件夹
async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return
  const path = currentPath.value ? `${currentPath.value}/${newFolderName.value}` : newFolderName.value
  await api.post('/files/mkdir', { path, poolId: currentPoolId.value })
  await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
  showCreateFolder.value = false
  newFolderName.value = ''
}

// 删除
function confirmDelete(file: FileItem) {
  fileToDelete.value = file
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!fileToDelete.value) return
  await api.delete(`/files/delete?path=${encodeURIComponent(fileToDelete.value.path)}${currentPoolId.value ? `&poolId=${currentPoolId.value}` : ''}`)
  await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
  showDeleteConfirm.value = false
  fileToDelete.value = null
}

// 下载
async function handleDownload(file: FileItem) {
  await filesStore.downloadFile(file.path, file.poolId || currentPoolId.value)
}

// 搜索
async function handleSearch() {
  if (!searchQuery.value.trim()) { showSearch.value = false; return }
  isSearching.value = true
  showSearch.value = true
  try {
    const params = new URLSearchParams()
    params.set('q', searchQuery.value)
    if (currentPath.value) params.set('path', currentPath.value)
    if (currentPoolId.value) params.set('poolId', String(currentPoolId.value))
    const res = await api.get<{ files: FileItem[] }>(`/files/search?${params}`)
    searchResults.value = res.files
  } catch { searchResults.value = [] }
  finally { isSearching.value = false }
}

// 重命名
function startRename(file: FileItem) {
  fileToRename.value = file
  newFileName.value = file.name
  showRename.value = true
}

async function handleRename() {
  if (!fileToRename.value || !newFileName.value.trim()) return
  try {
    await api.post('/files/rename', { path: fileToRename.value.path, newName: newFileName.value.trim(), poolId: currentPoolId.value })
    await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    showRename.value = false
  } catch (err: any) { alert(err.message) }
}

// 分享
function startShare(file: FileItem) {
  fileToShare.value = file
  showShare.value = true
}

// 详情面板
function showDetail(file: any) {
  detailItem.value = file
  showDetailPanel.value = true
}

// 右键菜单处理
function handleContextMenu(e: MouseEvent, file?: any) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, item: file || null }
}

function handleContextAction(action: string, item?: any) {
  switch (action) {
    case 'open': if (item) navigateToPath(item.path); break
    case 'preview': if (item) { fileToPreview.value = item; showPreview.value = true }; break
    case 'download': if (item) handleDownload(item); break
    case 'rename': if (item) startRename(item); break
    case 'share': if (item) startShare(item); break
    case 'favourite': if (item) toggleFavourite(item); break
    case 'info': if (item) showDetail(item); break
    case 'delete': if (item) confirmDelete(item); break
    case 'batch-delete': handleBatchDelete(); break
    case 'batch-download': handleBatchDownload(); break
    case 'new-folder': showCreateFolder.value = true; break
    case 'upload': showUpload.value = true; break
    case 'remote-upload': showRemoteUpload.value = true; break
    case 'refresh': filesStore.fetchFiles(currentPath.value, currentPoolId.value); break
  }
}

// Spotlight搜索导航
function handleSpotlightNavigate(path: string, poolId?: number) {
  navigateToPath(path, poolId || currentPoolId.value)
}

// 文件夹树导航
function handleTreeNavigate(path: string, poolId?: number) {
  navigateToPath(path, poolId || currentPoolId.value)
}

// 当前存储池名称
const currentPoolName = computed(() => {
  if (!currentPoolId.value) return ''
  const pool = pools.value.find(p => p.id === currentPoolId.value)
  return pool?.name || ''
})

// 格式化文件大小
function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}
</script>

<template>
  <Layout>
    <!-- 拖拽上传覆盖层 -->
    <div v-if="isDragging"
      class="fixed inset-0 z-40 bg-blue-500/20 border-4 border-dashed border-blue-500 flex items-center justify-center"
      @dragenter="handleDragEnter" @dragleave="handleDragLeave" @dragover="handleDragOver" @drop="handleDrop">
      <div class="bg-white dark:bg-dark-card rounded-xl p-8 shadow-xl text-center">
        <div class="text-5xl mb-3">📤</div>
        <p class="text-lg font-semibold dark:text-dark-text">拖放文件到此处上传</p>
      </div>
    </div>

    <div class="flex h-full" @dragenter="handleDragEnter" @dragleave="handleDragLeave" @dragover="handleDragOver" @drop="handleDrop">
      <!-- 左侧文件夹树 -->
      <div v-if="showFolderTree" class="w-56 border-r dark:border-dark-border border-light-border overflow-y-auto py-2 flex-shrink-0 hidden lg:block">
        <div class="px-2 mb-2">
          <p class="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase">目录</p>
        </div>
        <FolderTree :current-path="currentPath" :pool-id="currentPoolId" @navigate="handleTreeNavigate" />
      </div>

      <!-- 主内容区 -->
      <div class="flex-1 min-w-0">
        <div class="max-w-6xl mx-auto p-4">
          <!-- 顶部操作栏 -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <!-- 面包屑导航 -->
            <div class="flex items-center gap-1.5 text-sm flex-wrap">
              <button @click="goBackToPools"
                class="px-2 py-1 rounded-md transition-colors"
                :style="{ color: currentPoolId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: currentPoolId ? 'normal' : '500' }">
                全部存储池
              </button>
              <template v-if="currentPoolId">
                <svg class="w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
                <button @click="navigateToPath('', currentPoolId)"
                  class="px-2 py-1 rounded-md transition-colors"
                  :style="{ color: currentPath ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: currentPath ? 'normal' : '500' }">
                  {{ currentPoolName }}
                </button>
                <template v-for="(segment, index) in pathSegments" :key="index">
                  <svg class="w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                  <button @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'), currentPoolId)"
                    class="px-2 py-1 rounded-md transition-colors"
                    :style="{ color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === pathSegments.length - 1 ? '500' : 'normal' }">
                    {{ segment }}
                  </button>
                </template>
              </template>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Spotlight搜索触发 -->
              <button @click="$el.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))"
                class="btn-secondary text-sm flex items-center gap-1" title="Ctrl+K 搜索">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                搜索
              </button>

              <button v-if="currentPath || currentPoolId" @click="goUp" class="btn-secondary text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
                </svg>
                上级
              </button>

              <!-- 视图模式切换 -->
              <div class="flex items-center border rounded-lg overflow-hidden" style="border-color: var(--border-color)">
                <button @click="viewMode = 'list'" class="p-1.5 transition-colors" :style="viewMode === 'list' ? 'background-color: var(--accent-color); color: white' : 'color: var(--text-secondary-color)'"
                  title="列表模式">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                  </svg>
                </button>
                <button @click="viewMode = 'grid'" class="p-1.5 transition-colors" :style="viewMode === 'grid' ? 'background-color: var(--accent-color); color: white' : 'color: var(--text-secondary-color)'"
                  title="图片模式">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"/>
                  </svg>
                </button>
              </div>

              <!-- 批量选择模式 -->
              <button @click="toggleSelectMode"
                :class="isSelectMode ? 'btn-primary' : 'btn-secondary'" class="text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                </svg>
                {{ isSelectMode ? '退出选择' : '多选' }}
              </button>

              <button @click="showCreateFolder = true" class="btn-secondary text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                </svg>
                新建
              </button>

              <button @click="showRemoteUpload = true" class="btn-secondary text-sm flex items-center gap-1" title="远程URL上传">
                🌐 远程上传
              </button>

              <button @click="showUpload = true" class="btn-primary text-sm flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                上传
              </button>
            </div>
          </div>

          <!-- 批量操作栏 -->
          <div v-if="isSelectMode" class="mb-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button @click="selectAll" class="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                {{ selectedFiles.size === (showSearch ? searchResults : filesStore.files).length ? '取消全选' : '全选' }}
              </button>
              <span class="text-sm text-gray-600 dark:text-gray-400">已选 {{ selectedFiles.size }} 项</span>
            </div>
            <div class="flex items-center gap-2">
              <button v-if="selectedFiles.size > 0" @click="handleBatchDownload"
                class="btn-secondary text-sm px-3 py-1.5">📦 打包下载</button>
              <button v-if="selectedFiles.size > 0" @click="handleBatchDelete"
                class="btn-danger text-sm px-3 py-1.5">🗑️ 批量删除</button>
            </div>
          </div>

          <!-- 上传进度 -->
          <div v-if="showUploadProgress" class="mb-4 p-4 rounded-lg bg-white dark:bg-dark-card border dark:border-dark-border border-light-border">
            <h4 class="text-sm font-semibold mb-2 dark:text-dark-text">上传进度</h4>
            <div v-for="(item, index) in uploadProgress" :key="index" class="mb-2 last:mb-0">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="dark:text-dark-text truncate max-w-[200px]">{{ item.file }}</span>
                <span class="dark:text-dark-text-secondary">{{ item.percent }}%</span>
              </div>
              <div class="w-full bg-gray-200 dark:bg-dark-hover rounded-full h-2">
                <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- 搜索内联 -->
          <div v-if="showSearch" class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-sm font-medium" style="color: var(--text-color)">搜索结果：{{ searchResults.length }} 个</h3>
              <button @click="showSearch = false; searchQuery = ''" class="text-xs hover:underline" style="color: var(--accent-color)">清除</button>
            </div>
          </div>

          <!-- 文件列表 -->
          <FileList
            :files="showSearch ? searchResults : filesStore.files"
            :loading="filesStore.loading || isSearching"
            :show-actions="true"
            :select-mode="isSelectMode"
            :selected-files="selectedFiles"
            :view-mode="viewMode"
            @open="openFile"
            @download="handleDownload"
            @delete="confirmDelete"
            @contextmenu="handleContextMenu"
            @toggle-select="toggleSelectFile"
            @detail="showDetail"
          />

          <!-- 错误提示 -->
          <div v-if="filesStore.error" class="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {{ filesStore.error }}
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :item="contextMenu.item"
      :selected-items="isSelectMode ? Array.from(selectedFiles) : []"
      @close="contextMenu.visible = false"
      @action="handleContextAction"
    />

    <!-- 文件详情面板 -->
    <FileDetailPanel
      :visible="showDetailPanel"
      :item="detailItem"
      @close="showDetailPanel = false"
      @favourite="toggleFavourite"
    />

    <!-- Spotlight搜索 -->
    <SpotlightSearch @navigate="handleSpotlightNavigate" />

    <!-- 上传对话框 -->
    <UploadDialog :show="showUpload" :current-path="currentPath" :pools="pools" :current-pool-id="currentPoolId" @close="showUpload = false" @upload="handleUpload" />

    <!-- 远程上传对话框 -->
    <Teleport to="body">
      <div v-if="showRemoteUpload" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="showRemoteUpload = false"/>
        <div class="relative card w-full max-w-md" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">远程URL上传</h3>
          <input v-model="remoteUrl" type="url" class="input-field mb-4" placeholder="https://example.com/file.zip" />
          <div class="flex justify-end gap-3">
            <button @click="showRemoteUpload = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleRemoteUpload" :disabled="remoteUploading" class="btn-primary text-sm">
              {{ remoteUploading ? '上传中...' : '开始上传' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 新建文件夹对话框 -->
    <Teleport to="body">
      <div v-if="showCreateFolder" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="showCreateFolder = false"/>
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">新建文件夹</h3>
          <input v-model="newFolderName" type="text" class="input-field mb-4" placeholder="文件夹名称" @keyup.enter="handleCreateFolder" />
          <div class="flex justify-end gap-3">
            <button @click="showCreateFolder = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleCreateFolder" class="btn-primary text-sm">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 重命名对话框 -->
    <Teleport to="body">
      <div v-if="showRename" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="showRename = false"/>
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4 dark:text-dark-text">重命名</h3>
          <input v-model="newFileName" type="text" class="input-field mb-4" placeholder="新名称" @keyup.enter="handleRename" />
          <div class="flex justify-end gap-3">
            <button @click="showRename = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleRename" class="btn-primary text-sm">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="`确定要删除「${fileToDelete?.name}」吗？`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />

    <!-- 文件预览 -->
    <FilePreview v-if="fileToPreview" :show="showPreview" :file-path="fileToPreview.path" :file-name="fileToPreview.name" :pool-id="fileToPreview.poolId || currentPoolId" @close="showPreview = false" />

    <!-- 分享对话框 -->
    <ShareDialog v-if="fileToShare" :show="showShare" :file-path="fileToShare.path" :file-name="fileToShare.name" @close="showShare = false" />
  </Layout>
</template>
