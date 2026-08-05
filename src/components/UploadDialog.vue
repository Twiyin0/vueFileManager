<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
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
const clipboardNotice = ref<{ type: 'info' | 'error'; message: string } | null>(null)
let clipboardNoticeTimer: number | null = null

const effectivePoolId = computed(() => selectedPoolId.value ?? props.currentPoolId)
const isUploadingState = computed(() => props.uploadStatus === 'uploading' || props.uploadStatus === 'processing')
const supportsClipboardRead = computed(() => typeof navigator !== 'undefined' && window.isSecureContext && typeof navigator.clipboard?.read === 'function')
const pasteShortcutLabel = computed(() => {
  if (typeof navigator === 'undefined') return 'Ctrl+V'
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? 'Cmd+V' : 'Ctrl+V'
})

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

function clearClipboardNotice() {
  if (clipboardNoticeTimer !== null) {
    window.clearTimeout(clipboardNoticeTimer)
    clipboardNoticeTimer = null
  }
  clipboardNotice.value = null
}

function setClipboardNotice(message: string, type: 'info' | 'error' = 'info') {
  clearClipboardNotice()
  clipboardNotice.value = { type, message }
  clipboardNoticeTimer = window.setTimeout(() => {
    clipboardNotice.value = null
    clipboardNoticeTimer = null
  }, 4000)
}

function emitUploadFiles(files: FileList | File[]) {
  const clean = filterJunk(files)
  if (clean.length) {
    clearClipboardNotice()
    emit('upload', clean, effectivePoolId.value)
  }
}

function extractClipboardFiles(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer) return []

  const itemFiles = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file)

  if (itemFiles.length > 0) {
    return itemFiles
  }

  return Array.from(dataTransfer.files || [])
}

function generateHexId(length = 16) {
  const bytes = new Uint8Array(Math.ceil(length / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, length)
}

function inferClipboardExtension(file: Blob, originalName?: string) {
  const extensions: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav'
  }

  const normalizedName = (originalName || '').trim()
  const originalExt = normalizedName.includes('.')
    ? normalizedName.split('.').pop()?.toLowerCase()
    : ''

  return originalExt || extensions[file.type] || ''
}

function renameClipboardFile(file: File, fallbackType?: string) {
  const extension = inferClipboardExtension(file, file.name)
  const fileName = extension
    ? `${generateHexId()}.${extension}`
    : generateHexId()

  return new File([file], fileName, {
    type: file.type || fallbackType || 'application/octet-stream',
    lastModified: Date.now()
  })
}

function normalizeClipboardFiles(files: File[]) {
  return files.map((file) => renameClipboardFile(file))
}

async function readClipboardFiles() {
  if (isUploadingState.value || !supportsClipboardRead.value) return

  try {
    const items = await navigator.clipboard.read()
    const files: File[] = []

    for (const item of items) {
      const acceptedTypes = item.types.filter((type) =>
        type.startsWith('image/') ||
        type.startsWith('video/') ||
        type.startsWith('audio/') ||
        type === 'application/pdf'
      )

      for (const type of acceptedTypes) {
        const blob = await item.getType(type)
        if (!blob.size) continue
        const file = new File([blob], generateHexId(), {
          type: blob.type || type,
          lastModified: Date.now()
        })
        files.push(renameClipboardFile(file, type))
        break
      }
    }

    if (files.length === 0) {
      setClipboardNotice(t('upload.clipboardEmpty', 'No uploadable files were found in the system clipboard'))
      return
    }

    emitUploadFiles(files)
  } catch {
    setClipboardNotice(
      t('upload.clipboardReadFailed', 'Unable to read the system clipboard. You can still try {shortcut} after copying a file or screenshot')
        .replace('{shortcut}', pasteShortcutLabel.value),
      'error'
    )
  }
}

function handlePaste(event: ClipboardEvent) {
  if (!props.show || isUploadingState.value) return

  const files = extractClipboardFiles(event.clipboardData)
  if (files.length === 0) return

  event.preventDefault()
  emitUploadFiles(normalizeClipboardFiles(files))
}

