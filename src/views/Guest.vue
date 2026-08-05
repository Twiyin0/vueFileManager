<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import APlayer from 'aplayer'
import { api } from '@/api'
import { useI18n } from '@/composables/useI18n'
import type { DirectoryReadme as DirectoryReadmeData, FileItem } from '@/stores/files'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FileList from '@/components/FileList.vue'
import FilePreview from '@/components/FilePreview.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import FileDetailPanel from '@/components/FileDetailPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import UploadDialog from '@/components/UploadDialog.vue'
import Icon from '@/components/Icon.vue'
import DirectoryReadme from '@/components/DirectoryReadme.vue'
import { useAuthStore } from '@/stores/auth'
import { sortFiles, type FileSortDirection, type FileSortKey } from '@/utils/fileSort'

import 'aplayer/dist/APlayer.min.css'

type ViewMode = 'list' | 'grid' | 'medium-list'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { t, format, language } = useI18n()

const files = ref<FileItem[]>([])
const readme = ref<DirectoryReadmeData | null>(null)
const loading = ref(false)
const error = ref('')
const owner = ref('')
const shares = ref<any[]>([])
const shareLabel = ref('')
const sharePath = ref('')
const sharePoolName = ref('')
const loadingShares = ref(false)
const needPassword = ref(false)
const accessPassword = ref('')
const verifiedPassword = ref('')
const passwordError = ref('')

const showPreview = ref(false)
const fileToPreview = ref<FileItem | null>(null)

const savedViewMode = localStorage.getItem('guestViewMode') as ViewMode | null
const viewMode = ref<ViewMode>(savedViewMode === 'grid' || savedViewMode === 'medium-list' ? savedViewMode : 'list')
watch(viewMode, (value) => localStorage.setItem('guestViewMode', value))

const contextMenu = ref({ visible: false, x: 0, y: 0, item: null as any })
const showDetailPanel = ref(false)
const detailItem = ref<any>(null)
const sharePermissions = ref('')

const selectedFiles = ref<Set<string>>(new Set())
const isSelectMode = computed(() => selectedFiles.value.size > 0)

const uploadError = ref('')
const showUploadProgress = ref(false)
const uploadProgress = ref<{ file: string; percent: number }[]>([])
const uploadStatus = ref('')
const activeUploads = ref<XMLHttpRequest[]>([])
const showUpload = ref(false)
const pendingUploadFiles = ref<File[]>([])

const isUploadBusy = computed(() => uploadStatus.value === 'uploading' || uploadStatus.value === 'processing')
const uploadStatusLabel = computed(() => {
  if (uploadStatus.value === 'cancelled') return t('upload.statusCancelled', 'Cancelled')
  if (uploadStatus.value === 'processing') return t('guest.processingOnServer', 'Processing on server')
  if (uploadStatus.value === 'completed') return t('upload.statusCompleted', 'Completed')
  return ''
})

const showDeleteConfirm = ref(false)
const fileToDelete = ref<FileItem | null>(null)

const showRename = ref(false)
const fileToRename = ref<FileItem | null>(null)
const newFileName = ref('')

const showCreateFolder = ref(false)
const newFolderName = ref('')

const searchQuery = ref('')
const searchResults = ref<FileItem[]>([])
const showSearch = ref(false)
const sortKey = ref<FileSortKey>((localStorage.getItem('guestFileSortKey') as FileSortKey) || 'name')
const sortDirection = ref<FileSortDirection>((localStorage.getItem('guestFileSortDirection') as FileSortDirection) || 'asc')

const showShareDropdown = ref(false)

const aplayerRef = ref<HTMLDivElement>()
let aplayerInst: any = null
const showAplayer = ref(false)
const aplayerCollapsed = ref(true)
const isDark = ref(document.documentElement.classList.contains('dark'))
const themeObserver = new MutationObserver(() => {
  isDark.value = document.documentElement.classList.contains('dark')
})

const username = computed(() => route.params.username as string)
const shareId = computed(() => route.params.shareId as string)
const currentPath = computed(() => ((route.query.path as string) || '').replace(/\\/g, '/'))
const pathSegments = computed(() => currentPath.value.split('/').filter(Boolean))
const isFolderView = computed(() => !!shareId.value)
const currentShare = computed(() => shares.value.find((share) => String(share.id) === shareId.value))
const currentShareDisplayName = computed(() =>
  getShareDisplayName(currentShare.value || {
    label: shareLabel.value,
    folder_path: sharePath.value,
    pool_name: sharePoolName.value
  })
)
const sortedFiles = computed(() => sortFiles(files.value, sortKey.value, sortDirection.value))
const sortedSearchResults = computed(() => sortFiles(searchResults.value, sortKey.value, sortDirection.value))

watch(sortKey, (value) => localStorage.setItem('guestFileSortKey', value))
watch(sortDirection, (value) => localStorage.setItem('guestFileSortDirection', value))

const permissionAliases: Record<string, string[]> = {
  read: ['preview', 'download'],
  write: ['upload', 'new-folder'],
  edit: ['rename']
}

