<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { FileItem } from '@/stores/files'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FileList from '@/components/FileList.vue'
import FilePreview from '@/components/FilePreview.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import APlayer from 'aplayer'
import 'aplayer/dist/APlayer.min.css'

const route = useRoute()
const router = useRouter()

const files = ref<FileItem[]>([])
const loading = ref(false)
const error = ref('')
const owner = ref('')
const shares = ref<any[]>([])
const shareLabel = ref('')
const loadingShares = ref(false)

// 预览
const showPreview = ref(false)
const fileToPreview = ref<FileItem | null>(null)

// 视图模式
const viewMode = ref<'list' | 'grid'>((localStorage.getItem('guestViewMode') as 'list' | 'grid') || 'list')
watch(viewMode, (v) => localStorage.setItem('guestViewMode', v))

// 右键菜单
const contextMenu = ref({ visible: false, x: 0, y: 0, item: null as any })

// 文件详情面板
const showDetailPanel = ref(false)
const detailItem = ref<any>(null)

// 权限
const sharePermissions = ref<string>('')

// 批量选择
const selectedFiles = ref<Set<string>>(new Set())
const isSelectMode = computed(() => selectedFiles.value.size > 0)

// 上传
const uploading = ref(false)
const uploadError = ref('')
const showUploadProgress = ref(false)
const uploadProgress = ref<{ file: string; percent: number }[]>([])

// 删除确认
const showDeleteConfirm = ref(false)
const fileToDelete = ref<FileItem | null>(null)

// 重命名
const showRename = ref(false)
const fileToRename = ref<FileItem | null>(null)
const newFileName = ref('')

// 新建文件夹
const showCreateFolder = ref(false)
const newFolderName = ref('')

// 搜索
const searchQuery = ref('')
const searchResults = ref<FileItem[]>([])
const showSearch = ref(false)

// 分享下拉
const showShareDropdown = ref(false)

// APlayer
const aplayerRef = ref<HTMLDivElement>()
let aplayerInst: APlayer | null = null
const showAplayer = ref(false)
const aplayerCollapsed = ref(true)
const isDark = ref(document.documentElement.classList.contains('dark'))
const themeObserver = new MutationObserver(() => {
  isDark.value = document.documentElement.classList.contains('dark')
})

const username = computed(() => route.params.username as string)
const shareId = computed(() => route.params.shareId as string)
const currentPath = computed(() => ((route.query.path as string) || '').replace(/\\/g, '/'))

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

const isFolderView = computed(() => !!shareId.value)

const currentShare = computed(() => shares.value.find(s => String(s.id) === shareId.value))

// 权限
const permissionAliases: Record<string, string[]> = {
  read: ['preview', 'download'],
  write: ['upload', 'new-folder'],
  edit: ['rename'],
}

const hasPermission = (action: string) => {
  const perms = sharePermissions.value.split(',').map(s => s.trim())
  if (perms.includes(action)) return true
  for (const [parent, aliases] of Object.entries(permissionAliases)) {
    if (aliases.includes(action) && perms.includes(parent)) return true
  }
  return false
}

const guestBaseUrl = computed(() => {
  if (!shareId.value) return undefined
  return `/api/guest/${username.value}/${shareId.value}/preview`
})

const guestSaveUrl = computed(() => {
  if (!shareId.value || !hasPermission('edit')) return undefined
  return `/api/guest/${username.value}/${shareId.value}/write`
})

const allowedContextMenuActions = computed(() => {
  const actions: string[] = []
  if (hasPermission('preview')) actions.push('preview')
  if (hasPermission('download')) actions.push('download')
  if (hasPermission('delete')) actions.push('delete')
  if (hasPermission('rename')) actions.push('rename')
  if (hasPermission('upload')) actions.push('new-folder')
  actions.push('info')
  return actions
})

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
    const res = await api.get<{ files: FileItem[]; owner: string; shareLabel: string; permissions: string }>(
      `/guest/${username.value}/${shareId.value}/list${query}`
    )
    files.value = res.files
    owner.value = res.owner
    shareLabel.value = res.shareLabel
    sharePermissions.value = res.permissions || ''
  } catch (err: any) {
    error.value = err.message
    files.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (shareId.value) {
    fetchFiles()
  } else {
    fetchShares()
  }
})

onUnmounted(() => {
  themeObserver.disconnect()
  destroyAplayer()
})

