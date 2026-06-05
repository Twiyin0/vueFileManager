<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { api } from '@/api'
import ArtPlayer from 'artplayer'
import APlayer from 'aplayer'
import Viewer from 'viewerjs'
import VueMonacoEditor from '@guolao/vue-monaco-editor'
import Icon from '@/components/Icon.vue'

import 'aplayer/dist/APlayer.min.css'
import 'viewerjs/dist/viewer.css'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  poolId?: number
  token?: string
  /** All files in the current directory (for image gallery prev/next navigation) */
  fileList?: { path: string; name: string; poolId?: number }[]
  /** Guest preview base URL (e.g. /api/guest/:username/:shareId/preview) */
  guestBaseUrl?: string
}>()

const emit = defineEmits<{
  close: []
}>()

// ---- URL helpers ----
const previewUrl = computed(() => {
  if (!props.filePath) return ''
  if (props.filePath.startsWith('/api/')) return props.filePath
  if (props.guestBaseUrl) {
    return `${props.guestBaseUrl}?path=${encodeURIComponent(props.filePath)}`
  }
  const base = '/api/files/preview'
  const params = new URLSearchParams({ path: props.filePath })
  if (props.poolId) params.set('poolId', String(props.poolId))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `${base}?${params.toString()}`
})

/** Generate preview URL for any file path (used for gallery images) */
function getImagePreviewUrl(file: { path: string; poolId?: number }): string {
  if (file.path.startsWith('/api/')) return file.path
  if (props.guestBaseUrl) {
    return `${props.guestBaseUrl}?path=${encodeURIComponent(file.path)}`
  }
  const base = '/api/files/preview'
  const params = new URLSearchParams({ path: file.path })
  const pid = file.poolId || props.poolId
  if (pid) params.set('poolId', String(pid))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `${base}?${params.toString()}`
}

const fileType = computed(() => {
  const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio'
  if (ext === 'ogg') return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  if (['txt', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'py', 'java', 'go', 'rs', 'vue', 'sh', 'sql', 'toml', 'ini', 'cfg', 'log', 'env', 'gitignore', 'dockerfile'].includes(ext)) return 'text'
  return 'unknown'
})

const isDark = ref(document.documentElement.classList.contains('dark'))
const themeObserver = new MutationObserver(() => {
  isDark.value = document.documentElement.classList.contains('dark')
})
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

// ---- Player instances ----
let artPlayer: ArtPlayer | null = null
let aplayerInst: APlayer | null = null
let viewer: Viewer | null = null

// ---- Blob URL tracking ----
let imageBlobUrl: string | null = null
let pdfBlobUrl: string | null = null

// ---- ViewerJS re-entrancy guard ----
let isProgrammaticDestroy = false

// ---- DOM refs ----
const imageContainer = ref<HTMLDivElement>()
const videoContainer = ref<HTMLDivElement>()
const audioContainer = ref<HTMLDivElement>()
const pdfCanvas = ref<HTMLCanvasElement>()

// ---- Loading ----
const loading = ref(true)

// ---- Image gallery (for floating header counter + prev/next navigation) ----
const galleryFiles = ref<{ path: string; name: string; poolId?: number }[]>([])
const galleryIndex = ref(0)

// ---- PDF state ----
const pdfPageNum = ref(1)
const pdfTotalPages = ref(0)
const pdfScale = ref(1.5)
const pdfLoading = ref(false)
let pdfDoc: any = null

async function loadPdfJs(): Promise<any> {
  const w = window as any
  if (w.pdfjsLib) return w.pdfjsLib
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs'
    script.type = 'module'
    script.onload = () => {
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs'
      resolve(w.pdfjsLib)
    }
    script.onerror = () => reject(new Error('PDF.js CDN 加载失败'))
    document.head.appendChild(script)
  })
}

async function renderPdfPage() {
  if (!pdfDoc || !pdfCanvas.value) return
  pdfLoading.value = true
  try {
    const page = await pdfDoc.getPage(pdfPageNum.value)
    const viewport = page.getViewport({ scale: pdfScale.value })
    const canvas = pdfCanvas.value
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
  } catch (err) { console.error('PDF render error:', err) }
  pdfLoading.value = false
}

