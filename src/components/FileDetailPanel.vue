<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
  item: any | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'favourite', item: any): void
}>()

const icon = computed(() => {
  if (!props.item) return '📄'
  if (props.item.type === 'folder') return '📁'
  const ext = props.item.name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, string> = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    mp4: '🎬', webm: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    js: '📜', ts: '📜', py: '📜', java: '📜', go: '📜', rs: '📜',
    html: '🌐', css: '🎨', json: '📋', xml: '📋', yaml: '📋',
    txt: '📝', md: '📝', log: '📝',
    vue: '💚', sh: '⚙️',
  }
  return iconMap[ext] || '📄'
})

function formatSize(bytes: number) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const fileExt = computed(() => {
  if (!props.item || props.item.type === 'folder') return '-'
  return props.item.name.split('.').pop()?.toUpperCase() || '-'
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible && item"
      class="fixed right-0 top-0 h-full w-80 shadow-2xl z-50 border-l dark:border-dark-border border-light-border flex flex-col"
      style="background-color: var(--card-color)">
      <!-- 头部 -->
      <div class="flex items-center justify-between px-4 py-3 border-b dark:border-dark-border border-light-border">
        <h3 class="font-semibold text-sm dark:text-dark-text text-light-text">文件详情</h3>
        <button @click="emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 内容 -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- 图标和名称 -->
        <div class="text-center py-4">
          <div class="text-5xl mb-3">{{ icon }}</div>
          <p class="font-medium dark:text-dark-text text-light-text break-all">{{ item.name }}</p>
        </div>

        <!-- 信息列表 -->
        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">类型</span>
            <span class="dark:text-dark-text text-light-text">{{ item.type === 'folder' ? '文件夹' : fileExt }}</span>
          </div>
          <div v-if="item.type === 'file'" class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">大小</span>
            <span class="dark:text-dark-text text-light-text">{{ formatSize(item.size) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">修改时间</span>
            <span class="dark:text-dark-text text-light-text">{{ formatDate(item.modified) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">路径</span>
            <span class="dark:text-dark-text text-light-text text-right break-all max-w-[180px]">{{ item.path }}</span>
          </div>
        </div>
      </div>

      <!-- 底部操作 -->
      <div class="p-4 border-t dark:border-dark-border border-light-border flex gap-2">
        <button @click="emit('favourite', item)" class="btn-secondary flex-1 text-sm">⭐ 收藏</button>
      </div>
    </div>
  </Teleport>
</template>