watch(shareId, () => {
  selectedFiles.value.clear()
  showSearch.value = false
  searchQuery.value = ''
  if (shareId.value) {
    fetchFiles()
  } else {
    fetchShares()
  }
})

watch(currentPath, () => {
  selectedFiles.value.clear()
  showSearch.value = false
  searchQuery.value = ''
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

// APlayer
const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']

function isAudioFile(file: FileItem): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return audioExts.includes(ext)
}

function getFilePreviewUrl(file: FileItem): string {
  return `/api/guest/${username.value}/${shareId.value}/preview?path=${encodeURIComponent(file.path)}`
}

function buildAudioList() {
  return files.value.filter(f => isAudioFile(f)).map(f => ({
    name: f.name.replace(/\.[^.]+$/, ''),
    url: getFilePreviewUrl(f),
    artist: `${owner.value} 的文件`,
  }))
}

function destroyAplayer() {
  if (aplayerInst) { try { aplayerInst.destroy() } catch {} aplayerInst = null }
  showAplayer.value = false
}

// 移动端检测
const isMobileDevice = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)

function openAplayerWithFile(targetFile: FileItem) {
  const audioList = buildAudioList()
  if (audioList.length === 0) return

  const targetUrl = getFilePreviewUrl(targetFile)
  const targetIndex = audioList.findIndex(a => a.url === targetUrl)

  if (aplayerInst && showAplayer.value) {
    aplayerInst.list.clear()
    audioList.forEach(a => aplayerInst!.list.add(a))
    if (targetIndex >= 0) aplayerInst.list.switch(targetIndex)
    aplayerInst.play()
    return
  }

  destroyAplayer()
  showAplayer.value = true
  aplayerCollapsed.value = false

  nextTick(() => {
    if (!aplayerRef.value) return
    aplayerInst = new APlayer({
      container: aplayerRef.value,
      autoplay: !isMobileDevice,
      volume: 0.3,
      theme: isDark.value ? '#6b7cff' : '#4f6ef7',
      audio: audioList,
    })
    if (targetIndex > 0) aplayerInst.list.switch(targetIndex)
    if (isMobileDevice) aplayerInst.play()
  })
}

function toggleAplayerCollapse() {
  aplayerCollapsed.value = !aplayerCollapsed.value
}

// 目录变化时刷新 APlayer
watch(currentPath, () => {
  if (showAplayer.value) {
    nextTick(() => {
      const audioList = buildAudioList()
      if (audioList.length > 0 && aplayerInst) {
        aplayerInst.list.clear()
        audioList.forEach(a => aplayerInst!.list.add(a))
      } else if (audioList.length === 0) {
        destroyAplayer()
      }
    })
  }
})

function openFile(file: FileItem) {
  if (file.type === 'folder') {
    navigateToPath(file.path)
  } else if (isAudioFile(file)) {
    openAplayerWithFile(file)
  } else if (hasPermission('preview')) {
    fileToPreview.value = file
    showPreview.value = true
  }
}

function goUp() {
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  navigateToPath(segments.join('/'))
}

async function handleDownload(file: FileItem) {
  if (!hasPermission('download')) return
  const url = `/api/guest/${username.value}/${shareId.value}/download?path=${encodeURIComponent(file.path)}`
  const response = await fetch(url)
  if (!response.ok) throw new Error('下载失败')
  const blob = await response.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  URL.revokeObjectURL(a.href)
}

// 搜索（前端过滤）
function handleSearch() {
  if (!searchQuery.value.trim()) {
    showSearch.value = false
    return
  }
  const q = searchQuery.value.toLowerCase()
  searchResults.value = files.value.filter(f => f.name.toLowerCase().includes(q))
  showSearch.value = true
}

// 批量选择
function toggleSelectFile(path: string) {
  if (selectedFiles.value.has(path)) {
    selectedFiles.value.delete(path)
    selectedFiles.value = new Set(selectedFiles.value)
  } else {
    selectedFiles.value = new Set([...selectedFiles.value, path])
  }
}

function selectAll() {
  const list = showSearch.value ? searchResults.value : files.value
  if (selectedFiles.value.size === list.length) {
    selectedFiles.value.clear()
  } else {
    selectedFiles.value = new Set(list.map(f => f.path))
  }
}

