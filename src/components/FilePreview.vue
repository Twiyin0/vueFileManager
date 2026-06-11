<script setup lang="ts">
import { reactive } from 'vue'
import Icon from '@/components/Icon.vue'
import { useFilePreview } from '@/composables/useFilePreview'
import MarkdownContent from '@/components/MarkdownContent.vue'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  fileUrl?: string
  poolId?: number
  token?: string
  /** All files in the current directory (for image gallery prev/next navigation) */
  fileList?: { path: string; name: string; poolId?: number }[]
  /** Guest preview base URL (e.g. /api/guest/:username/:shareId/preview) */
  guestBaseUrl?: string
  /** Guest save URL for text editing (e.g. /api/guest/:username/:shareId/write) */
  guestSaveUrl?: string
  /** Whether the file is editable (guest mode permission) */
  editable?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const state = reactive(useFilePreview(props, emit))
</script>

<template>
  <Teleport to="body">
    <!-- ============================================================ -->
    <!-- IMAGE: ViewerJS 全屏接管，去掉 modal，只放浮层关闭按钮        -->
    <!-- ============================================================ -->
    <template v-if="show && state.fileType === 'image'">
      <!-- ViewerJS injects here (creates canvas + toolbar at z-index 2015) -->
      <div :ref="state.setImageContainer" />

      <!-- Floating header bar above ViewerJS (z-index: 3000 > ViewerJS 2015) -->
      <div class="fixed top-0 left-0 right-0 z-[3000] flex items-center justify-between px-4 py-2 transition-opacity"
        style="background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)">
        <h3 class="font-medium truncate text-white text-sm flex-1 mr-4">
          {{ fileName }}
          <span v-if="state.galleryFiles.length > 1" class="text-white/60 ml-2">{{ state.galleryIndex + 1 }} / {{ state.galleryFiles.length }}</span>
        </h3>
        <div class="flex items-center gap-2">
          <a :href="state.previewUrl" :download="fileName"
            class="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/90"
            title="下载">
            <Icon name="download" class="w-5 h-5" />
          </a>
          <button @click="emit('close')"
            class="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/90">
            <Icon name="xmark" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Prev/Next arrows (only when multiple images in gallery) -->
      <button v-if="state.galleryFiles.length > 1" @click="state.navigateImage(-1)"
        class="gallery-nav-btn fixed top-1/2 -translate-y-1/2 left-4 z-[3000]"
        title="上一张 (←)">
        <Icon name="chevron-left" class="w-5 h-5" />
      </button>
      <button v-if="state.galleryFiles.length > 1" @click="state.navigateImage(1)"
        class="gallery-nav-btn fixed top-1/2 -translate-y-1/2 right-4 z-[3000]"
        title="下一张 (→)">
        <Icon name="chevron-right" class="w-5 h-5" />
      </button>
    </template>

    <!-- ============================================================ -->
    <!-- VIDEO / AUDIO / PDF / TEXT: 标准 modal 对话框                -->
    <!-- ============================================================ -->
    <div v-else-if="show" :class="state.isFullscreen ? 'fixed inset-0 z-50' : 'fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4'">
      <div v-if="!state.isFullscreen" class="absolute inset-0 bg-black/70 dark:bg-black/80" @click="emit('close')" />

      <div :class="state.dialogClass" :style="state.dialogStyle">
        <!-- Header: 半透明毛玻璃 -->
        <div class="flex items-center justify-between px-2.5 py-1 border-b flex-shrink-0 backdrop-blur-md" style="border-color: var(--border-color); background-color: color-mix(in srgb, var(--surface-color) 75%, transparent)">
          <h3 class="text-xs font-medium truncate flex-1 mr-2" style="color: var(--text-color)">{{ fileName }}</h3>
          <div class="flex items-center gap-0.5">
            <button @click="state.isFullscreen = !state.isFullscreen" class="p-1 rounded hover:opacity-80 transition-colors" :title="state.isFullscreen ? '退出全屏' : '全屏'">
              <Icon :name="state.isFullscreen ? 'compress-alt' : 'expand-alt'" class="w-3.5 h-3.5" style="color: var(--text-color)" />
            </button>
            <a :href="state.previewUrl" :download="fileName" class="p-1 rounded hover:opacity-80 transition-colors" title="下载">
              <Icon name="download" class="w-3.5 h-3.5" style="color: var(--text-color)" />
            </a>
            <button @click="emit('close')" class="p-1 rounded hover:opacity-80 transition-colors">
              <Icon name="xmark" class="w-3.5 h-3.5" style="color: var(--text-color)" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div
          :class="[
            state.fileType === 'video' ? 'flex-1 flex items-center justify-center p-2 sm:p-4' : 'flex-1',
            state.isFullscreen ? 'flex flex-col overflow-hidden' : state.fileType === 'video' ? '' : 'overflow-auto'
          ]"
          style="background-color: var(--surface-color); touch-action: manipulation"
          @contextmenu.prevent
        >

          <!-- LOADING -->
          <div
            v-if="state.loading"
            :class="state.fileType === 'video'
              ? 'absolute inset-0 z-10 flex items-center justify-center pointer-events-none'
              : 'flex items-center justify-center py-20'"
          >
            <svg class="animate-spin h-8 w-8" style="color: var(--accent-color)" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>

          <!-- VIDEO: ArtPlayer (mount immediately, loading spinner shown separately) -->
          <div
            v-if="state.fileType === 'video' && state.showVideo"
            :ref="state.setVideoContainer"
            class="rounded-lg overflow-hidden"
            :style="state.videoContainerStyle"
          />

          <!-- AUDIO: APlayer (mount immediately) -->
          <div v-if="state.fileType === 'audio'" :ref="state.setAudioContainer"
            class="flex items-center justify-center py-8 px-4" />

          <!-- PDF: PDF.js CDN canvas + toolbar -->
          <div v-if="!state.loading && state.fileType === 'pdf'" class="flex flex-col flex-1 min-h-0">
            <!-- PDF Toolbar -->
            <div class="flex items-center gap-1.5 px-2.5 py-1 border-b flex-shrink-0 flex-wrap"
              style="border-color: var(--border-color); background-color: var(--hover-color)">
              <button @click="state.pdfPrevPage" :disabled="state.pdfPageNum <= 1" class="toolbar-btn" title="上一页">
                <Icon name="chevron-left" class="w-4 h-4" />
              </button>
              <span class="text-sm font-mono" style="color: var(--text-color)">{{ state.pdfPageNum }} / {{ state.pdfTotalPages }}</span>
              <button @click="state.pdfNextPage" :disabled="state.pdfPageNum >= state.pdfTotalPages" class="toolbar-btn" title="下一页">
                <Icon name="chevron-right" class="w-4 h-4" />
              </button>
              <span class="w-px h-5 mx-1" style="background: var(--border-color)" />
              <button @click="state.pdfZoomOut" class="toolbar-btn" title="缩小">
                <Icon name="minus" class="w-4 h-4" />
              </button>
              <button @click="state.pdfResetZoom" class="toolbar-btn text-xs font-mono px-1.5" title="重置缩放">
                {{ Math.round(state.pdfScale * 100) }}%
              </button>
              <button @click="state.pdfZoomIn" class="toolbar-btn" title="放大">
                <Icon name="plus" class="w-4 h-4" />
              </button>
              <span class="flex-1" />
              <a :href="state.previewUrl" :download="fileName" class="toolbar-btn text-xs">下载</a>
            </div>
            <!-- PDF Canvas -->
            <div class="flex-1 min-h-0 overflow-auto p-4" style="background: #525659; text-align: center">
              <div v-if="state.pdfLoading" class="flex items-center justify-center py-12">
                <svg class="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <canvas :ref="state.setPdfCanvas" class="shadow-lg inline-block" />
            </div>
          </div>

          <!-- TEXT/CODE: CodeMirror Editor + Save -->
          <div v-if="!state.loading && (state.fileType === 'text' || state.fileType === 'markdown')" class="flex flex-col flex-1 min-h-0">
            <div class="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
              style="border-color: var(--border-color); background-color: var(--hover-color)">
              <span class="text-xs" style="color: var(--text-secondary-color)">{{ state.cmLanguageName }}</span>
              <div v-if="state.fileType === 'markdown'" class="flex items-center gap-1 rounded-lg p-1" style="background-color: var(--surface-color)">
                <button
                  class="px-2 py-1 rounded text-xs transition-colors"
                  :style="{
                    backgroundColor: state.markdownPreviewMode === 'rendered' ? 'var(--accent-color)' : 'transparent',
                    color: state.markdownPreviewMode === 'rendered' ? '#fff' : 'var(--text-secondary-color)'
                  }"
                  @click="state.setMarkdownPreviewMode('rendered')"
                >
                  渲染
                </button>
                <button
                  class="px-2 py-1 rounded text-xs transition-colors"
                  :style="{
                    backgroundColor: state.markdownPreviewMode === 'text' ? 'var(--accent-color)' : 'transparent',
                    color: state.markdownPreviewMode === 'text' ? '#fff' : 'var(--text-secondary-color)'
                  }"
                  @click="state.setMarkdownPreviewMode('text')"
                >
                  文本
                </button>
              </div>
              <span class="flex-1" />
              <button v-if="!state.isEditorReadOnly && (!state.isMarkdownRenderedMode || state.fileType !== 'markdown')" @click="state.saveTextFile"
                :disabled="state.isSaving"
                class="px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50"
                style="background-color: var(--accent-color); color: #fff">
                {{ state.isSaving ? '保存中...' : '保存' }}
              </button>
            </div>
            <div v-if="state.isMarkdownRenderedMode" class="flex-1 min-h-0 overflow-auto px-4 py-4">
              <MarkdownContent :source="state.textContent" />
            </div>
            <div v-else class="flex-1 min-h-0 rounded-b-lg border-t-0 relative" style="border-color: var(--border-color)">
              <div :ref="state.setEditorContainer" class="h-full" />
            </div>
            <!-- Save toast: centered overlay with auto-dismiss -->
            <Transition name="toast">
              <div v-if="state.saveMsg" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-1.5"
                :style="{ background: state.saveMsg === '保存失败' ? 'rgba(220,38,38,0.9)' : 'rgba(34,197,94,0.9)', color: '#fff' }">
                <Icon v-if="state.saveMsg === '已保存'" name="circle-check" class="w-4 h-4" />
                <Icon v-else-if="state.saveMsg === '保存失败'" name="circle-xmark" class="w-4 h-4" />
                <span>{{ state.saveMsg }}</span>
              </div>
            </Transition>
          </div>

          <!-- DOCX: docx-preview -->
          <div v-if="!state.loading && state.fileType === 'docx'" class="office-container">
            <div :ref="state.setDocxContainer" class="docx-content" />
          </div>

          <!-- EXCEL: ExcelJS + 自定义 sheet tab -->
          <div v-if="!state.loading && state.fileType === 'xlsx'" class="office-container">
            <div class="flex flex-col h-full">
              <!-- Sheet tabs -->
              <div v-if="state.excelSheets.length > 1" class="flex items-center gap-0 px-2 py-1 border-b flex-shrink-0 overflow-x-auto"
                style="border-color: var(--border-color); background-color: var(--hover-color)">
                <button v-for="(sheet, idx) in state.excelSheets" :key="sheet.name"
                  @click="state.excelActiveSheet = idx"
                  class="px-3 py-1 text-xs font-medium border-b-2 transition-colors whitespace-nowrap"
                  :style="{
                    color: idx === state.excelActiveSheet ? 'var(--accent-color)' : 'var(--text-secondary-color)',
                    'border-color': idx === state.excelActiveSheet ? 'var(--accent-color)' : 'transparent'
                  }">
                  {{ sheet.name }}
                </button>
              </div>
              <!-- Sheet content -->
              <div class="flex-1 overflow-auto p-2" v-html="state.excelSheets[state.excelActiveSheet]?.html || ''" />
            </div>
          </div>

          <!-- UNSUPPORTED / LEGACY DOC / PPT -->
          <div v-if="!state.loading && (state.fileType === 'unknown' || state.fileType === 'doc-legacy' || state.fileType === 'ppt-legacy')" class="flex flex-col items-center justify-center py-20" style="color: var(--text-secondary-color)">
            <Icon name="file-alt" class="w-16 h-16 mb-4" />
            <p v-if="state.fileType === 'doc-legacy'" class="text-lg" style="color: var(--text-secondary-color)">不支持预览 .doc 格式，请转为 .docx</p>
            <p v-else-if="state.fileType === 'ppt-legacy'" class="text-lg" style="color: var(--text-secondary-color)">不支持在线预览 PPT，请下载查看</p>
            <p v-else class="text-lg" style="color: var(--text-secondary-color)">不支持预览此文件类型</p>
            <a :href="state.previewUrl" :download="fileName" class="btn-primary mt-4 text-sm">下载文件</a>
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
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
.office-container :deep(td), .office-container :deep(th) {
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  white-space: nowrap;
}
.office-container :deep(th) {
  background: var(--hover-color);
  font-weight: 600;
}
.docx-content {
  padding: 1.5rem;
}
</style>
