<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FilePreview from '@/components/FilePreview.vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const route = useRoute()
const { t, language } = useI18n()

const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareInfo = ref<any>(null)
const showPreview = ref(false)
const fileToPreview = ref<any>(null)
const folderFiles = ref<any[]>([])
const folderLoading = ref(false)
const currentSubPath = ref('')

const shareCode = computed(() => route.params.code as string)
const sign = computed(() => route.query.sign as string)
const timestamp = computed(() => route.query.t as string)
const shareDisplayName = computed(() => shareInfo.value?.fileName || t('common.rootDirectory', 'Root directory'))

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
  const key = type === 'folder' ? 'folder' : getFileType(name)
  return fileIconMap[key] || fileIconMap.file
}

function formatSize(bytes: number): string {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.toLocaleDateString(language.value || 'zh-CN')} ${date.toLocaleTimeString(language.value || 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })}`
}

async function fetchShare(providedPassword?: string) {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (providedPassword) params.set('password', providedPassword)
    const res = await api.get<any>(`/share/s/${shareCode.value}${params.toString() ? `?${params.toString()}` : ''}`)

    if (res.needPassword) {
      needPassword.value = true
      shareInfo.value = res
    } else {
      needPassword.value = false
      shareInfo.value = res
      if (res.fileType === 'folder') {
        await fetchFolderContents()
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
  const nextPath = currentSubPath.value ? `${currentSubPath.value}/${subPath}` : subPath
  fetchFolderContents(nextPath)
}

function goUpFolder() {
  const parts = currentSubPath.value.split('/').filter(Boolean)
  parts.pop()
  fetchFolderContents(parts.join('/') || undefined)
}

function openFile(file: any) {
  if (file.type === 'folder') {
    navigateFolder(file.name)
    return
  }
  fileToPreview.value = file
  showPreview.value = true
}

function getPreviewUrlForFile(file: any): string {
  const params = new URLSearchParams()
  const relPath = currentSubPath.value ? `${currentSubPath.value}/${file.name}` : file.name
  params.set('path', relPath)
  if (sign.value) params.set('sign', sign.value)
  if (timestamp.value) params.set('t', timestamp.value)
  if (password.value) params.set('password', password.value)
  return `/api/share/preview/${shareCode.value}?${params.toString()}`
}

function getCurrentPreviewUrl(file: any): string {
  return file?._sharePath || getPreviewUrlForFile(file)
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
  const params = new URLSearchParams()
  if (password.value) params.set('password', password.value)
  if (sign.value) params.set('sign', sign.value)
  if (timestamp.value) params.set('t', timestamp.value)
  window.open(`/api/share/download/${shareCode.value}?${params.toString()}`, '_blank')
}

function previewSingleFile() {
  const params = new URLSearchParams()
  if (sign.value) params.set('sign', sign.value)
  if (timestamp.value) params.set('t', timestamp.value)
  if (password.value) params.set('password', password.value)
  fileToPreview.value = {
    name: shareInfo.value.fileName,
    path: shareInfo.value.filePath,
    _sharePath: `/api/share/preview/${shareCode.value}?${params.toString()}`
  }
  showPreview.value = true
}

function submitPassword() {
  fetchShare(password.value)
}

onMounted(() => {
  fetchShare()
})
</script>

<template>
  <div class="flex min-h-screen flex-col" style="background-color: var(--bg-color)">
    <header class="flex h-11 flex-shrink-0 items-center justify-between px-3 sm:px-4" style="background-color: var(--surface-color)">
      <router-link to="/guest" class="flex flex-shrink-0 items-center gap-2 text-lg font-bold">
        <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
        <span class="hidden sm:inline" style="color: var(--text-color)">VueFileManager</span>
      </router-link>
      <ThemeToggle />
    </header>

    <main class="flex-1 overflow-auto">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <div v-else-if="error" class="mx-auto max-w-md p-4 text-center sm:p-8">
        <Icon name="exclamation" class="mx-auto mb-3 h-12 w-12 text-red-400 sm:mb-4 sm:h-16 sm:w-16" />
        <h2 class="mb-2 text-lg font-semibold sm:text-xl" style="color: var(--text-color)">{{ t('sharePage.errorTitle', 'Access Failed') }}</h2>
        <p class="text-sm" style="color: var(--text-secondary-color)">{{ error }}</p>
      </div>

      <div v-else-if="needPassword" class="mx-auto max-w-md p-4 sm:p-8">
        <div class="mb-4 text-center sm:mb-6">
          <Icon name="lock" class="mx-auto mb-3 h-12 w-12 sm:mb-4 sm:h-16 sm:w-16" style="color: var(--accent-color)" />
          <h2 class="mb-2 text-lg font-semibold sm:text-xl" style="color: var(--text-color)">{{ t('sharePage.passwordRequiredTitle', 'Password Required') }}</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">{{ t('sharePage.passwordRequiredDescription', 'This share link requires a password to access.') }}</p>
          <p v-if="shareInfo?.owner" class="mt-1 text-xs" style="color: var(--text-secondary-color)">
            {{ t('sharePage.owner', 'Shared by: {owner}').replace('{owner}', shareInfo.owner) }}
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="submitPassword">
          <input
            v-model="password"
            type="password"
            class="input-field"
            :placeholder="t('sharePage.passwordPlaceholder', 'Enter access password')"
            autofocus
          />
          <button type="submit" class="btn-primary w-full" :disabled="loading || !password">
            {{ loading ? t('sharePage.verifying', 'Verifying...') : t('sharePage.verify', 'Verify') }}
          </button>
        </form>
      </div>

      <template v-else-if="shareInfo && shareInfo.fileType === 'folder'">
        <div class="px-4 pt-4">
          <div class="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
            <button
              class="max-w-[120px] truncate rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover sm:max-w-none"
              style="color: var(--accent-color)"
              @click="fetchFolderContents()"
            >
              {{ shareDisplayName }}
            </button>

            <template v-for="(segment, index) in currentSubPath.split('/').filter(Boolean)" :key="`${segment}-${index}`">
              <Icon name="chevron-right" class="h-4 w-4 flex-shrink-0" style="color: var(--text-secondary-color)" />
              <button
                class="max-w-[100px] truncate rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover sm:max-w-none"
                :style="{ color: index === currentSubPath.split('/').filter(Boolean).length - 1 ? 'var(--text-color)' : 'var(--accent-color)' }"
                @click="fetchFolderContents(currentSubPath.split('/').filter(Boolean).slice(0, index + 1).join('/'))"
              >
                {{ segment }}
              </button>
            </template>

            <span v-if="shareInfo.owner" class="ml-2 hidden flex-shrink-0 text-xs sm:inline" style="color: var(--text-secondary-color)">
              {{ t('sharePage.owner', 'Shared by: {owner}').replace('{owner}', shareInfo.owner) }}
            </span>
          </div>

          <div v-if="folderLoading" class="flex items-center justify-center py-12">
            <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>

          <div v-else-if="folderFiles.length === 0" class="py-12 text-center" style="color: var(--text-secondary-color)">
            <Icon name="folder" class="mx-auto mb-3 h-16 w-16" />
            <p>{{ t('sharePage.emptyFolder', 'Empty folder') }}</p>
          </div>

          <div v-else class="card overflow-hidden" style="padding: 0">
            <div
              v-if="currentSubPath"
              class="flex cursor-pointer items-center gap-2.5 border-b px-4 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover"
              style="border-color: var(--border-color)"
              @click="goUpFolder"
            >
              <Icon name="arrow-up" class="h-5 w-5" style="color: var(--text-secondary-color)" />
              <span class="text-sm" style="color: var(--text-secondary-color)">..</span>
            </div>

            <div
              v-for="file in folderFiles"
              :key="file.path"
              class="flex cursor-pointer items-center gap-2.5 border-b px-4 py-2.5 transition-colors last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover"
              style="border-color: var(--border-color)"
              @click="openFile(file)"
            >
              <Icon :name="getIconInfo(file.name, file.type).icon" :class="['h-5 w-5 flex-shrink-0', getIconInfo(file.name, file.type).color]" />
              <span class="flex-1 truncate text-sm" style="color: var(--text-color)">{{ file.name }}</span>
              <span v-if="file.type !== 'folder'" class="text-xs" style="color: var(--text-secondary-color)">{{ formatSize(file.size) }}</span>
              <span v-if="file.modified" class="hidden text-xs lg:inline" style="color: var(--text-secondary-color)">{{ formatDate(file.modified) }}</span>
              <button
                v-if="file.type !== 'folder'"
                class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-2 transition-colors hover:bg-gray-200 dark:hover:bg-dark-hover sm:p-1"
                :title="t('file.download', 'Download')"
                @click.stop="handleDownloadFile(file)"
              >
                <Icon name="download" class="h-4 w-4" style="color: var(--text-secondary-color)" />
              </button>
            </div>
          </div>
        </div>
      </template>

      <div v-else-if="shareInfo" class="mx-auto max-w-lg p-4 sm:p-8">
        <div class="mb-4 text-center sm:mb-6">
          <Icon name="file-alt" class="mx-auto mb-3 h-12 w-12 sm:mb-4 sm:h-16 sm:w-16" style="color: var(--accent-color)" />
          <h2 class="mb-2 truncate px-4 text-lg font-semibold sm:text-xl" style="color: var(--text-color)">{{ shareDisplayName }}</h2>
          <p v-if="shareInfo.owner" class="text-sm" style="color: var(--text-secondary-color)">
            {{ t('sharePage.owner', 'Shared by: {owner}').replace('{owner}', shareInfo.owner) }}
          </p>
        </div>

        <div
          v-if="!sign"
          class="mb-4 rounded-lg p-3 text-sm"
          style="background: rgba(245,158,11,0.1); color: #d97706"
        >
          {{ t('sharePage.signatureRequired', 'This share link requires signature parameters for download. Please open it with the complete signed URL.') }}
        </div>

        <div class="flex flex-col gap-3">
          <button
            class="btn-primary flex w-full items-center justify-center gap-2"
            :disabled="!sign"
            @click="handleDownloadSingle"
          >
            <Icon name="download" class="h-5 w-5" />
            {{ t('sharePage.downloadFile', 'Download File') }}
          </button>

          <button
            v-if="sign"
            class="btn-secondary flex w-full items-center justify-center gap-2"
            @click="previewSingleFile"
          >
            <Icon name="eye" class="h-5 w-5" />
            {{ t('sharePage.previewFile', 'Preview File') }}
          </button>
        </div>
      </div>
    </main>

    <FilePreview
      v-if="fileToPreview && sign"
      :show="showPreview"
      :file-path="fileToPreview.path || fileToPreview.name"
      :file-url="getCurrentPreviewUrl(fileToPreview)"
      :file-name="fileToPreview.name"
      @close="showPreview = false; fileToPreview = null"
    />
  </div>
</template>