function clearSelection() {
  selectedFiles.value.clear()
}

// 右键菜单
function handleContextMenu(e: MouseEvent, file?: FileItem) {
  e.preventDefault()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, item: file || null }
}

function handleContextAction(action: string, item?: any) {
  switch (action) {
    case 'preview':
      if (item) { fileToPreview.value = item; showPreview.value = true }
      break
    case 'download':
      if (item) handleDownload(item)
      break
    case 'open':
      if (item) navigateToPath(item.path)
      break
    case 'info':
      if (item) { detailItem.value = item; showDetailPanel.value = true }
      break
    case 'delete':
      if (item) { fileToDelete.value = item; showDeleteConfirm.value = true }
      break
    case 'rename':
      if (item) { fileToRename.value = item; newFileName.value = item.name; showRename.value = true }
      break
    case 'new-folder':
      newFolderName.value = ''
      showCreateFolder.value = true
      break
    case 'select-all': selectAll(); break
    case 'clear-selection': clearSelection(); break
    case 'refresh': fetchFiles(); break
  }
}

async function handleDelete() {
  if (!fileToDelete.value) return
  try {
    const res = await fetch(`/api/guest/${username.value}/${shareId.value}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileToDelete.value.path })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || '删除失败')
    }
    await fetchFiles()
  } catch (err: any) {
    uploadError.value = err.message
  }
  showDeleteConfirm.value = false
  fileToDelete.value = null
}

async function handleRename() {
  if (!fileToRename.value || !newFileName.value.trim()) return
  try {
    const res = await fetch(`/api/guest/${username.value}/${shareId.value}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileToRename.value.path, newName: newFileName.value.trim() })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || '重命名失败')
    }
    await fetchFiles()
  } catch (err: any) {
    uploadError.value = err.message
  }
  showRename.value = false
  fileToRename.value = null
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return
  try {
    const dirPath = currentPath.value
      ? `${currentPath.value}/${newFolderName.value.trim()}`
      : newFolderName.value.trim()
    await api.post(`/guest/${username.value}/${shareId.value}/mkdir`, { path: dirPath })
    showCreateFolder.value = false
    newFolderName.value = ''
    await fetchFiles()
  } catch (err: any) {
    uploadError.value = err.message
  }
}

// 上传
async function handleUpload(fileList: FileList) {
  const arr = Array.from(fileList)
  if (arr.length === 0) return
  showUploadProgress.value = true
  uploadProgress.value = arr.map(f => ({ file: f.name, percent: 0 }))

  for (let i = 0; i < arr.length; i++) {
    const file = arr[i]
    try {
      const formData = new FormData()
      // 文件名放 query 参数，multipart 里用占位名，彻底绕开编码问题
      formData.append('file', file, 'upload.bin')
      if (currentPath.value) formData.append('dirPath', currentPath.value)

      const xhr = new XMLHttpRequest()
      const params = new URLSearchParams({ filename: file.name })
      if (currentPath.value) params.set('dirPath', currentPath.value)
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
          } else reject(new Error(xhr.statusText))
        }
        xhr.onerror = () => reject(new Error('上传失败'))
        xhr.open('POST', `/api/guest/${username.value}/${shareId.value}/upload?${params}`)
        xhr.send(formData)
      })
    } catch (err: any) {
      uploadError.value = err.message
    }
  }

  await fetchFiles()
  setTimeout(() => { showUploadProgress.value = false }, 2000)
}

