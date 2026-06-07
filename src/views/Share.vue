<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FilePreview from '@/components/FilePreview.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareInfo = ref<any>(null)
const showPreview = ref(false)
const fileToPreview = ref<any>(null)

// 文件夹浏览
const folderFiles = ref<any[]>([])
const folderLoading = ref(false)
const currentSubPath = ref('')

const shareCode = computed(() => route.params.code as string)
const sign = computed(() => route.query.sign as string)
const timestamp = computed(() => route.query.t as string)

// 文件图标映射
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

function getFileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getIconInfo(name: string, type: string) {
  const ft = type === 'folder' ? 'folder' : getFileType(name)
  return fileIconMap[ft] || fileIconMap.file
}

function formatSize(bytes: number): string {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

async function fetchShare(providedPassword?: string) {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (providedPassword) params.set('password', providedPassword)
    const res = await api.get<any>(`/share/s/${shareCode.value}${params.toString() ? '?' + params.toString() : ''}`)

    if (res.needPassword) {
      needPassword.value = true
      shareInfo.value = res
    } else {
      needPassword.value = false
      shareInfo.value = res
      // 文件夹分享：加载内容
      if (res.fileType === 'folder') {
        fetchFolderContents()
      }
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function fetchFolderContents(subPath?: string) {
  if (!shareInfo.value) return
  folderLoading.value = true
  try {
    const params = new URLSearchParams()
    if (sign.value) params.set('sign', sign.value)
    if (timestamp.value) params.set('t', timestamp.value)
    if (password.value) params.set('password', password.value)
    if (subPath) params.set('path', subPath)
    const res = await api.get<any>(`/share/list/${shareCode.value}?${params.toString()}`)
    folderFiles.value = res.files || []
    currentSubPath.value = subPath || ''
  } catch (err: any) {
    error.value = err.message
  } finally {
    folderLoading.value = false
  }
}

function navigateFolder(subPath: string) {
  const newPath = currentSubPath.value ? `${currentSubPath.value}/${subPath}` : subPath
  fetchFolderContents(newPath)
}

function goUpFolder() {
  const parts = currentSubPath.value.split('/').filter(Boolean)
  parts.pop()
  fetchFolderContents(parts.join('/') || undefined)
}

function openFile(file: any) {
  if (file.type === 'folder') {
    navigateFolder(file.name)
  } else {
    // 预览文件
    fileToPreview.value = file
    showPreview.value = true
  }
}

function getPreviewUrlForFile(file: any): string {
  const params = new URLSearchParams()
  // 只传相对路径（子目录+文件名），后端会拼上 share.file_path
  const relPath = currentSubPath.value ? `${currentSubPath.value}/${file.name}` : file.name
  params.set('path', relPath)
  if (sign.value) params.set('sign', sign.value)
  if (timestamp.value) params.set('t', timestamp.value)
  if (password.value) params.set('password', password.value)
  return `/api/share/preview/${shareCode.value}?${params.toString()}`
}

function handleDownloadFile(file: any) {
  const params = new URLSearchParams()
  const relPath = currentSubPath.value ? `${currentSubPath.value}/${file.name}` : file.name
  params.set('path', relPath)
  if (sign.value) params.set('sign', sign.value)
  if (timestamp.value) params.set('t', timestamp.value)
  if (password.value) params.set('password', password.value)
  window.open(`/api/share/download/${shareCode.value}?${params.toString()}`, '_blank')
}

function handleDownloadSingle() {
  const p = new URLSearchParams()
  if (password.value) p.set('password', password.value)
  if (sign.value) p.set('sign', sign.value)
  if (timestamp.value) p.set('t', timestamp.value)
  window.open(`/api/share/download/${shareCode.value}?${p.toString()}`, '_blank')
}

function previewSingleFile() {
  const p = new URLSearchParams()
  p.set('path', shareInfo.value.filePath)
  if (sign.value) p.set('sign', sign.value)
  if (timestamp.value) p.set('t', timestamp.value)
  if (password.value) p.set('password', password.value)
  fileToPreview.value = { name: shareInfo.value.fileName, _sharePath: `/api/share/preview/${shareCode.value}?${p.toString()}` }
  showPreview.value = true
}

onMounted(() => fetchShare())

function submitPassword() {
  fetchShare(password.value)
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- Header -->
    <header class="h-11 flex items-center justify-between px-4 border-b flex-shrink-0" style="background-color: var(--surface-color); border-color: var(--border-color)">
      <router-link to="/guest" class="flex items-center gap-2 font-bold text-lg flex-shrink-0">
        <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
        <span style="color: var(--text-color)">VueFileManager</span>
      </router-link>
      <ThemeToggle />
    </header>

    <!-- 内容 -->
    <main class="flex-1 overflow-auto">
      <!-- 加载中 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="max-w-md mx-auto p-8 text-center">
        <Icon name="exclamation" class="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 class="text-xl font-semibold mb-2" style="color: var(--text-color)">访问失败</h2>
        <p style="color: var(--text-secondary-color)">{{ error }}</p>
      </div>

      <!-- 需要密码 -->
      <div v-else-if="needPassword" class="max-w-md mx-auto p-8">
        <div class="text-center mb-6">
          <Icon name="lock" class="w-16 h-16 mx-auto mb-4" style="color: var(--accent-color)" />
          <h2 class="text-xl font-semibold mb-2" style="color: var(--text-color)">需要密码</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">此分享链接需要密码才能访问</p>
          <p v-if="shareInfo?.owner" class="text-xs mt-1" style="color: var(--text-secondary-color)">分享者：{{ shareInfo.owner }}</p>
        </div>
        <form @submit.prevent="submitPassword" class="space-y-4">
          <input v-model="password" type="password" class="input-field" placeholder="请输入访问密码" autofocus />
          <button type="submit" class="btn-primary w-full" :disabled="loading || !password">
            {{ loading ? '验证中...' : '验证' }}
          </button>
        </form>
      </div>

      <!-- 文件夹分享 -->
      <template v-else-if="shareInfo && shareInfo.fileType === 'folder'">
        <div class="px-4 pt-4">
          <!-- 面包屑 -->
          <div class="flex items-center gap-1.5 text-sm mb-4 flex-wrap">
            <button @click="fetchFolderContents()" class="px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover" style="color: var(--accent-color)">
              {{ shareInfo.fileName }}
            </button>
            <template v-for="(segment, index) in currentSubPath.split('/').filter(Boolean)" :key="index">
              <Icon name="chevron-right" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              <button @click="fetchFolderContents(currentSubPath.split('/').filter(Boolean).slice(0, index + 1).join('/'))"
                class="px-2 py-1 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                :style="{ color: index === currentSubPath.split('/').filter(Boolean).length - 1 ? 'var(--text-color)' : 'var(--accent-color)' }">
                {{ segment }}
              </button>
            </template>
            <span class="ml-2 text-xs" style="color: var(--text-secondary-color)">分享者：{{ shareInfo.owner }}</span>
          </div>

          <!-- 文件列表 -->
          <div v-if="folderLoading" class="flex items-center justify-center py-12">
            <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>

          <div v-else-if="folderFiles.length === 0" class="text-center py-12" style="color: var(--text-secondary-color)">
            <Icon name="folder" class="w-16 h-16 mx-auto mb-3" />
            <p>空文件夹</p>
          </div>

          <div v-else class="card overflow-hidden" style="padding: 0">
            <!-- 上级目录 -->
            <div v-if="currentSubPath" class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer border-b transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover" style="border-color: var(--border-color)" @click="goUpFolder">
              <Icon name="arrow-up" class="w-5 h-5" style="color: var(--text-secondary-color)" />
              <span class="text-sm" style="color: var(--text-secondary-color)">..</span>
            </div>
            <!-- 文件行 -->
            <div v-for="file in folderFiles" :key="file.path"
              class="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer border-b last:border-0 transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover"
              style="border-color: var(--border-color)"
              @click="openFile(file)">
              <Icon :name="getIconInfo(file.name, file.type).icon" :class="['w-5 h-5 flex-shrink-0', getIconInfo(file.name, file.type).color]" />
              <span class="flex-1 text-sm truncate" style="color: var(--text-color)">{{ file.name }}</span>
              <span v-if="file.type !== 'folder'" class="text-xs" style="color: var(--text-secondary-color)">{{ formatSize(file.size) }}</span>
              <button v-if="file.type !== 'folder'" @click.stop="handleDownloadFile(file)" class="p-1 rounded hover:bg-gray-200 dark:hover:bg-dark-hover transition-colors" title="下载">
                <Icon name="download" class="w-4 h-4" style="color: var(--text-secondary-color)" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- 单文件分享 -->
      <div v-else-if="shareInfo" class="max-w-lg mx-auto p-8">
        <div class="text-center mb-6">
          <Icon name="file-alt" class="w-16 h-16 mx-auto mb-4" style="color: var(--accent-color)" />
          <h2 class="text-xl font-semibold mb-2" style="color: var(--text-color)">{{ shareInfo.fileName }}</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">分享者：{{ shareInfo.owner }}</p>
        </div>
        <div v-if="!sign" class="mb-4 p-3 rounded-lg text-sm" style="background: rgba(245,158,11,0.1); color: #d97706">
          此分享链接需要签名参数才能下载，请使用带签名的完整链接访问。
        </div>
        <div class="flex flex-col gap-3">
          <button @click="handleDownloadSingle" class="btn-primary w-full flex items-center justify-center gap-2" :disabled="!sign">
            <Icon name="download" class="w-5 h-5" /> 下载文件
          </button>
          <button v-if="sign" @click="previewSingleFile" class="btn-secondary w-full flex items-center justify-center gap-2">
            <Icon name="eye" class="w-5 h-5" /> 预览文件
          </button>
        </div>
      </div>
    </main>

    <!-- 文件预览 -->
    <FilePreview
      v-if="fileToPreview && sign"
      :show="showPreview"
      :file-path="fileToPreview._sharePath || getPreviewUrlForFile(fileToPreview)"
      :file-name="fileToPreview.name"
      @close="showPreview = false; fileToPreview = null"
    />
  </div>
</template>
