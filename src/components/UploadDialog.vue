<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  currentPath: string
  pools?: { id: number; name: string }[]
  currentPoolId?: number
  pendingFiles?: File[]
  uploading?: boolean
  uploadProgress?: { file: string; percent: number; status?: string; error?: string }[]
  uploadStatus?: string
  uploadError?: string
}>()

const emit = defineEmits<{
  close: []
  upload: [files: FileList | File[], poolId?: number]
  cancel: []
}>()

const { t } = useI18n()
const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedPoolId = ref<number | undefined>(undefined)
const skippedFiles = ref<string[]>([])

const effectivePoolId = computed(() => selectedPoolId.value ?? props.currentPoolId)
const isUploadingState = computed(() => props.uploadStatus === 'uploading' || props.uploadStatus === 'processing')

function filterJunk(files: FileList | File[]): File[] {
  const junkPatterns = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//]
  const keep: File[] = []
  const skipped: string[] = []

  for (const file of files) {
    if (junkPatterns.some((pattern) => pattern.test(file.name))) skipped.push(file.name)
    else keep.push(file)
  }

  skippedFiles.value = skipped
  if (skipped.length) {
    setTimeout(() => {
      skippedFiles.value = []
    }, 4000)
  }

  return keep
}

function handleDrop(event: DragEvent) {
  if (isUploadingState.value) return
  isDragging.value = false
  if (event.dataTransfer?.files) {
    const clean = filterJunk(event.dataTransfer.files)
    if (clean.length) emit('upload', clean, effectivePoolId.value)
  }
}

function handleFileSelect(event: Event) {
  if (isUploadingState.value) return
  const input = event.target as HTMLInputElement
  if (input.files) {
    const clean = filterJunk(input.files)
    if (clean.length) emit('upload', clean, effectivePoolId.value)
  }
}

function openFilePicker() {
  if (isUploadingState.value) return
  fileInput.value?.click()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')" />
      <div class="relative card max-h-[90vh] w-full max-w-lg overflow-y-auto" style="padding: 1.5rem">
        <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('upload.title', '上传文件') }}</h3>
        <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
          {{ t('upload.targetPath', '上传到：{path}').replace('{path}', currentPath || t('upload.rootPath', '根目录')) }}
        </p>

        <div v-if="pools && pools.length > 0" class="mb-4">
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('upload.targetPool', '目标存储池') }}</label>
          <select v-model="selectedPoolId" class="input-field" :disabled="isUploadingState">
            <option :value="undefined">{{ t('upload.currentPool', '当前存储池') }}</option>
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">
              {{ pool.name }}
            </option>
          </select>
        </div>

        <div
          class="rounded-xl border-2 border-dashed p-8 text-center transition-colors"
          :class="isUploadingState ? 'cursor-default opacity-70' : 'cursor-pointer'"
          :style="isDragging
            ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color)'
            : 'border-color: var(--border-color)'"
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
          @click="openFilePicker"
        >
          <Icon name="upload" class="mx-auto mb-3 h-12 w-12" style="color: var(--text-secondary-color)" />
          <p class="text-sm" style="color: var(--text-color)">
            {{ isUploadingState
              ? t('upload.busyHint', '上传任务进行中，可关闭此窗口，右下角会继续显示进度')
              : t('upload.dropHint', '点击或拖拽文件到此处上传') }}
          </p>
          <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('upload.limitHint', '单文件大小受服务端上传限制控制') }}</p>
        </div>

        <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect" />

        <div
          v-if="pendingFiles?.length"
          class="mt-4 rounded-lg border p-3"
          style="background-color: var(--surface-color); border-color: var(--border-color)"
        >
          <div class="mb-2 text-sm font-medium" style="color: var(--text-color)">
            {{ isUploadingState ? t('upload.queue', '上传队列') : t('upload.pendingFiles', '待上传文件') }}
          </div>
          <div v-for="(file, index) in pendingFiles" :key="index" class="mb-2 flex items-center justify-between text-xs last:mb-0">
            <span class="max-w-[260px] truncate" style="color: var(--text-color)">{{ file.name }}</span>
            <span style="color: var(--text-secondary-color)">{{ Math.max(1, Math.round(file.size / 1024)) }} KB</span>
          </div>
        </div>

        <div
          v-if="uploadError"
          class="mt-4 rounded-lg px-3 py-2 text-sm"
          style="background: rgba(239,68,68,0.12); color: #dc2626"
        >
          {{ uploadError }}
        </div>

        <div
          v-if="skippedFiles.length"
          class="mt-3 rounded-lg px-3 py-2 text-xs"
          style="background: rgba(245,158,11,0.12); color: #d97706"
        >
          <span class="flex items-center gap-1">
            <Icon name="triangle-exclamation" class="h-3.5 w-3.5 flex-shrink-0" />
            {{ t('upload.skippedFiles', '已自动跳过 {count} 个系统文件：{files}')
              .replace('{count}', String(skippedFiles.length))
              .replace('{files}', skippedFiles.join(', ')) }}
          </span>
        </div>

        <div class="mt-4 flex justify-end gap-3">
          <button
            v-if="!isUploadingState && pendingFiles?.length"
            class="btn-primary text-sm"
            @click="emit('upload', pendingFiles, effectivePoolId)"
          >
            {{ t('upload.start', '开始上传') }}
          </button>

          <button v-if="isUploadingState" class="btn-secondary text-sm" @click="emit('cancel')">
            {{ t('upload.cancel', '取消上传') }}
          </button>

          <button class="btn-secondary text-sm" @click="emit('close')">
            {{ isUploadingState ? t('upload.hideWindow', '隐藏窗口') : t('common.close', '关闭') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