function pdfPrevPage() { if (pdfPageNum.value > 1) { pdfPageNum.value--; renderPdfPage() } }
function pdfNextPage() { if (pdfPageNum.value < pdfTotalPages.value) { pdfPageNum.value++; renderPdfPage() } }
function pdfZoomIn() { pdfScale.value = Math.min(5, pdfScale.value + 0.25); renderPdfPage() }
function pdfZoomOut() { pdfScale.value = Math.max(0.5, pdfScale.value - 0.25); renderPdfPage() }

// ---- Text/Code state ----
const textContent = ref('')
const isSaving = ref(false)
const saveMsg = ref('')
let saveTimer: ReturnType<typeof setTimeout> | null = null

async function saveTextFile() {
  if (isSaving.value) return
  isSaving.value = true
  saveMsg.value = '保存中...'
  try {
    await api.post('/files/write', { path: props.filePath, content: textContent.value, poolId: props.poolId })
    saveMsg.value = '已保存'
  } catch (err: any) {
    saveMsg.value = '保存失败'
    console.error('Save error:', err)
  } finally {
    isSaving.value = false
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveMsg.value = '' }, 2000)
  }
}

function handleMonacoMount(editor: any, monaco: any) {
  // Register Ctrl+S / Cmd+S for save
  editor.addAction({
    id: 'save-file',
    label: '保存文件',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: () => saveTextFile(),
  })
}

/** Monaco options: tuned for performance on large files */
const monacoOptions = {
  readOnly: false,
  minimap: { enabled: false },
  automaticLayout: true,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  fontSize: 14,
  lineNumbers: 'on' as const,
  renderWhitespace: 'none' as const,
  smoothScrolling: true,
  cursorBlinking: 'smooth' as const,
  // Performance: disable heavy features for large files
  bracketPairColorization: { enabled: false },
  guides: { indentation: false, bracketPairs: false },
  suggest: { showWords: false, showSnippets: false },
  occurrencesHighlight: 'off' as const,
  selectionHighlight: false,
  renderLineHighlight: 'none' as const,
  folding: false,
  hideCursorInOverviewRuler: true,
  overviewRulerBorder: false,
  overviewRulerLanes: 0,
}

const languageMap: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  py: 'python', java: 'java', go: 'go', rs: 'rust',
  vue: 'html', sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql', md: 'markdown', markdown: 'markdown',
  dockerfile: 'dockerfile', txt: 'plaintext', log: 'plaintext', env: 'plaintext',
  cfg: 'plaintext', php: 'php', rb: 'ruby', c: 'c', cpp: 'cpp',
  swift: 'swift', kt: 'kotlin', dart: 'dart', lua: 'lua',
}

const monacoLanguage = computed(() => {
  const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
  return languageMap[ext] || 'plaintext'
})

async function loadTextContent() {
  try {
    const resp = await fetch(previewUrl.value)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    textContent.value = await resp.text()
  } catch { textContent.value = '// Failed to load file content' }
  loading.value = false
}

function buildGallery() {
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico']
  const fallbackFile = { path: props.filePath, name: props.fileName, poolId: props.poolId }
  const list = (props.fileList || [fallbackFile])
    .filter(f => {
      const ext = f.name?.split('.').pop()?.toLowerCase() || ''
      return imageExts.includes(ext)
    })
  if (!list.find(f => f.path === props.filePath)) list.push(fallbackFile)
  const idx = list.findIndex(f => f.path === props.filePath)
  galleryFiles.value = list
  galleryIndex.value = idx >= 0 ? idx : 0
}

// ---- Initializers ----

