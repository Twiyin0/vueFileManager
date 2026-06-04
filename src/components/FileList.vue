<script setup lang="ts">
import { ref } from 'vue'
import { FileItem } from '@/stores/files'

const props = withDefaults(defineProps<{
  files: FileItem[]
  loading: boolean
  showActions?: boolean
  selectMode?: boolean
  selectedFiles?: Set<string>
  viewMode?: 'list' | 'grid'
  currentPoolId?: number
}>(), {
  viewMode: 'list'
})

const emit = defineEmits<{
  open: [file: FileItem]
  download: [file: FileItem]
  delete: [file: FileItem]
  contextmenu: [e: MouseEvent, file?: FileItem]
  toggleSelect: [path: string]
  detail: [file: FileItem]
}>()

// 长按进入多选
let longPressTimer: ReturnType<typeof setTimeout> | null = null
const longPressThreshold = 500

function handleTouchStart(e: TouchEvent, file: FileItem) {
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    emit('toggleSelect', file.path)
  }, longPressThreshold)
}

function handleTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleTouchMove() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// 右键高亮
const contextHighlighted = ref<string | null>(null)

function handleItemContext(e: MouseEvent, file: FileItem) {
  contextHighlighted.value = file.path
  emit('contextmenu', e, file)
}

// 清除右键高亮（点击其他地方时）
function handleContainerContext(e: MouseEvent) {
  contextHighlighted.value = null
  emit('contextmenu', e)
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getFileIcon(file: FileItem): string {
  if (file.type === 'folder') return 'folder'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac'].includes(ext)) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getPreviewUrl(file: FileItem): string {
  const params = new URLSearchParams({ path: file.path })
  const poolId = file.poolId || props.currentPoolId
  if (poolId) params.set('poolId', String(poolId))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `/api/files/preview?${params.toString()}`
}
</script>

<template>
  <div class="card overflow-hidden" style="padding: 0" @contextmenu.prevent="handleContainerContext">
    <!-- 加载状态 -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
      </svg>
    </div>

    <!-- 空状态 -->
    <div v-else-if="files.length === 0" class="flex flex-col items-center justify-center py-12" style="color: var(--text-secondary-color)">
      <svg class="w-16 h-16 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
      </svg>
      <p>暂无文件</p>
    </div>

    <!-- 网格模式（缩略图） -->
    <div v-else-if="viewMode === 'grid'" class="p-3">
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div
          v-for="file in files"
          :key="file.path"
          class="group cursor-pointer rounded-lg overflow-hidden border transition-all"
          :class="[
            selectedFiles?.has(file.path) ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-600' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600',
            contextHighlighted === file.path ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
          ]"
          style="background-color: var(--hover-color)"
          @click="selectMode ? emit('toggleSelect', file.path) : emit('open', file)"
          @contextmenu.prevent.stop="handleItemContext($event, file)"
          @touchstart.passive="handleTouchStart($event, file)"
          @touchend="handleTouchEnd"
          @touchmove="handleTouchMove"
        >
          <!-- 缩略图区域 -->
          <div class="thumb-container relative">
            <!-- 选择框 -->
            <div v-if="selectMode" class="absolute top-1.5 left-1.5 z-10" @click.stop>
              <input type="checkbox" :checked="selectedFiles?.has(file.path)" @change="emit('toggleSelect', file.path)"
                class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            </div>
            <!-- 图片缩略图 -->
            <img v-if="getFileIcon(file) === 'image'" :src="getPreviewUrl(file)" :alt="file.name" class="thumb-img" loading="lazy" />
            <!-- 非图片：大图标 -->
            <div v-else class="thumb-icon">
              <!-- 文件夹 -->
              <svg v-if="getFileIcon(file) === 'folder'" class="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
              </svg>
              <!-- 视频 -->
              <svg v-else-if="getFileIcon(file) === 'video'" class="w-10 h-10 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <!-- 音频 -->
              <svg v-else-if="getFileIcon(file) === 'audio'" class="w-10 h-10 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"/>
              </svg>
              <!-- PDF -->
              <svg v-else-if="getFileIcon(file) === 'pdf'" class="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
              <!-- 压缩包 -->
              <svg v-else-if="getFileIcon(file) === 'archive'" class="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
              </svg>
              <!-- 代码 -->
              <svg v-else-if="getFileIcon(file) === 'code'" class="w-10 h-10 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
              </svg>
              <!-- 文本 -->
              <svg v-else-if="getFileIcon(file) === 'text'" class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              <!-- 默认 -->
              <svg v-else class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
              </svg>
            </div>
          </div>
          <!-- 文件名 -->
          <div class="px-2 py-1.5">
            <p class="text-xs truncate text-center" style="color: var(--text-color)" :title="file.name">{{ file.name }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 列表模式 -->
    <div v-else>
      <!-- 表头 -->
      <div class="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium border-b" style="color: var(--text-secondary-color); border-color: var(--border-color)">
        <div v-if="selectMode" class="col-span-1"></div>
        <div :class="selectMode ? 'col-span-5 sm:col-span-4' : 'col-span-6 sm:col-span-5'">名称</div>
        <div class="col-span-3 sm:col-span-2 text-right hidden sm:block">大小</div>
        <div class="col-span-3 text-right hidden md:block">修改时间</div>
        <div v-if="showActions" class="col-span-6 sm:col-span-2 text-right">操作</div>
      </div>

      <!-- 文件行 -->
      <div
        v-for="file in files"
        :key="file.path"
        class="file-row grid grid-cols-12 gap-2 px-4 py-2.5 items-center cursor-pointer border-b last:border-0"
        :class="[
          selectedFiles?.has(file.path) ? 'bg-blue-50 dark:bg-blue-900/20' : '',
          contextHighlighted === file.path ? 'bg-blue-50/70 dark:bg-blue-900/30' : ''
        ]"
        style="border-color: var(--border-color)"
        @click="selectMode ? emit('toggleSelect', file.path) : emit('open', file)"
        @contextmenu.prevent.stop="handleItemContext($event, file)"
        @touchstart.passive="handleTouchStart($event, file)"
        @touchend="handleTouchEnd"
        @touchmove="handleTouchMove"
      >
        <!-- 选择框 -->
        <div v-if="selectMode" class="col-span-1 flex items-center" @click.stop>
          <input type="checkbox" :checked="selectedFiles?.has(file.path)" @change="emit('toggleSelect', file.path)"
            class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        </div>
        <!-- 名称 + 图标 -->
        <div :class="selectMode ? 'col-span-5 sm:col-span-4' : 'col-span-6 sm:col-span-5'" class="flex items-center gap-2.5 min-w-0">
          <!-- 文件夹图标 -->
          <svg v-if="getFileIcon(file) === 'folder'" class="w-5 h-5 flex-shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
          </svg>
          <!-- 图片图标 -->
          <svg v-else-if="getFileIcon(file) === 'image'" class="w-5 h-5 flex-shrink-0 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <!-- 视频图标 -->
          <svg v-else-if="getFileIcon(file) === 'video'" class="w-5 h-5 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <!-- 音频图标 -->
          <svg v-else-if="getFileIcon(file) === 'audio'" class="w-5 h-5 flex-shrink-0 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
          </svg>
          <!-- PDF 图标 -->
          <svg v-else-if="getFileIcon(file) === 'pdf'" class="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <!-- 压缩包图标 -->
          <svg v-else-if="getFileIcon(file) === 'archive'" class="w-5 h-5 flex-shrink-0 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
          </svg>
          <!-- 代码图标 -->
          <svg v-else-if="getFileIcon(file) === 'code'" class="w-5 h-5 flex-shrink-0 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
          </svg>
          <!-- 文本图标 -->
          <svg v-else-if="getFileIcon(file) === 'text'" class="w-5 h-5 flex-shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <!-- 默认文件图标 -->
          <svg v-else class="w-5 h-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <span class="truncate text-sm" style="color: var(--text-color)">{{ file.name }}</span>
        </div>

        <!-- 大小 -->
        <div class="col-span-3 sm:col-span-2 text-right text-xs hidden sm:block" style="color: var(--text-secondary-color)">
          {{ file.type === 'folder' ? '-' : formatSize(file.size) }}
        </div>

        <!-- 修改时间 -->
        <div class="col-span-3 text-right text-xs hidden md:block" style="color: var(--text-secondary-color)">
          {{ formatDate(file.modified) }}
        </div>

        <!-- 操作 -->
        <div v-if="showActions" class="col-span-6 sm:col-span-2 flex items-center justify-end gap-1" @click.stop>
          <button
            @click="emit('detail', file)"
            class="p-1.5 rounded-md hover:opacity-80 transition-colors"
            title="详情"
          >
            <svg class="w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </button>
          <button
            v-if="file.type === 'file'"
            @click="emit('download', file)"
            class="p-1.5 rounded-md hover:opacity-80 transition-colors"
            title="下载"
          >
            <svg class="w-4 h-4" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
          </button>
          <button
            @click="emit('delete', file)"
            class="p-1.5 rounded-md hover:opacity-80 transition-colors"
            title="删除"
          >
            <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
