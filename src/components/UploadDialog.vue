<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  show: boolean
  currentPath: string
}>()

const emit = defineEmits<{
  close: []
  upload: [files: FileList]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function handleDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) {
    emit('upload', e.dataTransfer.files)
    emit('close')
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    emit('upload', input.files)
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
      <div class="relative card w-full max-w-lg" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">上传文件</h3>
        <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
          上传到：{{ currentPath || '根目录' }}
        </p>

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
          <svg class="w-12 h-12 mx-auto mb-3" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
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

        <div class="flex justify-end mt-4">
          <button @click="emit('close')" class="btn-secondary text-sm">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