function handleDrop(event: DragEvent) {
  if (isUploadingState.value) return
  isDragging.value = false
  if (event.dataTransfer?.files) {
    emitUploadFiles(event.dataTransfer.files)
  }
}

function handleFileSelect(event: Event) {
  if (isUploadingState.value) return
  const input = event.target as HTMLInputElement
  if (input.files) {
    emitUploadFiles(input.files)
  }
}

function openFilePicker() {
  if (isUploadingState.value) return
  fileInput.value?.click()
}

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('paste', handlePaste)
      clearClipboardNotice()
      return
    }

    window.removeEventListener('paste', handlePaste)
    clearClipboardNotice()
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste)
  clearClipboardNotice()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay">
      <div class="dialog-backdrop" @click="emit('close')" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-lg">
        <div class="dialog-section">
        <h3 class="dialog-title mb-2">{{ t('upload.title', 'Upload Files') }}</h3>
        <p class="dialog-description mb-4">
          {{ t('upload.targetPath', 'Upload to: {path}').replace('{path}', currentPath || t('upload.rootPath', 'Root Directory')) }}
        </p>

        <div v-if="pools && pools.length > 0" class="mb-4">
          <label class="dialog-form-label">{{ t('upload.targetPool', 'Target Storage Pool') }}</label>
          <select v-model="selectedPoolId" class="input-field" :disabled="isUploadingState">
            <option :value="undefined">{{ t('upload.currentPool', 'Current Storage Pool') }}</option>
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">
              {{ pool.name }}
            </option>
          </select>
        </div>

        <div
          class="dialog-muted-block-strong rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
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
          <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">
            {{ t('upload.clipboardHint', 'While this window is open, press {shortcut} to upload files or screenshots from the system clipboard')
              .replace('{shortcut}', pasteShortcutLabel) }}
          </p>
          <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('upload.limitHint', 'Single file size is controlled by the server upload limit') }}</p>
          <button
            v-if="supportsClipboardRead && !isUploadingState"
            class="btn-secondary mt-4 text-xs"
            @click.stop="readClipboardFiles"
          >
            {{ t('upload.readClipboard', 'Read Clipboard') }}
          </button>
        </div>

        <input ref="fileInput" type="file" multiple class="hidden" @change="handleFileSelect" />

        <div
          v-if="pendingFiles?.length"
          class="dialog-muted-block-strong mt-4"
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
          class="mt-4 rounded-xl px-3 py-2 text-sm"
          style="background: rgba(239,68,68,0.12); color: #dc2626"
        >
          {{ uploadError }}
        </div>

        <div
          v-if="skippedFiles.length"
          class="mt-3 rounded-xl px-3 py-2 text-xs"
          style="background: rgba(245,158,11,0.12); color: #d97706"
        >
          <span class="flex items-center gap-1">
            <Icon name="triangle-exclamation" class="h-3.5 w-3.5 flex-shrink-0" />
            {{ t('upload.skippedFiles', 'Skipped {count} system files automatically: {files}')
              .replace('{count}', String(skippedFiles.length))
              .replace('{files}', skippedFiles.join(', ')) }}
          </span>
        </div>

        <div
          v-if="clipboardNotice"
          class="mt-3 rounded-xl px-3 py-2 text-xs"
          :style="clipboardNotice.type === 'error'
            ? 'background: rgba(239,68,68,0.12); color: #dc2626'
            : 'background: rgba(59,130,246,0.12); color: #2563eb'"
        >
          <span class="flex items-center gap-1">
            <Icon :name="clipboardNotice.type === 'error' ? 'triangle-exclamation' : 'clipboard'" class="h-3.5 w-3.5 flex-shrink-0" />
            {{ clipboardNotice.message }}
          </span>
        </div>

        <div class="dialog-footer mt-4">
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
    </div>
  </Teleport>
</template>