function initImageViewer() {
  if (!imageContainer.value) return
  destroyImageViewer()
  imageContainer.value.innerHTML = ''

  const list = galleryFiles.value
  if (!list.length) { loading.value = false; return }

  // Create ALL images with visibility:hidden (NOT display:none).
  // Browser loads visibility:hidden images → ViewerJS detects gallery.
  // Stack them absolutely so they don't affect layout.
  list.forEach((f, i) => {
    const img = document.createElement('img')
    img.alt = f.name
    img.src = i === galleryIndex.value ? '' : getImagePreviewUrl(f) // current loads via blob below
    Object.assign(img.style, {
      position: 'absolute', top: '0', left: '0',
      width: '1px', height: '1px',
      visibility: 'hidden',
    })
    imageContainer.value!.appendChild(img)
  })

  // Fetch current image as blob (anti iOS system preview), then create ViewerJS
  const currentUrl = getImagePreviewUrl(list[galleryIndex.value])
  fetch(currentUrl)
    .then(resp => { if (!resp.ok) throw new Error(`HTTP ${resp.status}`); return resp.blob() })
    .then(blob => {
      if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
      imageBlobUrl = URL.createObjectURL(blob)
      // Set blob URL on current image
      const allImgs = imageContainer.value!.querySelectorAll('img')
      allImgs[galleryIndex.value].src = imageBlobUrl

      viewer = new Viewer(imageContainer.value!, {
        initialViewIndex: galleryIndex.value,
        navbar: true,
        toolbar: {
          zoomIn: true, zoomOut: true, oneToOne: true, reset: true,
          prev: false, play: false, next: false,
          rotateLeft: true, rotateRight: true,
          flipHorizontal: true, flipVertical: true,
        },
        title: [1, (_image: any, imageData: any) =>
          `${imageData.alt || list[galleryIndex.value].name} (${imageData.width}×${imageData.height})`],
        hidden: () => { if (!isProgrammaticDestroy) emit('close'); isProgrammaticDestroy = false },
      })
      viewer.show()
      // Sync floating counter on ViewerJS internal navigation
      imageContainer.value!.addEventListener('viewed', ((e: CustomEvent) => {
        galleryIndex.value = e.detail?.index ?? galleryIndex.value
      }) as EventListener)
      loading.value = false
    })
    .catch(err => { console.error('Image load error:', err); loading.value = false })
}

function destroyImageViewer() {
  if (viewer) { try { viewer.destroy() } catch {}; viewer = null }
  if (imageBlobUrl) { URL.revokeObjectURL(imageBlobUrl); imageBlobUrl = null }
}

function navigateImage(dir: number) {
  if (!viewer) return
  const newIdx = galleryIndex.value + dir
  if (newIdx < 0 || newIdx >= galleryFiles.value.length) return
  galleryIndex.value = newIdx
  viewer.view(newIdx)
}

function initVideoPlayer() {
  if (!videoContainer.value) return
  try {
    artPlayer = new ArtPlayer({
      container: videoContainer.value,
      url: previewUrl.value,
      autoplay: false,
      autoSize: false,
      autoMini: true,
      screenshot: true,
      setting: true,
      pip: true,
      fullscreen: true,
      playbackRate: true,
      aspectRatio: true,
      theme: isDark.value ? '#6b7cff' : '#4f6ef7',
      hotkey: true,
      airplay: true,
      playsInline: true,
      lang: navigator.language.startsWith('zh') ? 'zh-cn' : 'en',
    })
    loading.value = false
  } catch (err) { console.error('ArtPlayer init error:', err); loading.value = false }
}

function initAudioPlayer() {
  if (!audioContainer.value) return
  try {
    aplayerInst = new APlayer({
      container: audioContainer.value,
      autoplay: false,
      theme: isDark.value ? '#6b7cff' : '#4f6ef7',
      audio: [{ name: props.fileName, url: previewUrl.value, artist: 'VueFileManager', cover: '' }],
    })
    loading.value = false
  } catch (err) { console.error('APlayer init error:', err); loading.value = false }
}

async function initPdfViewer() {
  try {
    const pdfjs = await loadPdfJs()
    const resp = await fetch(previewUrl.value)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    pdfBlobUrl = URL.createObjectURL(blob)
    const arrayBuf = await blob.arrayBuffer()
    pdfDoc = await pdfjs.getDocument({ data: arrayBuf }).promise
    pdfTotalPages.value = pdfDoc.numPages
    pdfPageNum.value = 1
    loading.value = false    // 先挂载 canvas DOM
    await nextTick()          // 等 Vue 渲染完成
    await renderPdfPage()     // 再绘制 PDF
  } catch (err) { console.error('PDF init error:', err); loading.value = false }
}

// ---- Cleanup ----

function destroyPlayers() {
  loading.value = true
  isProgrammaticDestroy = true
  if (artPlayer) { try { artPlayer.destroy() } catch {}; artPlayer = null }
  if (aplayerInst) { try { aplayerInst.destroy() } catch {}; aplayerInst = null }
  destroyImageViewer()
  if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); pdfBlobUrl = null }
  pdfDoc = null; pdfTotalPages.value = 0; pdfPageNum.value = 1
  galleryFiles.value = []; galleryIndex.value = 0
  textContent.value = ''
}