function hasPermission(action: string) {
  const perms = sharePermissions.value.split(',').map((item) => item.trim())
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

const guestThumbnailBaseUrl = computed(() => {
  if (!shareId.value) return undefined
  return `/api/guest/${username.value}/${shareId.value}/thumbnail`
})

const guestSaveUrl = computed(() => {
  if (!shareId.value || !hasPermission('edit')) return undefined
  return buildGuestFullUrl('write')
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
    const res = await api.get<{ shares: any[]; owner: string }>(`/guest/${username.value}/list`)
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
  passwordError.value = ''
  try {
    const params = new URLSearchParams()
    if (currentPath.value) params.set('path', currentPath.value)
    if (verifiedPassword.value) params.set('password', verifiedPassword.value)
    const query = params.toString() ? `?${params}` : ''
    const res = await api.get<{ needPassword?: boolean; files?: FileItem[]; owner: string; shareLabel: string; sharePath: string; poolName: string; permissions: string; readme?: DirectoryReadmeData | null }>(
      `/guest/${username.value}/${shareId.value}/list${query}`
    )
    if (res.needPassword) {
      needPassword.value = true
      files.value = []
      readme.value = null
      owner.value = res.owner || owner.value
      shareLabel.value = res.shareLabel || shareLabel.value
      sharePath.value = res.sharePath || sharePath.value || ''
      sharePoolName.value = res.poolName || sharePoolName.value || ''
      sharePermissions.value = res.permissions || ''
      if (verifiedPassword.value) {
        passwordError.value = t('guest.incorrectPassword', 'Incorrect password')
        verifiedPassword.value = ''
      }
      return
    }
    needPassword.value = false
    accessPassword.value = verifiedPassword.value
    files.value = res.files || []
    readme.value = res.readme || null
    owner.value = res.owner
    shareLabel.value = res.shareLabel
    sharePath.value = res.sharePath || ''
    sharePoolName.value = res.poolName || ''
    sharePermissions.value = res.permissions || ''
  } catch (err: any) {
    error.value = err.message
    files.value = []
    readme.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!authStore.user && localStorage.getItem('token')) {
    authStore.fetchUser()
  }
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  if (shareId.value) fetchFiles()
  else fetchShares()
})

onUnmounted(() => {
  themeObserver.disconnect()
  destroyAplayer()
})

watch(shareId, () => {
  selectedFiles.value.clear()
  showSearch.value = false
  searchQuery.value = ''
  needPassword.value = false
  accessPassword.value = ''
  verifiedPassword.value = ''
  passwordError.value = ''
  if (shareId.value) fetchFiles()
  else fetchShares()
})

watch(currentPath, () => {
  selectedFiles.value.clear()
  showSearch.value = false
  searchQuery.value = ''
  if (shareId.value) fetchFiles()
})

function navigateToPath(path: string) {
  router.push({ path: `/guest/${username.value}/${shareId.value}`, query: path ? { path } : {} })
}

function navigateToShare(id: number) {
  router.push({ path: `/guest/${username.value}/${id}` })
}

function getShareDisplayName(share: any): string {
  return share?.label || share?.folder_path || share?.pool_name || t('common.rootDirectory', 'Root directory')
}

function buildGuestApiPath(action: string, params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params)
  if (verifiedPassword.value) searchParams.set('password', verifiedPassword.value)
  const query = searchParams.toString()
  return `/guest/${username.value}/${shareId.value}/${action}${query ? `?${query}` : ''}`
}

function buildGuestFullUrl(action: string, params: Record<string, string> = {}) {
  return `/api${buildGuestApiPath(action, params)}`
}

async function submitPassword() {
  if (!accessPassword.value) return
  verifiedPassword.value = accessPassword.value
  await fetchFiles()
}

const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']

function isAudioFile(file: FileItem) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return audioExts.includes(ext)
}

function getFilePreviewUrl(file: FileItem) {
  return buildGuestFullUrl('preview', { path: file.path })
}

function buildAudioList() {
  return files.value.filter((file) => isAudioFile(file)).map((file) => ({
    name: file.name,
    url: getFilePreviewUrl(file),
    artist: format('guest.ownerFileArtist', '{owner}\'s files', { owner: owner.value })
  }))
}

function toAplayerAudioList(audioList: Array<{ name: string; url: string; artist: string }>) {
  return audioList.map((item) => ({
    name: item.name.replace(/\.[^.]+$/, ''),
    url: item.url,
    artist: item.artist
  }))
}

async function refreshAplayerList(targetUrl?: string) {
  const audioList = buildAudioList()
  if (audioList.length === 0 || !aplayerInst) {
    destroyAplayer()
    return { audioList, targetIndex: -1 }
  }

  const targetIndex = targetUrl
    ? audioList.findIndex((item) => item.url === targetUrl)
    : Math.max(aplayerInst.list.index ?? 0, 0)

  const playerAudioList = toAplayerAudioList(audioList)
  aplayerInst.list.clear()
  playerAudioList.forEach((item) => aplayerInst!.list.add(item))

  if (targetIndex >= 0 && targetIndex < playerAudioList.length) {
    aplayerInst.list.switch(targetIndex)
  }

  return { audioList, targetIndex }
}

