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
}

export const useFilesStore = defineStore('files', () => {
  const files = ref<FileItem[]>([])
  const currentPath = ref('')
  const loading = ref(false)
  const error = ref('')

  async function fetchFiles(path: string = '', poolId?: number) {
    loading.value = true
    error.value = ''
    try {
      const params = new URLSearchParams()
      if (path) params.set('path', path)
      if (poolId) params.set('poolId', String(poolId))
      const query = params.toString() ? `?${params}` : ''
      const res = await api.get<{ files: FileItem[] }>(`/files/list${query}`)
      files.value = res.files
      currentPath.value = path
    } catch (err: any) {
      error.value = err.message
      files.value = []
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

  async function downloadFile(path: string) {
    const token = localStorage.getItem('token')
    const url = `/api/files/download?path=${encodeURIComponent(path)}`
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!response.ok) throw new Error('下载失败')
    const blob = await response.blob()
    const fileName = path.split('/').pop() || 'download'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
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
    files, currentPath, loading, error,
    fetchFiles, uploadFile, deleteFile, createFolder, downloadFile,
    formatSize, formatDate
  }
})