function initPlayer() {
  loading.value = true
  const ft = fileType.value
  if (ft === 'video') nextTick().then(initVideoPlayer)
  else if (ft === 'audio') nextTick().then(initAudioPlayer)
  else if (ft === 'image') { buildGallery(); nextTick().then(initImageViewer) }
  else if (ft === 'text' || ft === 'markdown') loadTextContent()
  else if (ft === 'pdf') initPdfViewer()
  else loading.value = false
}

// ---- Lifecycle ----

const showVideo = ref(false)

onMounted(() => {
  if (props.show) {
    if (fileType.value === 'video') { showVideo.value = true; nextTick().then(() => nextTick().then(initPlayer)) }
    else nextTick().then(initPlayer)
  }
})

watch([() => props.show, () => props.filePath], async ([show, filePath], [oldShow, oldFilePath]) => {
  if (show) {
    if (oldShow && filePath !== oldFilePath) { destroyPlayers(); showVideo.value = false; await nextTick() }
    if (fileType.value === 'video') { showVideo.value = true; await nextTick(); await nextTick() }
    else showVideo.value = false
    await nextTick()
    initPlayer()
  } else {
    destroyPlayers()
    showVideo.value = false
  }
})

onUnmounted(() => { themeObserver.disconnect(); destroyPlayers() })
</script>

