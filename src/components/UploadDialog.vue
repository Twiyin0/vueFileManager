<script setup lang="ts">
import { ref, computed } from 'vue'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  show: boolean
  currentPath: string
  pools?: { id: number; name: string }[]
  currentPoolId?: number
}>()

const emit = defineEmits<{
  close: []
  upload: [files: FileList, poolId?: number]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedPoolId = ref<number | undefined>(undefined)
const skippedFiles = ref<string[]>([])

// 初始化选中的存储池
const effectivePoolId = computed(() => selectedPoolId.value ?? props.currentPoolId)

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
  isDragging.value = false
  if (e.dataTransfer?.files) {
    const clean = filterJunk(e.dataTransfer.files)
    if (clean.length) {
      // Create a new FileList-like array and emit
      emit('upload', clean as unknown as FileList, effectivePoolId.value)
    }
    emit('close')
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    const clean = filterJunk(input.files)
    if (clean.length) {
      emit('upload', clean as unknown as FileList, effectivePoolId.value)
    }
    emit('close')
  }
}

function openFilePicker() {
  fileInput.value?.click()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')"/>
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
          class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
          :style="isDragging
            ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color)'
            : 'border-color: var(--border-color)'"
        >
          <Icon name="upload" class="w-12 h-12 mx-auto mb-3" style="color: var(--text-secondary-color)" />
          <p class="text-sm" style="color: var(--text-color)">点击或拖拽文件到此处上传</p>
          <p class="text-xs mt-1" style="color: var(--text-secondary-color)">最大 100MB</p>
        </div>

        <input
          ref="fileInput"
          type="file"
          multiple
          class="hidden"
          @change="handleFileSelect"
        />

        <!-- macOS 系统文件拦截提示 -->
        <div v-if="skippedFiles.length" class="mt-3 px-3 py-2 rounded-lg text-xs" style="background: rgba(245,158,11,0.12); color: #d97706">
          ⚠ 已自动跳过 {{ skippedFiles.length }} 个系统文件：{{ skippedFiles.join(', ') }}
        </div>

        <div class="flex justify-end mt-4">
          <button @click="emit('close')" class="btn-secondary text-sm">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
