<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFilesStore, FileItem } from '@/stores/files'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import FileList from '@/components/FileList.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import FilePreview from '@/components/FilePreview.vue'
import ShareDialog from '@/components/ShareDialog.vue'

const route = useRoute()
const router = useRouter()
const filesStore = useFilesStore()

const showUpload = ref(false)
const showCreateFolder = ref(false)
const newFolderName = ref('')
const showDeleteConfirm = ref(false)
const fileToDelete = ref<FileItem | null>(null)

// 新增：搜索
const searchQuery = ref('')
const searchResults = ref<FileItem[]>([])
const isSearching = ref(false)
const showSearch = ref(false)

// 新增：重命名
const showRename = ref(false)
const fileToRename = ref<FileItem | null>(null)
const newFileName = ref('')

// 新增：预览
const showPreview = ref(false)
const fileToPreview = ref<FileItem | null>(null)

// 新增：分享
const showShare = ref(false)
const fileToShare = ref<FileItem | null>(null)

// 新增：右键菜单
const contextMenu = ref<{ show: boolean; x: number; y: number; file: FileItem | null }>({
  show: false, x: 0, y: 0, file: null
})

const currentPath = computed(() => (route.query.path as string) || '')

const pathSegments = computed(() => {
  if (!currentPath.value) return []
  return currentPath.value.split('/').filter(Boolean)
})

onMounted(() => {
  filesStore.fetchFiles(currentPath.value)
})

watch(currentPath, (newPath) => {
  filesStore.fetchFiles(newPath)
  showSearch.value = false
  searchQuery.value = ''
})

function navigateToPath(path: string) {
  router.push({ path: '/', query: path ? { path } : {} })
}

function openFile(file: FileItem) {
  if (file.type === 'folder') {
    navigateToPath(file.path)
  } else {
    // 预览文件
    fileToPreview.value = file
    showPreview.value = true
  }
}

function goUp() {
  const segments = currentPath.value.split('/').filter(Boolean)
  segments.pop()
  navigateToPath(segments.join('/'))
}

async function handleUpload(files: FileList) {
  for (let i = 0; i < files.length; i++) {
    await filesStore.uploadFile(files[i], currentPath.value)
  }
}

async function handleCreateFolder() {
  if (!newFolderName.value.trim()) return
  const path = currentPath.value ? `${currentPath.value}/${newFolderName.value}` : newFolderName.value
  await filesStore.createFolder(path)
  showCreateFolder.value = false
  newFolderName.value = ''
}

function confirmDelete(file: FileItem) {
  fileToDelete.value = file
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!fileToDelete.value) return
  await filesStore.deleteFile(fileToDelete.value.path)
  showDeleteConfirm.value = false
  fileToDelete.value = null
}

async function handleDownload(file: FileItem) {
  await filesStore.downloadFile(file.path)
}

