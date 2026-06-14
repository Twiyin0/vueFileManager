<script setup lang="ts">
import { computed } from 'vue'
import Icon from '@/components/Icon.vue'
import type { OfflineTask } from '@/composables/useOfflineTasks'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  tasks: OfflineTask[]
  loading?: boolean
  showWhenEmpty?: boolean
  title?: string
  description?: string
  showHideButton?: boolean
  canClearFinished?: boolean
}>(), {
  loading: false,
  showWhenEmpty: false,
  showHideButton: false,
  canClearFinished: false
})

const emit = defineEmits<{
  refresh: []
  cancel: [taskId: number]
  retry: [taskId: number]
  clearFinished: []
  hide: []
}>()

const shouldRender = computed(() => props.showWhenEmpty || props.tasks.length > 0)
const panelTitle = computed(() => props.title || t('offline.panelTitle', '离线下载任务'))
const panelDescription = computed(() => props.description || t('offline.panelDescription', '远程 URL 下载会在服务器端排队执行'))

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: t('offline.statusPending', '排队中'),
    running: t('offline.statusRunning', '执行中'),
    completed: t('offline.statusCompleted', '已完成'),
    failed: t('offline.statusFailed', '失败'),
    cancelled: t('offline.statusCancelled', '已取消')
  }
  return map[status] || status
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
</script>

<template>
  <div v-if="shouldRender" class="card">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold" style="color: var(--text-color)">{{ panelTitle }}</h3>
        <p class="text-xs" style="color: var(--text-secondary-color)">{{ panelDescription }}</p>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <button
          v-if="canClearFinished"
          class="btn-secondary px-3 py-1 text-xs"
          @click="emit('clearFinished')"
        >
          {{ t('offline.clearFinished', '清空已结束') }}
        </button>

        <button
          class="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
          :disabled="loading"
          @click="emit('refresh')"
        >
          <Icon name="refresh-cw" class="h-3.5 w-3.5" />
          {{ loading ? t('common.loading', '加载中...') : t('common.refresh', '刷新') }}
        </button>

        <button
          v-if="showHideButton"
          class="btn-secondary px-3 py-1 text-xs"
          @click="emit('hide')"
        >
          {{ t('common.close', '关闭') }}
        </button>
      </div>
    </div>

    <div
      v-if="tasks.length === 0"
      class="rounded-lg border px-4 py-8 text-center"
      style="border-color: var(--border-color)"
    >
      <Icon name="download" class="mx-auto mb-3 h-10 w-10" style="color: var(--text-secondary-color)" />
      <p class="text-sm font-medium" style="color: var(--text-color)">{{ t('offline.emptyTitle', '暂无离线任务') }}</p>
      <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">
        {{ t('offline.emptyDescription', '在文件管理页选择“远程上传”，切到离线模式后即可创建任务。') }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="task in tasks"
        :key="task.id"
        class="rounded-lg border p-3"
        style="border-color: var(--border-color); background-color: var(--surface-color)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="truncate text-sm font-medium" style="color: var(--text-color)">
                {{ task.file_name || task.url }}
              </span>

              <span
                class="rounded-full px-2 py-0.5 text-xs"
                :class="task.status === 'completed'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : task.status === 'failed'
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : task.status === 'cancelled'
                      ? 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-dark-text-secondary'
                      : task.status === 'running'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'"
              >
                {{ statusLabel(task.status) }}
              </span>

              <span class="text-xs font-mono" style="color: var(--text-secondary-color)">
                {{ task.pool_name }}
              </span>
            </div>

            <p class="mt-1 break-all text-xs" style="color: var(--text-secondary-color)">{{ task.url }}</p>

            <div class="mt-2 h-2 rounded-full" style="background-color: var(--hover-color)">
              <div class="h-2 rounded-full bg-blue-500 transition-all" :style="{ width: `${task.progress || 0}%` }" />
            </div>

            <div class="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs" style="color: var(--text-secondary-color)">
              <span>{{ task.progress || 0 }}%</span>
              <span>
                {{ formatBytes(task.downloaded_bytes) }} / {{ task.total_bytes ? formatBytes(task.total_bytes) : t('offline.unknownSize', '未知大小') }}
              </span>
              <span v-if="task.error_message" class="text-red-500">{{ task.error_message }}</span>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              v-if="task.status === 'pending' || task.status === 'running'"
              class="btn-secondary px-3 py-1 text-xs"
              @click="emit('cancel', task.id)"
            >
              {{ t('common.cancel', '取消') }}
            </button>

            <button
              v-if="task.status === 'failed' || task.status === 'cancelled'"
              class="btn-primary px-3 py-1 text-xs"
              @click="emit('retry', task.id)"
            >
              {{ t('offline.retry', '重试') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
