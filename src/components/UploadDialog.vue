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
        <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('upload.title', 'Upload Files') }}</h3>
        <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
          {{ t('upload.targetPath', 'Upload to: {path}').replace('{path}', currentPath || t('upload.rootPath', 'Root Directory')) }}
        </p>

        <div v-if="pools && pools.length > 0" class="mb-4">
          <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('upload.targetPool', 'Target Storage Pool') }}</label>
          <select v-model="selectedPoolId" class="input-field" :disabled="isUploadingState">
            <option :value="undefined">{{ t('upload.currentPool', 'Current Storage Pool') }}</option>
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
              ? t('upload.busyHint', 'Upload is in progress. You can close this window and keep watching progress at the bottom-right corner.')
              : t('upload.dropHint', 'Click or drag files here to upload') }}
          </p>
          <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('upload.limitHint', 'Single file size is controlled by the server upload limit') }}</p>
        </div>

        <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect" />

        <div
          v-if="pendingFiles?.length"
          class="mt-4 rounded-lg border p-3"
          style="background-color: var(--surface-color); border-color: var(--border-color)"
        >
          <div class="mb-2 text-sm font-medium" style="color: var(--text-color)">
            {{ isUploadingState ? t('upload.queue', 'Upload Queue') : t('upload.pendingFiles', 'Pending Files') }}
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
            {{ t('upload.skippedFiles', 'Skipped {count} system files automatically: {files}')
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
            {{ t('upload.start', 'Start Upload') }}
          </button>

          <button v-if="isUploadingState" class="btn-secondary text-sm" @click="emit('cancel')">
            {{ t('upload.cancel', 'Cancel Upload') }}
          </button>

          <button class="btn-secondary text-sm" @click="emit('close')">
            {{ isUploadingState ? t('upload.hideWindow', 'Hide Window') : t('common.close', 'Close') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
