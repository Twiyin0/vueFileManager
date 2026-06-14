<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import OfflineTasksPanel from '@/components/OfflineTasksPanel.vue'
import { useOfflineTasks } from '@/composables/useOfflineTasks'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const {
  tasks,
  loading,
  hasActiveTasks,
  hasFinishedTasks,
  loadTasks,
  cancelTask,
  retryTask,
  clearFinishedTasks
} = useOfflineTasks()

let refreshTimer: number | null = null

function startPolling() {
  if (refreshTimer !== null) return
  refreshTimer = window.setInterval(() => {
    loadTasks().catch(() => {})
  }, 5000)
}

function stopPolling() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
}

watch(hasActiveTasks, (active) => {
  if (active) {
    startPolling()
  } else {
    stopPolling()
  }
}, { immediate: true })

useKeepAliveRefresh(loadTasks)

onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <div class="space-y-4 px-4 pt-4">
    <div class="card">
      <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('offline.pageTitle', '后台离线任务') }}</h2>
      <p class="text-sm" style="color: var(--text-secondary-color)">
        {{ t('offline.pageDescription', '这里集中展示服务器端的远程下载队列。任务执行中会自动轮询刷新，失败后可以直接重试。') }}
      </p>
    </div>

    <OfflineTasksPanel
      :tasks="tasks"
      :loading="loading"
      :show-when-empty="true"
      :can-clear-finished="hasFinishedTasks"
      @refresh="loadTasks"
      @cancel="cancelTask"
      @retry="retryTask"
      @clear-finished="clearFinishedTasks"
    />
  </div>
</template>