// 拖拽上传
const isDragging = ref(false)
let dragCounter = 0

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
function handleDragOver(e: DragEvent) { e.preventDefault() }
function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter = 0
  isDragging.value = false
  if (e.dataTransfer?.files.length) handleUpload(e.dataTransfer.files)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const permLabels: Record<string, string> = {
  read: '读取',
  write: '写入',
  delete: '删除',
  edit: '文件编辑',
  preview: '预览',
  download: '下载',
  upload: '上传'
}
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden" style="background-color: var(--bg-color)">
    <!-- Header -->
    <header class="h-11 flex items-center justify-between px-3 sm:px-4 flex-shrink-0" style="background-color: var(--surface-color)">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <router-link to="/guest" class="flex items-center gap-2 font-bold text-lg flex-shrink-0">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
          <span class="hidden sm:inline" style="color: var(--text-color)">VueFileManager</span>
        </router-link>
        <span v-if="isFolderView" class="text-sm font-medium truncate" style="color: var(--text-secondary-color)">
          / {{ owner }}
        </span>
        <span v-else class="text-sm font-medium truncate hidden sm:inline" style="color: var(--text-secondary-color)">
          / 访客模式
        </span>
      </div>
      <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
        <ThemeToggle />
        <router-link to="/login" class="btn-primary text-sm px-3 py-1.5">登录</router-link>
      </div>
    </header>

    <!-- 内容区 -->
    <main class="flex-1 overflow-auto" @dragenter="handleDragEnter" @dragleave="handleDragLeave" @dragover="handleDragOver" @drop="handleDrop">
      <!-- 拖拽上传覆盖层 -->
      <div v-if="isDragging" class="fixed inset-0 z-40 bg-blue-500/20 border-4 border-dashed border-blue-500 flex items-center justify-center">
        <div class="bg-white dark:bg-dark-card rounded-xl p-8 border text-center">
          <Icon name="upload" class="w-16 h-16 mb-3" style="color: var(--accent-color)" />
          <p class="text-lg font-semibold" style="color: var(--text-color)">拖放文件到此处上传</p>
        </div>
      </div>

      <!-- 加载中 -->
      <div v-if="loadingShares || loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" class="px-4 pt-4">
        <div class="card p-6 text-center">
          <Icon name="exclamation" class="w-16 h-16 mx-auto mb-3 text-red-400" />
          <p class="text-red-500">{{ error }}</p>
        </div>
      </div>

      <!-- 文件夹列表视图（无 shareId） -->
      <template v-else-if="!isFolderView">
        <div class="px-4 pt-4">
          <div v-if="shares.length === 0" class="card flex flex-col items-center justify-center py-20" style="color: var(--text-secondary-color)">
            <Icon name="folder" class="w-16 h-16 mb-3" />
            <p>暂无分享的文件夹</p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="share in shares"
              :key="share.id"
              @click="navigateToShare(share.id)"
              class="card flex items-center gap-4 cursor-pointer group"
            >
              <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style="background-color: var(--accent-soft-color)">
                <Icon name="folder" class="w-6 h-6" style="color: var(--accent-color)" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium truncate transition-colors" style="color: var(--text-color)">
                  {{ share.label || share.folder_path }}
                </h3>
                <p class="text-xs" style="color: var(--text-secondary-color)">
                  {{ share.pool_name }} · {{ formatDate(share.created_at) }}
                </p>
                <div v-if="share.permissions" class="flex gap-1 mt-1.5 flex-wrap">
                  <span v-for="p in share.permissions.split(',')" :key="p"
                    class="px-1.5 py-0.5 text-xs rounded"
                    style="background-color: var(--accent-soft-color); color: var(--accent-color)">
                    {{ permLabels[p.trim()] || p.trim() }}
                  </span>
                </div>
              </div>
              <Icon name="chevron-right" class="w-5 h-5 flex-shrink-0 transition-colors" style="color: var(--text-secondary-color)" />
            </div>
          </div>
        </div>
      </template>

      <!-- 文件浏览视图（有 shareId） -->
      <template v-else>
        <div class="px-4 pt-4">
          <!-- 顶部操作栏 -->
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <!-- 面包屑：分享文件夹下拉 + 路径 -->
            <div class="flex items-center gap-1.5 text-sm flex-wrap">
              <div class="relative">
                <button @click.stop="showShareDropdown = !showShareDropdown"
                  class="flex items-center gap-1 px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--accent-color)">
                  <Icon name="folder" class="w-4 h-4" />
                  <span>{{ currentShare?.label || shareLabel || '文件夹' }}</span>
                  <Icon name="chevron-down" class="w-3 h-3" />
                </button>
                <div v-if="showShareDropdown"
                  class="absolute left-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border py-1 shadow-sm"
                  style="background-color: var(--card-color); border-color: var(--border-color)">
                  <div v-for="s in shares" :key="s.id"
                    class="px-4 py-2 text-sm flex items-center gap-2 cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    :style="{ color: String(s.id) === shareId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: String(s.id) === shareId ? '500' : 'normal' }"
                    @click="navigateToShare(s.id); showShareDropdown = false">
                    <Icon name="folder" class="w-4 h-4" />
                    {{ s.label || s.folder_path }}
                  </div>
                </div>
              </div>
              <template v-for="(segment, index) in pathSegments" :key="index">
                <Icon name="chevron-right" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                <button @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
                  class="px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  :style="{ color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === pathSegments.length - 1 ? '500' : 'normal' }">
                  {{ segment }}
                </button>
              </template>
            </div>

            <!-- 操作按钮 -->
            <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <!-- 搜索 -->
              <div class="flex items-center gap-1">
                <input v-model="searchQuery" type="text" class="input-field text-sm w-24 sm:w-32" placeholder="搜索..."
                  @keyup.enter="handleSearch" @input="!searchQuery && (showSearch = false)" />
                <button @click="handleSearch" class="btn-secondary text-sm p-1.5" title="搜索">
                  <Icon name="search" class="w-4 h-4" />
                </button>
              </div>

              <button @click="fetchFiles" class="btn-secondary text-sm p-1.5" title="刷新">
                <Icon name="refresh-cw" class="w-4 h-4" />
              </button>

              <button v-if="currentPath" @click="goUp" class="btn-secondary text-sm p-1.5" title="上级目录">
                <Icon name="arrow-up" class="w-4 h-4" />
              </button>

              <!-- 视图切换 -->
              <div class="view-mode-toggle flex items-center border rounded-lg overflow-hidden" style="border-color: var(--border-color)">
                <button @click="viewMode = 'list'" class="p-1.5 transition-colors" :class="viewMode === 'list' ? 'view-mode-active' : ''">
                  <Icon name="list" class="w-4 h-4" />
                </button>
                <button @click="viewMode = 'grid'" class="p-1.5 transition-colors" :class="viewMode === 'grid' ? 'view-mode-active' : ''">
                  <Icon name="grid" class="w-4 h-4" />
                </button>
              </div>

              <button v-if="hasPermission('upload')" @click="showCreateFolder = true" class="btn-secondary text-sm flex items-center gap-1">
                <Icon name="folder-plus" class="w-4 h-4" />
                <span class="hidden sm:inline">新建</span>
              </button>

              <label v-if="hasPermission('upload')" class="btn-primary text-sm flex items-center gap-1 cursor-pointer">
                <Icon name="upload" class="w-4 h-4" />
                <span class="hidden sm:inline">上传</span>
                <input type="file" class="hidden" multiple @change="handleUpload(($event.target as HTMLInputElement).files!)" />
              </label>
            </div>
          </div>

          <!-- 批量选择提示 -->
          <div v-if="isSelectMode" class="mb-3 p-2 rounded-lg flex items-center justify-between text-sm"
            style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)">
            <div class="flex items-center gap-2 sm:gap-3 min-w-0">
              <button @click="selectAll" class="text-sm hover:underline flex-shrink-0" style="color: var(--accent-color)">
                {{ selectedFiles.size === (showSearch ? searchResults : files).length ? '取消全选' : '全选' }}
              </button>
              <span class="truncate" style="color: var(--text-secondary-color)">已选 {{ selectedFiles.size }} 项</span>
            </div>
            <button @click="clearSelection" class="text-sm hover:underline flex-shrink-0 ml-2" style="color: var(--text-secondary-color)">取消</button>
          </div>

          <!-- 搜索结果 -->
          <div v-if="showSearch" class="mb-3">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm" style="color: var(--text-color)">搜索结果：{{ searchResults.length }} 个</span>
              <button @click="showSearch = false; searchQuery = ''" class="text-xs hover:underline" style="color: var(--accent-color)">清除</button>
            </div>
          </div>

          <!-- 上传错误 -->
          <div v-if="uploadError" class="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
            <span>{{ uploadError }}</span>
            <button @click="uploadError = ''" class="text-red-400 hover:text-red-600">
              <Icon name="xmark" class="w-4 h-4" />
            </button>
          </div>

          <!-- 上传进度 -->
          <div v-if="showUploadProgress" class="mb-3 p-3 rounded-lg border" style="background-color: var(--card-color); border-color: var(--border-color)">
            <div v-for="(item, index) in uploadProgress" :key="index" class="mb-2 last:mb-0">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="truncate max-w-[150px] sm:max-w-[200px]" style="color: var(--text-color)">{{ item.file }}</span>
                <span class="flex-shrink-0 ml-2" style="color: var(--text-secondary-color)">{{ item.percent }}%</span>
              </div>
              <div class="w-full rounded-full h-2" style="background-color: var(--hover-color)">
                <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" :style="{ width: item.percent + '%' }"></div>
              </div>
            </div>
          </div>

          <!-- 文件列表 -->
          <FileList
            :files="showSearch ? searchResults : files"
            :loading="loading"
            :show-actions="false"
            :select-mode="!!shareId"
            :selected-files="selectedFiles"
            :view-mode="viewMode"
            :guest-base-url="guestBaseUrl"
            @open="openFile"
            @download="handleDownload"
            @contextmenu="handleContextMenu"
            @toggle-select="toggleSelectFile"
            @detail="(f) => { detailItem = f; showDetailPanel = true }"
          />
        </div>
      </template>

      <!-- Footer -->
      <footer class="px-4 py-3 text-center" style="color: var(--text-secondary-color)">
        <p class="text-xs opacity-60" style="line-height: 1.4">
          © {{ new Date().getFullYear() }}
          <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">VueFileManager</a>
          by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">Twiyin0</a>
          · MIT License
        </p>
      </footer>
    </main>

    <!-- 右键菜单 -->
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :item="contextMenu.item"
      :selected-items="isSelectMode ? Array.from(selectedFiles) : []"
      :allowed-actions="allowedContextMenuActions"
      @close="contextMenu.visible = false"
      @action="handleContextAction"
    />

    <!-- 文件预览 -->
    <FilePreview
      v-if="fileToPreview"
      :show="showPreview"
      :file-path="fileToPreview.path"
      :file-name="fileToPreview.name"
      :guest-base-url="guestBaseUrl"
      :guest-save-url="guestSaveUrl"
      :editable="hasPermission('edit')"
      :file-list="files"
      @close="showPreview = false; fileToPreview = null"
    />

    <!-- 文件详情面板 -->
    <FileDetailPanel
      :visible="showDetailPanel"
      :item="detailItem"
      @close="showDetailPanel = false"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="`确定要删除「${fileToDelete?.name}」吗？`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false; fileToDelete = null"
    />

    <!-- 新建文件夹 -->
    <Teleport to="body">
      <div v-if="showCreateFolder" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showCreateFolder = false"/>
        <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">新建文件夹</h3>
          <input v-model="newFolderName" type="text" class="input-field mb-4" placeholder="文件夹名称" @keyup.enter="handleCreateFolder" />
          <div class="flex justify-end gap-3">
            <button @click="showCreateFolder = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleCreateFolder" class="btn-primary text-sm">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 重命名 -->
    <Teleport to="body">
      <div v-if="showRename" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showRename = false"/>
        <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">重命名</h3>
          <input v-model="newFileName" type="text" class="input-field mb-4" placeholder="新名称" @keyup.enter="handleRename" />
          <div class="flex justify-end gap-3">
            <button @click="showRename = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleRename" class="btn-primary text-sm">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- APlayer 浮动播放器 -->
    <Teleport to="body">
      <div v-if="showAplayer" class="aplayer-float" :class="{ 'aplayer-mobile': isMobileDevice }">
        <div v-if="aplayerCollapsed"
          @click="toggleAplayerCollapse"
          class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer shadow-sm transition-all active:scale-95"
          style="background-color: var(--accent-color); color: white"
          title="展开播放器">
          <Icon name="music" class="w-4 h-4" />
        </div>
        <div v-show="!aplayerCollapsed" class="aplayer-wrap rounded-lg overflow-hidden border" style="background-color: var(--card-color); border-color: var(--border-color)">
          <div class="flex items-center justify-between px-2 py-1" style="background-color: var(--surface-color); border-bottom: 1px solid var(--border-color)">
            <span class="text-xs" style="color: var(--text-secondary-color)">播放器</span>
            <div class="flex items-center gap-0.5">
              <button @click="toggleAplayerCollapse" class="p-1 rounded hover:opacity-80" title="收缩" style="color: var(--text-secondary-color)">
                <Icon name="chevron-down" class="w-3.5 h-3.5" />
              </button>
              <button @click="destroyAplayer" class="p-1 rounded hover:opacity-80" title="关闭" style="color: var(--text-secondary-color)">
                <Icon name="xmark" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div ref="aplayerRef" />
        </div>
      </div>
    </Teleport>
  </div>
</template>
