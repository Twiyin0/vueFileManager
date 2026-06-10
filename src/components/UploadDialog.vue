<script setup lang="ts">
import { ref, computed } from 'vue'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  show: boolean
  currentPath: string
  pools?: { id: number; name: string }[]
  currentPoolId?: number
  pendingFiles?: File[]
  uploading?: boolean
  uploadProgress?: { file: string; percent: number }[]
  uploadStatus?: string
  uploadError?: string
}>()

const emit = defineEmits<{
  close: []
  upload: [files: FileList, poolId?: number]
  cancel: []
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedPoolId = ref<number | undefined>(undefined)
const skippedFiles = ref<string[]>([])

// 初始化选中的存储池
const effectivePoolId = computed(() => selectedPoolId.value ?? props.currentPoolId)
const isUploadingState = computed(() => props.uploadStatus === 'uploading' || props.uploadStatus === 'processing')
const statusText = computed(() => {
  if (props.uploadStatus === 'cancelled') return '已取消'
  if (props.uploadStatus === 'processing') return '服务器处理中'
  if (props.uploadStatus === 'completed') return '已完成'
  return ''
})

/** 过滤 macOS 资源叉文件（._开头）、.DS_Store 等系统垃圾文件 */
function filterJunk(files: FileList | File[]): File[] {
  const junkPatterns = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//]
  const keep: File[] = []
  const skipped: string[] = []
  for (const f of files) {
    if (junkPatterns.some(p => p.test(f.name))) {
      skipped.push(f.name)
    } else {
      keep.push(f)
    }
  }
  skippedFiles.value = skipped
  if (skipped.length) setTimeout(() => { skippedFiles.value = [] }, 4000)
  return keep
}

function handleDrop(e: DragEvent) {
  if (isUploadingState.value) return
  isDragging.value = false
  if (e.dataTransfer?.files) {
    const clean = filterJunk(e.dataTransfer.files)
    if (clean.length) {
      emit('upload', clean as unknown as FileList, effectivePoolId.value)
    }
  }
}

function handleFileSelect(e: Event) {
  if (isUploadingState.value) return
  const input = e.target as HTMLInputElement
  if (input.files) {
    const clean = filterJunk(input.files)
    if (clean.length) {
      emit('upload', clean as unknown as FileList, effectivePoolId.value)
    }
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
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="!isUploadingState && emit('close')"/>
      <div class="relative card w-full max-w-lg max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">上传文件</h3>
        <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
          上传到：{{ currentPath || '根目录' }}
        </p>

        <!-- 存储池选择 -->
        <div v-if="pools && pools.length > 0" class="mb-4">
          <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">目标存储池</label>
          <select
            v-model="selectedPoolId"
            class="input-field"
            :disabled="isUploadingState"
          >
            <option :value="undefined">当前存储池</option>
            <option v-for="pool in pools" :key="pool.id" :value="pool.id">
              {{ pool.name }}
            </option>
          </select>
        </div>

        <!-- 拖拽区域 -->
        <div
          @dragover.prevent="isDragging = true"
          @dragleave="isDragging = false"
          @drop.prevent="handleDrop"
          @click="openFilePicker"
          class="border-2 border-dashed rounded-xl p-8 text-center transition-colors"
          :class="isUploadingState ? 'cursor-default opacity-70' : 'cursor-pointer'"
          :style="isDragging
            ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color)'
            : 'border-color: var(--border-color)'"
        >
          <Icon name="upload" class="w-12 h-12 mx-auto mb-3" style="color: var(--text-secondary-color)" />
          <p class="text-sm" style="color: var(--text-color)">
            {{ isUploadingState ? '上传进行中…' : '点击或拖拽文件到此处上传' }}
          </p>
          <p class="text-xs mt-1" style="color: var(--text-secondary-color)">最大 100MB</p>
        </div>

        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="handleFileSelect"
        />

        <div v-if="!isUploadingState && pendingFiles?.length" class="mt-4 p-3 rounded-lg border"
          style="background-color: var(--surface-color); border-color: var(--border-color)">
          <div class="text-sm font-medium mb-2" style="color: var(--text-color)">待上传文件</div>
          <div v-for="(file, index) in pendingFiles" :key="index" class="flex items-center justify-between text-xs mb-2 last:mb-0">
            <span class="truncate max-w-[260px]" style="color: var(--text-color)">{{ file.name }}</span>
            <span style="color: var(--text-secondary-color)">{{ Math.max(1, Math.round(file.size / 1024)) }} KB</span>
          </div>
        </div>

        <div v-if="isUploadingState && uploadProgress?.length" class="mt-4 p-3 rounded-lg border"
          style="background-color: var(--surface-color); border-color: var(--border-color)">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="text-sm font-medium" style="color: var(--text-color)">
              上传进度
              <span v-if="statusText" class="ml-2 text-xs" :class="uploadStatus === 'cancelled' ? 'text-red-500' : 'text-amber-500'">{{ statusText }}</span>
            </div>
            <button v-if="uploadStatus === 'uploading'" @click="emit('cancel')" class="btn-secondary text-xs px-3 py-1">
              取消上传
            </button>
          </div>
          <div v-for="(item, index) in uploadProgress" :key="index" class="mb-3 last:mb-0">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="truncate max-w-[220px]" style="color: var(--text-color)">{{ item.file }}</span>
              <span class="flex-shrink-0 ml-2" style="color: var(--text-secondary-color)">
                {{ uploadStatus === 'processing' && item.percent >= 100 ? '处理中' : `${item.percent}%` }}
              </span>
            </div>
            <div class="w-full rounded-full h-2" style="background-color: var(--hover-color)">
              <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" :style="{ width: item.percent + '%' }"></div>
            </div>
          </div>
        </div>

        <div v-if="uploadError" class="mt-4 px-3 py-2 rounded-lg text-sm"
          style="background: rgba(239,68,68,0.12); color: #dc2626">
          {{ uploadError }}
        </div>

        <!-- macOS 系统文件拦截提示 -->
        <div v-if="skippedFiles.length" class="mt-3 px-3 py-2 rounded-lg text-xs" style="background: rgba(245,158,11,0.12); color: #d97706">
          <span class="flex items-center gap-1"><Icon name="triangle-exclamation" class="w-3.5 h-3.5 flex-shrink-0" /> 已自动跳过 {{ skippedFiles.length }} 个系统文件：{{ skippedFiles.join(', ') }}</span>
        </div>

        <div class="flex justify-end mt-4">
          <button v-if="!isUploadingState && pendingFiles?.length" @click="emit('upload', pendingFiles as unknown as FileList, effectivePoolId)" class="btn-primary text-sm mr-3">
            开始上传
          </button>
          <button v-if="!isUploadingState" @click="emit('close')" class="btn-secondary text-sm">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
