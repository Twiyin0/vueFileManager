<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
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

// 上传
const showUpload = ref(false)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadError = ref('')

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

const username = computed(() => route.params.username as string)
const shareId = computed(() => route.params.shareId as string)
const currentPath = computed(() => ((route.query.path as string) || '').replace(/\\/g, '/'))

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

const isFolderView = computed(() => !!shareId.value)

// 权限别名映射
const permissionAliases: Record<string, string[]> = {
  read: ['preview', 'download'],
  write: ['upload'],
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

// 右键菜单
function handleContextMenu(e: MouseEvent, file?: FileItem) {
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
    case 'refresh':
      fetchFiles()
      break
  }
}

async function handleDelete() {
  if (!fileToDelete.value) return
  try {
    const url = `/api/guest/${username.value}/${shareId.value}/delete`
    const res = await fetch(url, {
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
    const url = `/api/guest/${username.value}/${shareId.value}/rename`
    const res = await fetch(url, {
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
function triggerUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) handleUpload(file)
  }
  input.click()
}

async function handleUpload(file: File) {
  uploading.value = true
  uploadError.value = ''
  try {
    const formData = new FormData()
    formData.append('file', file)
    if (currentPath.value) formData.append('dirPath', currentPath.value)

    const res = await fetch(`/api/guest/${username.value}/${shareId.value}/upload`, {
      method: 'POST',
      body: formData
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || '上传失败')
    }
    await fetchFiles()
  } catch (err: any) {
    uploadError.value = err.message
  } finally {
    uploading.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const permLabels: Record<string, string> = {
  read: '读取',
  write: '写入',
  delete: '删除',
  edit: '文件编辑',
  // 兼容旧格式
  preview: '预览',
  download: '下载',
  upload: '上传'
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--surface-color)">
      <router-link to="/guest" class="flex items-center gap-2 text-sm text-blue-500 dark:text-blue-400">
        <Icon name="chevron-left" class="w-4 h-4" />
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
            访客模式
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
          <Icon name="exclamation" class="w-16 h-16 mx-auto mb-3 text-red-400" />
          <p class="text-red-500 dark:text-red-400">{{ error }}</p>
        </div>

        <!-- 文件夹列表视图（无 shareId） -->
        <template v-else-if="!isFolderView">
          <div v-if="shares.length === 0" class="card flex flex-col items-center justify-center py-20 text-gray-400 dark:text-dark-text-secondary">
            <Icon name="folder" class="w-16 h-16 mb-3" />
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
                <Icon name="folder" class="w-6 h-6 text-blue-500 dark:text-dark-accent" />
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="font-medium dark:text-dark-text text-light-text group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors truncate">
                  {{ share.label || share.folder_path }}
                </h3>
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                  {{ share.pool_name }} · {{ formatDate(share.created_at) }}
                </p>
                <!-- 权限标签 -->
                <div v-if="share.permissions" class="flex gap-1 mt-1.5 flex-wrap">
                  <span v-for="p in share.permissions.split(',')" :key="p"
                    class="px-1.5 py-0.5 text-xs rounded"
                    style="background-color: var(--accent-soft-color); color: var(--accent-color)">
                    {{ permLabels[p.trim()] || p.trim() }}
                  </span>
                </div>
              </div>
              <Icon name="chevron-right" class="w-5 h-5 text-gray-400 dark:text-dark-text-secondary group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors flex-shrink-0" />
            </div>
          </div>
        </template>

        <!-- 文件浏览视图（有 shareId） -->
        <template v-else>
          <!-- 返回文件夹列表 + 路径导航 + 视图切换 -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-1.5 text-sm flex-wrap">
              <button
                @click="goBackToShares()"
                class="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                style="color: var(--accent-color)"
              >
                {{ shareLabel || '返回文件夹列表' }}
              </button>
              <template v-for="(segment, index) in pathSegments" :key="index">
                <Icon name="chevron-right" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                <button
                  @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
                  class="px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  :style="{ color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === pathSegments.length - 1 ? '500' : 'normal' }"
                >
                  {{ segment }}
                </button>
              </template>
            </div>

            <!-- 工具栏 -->
            <div class="flex items-center gap-1.5">
              <!-- 新建文件夹 -->
              <button
                v-if="hasPermission('upload')"
                @click="showCreateFolder = true"
                class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="新建文件夹"
              >
                <Icon name="folder-plus" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              </button>

              <!-- 上传按钮 -->
              <button
                v-if="hasPermission('upload')"
                @click="triggerUpload"
                class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="上传文件"
                :disabled="uploading"
              >
                <Icon v-if="uploading" name="loader" class="w-4 h-4 animate-spin" style="color: var(--text-secondary-color)" />
                <Icon v-else name="upload" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              </button>

              <!-- 返回上级 -->
              <button
                v-if="currentPath"
                @click="goUp"
                class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="上级目录"
              >
                <Icon name="arrow-up" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              </button>

              <!-- 刷新 -->
              <button
                @click="fetchFiles"
                class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="刷新"
              >
                <Icon name="refresh-cw" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              </button>

              <!-- 视图切换 -->
              <div class="flex border rounded-md overflow-hidden" style="border-color: var(--border-color)">
                <button @click="viewMode = 'list'" class="p-1.5 transition-colors" :style="viewMode === 'list' ? 'background-color: var(--accent-color); color: white' : 'color: var(--text-secondary-color)'">
                  <Icon name="list" class="w-4 h-4" />
                </button>
                <button @click="viewMode = 'grid'" class="p-1.5 transition-colors" :style="viewMode === 'grid' ? 'background-color: var(--accent-color); color: white' : 'color: var(--text-secondary-color)'">
                  <Icon name="grid" class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- 上传错误提示 -->
          <div v-if="uploadError" class="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm flex items-center justify-between">
            <span>{{ uploadError }}</span>
            <button @click="uploadError = ''" class="text-red-400 hover:text-red-600">
              <Icon name="x" class="w-4 h-4" />
            </button>
          </div>

          <!-- 文件列表 -->
          <FileList
            :files="files"
            :loading="loading"
            :show-actions="false"
            :view-mode="viewMode"
            :guest-base-url="guestBaseUrl"
            @open="openFile"
            @download="handleDownload"
            @contextmenu="handleContextMenu"
          />
        </template>
      </div>
    </main>

    <!-- 右键菜单 -->
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :item="contextMenu.item"
      :read-only="false"
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

    <!-- 新建文件夹对话框 -->
    <Teleport to="body">
      <div v-if="showCreateFolder" class="fixed inset-0 z-50 flex items-center justify-center p-4">
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

    <!-- 重命名对话框 -->
    <Teleport to="body">
      <div v-if="showRename" class="fixed inset-0 z-50 flex items-center justify-center p-4">
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
  </div>
</template>
