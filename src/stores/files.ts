import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'

export interface FileItem {
  name: string
  type: 'file' | 'folder'
  size: number
  modified: string
  path: string
  poolId?: number
  isPool?: boolean
  directUrl?: string
  fileUrl?: string
  isVirtual?: boolean
  mountId?: number
  sourcePath?: string
  sourcePoolId?: number
}

export interface DirectoryReadme {
  name: string
  path: string
  directUrl: string
  fileUrl: string
}

export const useFilesStore = defineStore('files', () => {
  const files = ref<FileItem[]>([])
  const currentPath = ref('')
  const loading = ref(false)
  const error = ref('')
  const readme = ref<DirectoryReadme | null>(null)

  async function fetchFiles(path: string = '', poolId?: number) {
    loading.value = true
    error.value = ''
    try {
      const params = new URLSearchParams()
      if (path) params.set('path', path)
      if (poolId) params.set('poolId', String(poolId))
      const query = params.toString() ? `?${params}` : ''
      const res = await api.get<{ files: FileItem[]; readme?: DirectoryReadme | null }>(`/files/list${query}`)
      files.value = res.files
      readme.value = res.readme || null
      currentPath.value = path
    } catch (err: any) {
      error.value = err.message
      files.value = []
      readme.value = null
    } finally {
      loading.value = false
    }
  }

  async function uploadFile(file: File, path: string = '', poolId?: number) {
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams()
    if (path) params.set('path', path)
    if (poolId) params.set('poolId', String(poolId))
    const query = params.toString() ? `?${params}` : ''
    await api.upload(`/files/upload${query}`, formData)
    await fetchFiles(currentPath.value, poolId)
  }

  async function deleteFile(path: string) {
    await api.delete(`/files/delete?path=${encodeURIComponent(path)}`)
    await fetchFiles(currentPath.value)
  }

  async function createFolder(path: string) {
    await api.post('/files/mkdir', { path })
    await fetchFiles(currentPath.value)
  }

  async function fetchDownloadBlob(path: string, poolId?: number) {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams({ path })
    if (poolId) params.set('poolId', String(poolId))
    const url = `/api/files/download?${params.toString()}`
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })

    if (!response.ok) {
      throw new Error('下载失败')
    }

    return response.blob()
  }

  function triggerBrowserDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadFile(path: string, poolId?: number) {
    const blob = await fetchDownloadBlob(path, poolId)
    triggerBrowserDownload(blob, path.split('/').pop() || 'download')
  }

  async function downloadFiles(items: Array<{ path: string; poolId?: number }>, concurrency: number = 3) {
    if (items.length === 0) return

    const limit = Math.max(1, Math.min(concurrency, items.length))
    const failures: string[] = []
    let nextIndex = 0

    const worker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++
        const item = items[currentIndex]

        try {
          const blob = await fetchDownloadBlob(item.path, item.poolId)
          triggerBrowserDownload(blob, item.path.split('/').pop() || `download-${currentIndex + 1}`)
        } catch (err) {
          console.error('Download failed:', item.path, err)
          failures.push(item.path.split('/').pop() || item.path)
        }
      }
    }

    await Promise.all(Array.from({ length: limit }, () => worker()))

    if (failures.length > 0) {
      throw new Error(`部分文件下载失败：${failures.slice(0, 3).join('、')}${failures.length > 3 ? ' 等' : ''}`)
    }
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

  return {
    files,
    currentPath,
    loading,
    error,
    readme,
    fetchFiles,
    uploadFile,
    deleteFile,
    createFolder,
    downloadFile,
    downloadFiles,
    formatSize,
    formatDate
  }
})