<template>
  <Teleport to="body">
    <!-- ============================================================ -->
    <!-- IMAGE: ViewerJS 全屏接管，去掉 modal，只放浮层关闭按钮        -->
    <!-- ============================================================ -->
    <template v-if="show && fileType === 'image'">
      <!-- ViewerJS injects here (creates canvas + toolbar at z-index 2015) -->
      <div ref="imageContainer" />

      <!-- Floating header bar above ViewerJS (z-index: 3000 > ViewerJS 2015) -->
      <div class="fixed top-0 left-0 right-0 z-[3000] flex items-center justify-between px-4 py-2 transition-opacity"
        style="background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)">
        <h3 class="font-medium truncate text-white text-sm flex-1 mr-4">
          {{ fileName }}
          <span v-if="galleryFiles.length > 1" class="text-white/60 ml-2">{{ galleryIndex + 1 }} / {{ galleryFiles.length }}</span>
        </h3>
        <div class="flex items-center gap-2">
          <a :href="previewUrl" :download="fileName"
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
      <button v-if="galleryFiles.length > 1" @click="navigateImage(-1)"
        class="gallery-nav-btn fixed top-1/2 -translate-y-1/2 left-4 z-[3000]"
        title="上一张 (←)">
        <Icon name="chevron-left" class="w-5 h-5" />
      </button>
      <button v-if="galleryFiles.length > 1" @click="navigateImage(1)"
        class="gallery-nav-btn fixed top-1/2 -translate-y-1/2 right-4 z-[3000]"
        title="下一张 (→)">
        <Icon name="chevron-right" class="w-5 h-5" />
      </button>
    </template>

    <!-- ============================================================ -->
    <!-- VIDEO / AUDIO / PDF / TEXT: 标准 modal 对话框                -->
    <!-- ============================================================ -->
    <div v-else-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/70 dark:bg-black/80" @click="emit('close')" />

      <div :class="['relative w-full max-h-[90vh] flex flex-col rounded-xl overflow-hidden', fileType === 'video' ? 'max-w-7xl' : 'max-w-5xl']" style="background-color: var(--surface-color)">
        <!-- Header -->
        <div class="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0" style="border-color: var(--border-color)">
          <h3 class="text-sm font-medium truncate flex-1 mr-3" style="color: var(--text-color)">{{ fileName }}</h3>
          <div class="flex items-center gap-1">
            <a :href="previewUrl" :download="fileName" class="p-1.5 rounded-md hover:opacity-80 transition-colors" title="下载">
              <Icon name="download" class="w-4 h-4" style="color: var(--text-color)" />
            </a>
            <button @click="emit('close')" class="p-1.5 rounded-md hover:opacity-80 transition-colors">
              <Icon name="xmark" class="w-4 h-4" style="color: var(--text-color)" />
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto" style="background-color: var(--surface-color); touch-action: manipulation" @contextmenu.prevent>

          <!-- LOADING -->
          <div v-if="loading" class="flex items-center justify-center py-20">
            <svg class="animate-spin h-8 w-8" style="color: var(--accent-color)" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>

          <!-- VIDEO: ArtPlayer (mount immediately, loading spinner shown separately) -->
          <div v-if="fileType === 'video' && showVideo" ref="videoContainer"
            class="w-full rounded-lg overflow-hidden" style="background-color: #000; aspect-ratio: 16 / 9; max-height: 75vh" />

          <!-- AUDIO: APlayer (mount immediately) -->
          <div v-if="fileType === 'audio'" ref="audioContainer"
            class="flex items-center justify-center py-8 px-4" />

          <!-- PDF: PDF.js CDN canvas + toolbar -->
          <div v-if="!loading && fileType === 'pdf'" class="flex flex-col h-full" style="min-height: 70vh">
            <!-- PDF Toolbar -->
            <div class="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0 flex-wrap"
              style="border-color: var(--border-color); background-color: var(--hover-color)">
              <button @click="pdfPrevPage" :disabled="pdfPageNum <= 1" class="toolbar-btn" title="上一页">
                <Icon name="chevron-left" class="w-4 h-4" />
              </button>
              <span class="text-sm font-mono" style="color: var(--text-color)">{{ pdfPageNum }} / {{ pdfTotalPages }}</span>
              <button @click="pdfNextPage" :disabled="pdfPageNum >= pdfTotalPages" class="toolbar-btn" title="下一页">
                <Icon name="chevron-right" class="w-4 h-4" />
              </button>
              <span class="w-px h-5 mx-1" style="background: var(--border-color)" />
              <button @click="pdfZoomOut" class="toolbar-btn" title="缩小">
                <Icon name="minus" class="w-4 h-4" />
              </button>
              <span class="text-xs font-mono" style="color: var(--text-secondary-color)">{{ Math.round(pdfScale * 100) }}%</span>
              <button @click="pdfZoomIn" class="toolbar-btn" title="放大">
                <Icon name="plus" class="w-4 h-4" />
              </button>
              <span class="flex-1" />
              <a :href="previewUrl" :download="fileName" class="toolbar-btn text-xs">下载</a>
            </div>
            <!-- PDF Canvas -->
            <div class="flex-1 overflow-auto flex justify-center p-4" style="background: #525659">
              <div v-if="pdfLoading" class="flex items-center justify-center py-12">
                <svg class="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <canvas ref="pdfCanvas" class="shadow-lg" />
            </div>
          </div>

          <!-- TEXT/CODE: Monaco Editor + Save -->
          <div v-if="!loading && (fileType === 'text' || fileType === 'markdown')" class="flex flex-col h-full" style="min-height: 60vh">
            <div class="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
              style="border-color: var(--border-color); background-color: var(--hover-color)">
              <span class="text-xs" style="color: var(--text-secondary-color)">{{ monacoLanguage }}</span>
              <span class="flex-1" />
              <button @click="saveTextFile"
                :disabled="isSaving"
                class="px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50"
                style="background-color: var(--accent-color); color: #fff">
                {{ isSaving ? '保存中...' : '保存' }}
              </button>
            </div>
            <div class="flex-1 rounded-b-lg overflow-hidden border-t-0 relative" style="border-color: var(--border-color); min-height: 55vh">
              <VueMonacoEditor
                v-model:value="textContent"
                :language="monacoLanguage"
                :theme="isDark ? 'vs-dark' : 'vs'"
                height="55vh"
                :options="monacoOptions"
                @mount="handleMonacoMount"
              />
            </div>
            <!-- Save toast: centered overlay with auto-dismiss -->
            <Transition name="toast">
              <div v-if="saveMsg" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg shadow-lg text-sm font-medium"
                :style="{ background: saveMsg === '保存失败' ? 'rgba(220,38,38,0.9)' : 'rgba(34,197,94,0.9)', color: '#fff' }">
                {{ saveMsg === '已保存' ? '✓ 已保存' : saveMsg === '保存失败' ? '✗ 保存失败' : saveMsg }}
              </div>
            </Transition>
          </div>

          <!-- UNSUPPORTED -->
          <div v-if="!loading && fileType === 'unknown'" class="flex flex-col items-center justify-center py-20" style="color: var(--text-secondary-color)">
            <Icon name="file-alt" class="w-16 h-16 mb-4" />
            <p class="text-lg" style="color: var(--text-secondary-color)">不支持预览此文件类型</p>
            <a :href="previewUrl" :download="fileName" class="btn-primary mt-4 text-sm">下载文件</a>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
