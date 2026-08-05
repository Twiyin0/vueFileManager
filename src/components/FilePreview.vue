<script setup lang="ts">
import { computed, reactive } from 'vue'
import Icon from '@/components/Icon.vue'
import MarkdownContent from '@/components/MarkdownContent.vue'
import { useFilePreview } from '@/composables/useFilePreview'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  fileUrl?: string
  poolId?: number
  token?: string
  fileList?: { path: string; name: string; poolId?: number }[]
  guestBaseUrl?: string
  guestSaveUrl?: string
  guestAccessPassword?: string
  editable?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const state = reactive(useFilePreview(props, emit))

const saveToastStyle = computed(() => {
  if (state.saveState === 'error') {
    return { background: 'rgba(220, 38, 38, 0.9)', color: '#fff' }
  }
  return { background: 'rgba(34, 197, 94, 0.9)', color: '#fff' }
})
</script>

<template>
  <Teleport to="body">
    <template v-if="show && state.fileType === 'image'">
      <div :ref="state.setImageContainer" />

      <div
        class="fixed left-0 right-0 top-0 z-[3000] flex items-center justify-between px-4 py-2 transition-opacity"
        style="background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)"
      >
        <h3 class="mr-4 flex-1 truncate text-sm font-medium text-white">
          {{ fileName }}
          <span v-if="state.galleryFiles.length > 1" class="ml-2 text-white/60">
            {{ state.galleryIndex + 1 }} / {{ state.galleryFiles.length }}
          </span>
        </h3>

        <div class="flex items-center gap-2">
          <a
            :href="state.previewUrl"
            :download="fileName"
            class="rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
            :title="t('file.download', 'Download')"
          >
            <Icon name="download" class="h-5 w-5" />
          </a>

          <button
            class="rounded-lg p-2 text-white/90 transition-colors hover:bg-white/10"
            :title="t('common.close', 'Close')"
            @click="emit('close')"
          >
            <Icon name="xmark" class="h-5 w-5" />
          </button>
        </div>
      </div>

      <button
        v-if="state.galleryFiles.length > 1"
        class="gallery-nav-btn fixed left-4 top-1/2 z-[3000] -translate-y-1/2"
        :title="t('preview.previousImage', 'Previous image')"
        @click="state.navigateImage(-1)"
      >
        <Icon name="chevron-left" class="h-5 w-5" />
      </button>

      <button
        v-if="state.galleryFiles.length > 1"
        class="gallery-nav-btn fixed right-4 top-1/2 z-[3000] -translate-y-1/2"
        :title="t('preview.nextImage', 'Next image')"
        @click="state.navigateImage(1)"
      >
        <Icon name="chevron-right" class="h-5 w-5" />
      </button>
    </template>

    <div
      v-else-if="show"
      :class="state.isFullscreen ? 'fixed inset-0 z-50' : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4'"
    >
      <div
        v-if="!state.isFullscreen"
        class="absolute inset-0 bg-black/70 dark:bg-black/80"
        @click="emit('close')"
      />

      <div :class="state.dialogClass" :style="state.dialogStyle">
        <div
          class="flex flex-shrink-0 items-center justify-between border-b px-2.5 py-1 backdrop-blur-md"
          style="border-color: var(--border-color); background-color: color-mix(in srgb, var(--surface-color) 75%, transparent)"
        >
          <h3 class="mr-2 flex-1 truncate text-xs font-medium" style="color: var(--text-color)">
            {{ fileName }}
          </h3>

          <div class="flex items-center gap-0.5">
            <button
              class="rounded p-1 transition-colors hover:opacity-80"
              :title="state.isFullscreen ? t('preview.exitFullscreen', 'Exit fullscreen') : t('preview.fullscreen', 'Fullscreen')"
              @click="state.isFullscreen = !state.isFullscreen"
            >
              <Icon :name="state.isFullscreen ? 'compress-alt' : 'expand-alt'" class="h-3.5 w-3.5" style="color: var(--text-color)" />
            </button>

            <a
              :href="state.previewUrl"
              :download="fileName"
              class="rounded p-1 transition-colors hover:opacity-80"
              :title="t('file.download', 'Download')"
            >
              <Icon name="download" class="h-3.5 w-3.5" style="color: var(--text-color)" />
            </a>

            <button
              class="rounded p-1 transition-colors hover:opacity-80"
              :title="t('common.close', 'Close')"
              @click="emit('close')"
            >
              <Icon name="xmark" class="h-3.5 w-3.5" style="color: var(--text-color)" />
            </button>
          </div>
        </div>

        <div
          :class="[
            state.fileType === 'video' ? 'flex flex-1 items-center justify-center p-2 sm:p-4' : 'flex-1',
            state.isFullscreen ? 'flex flex-col overflow-hidden' : state.fileType === 'video' ? '' : 'overflow-auto'
          ]"
          class="preview-content-area"
          style="background-color: var(--surface-color); touch-action: manipulation"
          @contextmenu.prevent
        >
          <div
            v-if="state.loading"
            :class="state.fileType === 'video'
              ? 'absolute inset-0 z-10 flex items-center justify-center pointer-events-none'
              : 'flex items-center justify-center py-20'"
          >
            <svg class="h-8 w-8 animate-spin" style="color: var(--accent-color)" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>

          <div
            v-if="state.fileType === 'video' && state.showVideo"
            :ref="state.setVideoContainer"
            class="overflow-hidden rounded-lg"
            :style="state.videoContainerStyle"
          />

          <div
            v-if="state.fileType === 'audio'"
            :ref="state.setAudioContainer"
            class="flex items-center justify-center px-4 py-8"
          />

          <div v-if="!state.loading && state.fileType === 'pdf'" class="flex min-h-0 flex-1 flex-col">
            <div
              class="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b px-2.5 py-1"
              style="border-color: var(--border-color); background-color: var(--hover-color)"
            >
              <button class="toolbar-btn" :disabled="state.pdfPageNum <= 1" :title="t('preview.prevPage', 'Previous page')" @click="state.pdfPrevPage">
                <Icon name="chevron-left" class="h-4 w-4" />
              </button>

              <span class="text-sm font-mono" style="color: var(--text-color)">{{ state.pdfPageNum }} / {{ state.pdfTotalPages }}</span>

              <button class="toolbar-btn" :disabled="state.pdfPageNum >= state.pdfTotalPages" :title="t('preview.nextPage', 'Next page')" @click="state.pdfNextPage">
                <Icon name="chevron-right" class="h-4 w-4" />
              </button>

              <span class="mx-1 h-5 w-px" style="background: var(--border-color)" />

              <button class="toolbar-btn" :title="t('preview.zoomOut', 'Zoom out')" @click="state.pdfZoomOut">
                <Icon name="minus" class="h-4 w-4" />
              </button>

              <button class="toolbar-btn px-1.5 font-mono text-xs" :title="t('preview.resetZoom', 'Reset zoom')" @click="state.pdfResetZoom">
                {{ Math.round(state.pdfScale * 100) }}%
              </button>

              <button class="toolbar-btn" :title="t('preview.zoomIn', 'Zoom in')" @click="state.pdfZoomIn">
                <Icon name="plus" class="h-4 w-4" />
              </button>

              <span class="flex-1" />

              <a :href="state.previewUrl" :download="fileName" class="toolbar-btn text-xs">
                {{ t('file.download', 'Download') }}
              </a>
            </div>

            <div class="min-h-0 flex-1 overflow-auto p-4" style="background: #525659; text-align: center">
              <div v-if="state.pdfLoading" class="flex items-center justify-center py-12">
                <svg class="h-6 w-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>

              <canvas :ref="state.setPdfCanvas" class="inline-block shadow-lg" />
            </div>
          </div>

          <div v-if="!state.loading && (state.fileType === 'text' || state.fileType === 'markdown')" class="flex min-h-0 flex-1 flex-col">
            <div
              class="flex flex-shrink-0 items-center gap-2 border-b px-3 py-2"
              style="border-color: var(--border-color); background-color: var(--hover-color)"
            >
              <span class="text-xs" style="color: var(--text-secondary-color)">{{ state.cmLanguageName }}</span>

              <div
                v-if="state.fileType === 'markdown'"
                class="flex items-center gap-1 rounded-lg p-1"
                style="background-color: var(--surface-color)"
              >
                <button
                  class="rounded px-2 py-1 text-xs transition-colors"
                  :style="{
                    backgroundColor: state.markdownPreviewMode === 'rendered' ? 'var(--accent-color)' : 'transparent',
                    color: state.markdownPreviewMode === 'rendered' ? '#fff' : 'var(--text-secondary-color)'
                  }"
                  @click="state.setMarkdownPreviewMode('rendered')"
                >
                  {{ t('preview.markdownRendered', 'Rendered') }}
                </button>

                <button
                  class="rounded px-2 py-1 text-xs transition-colors"
                  :style="{
                    backgroundColor: state.markdownPreviewMode === 'text' ? 'var(--accent-color)' : 'transparent',
                    color: state.markdownPreviewMode === 'text' ? '#fff' : 'var(--text-secondary-color)'
                  }"
                  @click="state.setMarkdownPreviewMode('text')"
                >
                  {{ t('preview.markdownSource', 'Source') }}
                </button>
              </div>

              <span class="flex-1" />

              <button
                v-if="!state.isEditorReadOnly && (!state.isMarkdownRenderedMode || state.fileType !== 'markdown')"
                class="rounded px-3 py-1 text-sm font-medium text-white transition-colors disabled:opacity-50"
                style="background-color: var(--accent-color)"
                :disabled="state.isSaving"
                @click="state.saveTextFile"
              >
                {{ state.isSaving ? t('common.save', 'Save') + '...' : t('common.save', 'Save') }}
              </button>
            </div>

            <div v-if="state.isMarkdownRenderedMode" class="min-h-0 flex-1 overflow-auto px-4 py-4">
              <MarkdownContent :source="state.textContent" />
            </div>

            <div v-else class="relative min-h-0 flex-1 rounded-b-lg border-t-0" style="border-color: var(--border-color)">
              <div :ref="state.setEditorContainer" class="h-full" />
            </div>

            <Transition name="toast">
              <div
                v-if="state.saveMsg"
                class="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium shadow-lg"
                :style="saveToastStyle"
              >
                <Icon v-if="state.saveState === 'success'" name="circle-check" class="h-4 w-4" />
                <Icon v-else-if="state.saveState === 'error'" name="circle-xmark" class="h-4 w-4" />
                <span>{{ state.saveMsg }}</span>
              </div>
            </Transition>
          </div>

          <div v-if="!state.loading && state.fileType === 'docx'" class="office-container">
            <div :ref="state.setDocxContainer" class="docx-content" />
          </div>

          <div v-if="!state.loading && state.fileType === 'xlsx'" class="office-container">
            <div class="flex h-full flex-col">
              <div
                v-if="state.excelSheets.length > 1"
                class="flex flex-shrink-0 items-center gap-0 overflow-x-auto border-b px-2 py-1"
                style="border-color: var(--border-color); background-color: var(--hover-color)"
              >
                <button
                  v-for="(sheet, idx) in state.excelSheets"
                  :key="sheet.name"
                  class="whitespace-nowrap border-b-2 px-3 py-1 text-xs font-medium transition-colors"
                  :style="{
                    color: idx === state.excelActiveSheet ? 'var(--accent-color)' : 'var(--text-secondary-color)',
                    borderColor: idx === state.excelActiveSheet ? 'var(--accent-color)' : 'transparent'
                  }"
                  @click="state.excelActiveSheet = idx"
                >
                  {{ sheet.name }}
                </button>
              </div>

              <div class="flex-1 overflow-auto p-2" v-html="state.excelSheets[state.excelActiveSheet]?.html || ''" />
            </div>
          </div>

          <div
            v-if="!state.loading && (state.fileType === 'unknown' || state.fileType === 'doc-legacy' || state.fileType === 'ppt-legacy')"
            class="flex flex-col items-center justify-center py-20"
            style="color: var(--text-secondary-color)"
          >
            <Icon name="file-alt" class="mb-4 h-16 w-16" />
            <p v-if="state.fileType === 'doc-legacy'" class="text-lg">{{ t('preview.docLegacyUnsupported', 'Online preview for .doc is not supported. Please convert it to .docx.') }}</p>
            <p v-else-if="state.fileType === 'ppt-legacy'" class="text-lg">{{ t('preview.pptLegacyUnsupported', 'Online preview for PPT is not supported. Please download the file instead.') }}</p>
            <p v-else class="text-lg">{{ t('preview.unsupported', 'Preview is not available for this file type') }}</p>
            <a :href="state.previewUrl" :download="fileName" class="btn-primary mt-4 text-sm">{{ t('preview.downloadFile', 'Download File') }}</a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.office-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.office-container :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.office-container :deep(td),
.office-container :deep(th) {
  white-space: nowrap;
  border: 1px solid var(--border-color);
  padding: 4px 8px;
}

.office-container :deep(th) {
  background: var(--hover-color);
  font-weight: 600;
}

.docx-content {
  padding: 1.5rem;
}
</style>