// 搜索
async function handleSearch() {
  if (!searchQuery.value.trim()) {
    showSearch.value = false
    return
  }
  isSearching.value = true
  showSearch.value = true
  try {
    const res = await api.get<{ files: FileItem[] }>(
      `/files/search?q=${encodeURIComponent(searchQuery.value)}&path=${encodeURIComponent(currentPath.value)}`
    )
    searchResults.value = res.files
  } catch (err) {
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

// 重命名
function startRename(file: FileItem) {
  fileToRename.value = file
  newFileName.value = file.name
  showRename.value = true
  contextMenu.value.show = false
}

async function handleRename() {
  if (!fileToRename.value || !newFileName.value.trim()) return
  try {
    await api.post('/files/rename', {
      path: fileToRename.value.path,
      newName: newFileName.value.trim()
    })
    await filesStore.fetchFiles(currentPath.value)
    showRename.value = false
  } catch (err: any) {
    alert(err.message)
  }
}

// 分享
function startShare(file: FileItem) {
  fileToShare.value = file
  showShare.value = true
  contextMenu.value.show = false
}

// 右键菜单
function showContextMenu(e: MouseEvent, file: FileItem) {
  e.preventDefault()
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    file
  }
}

function hideContextMenu() {
  contextMenu.value.show = false
}

// 点击空白处关闭菜单
onMounted(() => {
  document.addEventListener('click', hideContextMenu)
})
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto" @click="hideContextMenu">
      <!-- 路径导航 + 操作栏 -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <!-- 面包屑导航 -->
        <div class="flex items-center gap-1.5 text-sm flex-wrap">
          <button
            @click="navigateToPath('')"
            class="px-2 py-1 rounded-md transition-colors"
            :style="{
              color: currentPath ? 'var(--accent-color)' : 'var(--text-color)',
              fontWeight: currentPath ? 'normal' : '500'
            }"
          >
            根目录
          </button>
          <template v-for="(segment, index) in pathSegments" :key="index">
            <svg class="w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <button
              @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
              class="px-2 py-1 rounded-md transition-colors"
              :style="{
                color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)',
                fontWeight: index === pathSegments.length - 1 ? '500' : 'normal'
              }"
            >
              {{ segment }}
            </button>
          </template>
        </div>

        <!-- 操作按钮 -->
        <div class="flex items-center gap-2">
          <!-- 搜索框 -->
          <div class="relative">
            <input
              v-model="searchQuery"
              @keyup.enter="handleSearch"
              type="text"
              class="input-field w-48 pl-8 text-sm"
              placeholder="    搜索文件..."
            />
            <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <button v-if="currentPath" @click="goUp" class="btn-secondary text-sm flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/>
            </svg>
            上级
          </button>
          <button @click="showCreateFolder = true" class="btn-secondary text-sm flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            </svg>
            新建文件夹
          </button>
          <button @click="showUpload = true" class="btn-primary text-sm flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            上传
          </button>
        </div>
      </div>

      <!-- 搜索结果 -->
      <div v-if="showSearch" class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-medium" style="color: var(--text-color)">
            搜索结果：{{ searchResults.length }} 个文件
          </h3>
          <button @click="showSearch = false" class="text-xs hover:underline" style="color: var(--accent-color)">
            清除搜索
          </button>
        </div>
        <FileList
          :files="searchResults"
          :loading="isSearching"
          :show-actions="true"
          @open="openFile"
          @download="handleDownload"
          @delete="confirmDelete"
        />
      </div>

      <!-- 文件列表 -->
      <FileList
        v-else
        :files="filesStore.files"
        :loading="filesStore.loading"
        :show-actions="true"
        @open="openFile"
        @download="handleDownload"
        @delete="confirmDelete"
        @contextmenu="showContextMenu"
      />

      <!-- 错误提示 -->
      <div v-if="filesStore.error" class="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
        {{ filesStore.error }}
      </div>
    </div>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu.show"
        class="fixed z-50 py-1 rounded-lg shadow-lg border"
        style="background-color: var(--surface-color); border-color: var(--border-color)"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button
          v-if="contextMenu.file?.type === 'file'"
          @click="openFile(contextMenu.file!)"
          class="w-full px-4 py-2 text-left text-sm flex items-center gap-2"
          style="color: var(--text-color)"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
          </svg>
          预览
        </button>
        <button
          v-if="contextMenu.file?.type === 'file'"
          @click="handleDownload(contextMenu.file!)"
          class="w-full px-4 py-2 text-left text-sm flex items-center gap-2"
          style="color: var(--text-color)"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          下载
        </button>
        <button
          @click="startRename(contextMenu.file!)"
          class="w-full px-4 py-2 text-left text-sm flex items-center gap-2"
          style="color: var(--text-color)"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
          重命名
        </button>
        <button
          v-if="contextMenu.file?.type === 'file'"
          @click="startShare(contextMenu.file!)"
          class="w-full px-4 py-2 text-left text-sm flex items-center gap-2"
          style="color: var(--text-color)"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'var(--hover-color)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
          </svg>
          分享
        </button>
        <div class="border-t my-1" style="border-color: var(--border-color)"></div>
        <button
          @click="confirmDelete(contextMenu.file!)"
          class="w-full px-4 py-2 text-left text-sm flex items-center gap-2 text-red-500"
          @mouseenter="$event.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'"
          @mouseleave="$event.currentTarget.style.backgroundColor = ''"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          删除
        </button>
      </div>
    </Teleport>

    <!-- 上传对话框 -->
    <UploadDialog
      :show="showUpload"
      :current-path="currentPath"
      @close="showUpload = false"
      @upload="handleUpload"
    />

    <!-- 新建文件夹对话框 -->
    <Teleport to="body">
      <div v-if="showCreateFolder" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="showCreateFolder = false"/>
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">新建文件夹</h3>
          <input
            v-model="newFolderName"
            type="text"
            class="input-field mb-4"
            placeholder="文件夹名称"
            @keyup.enter="handleCreateFolder"
          />
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
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">重命名</h3>
          <input
            v-model="newFileName"
            type="text"
            class="input-field mb-4"
            placeholder="新名称"
            @keyup.enter="handleRename"
          />
          <div class="flex justify-end gap-3">
            <button @click="showRename = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleRename" class="btn-primary text-sm">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认对话框 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="确认删除"
      :message="`确定要删除「${fileToDelete?.name}」吗？此操作不可撤销。`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />

    <!-- 文件预览 -->
    <FilePreview
      v-if="fileToPreview"
      :show="showPreview"
      :file-path="fileToPreview.path"
      :file-name="fileToPreview.name"
      @close="showPreview = false"
    />

    <!-- 分享对话框 -->
    <ShareDialog
      v-if="fileToShare"
      :show="showShare"
      :file-path="fileToShare.path"
      :file-name="fileToShare.name"
      @close="showShare = false"
    />
  </Layout>
</template>
