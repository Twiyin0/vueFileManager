<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  token?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const previewUrl = computed(() => {
  if (!props.filePath) return ''
  const base = '/api/files/preview'
  const params = new URLSearchParams({ path: props.filePath })
  return `${base}?${params.toString()}`
})

const fileType = computed(() => {
  const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['txt', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'py', 'java', 'go', 'rs', 'vue', 'sh', 'sql', 'toml', 'ini', 'cfg', 'log', 'env', 'gitignore', 'dockerfile'].includes(ext)) return 'text'
  return 'unknown'
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/70 dark:bg-black/80" @click="emit('close')"/>

      <!-- 预览容器 -->
      <div class="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl overflow-hidden" style="background-color: var(--surface-color)">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-4 py-3 border-b" style="border-color: var(--border-color)">
          <h3 class="font-medium truncate flex-1 mr-4" style="color: var(--text-color)">{{ fileName }}</h3>
          <div class="flex items-center gap-2">
            <a
              :href="previewUrl"
              :download="fileName"
              class="p-2 rounded-lg hover:opacity-80 transition-colors"
              title="下载"
            >
              <svg class="w-5 h-5" style="color: var(--text-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </a>
            <button
              @click="emit('close')"
              class="p-2 rounded-lg hover:opacity-80 transition-colors"
            >
              <svg class="w-5 h-5" style="color: var(--text-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- 内容区 -->
        <div class="flex-1 overflow-auto p-4">
          <!-- 图片 -->
          <div v-if="fileType === 'image'" class="flex items-center justify-center">
            <img :src="previewUrl" :alt="fileName" class="max-w-full max-h-[75vh] object-contain rounded-lg" />
          </div>

          <!-- 视频 -->
          <div v-else-if="fileType === 'video'" class="flex items-center justify-center">
            <video controls class="max-w-full max-h-[75vh] rounded-lg">
              <source :src="previewUrl" />
              您的浏览器不支持视频播放
            </video>
          </div>

          <!-- 音频 -->
          <div v-else-if="fileType === 'audio'" class="flex flex-col items-center justify-center py-12">
            <svg class="w-24 h-24 mb-6" style="color: var(--border-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
            </svg>
            <audio controls class="w-full max-w-md">
              <source :src="previewUrl" />
              您的浏览器不支持音频播放
            </audio>
          </div>

          <!-- PDF -->
          <div v-else-if="fileType === 'pdf'" class="flex items-center justify-center">
            <iframe :src="previewUrl" class="w-full h-[75vh] rounded-lg border-0" />
          </div>

          <!-- 文本/代码 -->
          <div v-else-if="fileType === 'text' || fileType === 'markdown'" class="flex items-center justify-center">
            <iframe :src="previewUrl" class="w-full h-[75vh] rounded-lg border" style="border-color: var(--border-color); background-color: var(--surface-color)" />
          </div>

          <!-- 不支持预览 -->
          <div v-else class="flex flex-col items-center justify-center py-20" style="color: var(--text-secondary-color)">
            <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
            <p class="text-lg">不支持预览此文件类型</p>
            <a :href="previewUrl" :download="fileName" class="btn-primary mt-4 text-sm">下载文件</a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
