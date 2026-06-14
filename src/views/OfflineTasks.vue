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
      <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('offline.pageTitle', 'Background Offline Tasks') }}</h2>
      <p class="text-sm" style="color: var(--text-secondary-color)">
        {{ t('offline.pageDescription', 'This page shows the server-side remote download queue. Active tasks refresh automatically, and failed tasks can be retried directly.') }}
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