function destroyAplayer() {
  if (aplayerInst) {
    try {
      aplayerInst.destroy()
    } catch {}
    aplayerInst = null
  }
  showAplayer.value = false
}

const isMobileDevice = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)

async function openAplayerWithFile(targetFile: FileItem) {
  const targetUrl = getFilePreviewUrl(targetFile)
  let audioList: Array<{ name: string; url: string; artist: string }>
  let targetIndex = -1

  try {
    if (aplayerInst && showAplayer.value) {
      const refreshed = await refreshAplayerList(targetUrl)
      audioList = refreshed.audioList
      targetIndex = refreshed.targetIndex
    } else {
      audioList = buildAudioList()
      targetIndex = audioList.findIndex((item) => item.url === targetUrl)
    }
  } catch (err: any) {
    error.value = format('guest.audioLoadFailed', 'Audio load failed: {message}', {
      message: err.message || t('guest.audioReadFailed', 'Unable to read the audio file')
    })
    return
  }

  if (audioList.length === 0) return

  if (aplayerInst && showAplayer.value) {
    aplayerInst.play()
    return
  }

  destroyAplayer()
  showAplayer.value = true
  aplayerCollapsed.value = false

  nextTick(() => {
    if (!aplayerRef.value) return
    const playerAudioList = toAplayerAudioList(audioList)
    aplayerInst = new APlayer({
      container: aplayerRef.value,
      autoplay: !isMobileDevice,
      volume: 0.3,
      theme: isDark.value ? '#6b7cff' : '#4f6ef7',
      audio: playerAudioList
    })
    if (targetIndex >= 0) aplayerInst.list.switch(targetIndex)
    try {
      aplayerInst.play()
    } catch {}
  })
}

function toggleAplayerCollapse() {
  aplayerCollapsed.value = !aplayerCollapsed.value
}

watch(currentPath, () => {
  if (!showAplayer.value) return
  nextTick(() => {
    refreshAplayerList().catch((err: any) => {
      error.value = format('guest.audioLoadFailed', 'Audio load failed: {message}', {
        message: err.message || t('guest.audioRefreshFailed', 'Unable to refresh the playlist')
      })
    })
  })
})

function openFile(file: FileItem) {
  if (file.type === 'folder') {
    navigateToPath(file.path)
    return
  }

  if (isAudioFile(file)) {
    openAplayerWithFile(file)
    return
  }

  if (hasPermission('preview')) {
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
  const response = await fetch(buildGuestFullUrl('download', { path: file.path }))
  if (!response.ok) throw new Error(t('guest.downloadFailed', 'Download failed'))
  const blob = await response.blob()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = file.name
  link.click()
  URL.revokeObjectURL(link.href)
}

function handleSearch() {
  if (!searchQuery.value.trim()) {
    showSearch.value = false
    return
  }
  if (searchQuery.value.startsWith('//')) {
    const source = searchQuery.value.slice(2).trim()
    if (!source) {
      uploadError.value = t('search.invalidRegex', 'Invalid regular expression')
      searchResults.value = []
      showSearch.value = true
      return
    }
    try {
      const matcher = new RegExp(source, 'i')
      searchResults.value = files.value.filter((file) => matcher.test(file.name))
      uploadError.value = ''
    } catch {
      uploadError.value = t('search.invalidRegex', 'Invalid regular expression')
      searchResults.value = []
      showSearch.value = true
      return
    }
  } else {
    const q = searchQuery.value.toLowerCase()
    searchResults.value = files.value.filter((file) => file.name.toLowerCase().includes(q))
    uploadError.value = ''
  }
  showSearch.value = true
}

function updateSort(nextKey: FileSortKey) {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = nextKey
  sortDirection.value = nextKey === 'modified' || nextKey === 'size' ? 'desc' : 'asc'
}

function toggleSelectFile(path: string) {
  if (selectedFiles.value.has(path)) {
    selectedFiles.value.delete(path)
    selectedFiles.value = new Set(selectedFiles.value)
    return
  }
  selectedFiles.value = new Set([...selectedFiles.value, path])
}

function selectAll() {
  const list = showSearch.value ? searchResults.value : files.value
  if (selectedFiles.value.size === list.length) {
    selectedFiles.value.clear()
  } else {
    selectedFiles.value = new Set(list.map((file) => file.path))
  }
}

function clearSelection() {
  selectedFiles.value.clear()
}

function handleContextMenu(event: MouseEvent, file?: FileItem) {
  event.preventDefault()
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, item: file || null }
}

function handleContextAction(action: string, item?: FileItem) {
  switch (action) {
    case 'preview':
      if (item) {
        fileToPreview.value = item
        showPreview.value = true
      }
      break
    case 'download':
      if (item) handleDownload(item)
      break
    case 'open':
      if (item) navigateToPath(item.path)
      break
    case 'info':
      if (item) {
        detailItem.value = item
        showDetailPanel.value = true
      }
      break
    case 'delete':
      if (item) {
        fileToDelete.value = item
        showDeleteConfirm.value = true
      }
      break
    case 'rename':
      if (item) {
        fileToRename.value = item
        newFileName.value = item.name
        showRename.value = true
      }
      break
    case 'new-folder':
      newFolderName.value = ''
      showCreateFolder.value = true
      break
    case 'select-all':
      selectAll()
      break
    case 'clear-selection':
      clearSelection()
      break
    case 'refresh':
      fetchFiles()
      break
  }
}

