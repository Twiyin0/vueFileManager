<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  show: boolean
  collapsed: boolean
  uploadStatus: string
  uploadStatusLabel: string
  uploadProgress: Array<{ file: string; percent: number; status?: string; error?: string }>
  uploadSummary: { total: number; completed: number; failed: number; cancelled: number; uploading: number }
  uploadActiveCount: number
}>()

const emit = defineEmits<{
  close: []
  toggle: []
  cancel: []
}>()

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl border shadow-sm"
      style="background-color: var(--card-color); border-color: var(--border-color)"
    >
      <div class="flex items-center justify-between gap-3 border-b px-4 py-3" style="border-color: var(--border-color); background-color: var(--surface-color)">
        <h4 class="text-sm font-semibold" style="color: var(--text-color)">
          {{ t('upload.progressTitle', '上传进度') }}
          <span v-if="uploadStatusLabel" class="ml-2 text-xs" :class="uploadStatus === 'cancelled' ? 'text-red-500' : 'text-amber-500'">
            {{ uploadStatusLabel }}
          </span>
        </h4>

        <div class="flex items-center gap-1.5">
          <button
            v-if="uploadStatus === 'uploading' || uploadStatus === 'processing'"
            class="btn-secondary px-3 py-1 text-xs"
            @click="emit('cancel')"
          >
            {{ t('upload.cancel', '取消上传') }}
          </button>
          <button
            class="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            style="color: var(--text-secondary-color)"
            @click="emit('toggle')"
          >
            <Icon :name="collapsed ? 'chevron-up' : 'chevron-down'" class="h-4 w-4" />
          </button>
          <button
            class="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            style="color: var(--text-secondary-color)"
            @click="emit('close')"
          >
            <Icon name="xmark" class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div v-if="collapsed" class="flex items-center justify-between gap-3 px-4 py-3 text-xs" style="color: var(--text-secondary-color)">
        <span>
          {{ t('upload.summaryCollapsed', '共 {total} 个，完成 {completed}，失败 {failed}，进行中 {active}')
            .replace('{total}', String(uploadSummary.total))
            .replace('{completed}', String(uploadSummary.completed))
            .replace('{failed}', String(uploadSummary.failed))
            .replace('{active}', String(uploadActiveCount)) }}
        </span>
        <button
          v-if="uploadStatus === 'uploading' || uploadStatus === 'processing'"
          class="btn-secondary px-2 py-1 text-xs"
          @click="emit('cancel')"
        >
          {{ t('upload.cancel', '取消上传') }}
        </button>
      </div>

      <div v-else class="max-h-[40vh] overflow-y-auto p-4">
        <div class="mb-3 flex items-center justify-between gap-3 text-xs" style="color: var(--text-secondary-color)">
          <span>
            {{ t('upload.summaryExpanded', '共 {total} 个，完成 {completed}，失败 {failed}，取消 {cancelled}')
              .replace('{total}', String(uploadSummary.total))
              .replace('{completed}', String(uploadSummary.completed))
              .replace('{failed}', String(uploadSummary.failed))
              .replace('{cancelled}', String(uploadSummary.cancelled)) }}
          </span>
          <span>{{ t('upload.concurrentCount', '并发中 {count}').replace('{count}', String(uploadActiveCount)) }}</span>
        </div>

        <div v-for="(item, index) in uploadProgress" :key="index" class="mb-3 last:mb-0">
          <div class="mb-1 flex items-center justify-between text-xs">
            <span class="max-w-[220px] truncate" style="color: var(--text-color)">{{ item.file }}</span>
            <span class="ml-2 flex-shrink-0" style="color: var(--text-secondary-color)">
              {{
                item.status === 'completed' ? t('upload.statusCompleted', '已完成')
                  : item.status === 'processing' ? t('upload.statusProcessing', '处理中')
                  : item.status === 'cancelled' ? t('upload.statusCancelled', '已取消')
                  : item.status === 'error' ? t('upload.statusFailed', '失败')
                  : `${item.percent}%`
              }}
            </span>
          </div>
          <div class="h-2 w-full rounded-full" style="background-color: var(--hover-color)">
            <div class="h-2 rounded-full bg-blue-500 transition-all duration-300" :style="{ width: item.percent + '%' }"></div>
          </div>
          <div v-if="item.error" class="mt-1 truncate text-[11px] text-red-500">{{ item.error }}</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
