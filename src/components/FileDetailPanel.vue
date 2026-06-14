<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  visible: boolean
  item: any | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'favourite', item: any): void
}>()

const { t, language } = useI18n()

const fileIconMap: Record<string, { icon: string; color: string }> = {
  folder: { icon: 'folder', color: 'text-blue-500' },
  image: { icon: 'image', color: 'text-green-500' },
  video: { icon: 'video', color: 'text-purple-500' },
  audio: { icon: 'music', color: 'text-pink-500' },
  pdf: { icon: 'file-alt', color: 'text-red-500' },
  archive: { icon: 'box-archive', color: 'text-yellow-500' },
  code: { icon: 'code', color: 'text-cyan-500' },
  text: { icon: 'text', color: 'text-gray-500' },
  file: { icon: 'file-alt', color: 'text-gray-400' }
}

const iconInfo = computed(() => {
  if (!props.item) return fileIconMap.file
  if (props.item.type === 'folder') return fileIconMap.folder

  const ext = props.item.name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext)) return fileIconMap.image
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext)) return fileIconMap.video
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return fileIconMap.audio
  if (['pdf'].includes(ext)) return fileIconMap.pdf
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return fileIconMap.archive
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return fileIconMap.code
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return fileIconMap.text
  return fileIconMap.file
})

const fileExt = computed(() => {
  if (!props.item || props.item.type === 'folder') return '-'
  return props.item.name.split('.').pop()?.toUpperCase() || '-'
})

function formatSize(bytes: number) {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(date: string) {
  if (!date) return '-'
  return new Date(date).toLocaleString(language.value)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && item"
      class="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l shadow-sm dark:border-dark-border border-light-border"
      style="background-color: var(--card-color)"
    >
      <div class="flex items-center justify-between border-b px-4 py-3 dark:border-dark-border border-light-border">
        <h3 class="text-sm font-semibold dark:text-dark-text text-light-text">{{ t('fileDetail.title', 'File Details') }}</h3>
        <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="emit('close')">
          <Icon name="xmark" class="h-5 w-5" />
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-4">
        <div class="py-4 text-center">
          <Icon :name="iconInfo.icon" :class="['mb-3 h-14 w-14', iconInfo.color]" />
          <p class="break-all font-medium dark:text-dark-text text-light-text">{{ item.name }}</p>
        </div>

        <div class="space-y-3">
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('fileDetail.type', 'Type') }}</span>
            <span class="dark:text-dark-text text-light-text">
              {{ item.type === 'folder' ? t('fileDetail.folderType', 'Folder') : fileExt }}
            </span>
          </div>
          <div v-if="item.type === 'file'" class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('fileDetail.size', 'Size') }}</span>
            <span class="dark:text-dark-text text-light-text">{{ formatSize(item.size) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('fileDetail.modified', 'Modified') }}</span>
            <span class="dark:text-dark-text text-light-text">{{ formatDate(item.modified) }}</span>
          </div>
          <div class="flex justify-between text-sm">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('fileDetail.path', 'Path') }}</span>
            <span class="max-w-[180px] break-all text-right dark:text-dark-text text-light-text">{{ item.path }}</span>
          </div>
        </div>
      </div>

      <div class="flex gap-2 border-t p-4 dark:border-dark-border border-light-border">
        <button class="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-sm" @click="emit('favourite', item)">
          <Icon name="star-sharp" class="h-4 w-4 text-yellow-500" />
          {{ t('fileDetail.addFavourite', 'Add to Favourites') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>