async function handleDelete() {
  if (!fileToDelete.value) return
  try {
    const res = await fetch(`/api/guest/${username.value}/${shareId.value}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fileToDelete.value.path, password: verifiedPassword.value || undefined })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || t('guest.deleteFailed', 'Delete failed'))
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
      body: JSON.stringify({ path: fileToRename.value.path, newName: newFileName.value.trim(), password: verifiedPassword.value || undefined })
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || t('guest.renameFailed', 'Rename failed'))
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
    const dirPath = currentPath.value ? `${currentPath.value}/${newFolderName.value.trim()}` : newFolderName.value.trim()
    await api.post(buildGuestApiPath('mkdir'), { path: dirPath, password: verifiedPassword.value || undefined })
    showCreateFolder.value = false
    newFolderName.value = ''
    await fetchFiles()
  } catch (err: any) {
    uploadError.value = err.message
  }
}

async function handleUpload(filesToUpload: FileList | File[]) {
  const list = Array.from(filesToUpload)
  if (list.length === 0) return

  pendingUploadFiles.value = list
  showUpload.value = true
  showUploadProgress.value = true
  uploadStatus.value = 'uploading'
  uploadProgress.value = list.map((file) => ({ file: file.name, percent: 0 }))
  activeUploads.value = []

  for (let i = 0; i < list.length; i += 1) {
    const file = list[i]
    try {
      const formData = new FormData()
      formData.append('file', file, 'upload.bin')
      if (currentPath.value) formData.append('dirPath', currentPath.value)

      const xhr = new XMLHttpRequest()
      activeUploads.value.push(xhr)
      const params = new URLSearchParams({ filename: file.name })
      if (currentPath.value) params.set('dirPath', currentPath.value)
      if (verifiedPassword.value) params.set('password', verifiedPassword.value)

      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return
          uploadProgress.value[i].percent = Math.round((event.loaded / event.total) * 100)
          if (event.loaded === event.total) uploadStatus.value = 'processing'
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadProgress.value[i].percent = 100
            resolve()
          } else {
            reject(new Error(xhr.statusText))
          }
        }
        xhr.onerror = () => reject(new Error(t('guest.uploadFailed', 'Upload failed')))
        xhr.onabort = () => reject(new Error(t('guest.uploadCancelled', 'Upload cancelled')))
        xhr.open('POST', `/api/guest/${username.value}/${shareId.value}/upload?${params}`)
        xhr.send(formData)
      })
    } catch (err: any) {
      if (err.message === t('guest.uploadCancelled', 'Upload cancelled')) {
        uploadStatus.value = 'cancelled'
        break
      }
      uploadError.value = err.message
    }
  }

  activeUploads.value = []
  if (uploadStatus.value !== 'cancelled') {
    uploadStatus.value = 'completed'
    window.setTimeout(() => {
      showUploadProgress.value = false
      uploadStatus.value = ''
      showUpload.value = false
      pendingUploadFiles.value = []
    }, 2000)
  }

  fetchFiles().catch(() => {})
}

function cancelUploads() {
  if (activeUploads.value.length === 0) {
    showUploadProgress.value = false
    uploadStatus.value = ''
    return
  }

  uploadStatus.value = 'cancelled'
  activeUploads.value.forEach((xhr) => {
    try {
      xhr.abort()
    } catch {}
  })
  activeUploads.value = []

  window.setTimeout(() => {
    showUploadProgress.value = false
    uploadStatus.value = ''
    uploadProgress.value = []
    showUpload.value = false
    pendingUploadFiles.value = []
  }, 300)
}

const isDragging = ref(false)
let dragCounter = 0

function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  dragCounter += 1
  isDragging.value = true
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault()
  dragCounter -= 1
  if (dragCounter === 0) isDragging.value = false
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragCounter = 0
  isDragging.value = false
  if (event.dataTransfer?.files.length) {
    pendingUploadFiles.value = Array.from(event.dataTransfer.files)
    showUpload.value = true
  }
}

function formatDate(dateStr: string) {
  const locale = language.value === 'en-US' ? 'en-US' : 'zh-CN'
  const date = new Date(dateStr)
  return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
}

const permLabels: Record<string, string> = {
  read: t('permissions.read', 'Read'),
  write: t('permissions.write', 'Write'),
  delete: t('permissions.delete', 'Delete'),
  edit: t('permissions.edit', 'Text Edit'),
  preview: t('permissions.preview', 'Preview'),
  download: t('permissions.download', 'Download'),
  upload: t('permissions.upload', 'Upload')
}
</script>

<template>
  <div class="h-screen overflow-hidden" style="background-color: var(--bg-color)">
    <div class="flex h-full flex-col">
      <header class="flex h-11 flex-shrink-0 items-center justify-between px-3 sm:px-4" style="background-color: var(--surface-color)">
        <div class="min-w-0 flex items-center gap-2 sm:gap-3">
          <router-link to="/guest" class="flex flex-shrink-0 items-center gap-2 text-lg font-bold">
            <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
            <span class="hidden sm:inline" style="color: var(--text-color)">VueFileManager</span>
          </router-link>
          <span v-if="isFolderView" class="truncate text-sm font-medium" style="color: var(--text-secondary-color)">/ {{ owner }}</span>
          <span v-else class="hidden truncate text-sm font-medium sm:inline" style="color: var(--text-secondary-color)">/ {{ t('guest.mode', 'Guest Mode') }}</span>
        </div>

        <div class="flex flex-shrink-0 items-center gap-2 sm:gap-3" :class="{ 'guest-auth-logged-in': authStore.isLoggedIn }">
          <ThemeToggle />
          <router-link v-if="authStore.isLoggedIn" to="/" class="btn-primary px-3 py-1.5 text-sm">{{ t('guest.userMode', 'User Mode') }}</router-link>
          <router-link to="/login" class="btn-primary px-3 py-1.5 text-sm">{{ t('app.login', 'Login') }}</router-link>
        </div>
      </header>

      <main class="flex-1 overflow-auto" @dragenter="handleDragEnter" @dragleave="handleDragLeave" @dragover="handleDragOver" @drop="handleDrop">
        <div v-if="isDragging" class="fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-blue-500 bg-blue-500/20">
          <div class="rounded-xl border bg-white p-8 text-center dark:bg-dark-card">
            <Icon name="upload" class="mb-3 h-16 w-16" style="color: var(--accent-color)" />
            <p class="text-lg font-semibold" style="color: var(--text-color)">{{ t('guest.dragUploadOverlay', 'Drop files here to upload') }}</p>
          </div>
        </div>

        <div v-if="loadingShares || loading" class="flex items-center justify-center py-20">
          <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>

        <div v-else-if="needPassword" class="mx-auto max-w-md p-4 sm:p-8">
          <div class="mb-4 text-center sm:mb-6">
            <Icon name="lock" class="mx-auto mb-3 h-12 w-12 sm:mb-4 sm:h-16 sm:w-16" style="color: var(--accent-color)" />
            <h2 class="mb-2 text-lg font-semibold sm:text-xl" style="color: var(--text-color)">{{ t('sharePage.passwordRequiredTitle', 'Password Required') }}</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">{{ t('guest.passwordRequiredDescription', 'This guest folder requires a password to access.') }}</p>
            <p v-if="owner" class="mt-1 text-xs" style="color: var(--text-secondary-color)">
              {{ t('sharePage.owner', 'Shared by: {owner}').replace('{owner}', owner) }}
            </p>
          </div>

          <form class="space-y-3" @submit.prevent="submitPassword">
            <input
              v-model="accessPassword"
              type="password"
              class="input-field"
              :placeholder="t('sharePage.passwordPlaceholder', 'Enter access password')"
              autofocus
            />
            <p v-if="passwordError" class="text-sm text-red-500">{{ passwordError }}</p>
            <button type="submit" class="btn-primary w-full" :disabled="loading || !accessPassword">
              {{ loading ? t('sharePage.verifying', 'Verifying...') : t('sharePage.verify', 'Verify') }}
            </button>
          </form>
        </div>

        <div v-else-if="error" class="px-4 pt-4">
          <div class="card p-6 text-center">
            <Icon name="exclamation" class="mx-auto mb-3 h-16 w-16 text-red-400" />
            <p class="text-red-500">{{ error }}</p>
          </div>
        </div>

        <template v-else-if="!isFolderView">
          <div class="px-4 pt-4">
            <div v-if="shares.length === 0" class="card flex flex-col items-center justify-center py-20" style="color: var(--text-secondary-color)">
              <Icon name="folder" class="mb-3 h-16 w-16" />
              <p>{{ t('guest.noSharedFolders', 'No shared folders yet') }}</p>
            </div>

            <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="share in shares"
                :key="share.id"
                class="card group flex cursor-pointer items-center gap-4"
                @click="navigateToShare(share.id)"
              >
                <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl" style="background-color: var(--accent-soft-color)">
                  <Icon name="folder" class="h-6 w-6" style="color: var(--accent-color)" />
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="truncate font-medium transition-colors" style="color: var(--text-color)">
                    {{ getShareDisplayName(share) }}
                  </h3>
                  <p class="text-xs" style="color: var(--text-secondary-color)">
                    {{ share.pool_name }}{{ t('common.separator', ' | ') }}{{ formatDate(share.created_at) }}
                  </p>
                  <div v-if="share.permissions" class="mt-1.5 flex flex-wrap gap-1">
                    <span
                      v-if="share.has_password"
                      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                      style="background-color: var(--hover-color); color: var(--text-secondary-color)"
                    >
                      <Icon name="lock" class="h-3 w-3" />
                      {{ t('myShares.hasPassword', 'Password Protected') }}
                    </span>
                    <span
                      v-for="perm in share.permissions.split(',')"
                      :key="perm"
                      class="rounded px-1.5 py-0.5 text-xs"
                      style="background-color: var(--accent-soft-color); color: var(--accent-color)"
                    >
                      {{ permLabels[perm.trim()] || perm.trim() }}
                    </span>
                  </div>
                </div>
                <Icon name="chevron-right" class="h-5 w-5 flex-shrink-0 transition-colors" style="color: var(--text-secondary-color)" />
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="px-4 pt-4">
            <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="flex flex-wrap items-center gap-1.5 text-sm">
                <div class="relative">
                  <button
                    class="flex items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    style="color: var(--accent-color)"
                    @click.stop="showShareDropdown = !showShareDropdown"
                  >
                    <Icon name="folder" class="h-4 w-4" />
                    <span>{{ currentShareDisplayName || t('guest.folderFallback', 'Folder') }}</span>
                    <Icon name="chevron-down" class="h-3 w-3" />
                  </button>
                  <div
                    v-if="showShareDropdown"
                    class="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border py-1 shadow-sm"
                    style="background-color: var(--card-color); border-color: var(--border-color)"
                  >
                    <div
                      v-for="share in shares"
                      :key="share.id"
                      class="flex cursor-pointer items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                      :style="{ color: String(share.id) === shareId ? 'var(--accent-color)' : 'var(--text-color)', fontWeight: String(share.id) === shareId ? '500' : 'normal' }"
                      @click="navigateToShare(share.id); showShareDropdown = false"
                    >
                      <Icon name="folder" class="h-4 w-4" />
                      {{ getShareDisplayName(share) }}
                    </div>
                  </div>
                </div>

                <template v-for="(segment, index) in pathSegments" :key="segment + index">
                  <Icon name="chevron-right" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                  <button
                    class="rounded-md px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    :style="{ color: index === pathSegments.length - 1 ? 'var(--text-color)' : 'var(--accent-color)', fontWeight: index === pathSegments.length - 1 ? '500' : 'normal' }"
                    @click="navigateToPath(pathSegments.slice(0, index + 1).join('/'))"
                  >
                    {{ segment }}
                  </button>
                </template>
              </div>

              <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <div class="flex items-center gap-1">
                  <input
                    v-model="searchQuery"
                    type="text"
                    class="input-field w-24 text-sm sm:w-32"
                    :placeholder="t('guest.searchPlaceholder', 'Search... (//regex)')"
                    @keyup.enter="handleSearch"
                    @input="!searchQuery && (showSearch = false)"
                  />
                  <button class="btn-secondary p-1.5 text-sm" :title="t('common.search', 'Search')" @click="handleSearch">
                    <Icon name="search" class="h-4 w-4" />
                  </button>
                </div>

                <button class="btn-secondary p-1.5 text-sm" :title="t('common.refresh', 'Refresh')" @click="fetchFiles">
                  <Icon name="refresh-cw" class="h-4 w-4" />
                </button>

                <button v-if="currentPath" class="btn-secondary p-1.5 text-sm" :title="t('file.goUp', 'Up')" @click="goUp">
                  <Icon name="arrow-up" class="h-4 w-4" />
                </button>

                <div class="view-mode-toggle overflow-hidden rounded-lg">
                  <button :class="viewMode === 'list' ? 'view-mode-active' : ''" @click="viewMode = 'list'">
                    <Icon name="list" class="h-4 w-4" />
                  </button>
                  <button :class="viewMode === 'medium-list' ? 'view-mode-active' : ''" :title="t('file.mediumListView', 'Medium List View')" @click="viewMode = 'medium-list'">
                    <Icon name="video" class="h-4 w-4" />
                  </button>
                  <button :class="viewMode === 'grid' ? 'view-mode-active' : ''" @click="viewMode = 'grid'">
                    <Icon name="grid" class="h-4 w-4" />
                  </button>
                </div>

                <div class="toolbar-select-group">
                  <span class="toolbar-select-label hidden sm:inline">
                    {{ t('file.sortShort', 'Sort') }}
                  </span>
                  <div class="relative flex min-w-[5.5rem] items-center">
                    <select
                      class="toolbar-select-native"
                      :value="sortKey"
                      :title="t('file.sortShort', 'Sort')"
                      @change="updateSort(($event.target as HTMLSelectElement).value as any)"
                    >
                      <option value="name">{{ t('file.sortField.name', 'Name') }}</option>
                      <option value="modified">{{ t('file.sortField.modified', 'Modified') }}</option>
                      <option value="type">{{ t('file.sortField.type', 'Type') }}</option>
                      <option value="size">{{ t('file.sortField.size', 'Size') }}</option>
                    </select>
                    <Icon name="chevron-down" class="toolbar-select-caret pointer-events-none absolute right-0 h-4 w-4" />
                  </div>
                  <span class="toolbar-select-divider" />
                  <button
                    class="toolbar-select-action"
                    :title="t(`file.sortDirection.${sortDirection}`, sortDirection)"
                    @click="updateSort(sortKey)"
                  >
                    <Icon :name="sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'" class="h-4 w-4" />
                  </button>
                </div>

                <button v-if="hasPermission('upload')" class="btn-secondary flex items-center gap-1 text-sm" @click="showCreateFolder = true">
                  <Icon name="folder-plus" class="h-4 w-4" />
                  <span class="hidden sm:inline">{{ t('file.newFolderShort', 'New') }}</span>
                </button>

                <button v-if="hasPermission('upload')" class="btn-primary flex items-center gap-1 text-sm" @click="showUpload = true">
                  <Icon name="upload" class="h-4 w-4" />
                  <span class="hidden sm:inline">{{ t('upload.shortTitle', 'Upload') }}</span>
                </button>
              </div>
            </div>

            <div
              v-if="isSelectMode"
              class="mb-3 flex items-center justify-between rounded-lg p-2 text-sm"
              style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)"
            >
              <div class="min-w-0 flex items-center gap-2 sm:gap-3">
                <button class="flex-shrink-0 text-sm hover:underline" style="color: var(--accent-color)" @click="selectAll">
                  {{ selectedFiles.size === (showSearch ? searchResults : files).length ? t('file.unselectAll', 'Unselect All') : t('file.selectAll', 'Select All') }}
                </button>
                <span class="truncate" style="color: var(--text-secondary-color)">
                  {{ format('file.selectedItems', '{count} items selected', { count: selectedFiles.size }) }}
                </span>
              </div>
              <button class="ml-2 flex-shrink-0 text-sm hover:underline" style="color: var(--text-secondary-color)" @click="clearSelection">
                {{ t('common.cancel', 'Cancel') }}
              </button>
            </div>

            <div v-if="showSearch" class="mb-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-sm" style="color: var(--text-color)">
                  {{ format('guest.searchResults', 'Search results: {count}', { count: sortedSearchResults.length }) }}
                </span>
                <button class="text-xs hover:underline" style="color: var(--accent-color)" @click="showSearch = false; searchQuery = ''">
                  {{ t('file.clear', 'Clear') }}
                </button>
              </div>
            </div>

            <div v-if="uploadError" class="mb-3 flex items-center justify-between rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <span>{{ uploadError }}</span>
              <button class="text-red-400 hover:text-red-600" @click="uploadError = ''">
                <Icon name="xmark" class="h-4 w-4" />
              </button>
            </div>

            <DirectoryReadme v-if="!showSearch && readme" :src="readme.directUrl || readme.fileUrl" :title="readme.name" />

            <FileList
              :files="showSearch ? sortedSearchResults : sortedFiles"
              :loading="loading"
              :show-actions="false"
              :select-mode="!!shareId"
              :selected-files="selectedFiles"
              :view-mode="viewMode"
              :guest-base-url="guestBaseUrl"
              :guest-thumbnail-base-url="guestThumbnailBaseUrl"
              :guest-access-password="verifiedPassword"
              :sort-key="sortKey"
              :sort-direction="sortDirection"
              @open="openFile"
              @download="handleDownload"
              @contextmenu="handleContextMenu"
              @toggle-select="toggleSelectFile"
              @detail="(file) => { detailItem = file; showDetailPanel = true }"
              @sort="updateSort"
            />
          </div>
        </template>

        <footer class="px-4 py-3 text-center" style="color: var(--text-secondary-color)">
          <p class="text-xs opacity-60" style="line-height: 1.4">
            (c) {{ new Date().getFullYear() }}
            <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">VueFileManager</a>
            by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">Twiyin0</a>
            {{ t('common.separator', ' | ') }}MIT License
          </p>
        </footer>
      </main>

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

      <FilePreview
        v-if="fileToPreview"
        :show="showPreview"
        :file-path="fileToPreview.path"
        :file-name="fileToPreview.name"
        :guest-base-url="guestBaseUrl"
        :guest-save-url="guestSaveUrl"
        :guest-access-password="verifiedPassword"
        :editable="hasPermission('edit')"
        :file-list="files"
        @close="showPreview = false; fileToPreview = null"
      />

      <FileDetailPanel :visible="showDetailPanel" :item="detailItem" @close="showDetailPanel = false" />

      <ConfirmDialog
        :show="showDeleteConfirm"
        :title="t('file.confirmDeleteTitle', 'Confirm Delete')"
        :message="format('file.confirmDeleteMessage', 'Delete {name}?', { name: fileToDelete?.name || '' })"
        :confirm-text="t('common.delete', 'Delete')"
        :danger="true"
        @confirm="handleDelete"
        @cancel="showDeleteConfirm = false; fileToDelete = null"
      />

      <Teleport to="body">
        <div v-if="showCreateFolder" class="dialog-overlay">
          <div class="dialog-backdrop" @click="showCreateFolder = false" />
          <div class="dialog-panel dialog-panel-scroll dialog-panel-sm">
            <div class="dialog-section">
            <h3 class="dialog-title mb-4">{{ t('file.newFolder', 'New Folder') }}</h3>
            <input v-model="newFolderName" type="text" class="input-field mb-4" :placeholder="t('file.newFolderPlaceholder', 'Folder name')" @keyup.enter="handleCreateFolder" />
            <div class="dialog-footer mt-0">
              <button class="btn-secondary text-sm" @click="showCreateFolder = false">{{ t('common.cancel', 'Cancel') }}</button>
              <button class="btn-primary text-sm" @click="handleCreateFolder">{{ t('common.create', 'Create') }}</button>
            </div>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="showRename" class="dialog-overlay">
          <div class="dialog-backdrop" @click="showRename = false" />
          <div class="dialog-panel dialog-panel-scroll dialog-panel-sm">
            <div class="dialog-section">
            <h3 class="dialog-title mb-4">{{ t('file.rename', 'Rename') }}</h3>
            <input v-model="newFileName" type="text" class="input-field mb-4" :placeholder="t('file.renamePlaceholder', 'New name')" @keyup.enter="handleRename" />
            <div class="dialog-footer mt-0">
              <button class="btn-secondary text-sm" @click="showRename = false">{{ t('common.cancel', 'Cancel') }}</button>
              <button class="btn-primary text-sm" @click="handleRename">{{ t('common.confirm', 'Confirm') }}</button>
            </div>
            </div>
          </div>
        </div>
      </Teleport>

      <UploadDialog
        v-if="hasPermission('upload')"
        :show="showUpload"
        :current-path="currentPath"
        :pending-files="pendingUploadFiles"
        :uploading="isUploadBusy"
        :upload-progress="uploadProgress"
        :upload-status="uploadStatus"
        @close="showUpload = false; pendingUploadFiles = []"
        @upload="handleUpload"
        @cancel="cancelUploads"
      />

      <Teleport to="body">
        <div
          v-if="showUploadProgress"
          class="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border shadow-sm"
          style="background-color: var(--card-color); border-color: var(--border-color)"
        >
          <div
            class="flex items-center justify-between gap-3 border-b px-4 py-3"
            style="border-color: var(--border-color); background-color: var(--surface-color)"
          >
            <h4 class="text-sm font-semibold" style="color: var(--text-color)">
              {{ t('upload.progressTitle', 'Upload Progress') }}
              <span v-if="uploadStatusLabel" class="ml-2 text-xs" :class="uploadStatus === 'cancelled' ? 'text-red-500' : 'text-amber-500'">
                {{ uploadStatusLabel }}
              </span>
            </h4>
            <button v-if="uploadStatus === 'uploading'" class="btn-secondary px-3 py-1 text-xs" @click="cancelUploads">
              {{ t('upload.cancel', 'Cancel Upload') }}
            </button>
            <button
              v-else
              class="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
              style="color: var(--text-secondary-color)"
              @click="showUploadProgress = false"
            >
              <Icon name="xmark" class="h-4 w-4" />
            </button>
          </div>
          <div class="max-h-[40vh] overflow-y-auto p-4">
            <div v-for="(item, index) in uploadProgress" :key="index" class="mb-3 last:mb-0">
              <div class="mb-1 flex items-center justify-between text-xs">
                <span class="max-w-[220px] truncate" style="color: var(--text-color)">{{ item.file }}</span>
                <span class="ml-2 flex-shrink-0" style="color: var(--text-secondary-color)">
                  {{ uploadStatus === 'processing' && item.percent >= 100 ? t('upload.statusProcessing', 'Processing') : `${item.percent}%` }}
                </span>
              </div>
              <div class="h-2 w-full rounded-full" style="background-color: var(--hover-color)">
                <div class="h-2 rounded-full bg-blue-500 transition-all duration-300" :style="{ width: `${item.percent}%` }" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="showAplayer" class="aplayer-float" :class="{ 'aplayer-mobile': isMobileDevice }">
          <div
            v-if="aplayerCollapsed"
            class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full shadow-sm transition-all active:scale-95"
            style="background-color: var(--accent-color); color: white"
            :title="t('player.expand', 'Expand Player')"
            @click="toggleAplayerCollapse"
          >
            <Icon name="music" class="h-4 w-4" />
          </div>
          <div v-show="!aplayerCollapsed" class="aplayer-wrap overflow-hidden rounded-lg border" style="background-color: var(--card-color); border-color: var(--border-color)">
            <div class="flex items-center justify-between px-2 py-1" style="background-color: var(--surface-color); border-bottom: 1px solid var(--border-color)">
              <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('player.title', 'Player') }}</span>
              <div class="flex items-center gap-0.5">
                <button class="rounded p-1 hover:opacity-80" :title="t('player.collapse', 'Collapse')" style="color: var(--text-secondary-color)" @click="toggleAplayerCollapse">
                  <Icon name="chevron-down" class="h-3.5 w-3.5" />
                </button>
                <button class="rounded p-1 hover:opacity-80" :title="t('common.close', 'Close')" style="color: var(--text-secondary-color)" @click="destroyAplayer">
                  <Icon name="xmark" class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div ref="aplayerRef" />
          </div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.guest-auth-logged-in a[href="/login"] {
  display: none;
}
</style>
