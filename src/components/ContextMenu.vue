<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  item?: any
  selectedItems?: any[]
  clipboardCount?: number
  readOnly?: boolean
  allowedActions?: string[]
  showRemoteUploadAction?: boolean
  showUnmountAction?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string, item?: any): void
}>()

const { t } = useI18n()
const menuRef = ref<HTMLElement>()

const menuStyle = computed(() => {
  const maxHeight = window.innerHeight * 0.7
  let top = props.y
  if (top + maxHeight > window.innerHeight) {
    top = Math.max(8, window.innerHeight - maxHeight - 8)
  }
  return { left: `${props.x}px`, top: `${top}px` }
})

function handleClickOutside(event: Event) {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close')
  }
}

function handleAction(action: string) {
  emit('action', action, props.item)
  emit('close')
}

function isAllowed(action: string): boolean {
  if (!props.allowedActions) return true
  return props.allowedActions.includes(action)
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('touchstart', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('touchstart', handleClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="fixed z-50 min-w-[180px] max-h-[70vh] overflow-y-auto rounded-lg border border-light-border bg-white py-1 shadow-sm dark:border-dark-border dark:bg-dark-card"
      :style="menuStyle"
    >
      <template v-if="item">
        <button
          v-if="item.type === 'folder'"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('open')"
        >
          <Icon name="folder" class="h-4 w-4 text-blue-500" />
          {{ t('file.open', 'Open') }}
        </button>

        <button
          v-if="item.type === 'file' && isAllowed('preview')"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('preview')"
        >
          <Icon name="eye" class="h-4 w-4" />
          {{ t('file.preview', 'Preview') }}
        </button>

        <button
          v-if="isAllowed('download')"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('download')"
        >
          <Icon name="download" class="h-4 w-4" />
          {{ t('file.download', 'Download') }}
        </button>

        <template v-if="!readOnly">
          <div class="my-1 border-t border-light-border dark:border-dark-border"></div>

          <button
            v-if="isAllowed('rename')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('rename')"
          >
            <Icon name="pen" class="h-4 w-4" />
            {{ t('file.rename', 'Rename') }}
          </button>

          <button
            v-if="isAllowed('move')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('move')"
          >
            <Icon name="arrow-narrow-right-move" class="h-4 w-4" />
            {{ t('file.moveTo', 'Move to') }}
          </button>

          <button
            v-if="isAllowed('copy')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('copy')"
          >
            <Icon name="clipboard" class="h-4 w-4" />
            {{ t('file.copy', 'Copy') }}
          </button>

          <button
            v-if="isAllowed('share')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('share')"
          >
            <Icon name="link-alt" class="h-4 w-4" />
            {{ t('file.share', 'Share') }}
          </button>

          <button
            v-if="isAllowed('favourite')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('favourite')"
          >
            <Icon name="star-sharp" class="h-4 w-4 text-yellow-500" />
            {{ t('file.favourite', 'Favourite') }}
          </button>

          <button
            v-if="item.type === 'folder' && isAllowed('guest-share')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('guest-share')"
          >
            <Icon name="globe" class="h-4 w-4" />
            {{ t('file.shareToGuest', 'Share to Guest') }}
          </button>

          <button
            v-if="item.type === 'folder' && isAllowed('share-mount')"
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('share-mount')"
          >
            <Icon name="hard-drive" class="h-4 w-4" />
            {{ t('shareMount.menu', 'Cross-Pool Mount') }}
          </button>
        </template>

        <button
          v-if="props.showUnmountAction && item.type === 'folder' && isAllowed('unmount')"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          @click="handleAction('unmount')"
        >
          <Icon name="hard-drive" class="h-4 w-4" />
          {{ t('shareMount.unmount', 'Unmount') }}
        </button>

        <div class="my-1 border-t border-light-border dark:border-dark-border"></div>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('info')"
        >
          <Icon name="circle-information" class="h-4 w-4" />
          {{ t('file.details', 'Details') }}
        </button>

        <button
          v-if="!readOnly && isAllowed('delete')"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          @click="handleAction('delete')"
        >
          <Icon name="trash" class="h-4 w-4" />
          {{ t('common.delete', 'Delete') }}
        </button>

        <template v-if="selectedItems && selectedItems.length > 0">
          <div class="my-1 border-t border-light-border dark:border-dark-border"></div>
          <div class="px-4 py-1.5 text-xs" style="color: var(--text-secondary-color)">
            {{ t('file.batchActions', 'Batch Actions') }} ({{ selectedItems.length }})
          </div>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('batch-copy')"
          >
            <Icon name="clipboard" class="h-4 w-4" />
            {{ t('file.batchCopy', 'Batch Copy') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('batch-move')"
          >
            <Icon name="arrow-narrow-right-move" class="h-4 w-4" />
            {{ t('file.batchMove', 'Batch Move') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('batch-share-mount')"
          >
            <Icon name="hard-drive" class="h-4 w-4" />
            {{ t('shareMount.batchMenu', 'Batch Cross-Pool Mount') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('batch-download')"
          >
            <Icon name="download" class="h-4 w-4" />
            {{ t('file.batchDirectDownload', 'Batch Download') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('batch-zip-download')"
          >
            <Icon name="box-archive" class="h-4 w-4" />
            {{ t('file.batchZipDownload', 'Download as ZIP') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            @click="handleAction('batch-delete')"
          >
            <Icon name="trash" class="h-4 w-4" />
            {{ t('file.batchDelete', 'Batch Delete') }}
          </button>

          <button
            class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
            @click="handleAction('clear-selection')"
          >
            <Icon name="xmark" class="h-4 w-4" />
            {{ t('file.clearSelection', 'Clear Selection') }}
          </button>
        </template>

        <div class="my-1 border-t border-light-border dark:border-dark-border"></div>
        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('refresh')"
        >
          <Icon name="refresh-cw" class="h-4 w-4" />
          {{ t('common.refresh', 'Refresh') }}
        </button>
      </template>

      <template v-else-if="selectedItems && selectedItems.length > 0">
        <div class="px-4 py-2 text-xs text-gray-500 dark:text-dark-text-secondary">
          {{ t('file.selectedItems', '{count} items selected').replace('{count}', String(selectedItems.length)) }}
        </div>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('batch-download')"
        >
          <Icon name="download" class="h-4 w-4" />
          {{ t('file.batchDirectDownload', 'Batch Download') }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('batch-zip-download')"
        >
          <Icon name="box-archive" class="h-4 w-4" />
          {{ t('file.batchZipDownload', 'Download as ZIP') }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('batch-copy')"
        >
          <Icon name="clipboard" class="h-4 w-4" />
          {{ t('file.batchCopy', 'Batch Copy') }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('batch-move')"
        >
          <Icon name="arrow-narrow-right-move" class="h-4 w-4" />
          {{ t('file.batchMove', 'Batch Move') }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('batch-share-mount')"
        >
          <Icon name="hard-drive" class="h-4 w-4" />
          {{ t('shareMount.batchMenu', 'Batch Cross-Pool Mount') }}
        </button>

        <div class="my-1 border-t border-light-border dark:border-dark-border"></div>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          @click="handleAction('batch-delete')"
        >
          <Icon name="trash" class="h-4 w-4" />
          {{ t('file.batchDelete', 'Batch Delete') }}
        </button>
      </template>

      <template v-else-if="readOnly">
        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('refresh')"
        >
          <Icon name="refresh-cw" class="h-4 w-4" />
          {{ t('common.refresh', 'Refresh') }}
        </button>
      </template>

      <template v-else>
        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('new-folder')"
        >
          <Icon name="folder" class="h-4 w-4 text-blue-500" />
          {{ t('file.newFolder', 'New Folder') }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('upload')"
        >
          <Icon name="upload" class="h-4 w-4" />
          {{ t('file.uploadFile', 'Upload File') }}
        </button>

        <button
          v-if="showRemoteUploadAction !== false"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('remote-upload')"
        >
          <Icon name="network-wired" class="h-4 w-4" />
          {{ t('file.remoteUpload', 'Remote Upload') }}
        </button>

        <button
          v-if="clipboardCount && clipboardCount > 0"
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('paste')"
        >
          <Icon name="clipboard" class="h-4 w-4" />
          {{ t('file.pasteCount', 'Paste ({count})').replace('{count}', String(clipboardCount)) }}
        </button>

        <button
          class="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-light-text hover:bg-gray-100 dark:text-dark-text dark:hover:bg-dark-hover"
          @click="handleAction('refresh')"
        >
          <Icon name="refresh-cw" class="h-4 w-4" />
          {{ t('common.refresh', 'Refresh') }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
