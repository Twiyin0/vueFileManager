import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api'
import { useOfflineTasks } from '@/composables/useOfflineTasks'
import { useFilesStore, type FileItem } from '@/stores/files'
import APlayer from 'aplayer'

import 'aplayer/dist/APlayer.min.css'

export function useHomeView() {
  const route = useRoute()
  const router = useRouter()
  const filesStore = useFilesStore()

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
  const showGuestShare = ref(false)
  const fileToGuestShare = ref<FileItem | null>(null)

  const searchQuery = ref('')
  const searchResults = ref<FileItem[]>([])
  const isSearching = ref(false)
  const showSearch = ref(false)

  const contextMenu = ref({ visible: false, x: 0, y: 0, item: null as any })
  const selectedFiles = ref<Set<string>>(new Set())
  const isSelectMode = computed(() => selectedFiles.value.size > 0)

  const viewMode = ref<'list' | 'grid'>((localStorage.getItem('viewMode') as 'list' | 'grid') || 'list')
  watch(viewMode, (value) => localStorage.setItem('viewMode', value))

  const showDetailPanel = ref(false)
  const detailItem = ref<any>(null)

  const showRemoteUpload = ref(false)
  const remoteUrl = ref('')
  const remoteUploading = ref(false)
  const remoteUploadMode = ref<'instant' | 'offline'>('instant')
  const {
    tasks: offlineTasks,
    loading: offlineTasksLoading,
    hidden: offlineTasksHidden,
    hasActiveTasks: hasActiveOfflineTasks,
    hasFinishedTasks: hasFinishedOfflineTasks,
    loadTasks: loadOfflineTasks,
    cancelTask: cancelOfflineTask,
    retryTask: retryOfflineTask,
    clearFinishedTasks: clearFinishedOfflineTasks,
    hidePanel: hideOfflineTasksPanel,
    showPanel: showOfflineTasksPanel
  } = useOfflineTasks()
  let offlineTasksRefreshTimer: number | null = null

  const clipboardFiles = ref<{ path: string; name: string; poolId?: number }[]>([])
  const clipboardMode = ref<'copy' | 'move'>('copy')

  const toast = ref({ show: false, message: '', type: 'info' as 'success' | 'error' | 'info' })

  const showMoveDialog = ref(false)
  const filesToMove = ref<{ path: string; name: string; poolId?: number }[]>([])

  const isDragging = ref(false)
  let dragCounter = 0

  const uploadProgress = ref<{ file: string; percent: number }[]>([])
  const showUploadProgress = ref(false)
  const uploadStatus = ref('')
  const activeUploads = ref<XMLHttpRequest[]>([])
  const pendingUploadFiles = ref<File[]>([])
  const uploadError = ref('')
  const isUploadBusy = computed(() => uploadStatus.value === 'uploading' || uploadStatus.value === 'processing')
  const uploadStatusLabel = computed(() => {
    if (uploadStatus.value === 'cancelled') return '已取消'
    if (uploadStatus.value === 'processing') return '服务器处理中'
    if (uploadStatus.value === 'completed') return '已完成'
    return ''
  })

  const pools = ref<{ id: number; name: string }[]>([])
  const showPoolDropdown = ref(false)

  const currentPoolId = computed(() => {
    const pool = route.query.pool as string
    return pool ? parseInt(pool) : undefined
  })
  const currentPath = computed(() => ((route.query.path as string) || '').replace(/\\/g, '/'))
  const pathSegments = computed(() => {
    if (!currentPath.value) return []
    return currentPath.value.split('/').filter(Boolean)
  })

  const aplayerRef = ref<HTMLDivElement>()
  function setAplayerRef(element: Element | ComponentPublicInstance | null) {
    aplayerRef.value = element instanceof HTMLDivElement ? element : undefined
  }
  let aplayerInst: any = null
  const showAplayer = ref(false)
  const aplayerCollapsed = ref(true)

  const isDark = ref(document.documentElement.classList.contains('dark'))
  const isMobileDevice = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent)
  const themeObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })

  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']

  const currentPoolName = computed(() => {
    if (!currentPoolId.value) return ''
    const pool = pools.value.find((item) => item.id === currentPoolId.value)
    return pool?.name || ''
  })
  const canUseRemoteUpload = computed(() => !!currentPoolId.value)
  let hasInitialized = false

  onMounted(async () => {
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    if (!hasInitialized) {
      try {
        const res = await api.get<{ pools: Array<{ id: number; name: string }> }>('/storage-pools')
        pools.value = res.pools.map((pool) => ({ id: pool.id, name: pool.name }))
      } catch {}
      await loadOfflineTasks()
      await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
      hasInitialized = true
    }
  })

  onUnmounted(() => {
    themeObserver.disconnect()
    stopOfflineTasksPolling()
    destroyAplayer()
  })

  watch(hasActiveOfflineTasks, (active) => {
    if (active) {
      startOfflineTasksPolling()
    } else {
      stopOfflineTasksPolling()
    }
  }, { immediate: true })

  watch([currentPath, currentPoolId], ([newPath, newPoolId], [oldPath, oldPoolId]) => {
    if (hasInitialized && newPath === oldPath && newPoolId === oldPoolId) {
      return
    }
    filesStore.fetchFiles(newPath, currentPoolId.value)
    showSearch.value = false
    searchQuery.value = ''
    selectedFiles.value.clear()
  })

  watch(showPoolDropdown, (visible) => {
    if (visible) document.addEventListener('click', handlePoolDropdownOutside, { once: true })
  })

  watch([currentPath, currentPoolId], () => {
    if (showAplayer.value) {
      nextTick(() => {
        refreshAplayerList().catch((err: any) => {
          showToast(`音频加载失败：${err.message || '无法刷新播放列表'}`, 'error')
        })
      })
    }
  })

  function handlePoolDropdownOutside(event: MouseEvent) {
    const target = event.target as HTMLElement
    if (!target.closest('.pool-dropdown-trigger')) {
      showPoolDropdown.value = false
    }
  }

  function startOfflineTasksPolling() {
    if (offlineTasksRefreshTimer !== null) return
    offlineTasksRefreshTimer = window.setInterval(() => {
      loadOfflineTasks().catch(() => {})
    }, 5000)
  }

  function stopOfflineTasksPolling() {
    if (offlineTasksRefreshTimer === null) return
    window.clearInterval(offlineTasksRefreshTimer)
    offlineTasksRefreshTimer = null
  }

  function navigateToPath(path: string, poolId?: number) {
    const query: Record<string, string> = {}
    if (poolId) query.pool = String(poolId)
    if (path) query.path = path
    router.push({ path: '/', query })
  }

  function isAudioFile(file: FileItem) {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    return audioExts.includes(ext)
  }

  function openFile(file: FileItem) {
    if (file.isPool && file.poolId) {
      navigateToPath('', file.poolId)
    } else if (file.type === 'folder') {
      navigateToPath(file.path, currentPoolId.value)
    } else if (isAudioFile(file)) {
      openAplayerWithFile(file)
    } else {
      fileToPreview.value = file
      showPreview.value = true
    }
  }

  function getFilePreviewUrl(file: FileItem) {
    if (file.directUrl) return file.directUrl
    if (file.fileUrl) return file.fileUrl
    const params = new URLSearchParams({ path: file.path })
    const poolId = file.poolId || currentPoolId.value
    if (poolId) params.set('poolId', String(poolId))
    const token = localStorage.getItem('token')
    if (token) params.set('token', token)
    return `/api/files/preview?${params.toString()}`
  }

  function buildAudioList(): { name: string; url: string; artist: string }[] {
    return filesStore.files.filter((file) => isAudioFile(file)).map((file) => ({
      name: file.name,
      url: getFilePreviewUrl(file),
      artist: 'VueFileManager',
    }))
  }

  function resolveAudioList() {
    return buildAudioList()
  }

  function toAplayerAudioList(audioList: Array<{ name: string; url: string; artist: string }>) {
    return audioList.map((item) => ({
      name: item.name.replace(/\.[^.]+$/, ''),
      url: item.url,
      artist: item.artist,
    }))
  }

  async function refreshAplayerList(targetUrl?: string) {
    const audioList = await resolveAudioList()
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
        audioList = await resolveAudioList()
        targetIndex = audioList.findIndex((item) => item.url === targetUrl)
      }
    } catch (err: any) {
      showToast(`音频加载失败：${err.message || '无法读取音频文件'}`, 'error')
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

    nextTick(async () => {
      if (!aplayerRef.value) return
      const playerAudioList = toAplayerAudioList(audioList)
      aplayerInst = new APlayer({
        container: aplayerRef.value,
        autoplay: !isMobileDevice,
        volume: 0.3,
        theme: isDark.value ? '#6b7cff' : '#4f6ef7',
        audio: playerAudioList,
      })
      if (targetIndex >= 0) {
        aplayerInst.list.switch(targetIndex)
      }
      try {
        aplayerInst.play()
      } catch {}
    })
  }

  function destroyAplayer() {
    if (aplayerInst) {
      try { aplayerInst.destroy() } catch {}
      aplayerInst = null
    }
    showAplayer.value = false
  }

  function toggleAplayerCollapse() {
    aplayerCollapsed.value = !aplayerCollapsed.value
  }

  function goUp() {
    const segments = currentPath.value.split('/').filter(Boolean)
    segments.pop()
    const newPath = segments.join('/')
    if (!newPath && currentPoolId.value) {
      goBackToPools()
    } else {
      navigateToPath(newPath, currentPoolId.value)
    }
  }

  function goBackToPools() {
    router.push({ path: '/' })
  }

  async function handleUpload(files: FileList, uploadPoolId?: number) {
    const junkPatterns = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//]
    const arr = Array.from(files).filter((file) => !junkPatterns.some((pattern) => pattern.test(file.name)))
    if (arr.length === 0) return
    pendingUploadFiles.value = arr
    const targetPoolId = uploadPoolId || currentPoolId.value
    showUploadProgress.value = true
    uploadError.value = ''
    uploadStatus.value = 'uploading'
    uploadProgress.value = arr.map((file) => ({ file: file.name, percent: 0 }))
    activeUploads.value = []

    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      try {
        const xhr = new XMLHttpRequest()
        activeUploads.value.push(xhr)
        const token = localStorage.getItem('token')

        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              uploadProgress.value[i].percent = Math.round((event.loaded / event.total) * 100)
              if (event.loaded === event.total) {
                uploadStatus.value = 'processing'
              }
            }
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              uploadProgress.value[i].percent = 100
              resolve()
            } else {
              let message = xhr.statusText || '上传失败'
              try {
                const data = JSON.parse(xhr.responseText || '{}')
                message = data.error || data.message || message
              } catch {}
              reject(new Error(message))
            }
          }
          xhr.onerror = () => reject(new Error('上传失败'))
          xhr.onabort = () => reject(new Error('上传已取消'))

          const dirPath = currentPath.value || ''
          const params = new URLSearchParams()
          if (dirPath) params.set('path', dirPath)
          if (targetPoolId) params.set('poolId', String(targetPoolId))
          const query = params.toString() ? `?${params}` : ''
          const uploadUrl = `/api/files/upload-stream${query}`
          const encodedName = encodeURIComponent(file.name)
          const encodedDirPath = dirPath ? encodeURIComponent(dirPath) : ''
          xhr.open('POST', uploadUrl)
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          xhr.setRequestHeader('X-File-Name', encodedName)
          if (encodedDirPath) xhr.setRequestHeader('X-Dir-Path', encodedDirPath)
          if (targetPoolId) xhr.setRequestHeader('X-Pool-Id', String(targetPoolId))
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.send(file)
        })
      } catch (err: any) {
        if (err.message === '上传已取消') {
          uploadStatus.value = 'cancelled'
          break
        }
        uploadStatus.value = 'error'
        uploadError.value = `${file.name}: ${err.message || '上传失败'}`
        showToast(uploadError.value, 'error')
        console.error(`上传失败: ${file.name}`, err)
        return
      }
    }

    activeUploads.value = []
    if (uploadStatus.value === 'uploading' || uploadStatus.value === 'processing') {
      uploadStatus.value = 'completed'
      setTimeout(() => {
        showUploadProgress.value = false
        uploadStatus.value = ''
        showUpload.value = false
        pendingUploadFiles.value = []
        uploadError.value = ''
      }, 2000)
    }
    filesStore.fetchFiles(currentPath.value, currentPoolId.value).catch(() => {})
  }

  function cancelUploads() {
    if (activeUploads.value.length === 0) {
      showUploadProgress.value = false
      uploadStatus.value = ''
      return
    }
    uploadStatus.value = 'cancelled'
    activeUploads.value.forEach((xhr) => {
      try { xhr.abort() } catch {}
    })
    activeUploads.value = []
    setTimeout(() => {
      showUploadProgress.value = false
      uploadStatus.value = ''
      uploadProgress.value = []
      showUpload.value = false
      pendingUploadFiles.value = []
      uploadError.value = ''
    }, 300)
  }

  function handleDragEnter(event: DragEvent) {
    event.preventDefault()
    dragCounter++
    isDragging.value = true
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault()
    dragCounter--
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

  async function handleRemoteUpload() {
    if (!remoteUrl.value.trim()) return
    remoteUploading.value = true
    try {
      if (remoteUploadMode.value === 'offline') {
        await api.post('/files/offline-download', {
          url: remoteUrl.value,
          dirPath: currentPath.value,
          poolId: currentPoolId.value
        })
        showOfflineTasksPanel()
        await loadOfflineTasks()
        const destination = `${currentPoolName.value || '当前存储池'}${currentPath.value ? ` / ${currentPath.value}` : ' / 根目录'}`
        showToast(`离线任务已创建，完成后会保存到 ${destination}`, 'success')
      } else {
        await api.post('/files/remote-upload', { url: remoteUrl.value, dirPath: currentPath.value, poolId: currentPoolId.value })
        await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
        showToast('远程上传已完成', 'success')
      }
      showRemoteUpload.value = false
      remoteUrl.value = ''
    } catch (err: any) {
      alert(err.message)
    } finally {
      remoteUploading.value = false
    }
  }

  function toggleSelectFile(path: string) {
    if (selectedFiles.value.has(path)) {
      selectedFiles.value.delete(path)
      selectedFiles.value = new Set(selectedFiles.value)
    } else {
      selectedFiles.value = new Set([...selectedFiles.value, path])
    }
  }

  function selectAll() {
    const files = showSearch.value ? searchResults.value : filesStore.files
    if (selectedFiles.value.size === files.length) {
      selectedFiles.value.clear()
    } else {
      selectedFiles.value = new Set(files.map((file) => file.path))
    }
  }

  function clearSelection() {
    selectedFiles.value.clear()
  }

  async function handleBatchDelete() {
    if (selectedFiles.value.size === 0) return
    if (!confirm(`确定要删除选中的 ${selectedFiles.value.size} 个项目吗？`)) return
    try {
      await api.post('/files/batch-delete', { paths: Array.from(selectedFiles.value), poolId: currentPoolId.value })
      selectedFiles.value.clear()
      await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    } catch (err: any) {
      alert(err.message)
    }
  }

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
      const link = document.createElement('a')
      link.href = url
      link.download = 'download.zip'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function toggleFavourite(file: FileItem) {
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

  function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    toast.value = { show: true, message, type }
  }

  function handleCopy(files: { path: string; name?: string; poolId?: number }[]) {
    clipboardFiles.value = files.map((file) => ({
      path: file.path,
      name: file.name || file.path.split('/').filter(Boolean).pop() || file.path,
      poolId: file.poolId
    }))
    clipboardMode.value = 'copy'
    showToast(`已复制 ${files.length} 个项目`, 'success')
  }

  function handleMove(files: { path: string; name?: string; poolId?: number }[]) {
    filesToMove.value = files.map((file) => ({
      path: file.path,
      name: file.name || file.path.split('/').filter(Boolean).pop() || file.path,
      poolId: file.poolId
    }))
    showMoveDialog.value = true
  }

  async function handlePaste() {
    if (clipboardFiles.value.length === 0) return
    const srcPoolId = clipboardFiles.value[0].poolId || currentPoolId.value
    const destPoolId = currentPoolId.value
    const destPath = currentPath.value

    try {
      if (clipboardMode.value === 'copy') {
        if (!srcPoolId || srcPoolId === destPoolId) {
          for (const file of clipboardFiles.value) {
            const dest = destPath ? `${destPath}/${file.name}` : file.name
            await api.post('/files/copy', { src: file.path, dest, poolId: currentPoolId.value })
          }
          showToast(`已粘贴 ${clipboardFiles.value.length} 个项目`, 'success')
        } else {
          await api.post('/files/cross-copy', {
            srcPaths: clipboardFiles.value.map((file) => file.path),
            names: clipboardFiles.value.map((file) => file.name),
            srcPoolId,
            destPoolId,
            destPath
          })
          showToast(`已跨池复制 ${clipboardFiles.value.length} 个项目`, 'success')
        }
      } else {
        if (!srcPoolId || srcPoolId === destPoolId) {
          for (const file of clipboardFiles.value) {
            const dest = destPath ? `${destPath}/${file.name}` : file.name
            await api.post('/files/move', { src: file.path, dest, poolId: currentPoolId.value })
          }
          showToast(`已移动 ${clipboardFiles.value.length} 个项目`, 'success')
        } else {
          await api.post('/files/cross-move', {
            srcPaths: clipboardFiles.value.map((file) => file.path),
            names: clipboardFiles.value.map((file) => file.name),
            srcPoolId,
            destPoolId,
            destPath
          })
          showToast(`已跨池移动 ${clipboardFiles.value.length} 个项目`, 'success')
        }
        clipboardFiles.value = []
        clipboardMode.value = 'copy'
      }
      await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  async function handleMoveConfirm(destPoolId: number, destPath: string) {
    const srcPoolId = filesToMove.value[0].poolId || currentPoolId.value
    showMoveDialog.value = false

    try {
      if (!srcPoolId || srcPoolId === destPoolId) {
        for (const file of filesToMove.value) {
          const dest = destPath ? `${destPath}/${file.name}` : file.name
          await api.post('/files/move', { src: file.path, dest, poolId: destPoolId })
        }
        showToast(`已移动 ${filesToMove.value.length} 个项目`, 'success')
      } else {
        await api.post('/files/cross-move', {
          srcPaths: filesToMove.value.map((file) => file.path),
          names: filesToMove.value.map((file) => file.name),
          srcPoolId,
          destPoolId,
          destPath
        })
        showToast(`已跨池移动 ${filesToMove.value.length} 个项目`, 'success')
      }
      await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    } catch (err: any) {
      showToast(err.message || '移动失败', 'error')
    }
    filesToMove.value = []
  }

  async function handleCreateFolder() {
    if (!newFolderName.value.trim()) return
    const path = currentPath.value ? `${currentPath.value}/${newFolderName.value}` : newFolderName.value
    await api.post('/files/mkdir', { path, poolId: currentPoolId.value })
    await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    showCreateFolder.value = false
    newFolderName.value = ''
  }

  function confirmDelete(file: FileItem) {
    fileToDelete.value = file
    showDeleteConfirm.value = true
  }

  async function handleDelete() {
    if (!fileToDelete.value) return
    await api.post('/files/delete', { path: fileToDelete.value.path, poolId: currentPoolId.value || undefined, permanent: false })
    await filesStore.fetchFiles(currentPath.value, currentPoolId.value)
    showDeleteConfirm.value = false
    fileToDelete.value = null
  }

  async function handleDownload(file: FileItem) {
    await filesStore.downloadFile(file.path, file.poolId || currentPoolId.value)
  }

  async function handleSearch() {
    if (!searchQuery.value.trim()) {
      showSearch.value = false
      return
    }
    isSearching.value = true
    showSearch.value = true
    try {
      const params = new URLSearchParams()
      params.set('q', searchQuery.value)
      if (currentPath.value) params.set('path', currentPath.value)
      if (currentPoolId.value) params.set('poolId', String(currentPoolId.value))
      const res = await api.get<{ files: FileItem[] }>(`/files/search?${params}`)
      searchResults.value = res.files
    } catch {
      searchResults.value = []
    } finally {
      isSearching.value = false
    }
  }

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
    } catch (err: any) {
      alert(err.message)
    }
  }

  function startShare(file: FileItem) {
    fileToShare.value = file
    showShare.value = true
  }

  function showDetail(file: FileItem) {
    detailItem.value = file
    showDetailPanel.value = true
  }

  function handleContextMenu(event: MouseEvent, file?: FileItem) {
    event.preventDefault()
    contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, item: file || null }
  }

  function handleContextAction(action: string, item?: FileItem) {
    switch (action) {
      case 'open':
        if (item) navigateToPath(item.path)
        break
      case 'preview':
        if (item) {
          fileToPreview.value = item
          showPreview.value = true
        }
        break
      case 'download':
        if (item) handleDownload(item)
        break
      case 'rename':
        if (item) startRename(item)
        break
      case 'share':
        if (item) startShare(item)
        break
      case 'favourite':
        if (item) toggleFavourite(item)
        break
      case 'guest-share':
        if (item) {
          fileToGuestShare.value = item
          showGuestShare.value = true
        }
        break
      case 'info':
        if (item) showDetail(item)
        break
      case 'delete':
        if (item) confirmDelete(item)
        break
      case 'copy':
        if (item) handleCopy([{ path: item.path, name: item.name, poolId: item.poolId || currentPoolId.value }])
        break
      case 'move':
        if (item) handleMove([{ path: item.path, name: item.name, poolId: item.poolId || currentPoolId.value }])
        break
      case 'paste':
        handlePaste()
        break
      case 'select-all':
        selectAll()
        break
      case 'clear-selection':
        clearSelection()
        break
      case 'batch-delete':
        handleBatchDelete()
        break
      case 'batch-download':
        handleBatchDownload()
        break
      case 'batch-copy': {
        const allFiles = showSearch.value ? searchResults.value : filesStore.files
        handleCopy(Array.from(selectedFiles.value).map((path) => {
          const file = allFiles.find((item) => item.path === path)
          return { path, name: file?.name, poolId: currentPoolId.value }
        }))
        break
      }
      case 'batch-move': {
        const allFiles = showSearch.value ? searchResults.value : filesStore.files
        handleMove(Array.from(selectedFiles.value).map((path) => {
          const file = allFiles.find((item) => item.path === path)
          return { path, name: file?.name, poolId: currentPoolId.value }
        }))
        break
      }
      case 'new-folder':
        showCreateFolder.value = true
        break
      case 'upload':
        showUpload.value = true
        break
      case 'remote-upload':
        showRemoteUpload.value = true
        break
      case 'refresh':
        filesStore.fetchFiles(currentPath.value, currentPoolId.value)
        break
    }
  }

  function triggerSpotlight() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
  }

  function handleSpotlightNavigate(path: string, poolId?: number) {
    navigateToPath(path, poolId || currentPoolId.value)
  }

  function formatSize(bytes: number) {
    if (!bytes) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
  }

  return {
    route,
    router,
    filesStore,
    showUpload,
    showCreateFolder,
    newFolderName,
    showDeleteConfirm,
    fileToDelete,
    showRename,
    fileToRename,
    newFileName,
    showPreview,
    fileToPreview,
    showShare,
    fileToShare,
    showGuestShare,
    fileToGuestShare,
    searchQuery,
    searchResults,
    isSearching,
    showSearch,
    contextMenu,
    selectedFiles,
    isSelectMode,
    viewMode,
    showDetailPanel,
    detailItem,
    showRemoteUpload,
    remoteUrl,
    remoteUploading,
    remoteUploadMode,
    offlineTasks,
    offlineTasksLoading,
    offlineTasksHidden,
    hasFinishedOfflineTasks,
    loadOfflineTasks,
    cancelOfflineTask,
    retryOfflineTask,
    clearFinishedOfflineTasks,
    hideOfflineTasksPanel,
    showOfflineTasksPanel,
    clipboardFiles,
    clipboardMode,
    toast,
    showMoveDialog,
    filesToMove,
    isDragging,
    uploadProgress,
    showUploadProgress,
    uploadStatus,
    activeUploads,
    pendingUploadFiles,
    uploadError,
    isUploadBusy,
    uploadStatusLabel,
    currentPoolId,
    canUseRemoteUpload,
    pools,
    showPoolDropdown,
    currentPath,
    pathSegments,
    aplayerRef,
    setAplayerRef,
    showAplayer,
    aplayerCollapsed,
    isDark,
    isMobileDevice,
    currentPoolName,
    navigateToPath,
    isAudioFile,
    openFile,
    getFilePreviewUrl,
    goUp,
    goBackToPools,
    handleUpload,
    cancelUploads,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleRemoteUpload,
    toggleSelectFile,
    selectAll,
    clearSelection,
    handleBatchDelete,
    handleBatchDownload,
    toggleFavourite,
    showToast,
    handleCopy,
    handleMove,
    handlePaste,
    handleMoveConfirm,
    handleCreateFolder,
    confirmDelete,
    handleDelete,
    handleDownload,
    handleSearch,
    startRename,
    handleRename,
    startShare,
    showDetail,
    handleContextMenu,
    handleContextAction,
    triggerSpotlight,
    handleSpotlightNavigate,
    formatSize,
    destroyAplayer,
    toggleAplayerCollapse
  }
}
