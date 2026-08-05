import { computed, ref } from 'vue'
import { api } from '@/api'

export type OfflineTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface OfflineTask {
  id: number
  pool_id: number
  pool_name: string
  url: string
  dir_path: string
  file_name: string
  status: OfflineTaskStatus
  progress: number
  total_bytes: number | null
  downloaded_bytes: number
  error_message: string
  created_at?: string
  updated_at?: string
}

export function useOfflineTasks() {
  const tasks = ref<OfflineTask[]>([])
  const loading = ref(false)
  const hidden = ref(false)

  const hasTasks = computed(() => tasks.value.length > 0)
  const hasActiveTasks = computed(() => tasks.value.some((task) => task.status === 'pending' || task.status === 'running'))
  const hasFinishedTasks = computed(() => tasks.value.some((task) => ['completed', 'failed', 'cancelled'].includes(task.status)))

  async function loadTasks() {
    loading.value = true
    try {
      const res = await api.get<{ tasks: OfflineTask[] }>('/files/offline-download/tasks')
      tasks.value = res.tasks || []
    } catch {
      tasks.value = []
    } finally {
      loading.value = false
    }
  }

  async function cancelTask(taskId: number) {
    await api.post(`/files/offline-download/tasks/${taskId}/cancel`)
    await loadTasks()
  }

  async function retryTask(taskId: number) {
    await api.post(`/files/offline-download/tasks/${taskId}/retry`)
    await loadTasks()
  }

  async function clearFinishedTasks() {
    await api.post('/files/offline-download/tasks/clear-finished')
    await loadTasks()
  }

  function hidePanel() {
    hidden.value = true
  }

  function showPanel() {
    hidden.value = false
  }

  return {
    tasks,
    loading,
    hidden,
    hasTasks,
    hasActiveTasks,
    hasFinishedTasks,
    loadTasks,
    cancelTask,
    retryTask,
    clearFinishedTasks,
    hidePanel,
    showPanel
  }
}
