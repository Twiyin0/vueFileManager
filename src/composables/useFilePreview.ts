import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { api } from '@/api'
import type ArtPlayer from 'artplayer'
import APlayer from 'aplayer'
import type Viewer from 'viewerjs'
import { useI18n } from '@/composables/useI18n'

import 'aplayer/dist/APlayer.min.css'

export interface PreviewFileListItem {
  path: string
  name: string
  poolId?: number
  directUrl?: string
  fileUrl?: string
}

export interface FilePreviewProps {
  show: boolean
  filePath: string
  fileName: string
  fileUrl?: string
  poolId?: number
  token?: string
  fileList?: PreviewFileListItem[]
  guestBaseUrl?: string
  guestSaveUrl?: string
  guestAccessPassword?: string
  editable?: boolean
}

export function useFilePreview(props: FilePreviewProps, emit: (event: 'close') => void) {
  const { t } = useI18n()

  const previewUrl = computed(() => {
    if (props.fileUrl) return props.fileUrl
    if (!props.filePath) return ''
    if (props.filePath.startsWith('/api/')) return props.filePath
    if (props.guestBaseUrl) {
      return buildGuestUrl(props.guestBaseUrl, props.filePath)
    }

    const params = new URLSearchParams({ path: props.filePath })
    if (props.poolId) params.set('poolId', String(props.poolId))
    const token = localStorage.getItem('token')
    if (token) params.set('token', token)
    return `/api/files/preview?${params.toString()}`
  })

  function getImagePreviewUrl(file: PreviewFileListItem) {
    if (file.directUrl) return file.directUrl
    if (file.fileUrl) return file.fileUrl
    if (file.path.startsWith('/api/')) return file.path
    if (file.path.startsWith('/share')) return file.path
    if (props.guestBaseUrl) {
      return buildGuestUrl(props.guestBaseUrl, file.path)
    }

    const params = new URLSearchParams({ path: file.path })
    const poolId = file.poolId || props.poolId
    if (poolId) params.set('poolId', String(poolId))
    const token = localStorage.getItem('token')
    if (token) params.set('token', token)
    return `/api/files/preview?${params.toString()}`
  }

  const fileType = computed(() => {
    const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image'
    if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video'
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
    if (ext === 'pdf') return 'pdf'
    if (['md', 'markdown'].includes(ext)) return 'markdown'
    if (['txt', 'json', 'js', 'ts', 'html', 'css', 'xml', 'yaml', 'yml', 'py', 'java', 'go', 'rs', 'vue', 'sh', 'bat', 'ps1', 'php', 'sql', 'toml', 'ini', 'cfg', 'log', 'env', 'gitignore', 'dockerfile'].includes(ext)) return 'text'
    if (ext === 'doc') return 'doc-legacy'
    if (ext === 'docx') return 'docx'
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xlsx'
    if (['ppt', 'pptx'].includes(ext)) return 'ppt-legacy'
    return 'unknown'
  })

  function buildGuestUrl(baseUrl: string, filePath: string) {
    const params = new URLSearchParams({ path: filePath })
    if (props.guestAccessPassword) params.set('password', props.guestAccessPassword)
    return `${baseUrl}?${params.toString()}`
  }

  const isDark = ref(document.documentElement.classList.contains('dark'))
  const themeObserver = new MutationObserver(() => {
    isDark.value = document.documentElement.classList.contains('dark')
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })

  let artPlayer: ArtPlayer | null = null
  let aplayerInst: APlayer | null = null
  let viewer: Viewer | null = null
  let pdfDoc: any = null
  let cmView: any = null
  let themeCompartment: any = null
  let isProgrammaticDestroy = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const docxContainer = ref<HTMLDivElement>()
  const excelSheets = ref<{ name: string; html: string }[]>([])
  const excelActiveSheet = ref(0)
  const imageContainer = ref<HTMLDivElement>()
  const videoContainer = ref<HTMLDivElement>()
  const audioContainer = ref<HTMLDivElement>()
  const pdfCanvas = ref<HTMLCanvasElement>()
  const editorContainer = ref<HTMLDivElement>()

  function setImageContainer(element: Element | ComponentPublicInstance | null) {
    imageContainer.value = element instanceof HTMLDivElement ? element : undefined
  }

  function setVideoContainer(element: Element | ComponentPublicInstance | null) {
    videoContainer.value = element instanceof HTMLDivElement ? element : undefined
  }

  function setAudioContainer(element: Element | ComponentPublicInstance | null) {
    audioContainer.value = element instanceof HTMLDivElement ? element : undefined
  }

  function setPdfCanvas(element: Element | ComponentPublicInstance | null) {
    pdfCanvas.value = element instanceof HTMLCanvasElement ? element : undefined
  }

  function setEditorContainer(element: Element | ComponentPublicInstance | null) {
    editorContainer.value = element instanceof HTMLDivElement ? element : undefined
  }

  function setDocxContainer(element: Element | ComponentPublicInstance | null) {
    docxContainer.value = element instanceof HTMLDivElement ? element : undefined
  }

  const loading = ref(true)
  const isFullscreen = ref(false)
  const showVideo = ref(false)
  const videoAspectRatio = ref(16 / 9)
  const galleryFiles = ref<PreviewFileListItem[]>([])
  const galleryIndex = ref(0)
  const pdfPageNum = ref(1)
  const pdfTotalPages = ref(0)
  const pdfScale = ref(1.5)
  const pdfLoading = ref(false)
  const textContent = ref('')
  const textReloadVersion = ref(0)
  const isSaving = ref(false)
  const saveMsg = ref('')
  const saveState = ref<'success' | 'error' | ''>('')
  const markdownPreviewMode = ref<'rendered' | 'text'>('rendered')

  const isPortraitVideo = computed(() => fileType.value === 'video' && videoAspectRatio.value < 1)
  const isEditorReadOnly = computed(() => props.guestBaseUrl ? !props.editable : false)
  const isMarkdownRenderedMode = computed(() => fileType.value === 'markdown' && markdownPreviewMode.value === 'rendered')

  const dialogClass = computed(() => {
    if (isFullscreen.value) return 'w-full h-full flex flex-col rounded-none'
    if (fileType.value !== 'video') return 'relative overflow-hidden w-full max-w-5xl flex flex-col rounded-xl'
    return [
      'relative overflow-hidden w-full flex flex-col rounded-xl',
      isPortraitVideo.value ? 'max-w-[calc(100vw-1rem)]' : 'max-w-6xl'
    ].join(' ')
  })

  const dialogStyle = computed(() => {
    if (isFullscreen.value) {
      return {
        backgroundColor: 'var(--surface-color)',
        height: '100dvh',
      }
    }

    if (fileType.value !== 'video') {
      return {
        backgroundColor: 'var(--surface-color)',
        height: '90dvh',
      }
    }

    const availableHeight = 'calc(90dvh - 7rem)'
    return {
      backgroundColor: 'var(--surface-color)',
      height: '90dvh',
      width: isPortraitVideo.value
        ? `min(calc(${availableHeight} * ${videoAspectRatio.value} + 2rem), 32rem, calc(100vw - 1rem))`
        : 'min(calc(100vw - 1rem), 96rem)',
    }
  })

  const videoContainerStyle = computed(() => {
    const availableHeight = isFullscreen.value ? 'calc(100dvh - 3rem)' : 'calc(90dvh - 4.5rem)'
    return {
      backgroundColor: '#000',
      aspectRatio: String(videoAspectRatio.value),
      width: `min(100%, calc(${availableHeight} * ${videoAspectRatio.value}))`,
      maxWidth: '100%',
      maxHeight: availableHeight,
    }
  })

  const cmLanguageName = computed(() => {
    const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
    const map: Record<string, string> = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
      html: 'HTML', css: 'CSS', scss: 'SCSS', less: 'LESS',
      json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML',
      py: 'Python', java: 'Java', go: 'Go', rs: 'Rust',
      vue: 'HTML', sql: 'SQL', md: 'Markdown', markdown: 'Markdown',
      php: 'PHP', c: 'C', cpp: 'C++', rb: 'Ruby',
      swift: 'Swift', kt: 'Kotlin', dart: 'Dart', lua: 'Lua',
      sh: 'Shell', bat: 'Batch', ps1: 'PowerShell',
    }
    return map[ext] || 'Plain Text'
  })

  async function loadPdfJs(): Promise<any> {
    const win = window as any
    if (win.pdfjsLib) return win.pdfjsLib

    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs'
      script.type = 'module'
      script.onload = () => {
        win.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs'
        resolve(win.pdfjsLib)
      }
      script.onerror = () => reject(new Error(t('preview.pdfLoadFailed', 'Failed to load the PDF preview runtime')))
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
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      await page.render({ canvasContext: ctx, viewport }).promise
    } catch (err) {
      console.error('PDF render error:', err)
    }
    pdfLoading.value = false
  }

  function pdfPrevPage() {
    if (pdfPageNum.value > 1) {
      pdfPageNum.value--
      renderPdfPage()
    }
  }

  function pdfNextPage() {
    if (pdfPageNum.value < pdfTotalPages.value) {
      pdfPageNum.value++
      renderPdfPage()
    }
  }

  function pdfZoomIn() {
    pdfScale.value = Math.min(5, pdfScale.value + 0.5)
    renderPdfPage()
  }

  function pdfZoomOut() {
    pdfScale.value = Math.max(0.5, pdfScale.value - 0.5)
    renderPdfPage()
  }

  function pdfResetZoom() {
    pdfScale.value = 1.5
    renderPdfPage()
  }

  async function saveTextFile() {
    if (isSaving.value) return

    isSaving.value = true
    saveState.value = ''
    saveMsg.value = t('preview.saving', 'Saving...')

    try {
      if (props.guestSaveUrl) {
        const response = await fetch(props.guestSaveUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: props.filePath, content: textContent.value, password: props.guestAccessPassword || undefined })
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || t('preview.saveFailed', 'Save failed'))
        }
      } else {
        await api.post('/files/write', {
          path: props.filePath,
          content: textContent.value,
          poolId: props.poolId
        })
      }

      textReloadVersion.value = Date.now()
      await loadTextContent({ preserveLoadingState: true, reinitializeEditor: false })
      saveState.value = 'success'
      saveMsg.value = t('preview.saved', 'Saved')
    } catch (err: any) {
      saveState.value = 'error'
      saveMsg.value = err?.message || t('preview.saveFailed', 'Save failed')
      console.error('Save error:', err)
    } finally {
      isSaving.value = false
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveMsg.value = ''
        saveState.value = ''
      }, 2000)
    }
  }

  async function getLangExtension(ext: string): Promise<any> {
    switch (ext) {
      case 'js':
      case 'jsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
      case 'ts':
      case 'tsx':
        return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })
      case 'html':
      case 'vue':
        return (await import('@codemirror/lang-html')).html()
      case 'css':
      case 'scss':
      case 'less':
        return (await import('@codemirror/lang-css')).css()
      case 'json':
        return (await import('@codemirror/lang-json')).json()
      case 'xml':
        return (await import('@codemirror/lang-xml')).xml()
      case 'yaml':
      case 'yml':
        return (await import('@codemirror/lang-yaml')).yaml()
      case 'py':
        return (await import('@codemirror/lang-python')).python()
      case 'java':
        return (await import('@codemirror/lang-java')).java()
      case 'go':
        return (await import('@codemirror/lang-go')).go()
      case 'rs':
        return (await import('@codemirror/lang-rust')).rust()
      case 'sql':
        return (await import('@codemirror/lang-sql')).sql()
      case 'md':
      case 'markdown':
        return (await import('@codemirror/lang-markdown')).markdown()
      case 'php':
        return (await import('@codemirror/lang-php')).php()
      case 'c':
      case 'cpp':
        return (await import('@codemirror/lang-cpp')).cpp()
      case 'sh':
      case 'bat': {
        const { StreamLanguage } = await import('@codemirror/language')
        const { shell } = await import('@codemirror/legacy-modes/mode/shell')
        return StreamLanguage.define(shell)
      }
      case 'ps1': {
        const { StreamLanguage } = await import('@codemirror/language')
        const { powerShell } = await import('@codemirror/legacy-modes/mode/powershell')
        return StreamLanguage.define(powerShell)
      }
      default:
        return []
    }
  }

  async function getCmThemes(EditorView: any, HighlightStyle: any, tags: any) {
    const lightHighlight = HighlightStyle.define([
      { tag: tags.keyword, color: '#d73a49' },
      { tag: tags.string, color: '#032f62' },
      { tag: tags.number, color: '#005cc5' },
      { tag: tags.comment, color: '#6a737d', fontStyle: 'italic' },
      { tag: tags.variableName, color: '#24292e' },
      { tag: tags.typeName, color: '#6f42c1' },
      { tag: tags.tagName, color: '#22863a' },
      { tag: tags.attributeName, color: '#6f42c1' },
      { tag: tags.propertyName, color: '#005cc5' },
      { tag: tags.heading, color: '#0f766e', fontWeight: '700' },
      { tag: tags.emphasis, fontStyle: 'italic', color: '#7c3aed' },
      { tag: tags.strong, fontWeight: '700', color: '#111827' },
      { tag: tags.link, color: '#2563eb', textDecoration: 'underline' },
      { tag: tags.monospace, color: '#b45309', backgroundColor: '#fef3c7' },
      { tag: tags.list, color: '#0f766e' },
    ])

    const darkHighlight = HighlightStyle.define([
      { tag: tags.keyword, color: '#c586c0' },
      { tag: tags.string, color: '#ce9178' },
      { tag: tags.number, color: '#b5cea8' },
      { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
      { tag: tags.variableName, color: '#9cdcfe' },
      { tag: tags.typeName, color: '#4ec9b0' },
      { tag: tags.tagName, color: '#569cd6' },
      { tag: tags.attributeName, color: '#9cdcfe' },
      { tag: tags.propertyName, color: '#9cdcfe' },
      { tag: tags.heading, color: '#4fd1c5', fontWeight: '700' },
      { tag: tags.emphasis, fontStyle: 'italic', color: '#c4b5fd' },
      { tag: tags.strong, fontWeight: '700', color: '#f8fafc' },
      { tag: tags.link, color: '#60a5fa', textDecoration: 'underline' },
      { tag: tags.monospace, color: '#fbbf24', backgroundColor: '#3f2d16' },
      { tag: tags.list, color: '#4fd1c5' },
    ])

    const lightTheme = EditorView.theme({
      '&': { backgroundColor: '#ffffff', color: '#24292e' },
      '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '14px', caretColor: '#24292e' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#24292e !important', borderLeftWidth: '2px' },
      '.cm-gutters': { backgroundColor: '#f6f8fa', color: '#959da5', borderRight: '1px solid #e1e4e8' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, ::selection': { backgroundColor: '#c8e1ff !important' },
      '.cm-activeLine': { backgroundColor: '#f0f4f8' },
      '.cm-activeLineGutter': { backgroundColor: '#e8ecf0' },
    })

    const darkTheme = EditorView.theme({
      '&': { backgroundColor: '#1e1e1e', color: '#d4d4d4' },
      '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '14px', caretColor: '#aeafad' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#aeafad !important', borderLeftWidth: '2px' },
      '.cm-gutters': { backgroundColor: '#1e1e1e', color: '#858585', borderRight: '1px solid #333' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, ::selection': { backgroundColor: '#264f78 !important' },
      '.cm-activeLine': { backgroundColor: '#2a2d2e' },
      '.cm-activeLineGutter': { backgroundColor: '#2a2d2e' },
    })

    return { lightHighlight, darkHighlight, lightTheme, darkTheme }
  }

  async function initCodeMirror() {
    if (!editorContainer.value) return

    const [
      { EditorView, keymap, lineNumbers },
      { EditorState, Compartment },
      { defaultKeymap, history, historyKeymap },
      { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle },
      { tags },
    ] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/state'),
      import('@codemirror/commands'),
      import('@codemirror/language'),
      import('@lezer/highlight'),
    ])

    const ext = props.fileName?.split('.').pop()?.toLowerCase() || ''
    const langExt = await getLangExtension(ext)
    const { lightHighlight, darkHighlight, lightTheme, darkTheme } = await getCmThemes(EditorView, HighlightStyle, tags)

    themeCompartment = new Compartment()

    const state = EditorState.create({
      doc: textContent.value,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        indentOnInput(),
        EditorView.lineWrapping,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'Mod-s',
            run() {
              saveTextFile()
              return true
            },
          }
        ]),
        langExt,
        syntaxHighlighting(isDark.value ? darkHighlight : lightHighlight),
        themeCompartment.of(isDark.value ? darkTheme : lightTheme),
        EditorView.updateListener.of((update: any) => {
          if (update.docChanged) {
            textContent.value = update.state.doc.toString()
          }
        }),
        isEditorReadOnly.value ? EditorState.readOnly.of(true) : [],
      ],
    })

    cmView = new EditorView({ state, parent: editorContainer.value })
  }

  function destroyCodeMirror() {
    if (cmView) {
      cmView.destroy()
      cmView = null
    }
  }

  watch(isDark, async (dark) => {
    if (!cmView || !themeCompartment) return

    const [
      { EditorView },
      { syntaxHighlighting, HighlightStyle },
      { tags },
    ] = await Promise.all([
      import('@codemirror/view'),
      import('@codemirror/language'),
      import('@lezer/highlight'),
    ])

    const { lightHighlight, darkHighlight, lightTheme, darkTheme } = await getCmThemes(EditorView, HighlightStyle, tags)

    cmView.dispatch({
      effects: themeCompartment.reconfigure(dark ? darkTheme : lightTheme),
    })

    cmView.dispatch({
      effects: syntaxHighlighting(dark ? darkHighlight : lightHighlight)
    })
  })

  async function loadTextContent(options: { preserveLoadingState?: boolean; reinitializeEditor?: boolean } = {}) {
    const { preserveLoadingState = false, reinitializeEditor = true } = options

    if (!preserveLoadingState) {
      loading.value = true
    }

    try {
      const requestUrl = new URL(previewUrl.value, window.location.origin)
      requestUrl.searchParams.set('_t', String(textReloadVersion.value || Date.now()))
      const response = await fetch(requestUrl.toString(), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      textContent.value = await response.text()
    } catch {
      textContent.value = `// ${t('preview.loadContentFailed', 'Failed to load file content')}`
    }

    if (!preserveLoadingState) {
      loading.value = false
    }

    if (reinitializeEditor && (fileType.value === 'text' || markdownPreviewMode.value === 'text')) {
      destroyCodeMirror()
      await nextTick()
      initCodeMirror()
    }
  }

  async function setMarkdownPreviewMode(mode: 'rendered' | 'text') {
    if (fileType.value !== 'markdown' || markdownPreviewMode.value === mode) return

    markdownPreviewMode.value = mode

    if (mode === 'text') {
      await nextTick()
      initCodeMirror()
      return
    }

    destroyCodeMirror()
  }

  function buildGallery() {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico']
    const fallbackFile = { path: props.filePath, name: props.fileName, poolId: props.poolId }
    const list = (props.fileList || [fallbackFile]).filter((file) => {
      const ext = file.name?.split('.').pop()?.toLowerCase() || ''
      return imageExts.includes(ext)
    })

    if (!list.find((file) => file.path === props.filePath)) {
      list.push(fallbackFile)
    }

    const index = list.findIndex((file) => file.path === props.filePath)
    galleryFiles.value = list
    galleryIndex.value = index >= 0 ? index : 0
  }

  async function initImageViewer() {
    if (!imageContainer.value) return

    destroyImageViewer()
    imageContainer.value.innerHTML = ''

    const list = galleryFiles.value
    if (!list.length) {
      loading.value = false
      return
    }

    list.forEach((file, index) => {
      const img = document.createElement('img')
      img.alt = file.name
      img.src = index === galleryIndex.value ? '' : getImagePreviewUrl(file)
      Object.assign(img.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '1px',
        height: '1px',
        visibility: 'hidden',
      })
      imageContainer.value!.appendChild(img)
    })

    await import('viewerjs/dist/viewer.css')
    const { default: ViewerClass } = await import('viewerjs')
    const images = imageContainer.value.querySelectorAll('img')
    images[galleryIndex.value].src = getImagePreviewUrl(list[galleryIndex.value])

    viewer = new ViewerClass(imageContainer.value, {
      initialViewIndex: galleryIndex.value,
      navbar: true,
      toolbar: {
        zoomIn: true,
        zoomOut: true,
        oneToOne: true,
        reset: true,
        prev: false,
        play: false,
        next: false,
        rotateLeft: true,
        rotateRight: true,
        flipHorizontal: true,
        flipVertical: true,
      },
      title: [1, (_image: any, imageData: any) => `${imageData.alt || list[galleryIndex.value].name} (${imageData.width}x${imageData.height})`],
      hidden: () => {
        if (!isProgrammaticDestroy) emit('close')
        isProgrammaticDestroy = false
      },
    })

    viewer.show()

    imageContainer.value.addEventListener('viewed', ((event: CustomEvent) => {
      galleryIndex.value = event.detail?.index ?? galleryIndex.value
    }) as EventListener)

    loading.value = false
  }

  function destroyImageViewer() {
    if (viewer) {
      try {
        viewer.destroy()
      } catch {}
      viewer = null
    }
  }

  function navigateImage(dir: number) {
    if (!viewer) return

    const nextIndex = galleryIndex.value + dir
    if (nextIndex < 0 || nextIndex >= galleryFiles.value.length) return

    galleryIndex.value = nextIndex
    viewer.view(nextIndex)
  }

  async function loadVideoAspectRatio() {
    return new Promise<void>((resolve) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true

      const cleanup = () => {
        video.removeAttribute('src')
        video.load()
      }

      video.onloadedmetadata = () => {
        videoAspectRatio.value = video.videoWidth > 0 && video.videoHeight > 0
          ? video.videoWidth / video.videoHeight
          : 16 / 9
        cleanup()
        resolve()
      }

      video.onerror = () => {
        videoAspectRatio.value = 16 / 9
        cleanup()
        resolve()
      }

      video.src = previewUrl.value
    })
  }

  async function initVideoPlayer() {
    if (!videoContainer.value) return

    try {
      const { default: ArtPlayerClass } = await import('artplayer')
      artPlayer = new ArtPlayerClass({
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
        volume: 0.3,
        theme: isDark.value ? '#6b7cff' : '#4f6ef7',
        hotkey: true,
        airplay: true,
        playsInline: true,
        lang: navigator.language.startsWith('zh') ? 'zh-cn' : 'en',
      })
      loading.value = false
    } catch (err) {
      console.error('ArtPlayer init error:', err)
      loading.value = false
    }
  }

  async function initAudioPlayer() {
    if (!audioContainer.value) return

    try {
      aplayerInst = new APlayer({
        container: audioContainer.value,
        autoplay: false,
        volume: 0.3,
        theme: isDark.value ? '#6b7cff' : '#4f6ef7',
        audio: [{ name: props.fileName, url: previewUrl.value, artist: 'VueFileManager', cover: '' }],
      })
      try {
        aplayerInst.play()
      } catch {}
      loading.value = false
    } catch (err) {
      console.error('APlayer init error:', err)
      loading.value = false
    }
  }

  async function initPdfViewer() {
    try {
      const pdfjs = await loadPdfJs()
      const response = await fetch(previewUrl.value)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()
      pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise
      pdfTotalPages.value = pdfDoc.numPages
      pdfPageNum.value = 1
      loading.value = false
      await nextTick()
      await renderPdfPage()
    } catch (err) {
      console.error('PDF init error:', err)
      loading.value = false
    }
  }

  async function initDocxViewer() {
    try {
      const response = await fetch(previewUrl.value)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const docxPreview = await import('docx-preview')
      loading.value = false
      await nextTick()
      if (docxContainer.value) {
        await docxPreview.renderAsync(blob, docxContainer.value, undefined, {
          ignoreWidth: true,
          ignoreHeight: true
        })
      }
    } catch (err) {
      console.error('DOCX viewer init error:', err)
      loading.value = false
    }
  }

  async function initExcelViewer() {
    try {
      const response = await fetch(previewUrl.value)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer)

      excelSheets.value = workbook.worksheets.map((worksheet) => {
        const rows: string[][] = []

        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = []
          row.eachCell({ includeEmpty: true }, (_cell, colNumber) => {
            const cell = row.getCell(colNumber)
            cells[colNumber - 1] = cell.value != null ? String(cell.value) : ''
          })
          rows.push(cells)
        })

        if (rows.length === 0) {
          return {
            name: worksheet.name,
            html: `<p class="text-sm p-4" style="color:var(--text-secondary-color)">${t('preview.emptySheet', 'Empty worksheet')}</p>`
          }
        }

        const maxCols = Math.max(...rows.map((row) => row.length))
        rows.forEach((row) => {
          while (row.length < maxCols) row.push('')
        })

        const header = rows[0]
        const body = rows.slice(1)

        let html = '<table>'
        html += `<thead><tr>${header.map((item) => `<th>${item || ''}</th>`).join('')}</tr></thead>`
        html += `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell || ''}</td>`).join('')}</tr>`).join('')}</tbody>`
        html += '</table>'

        return { name: worksheet.name, html }
      })

      excelActiveSheet.value = 0
      loading.value = false
    } catch (err) {
      console.error('Excel viewer init error:', err)
      loading.value = false
    }
  }

  function destroyPlayers() {
    loading.value = true
    isProgrammaticDestroy = true

    if (artPlayer) {
      try {
        artPlayer.destroy()
      } catch {}
      artPlayer = null
    }

    if (aplayerInst) {
      try {
        aplayerInst.destroy()
      } catch {}
      aplayerInst = null
    }

    destroyImageViewer()
    destroyCodeMirror()
    pdfDoc = null
    pdfTotalPages.value = 0
    pdfPageNum.value = 1
    galleryFiles.value = []
    galleryIndex.value = 0
    textContent.value = ''
    markdownPreviewMode.value = 'rendered'
    excelSheets.value = []
    excelActiveSheet.value = 0
    saveMsg.value = ''
    saveState.value = ''
    if (docxContainer.value) docxContainer.value.innerHTML = ''
  }

  function initPlayer() {
    loading.value = true
    const type = fileType.value

    if (type === 'video') {
      nextTick().then(async () => {
        await loadVideoAspectRatio()
        await nextTick()
        initVideoPlayer()
      })
      return
    }

    if (type === 'audio') {
      nextTick().then(initAudioPlayer)
      return
    }

    if (type === 'image') {
      buildGallery()
      nextTick().then(initImageViewer)
      return
    }

    if (type === 'text' || type === 'markdown') {
      loadTextContent()
      return
    }

    if (type === 'pdf') {
      initPdfViewer()
      return
    }

    if (type === 'docx') {
      initDocxViewer()
      return
    }

    if (type === 'xlsx') {
      initExcelViewer()
      return
    }

    loading.value = false
  }

  onMounted(() => {
    if (!props.show) return

    if (fileType.value === 'video') {
      showVideo.value = true
      nextTick().then(() => nextTick().then(initPlayer))
      return
    }

    nextTick().then(initPlayer)
  })

  watch([() => props.show, () => props.filePath], async ([show], [oldShow]) => {
    if (show) {
      if (oldShow) {
        destroyPlayers()
        showVideo.value = false
        await nextTick()
      }

      if (fileType.value === 'video') {
        showVideo.value = true
        await nextTick()
        await nextTick()
      } else {
        showVideo.value = false
      }

      await nextTick()
      initPlayer()
      return
    }

    destroyPlayers()
    showVideo.value = false
    isFullscreen.value = false
  })

  onUnmounted(() => {
    themeObserver.disconnect()
    destroyPlayers()
  })

  return {
    previewUrl,
    getImagePreviewUrl,
    fileType,
    isDark,
    imageContainer,
    setImageContainer,
    videoContainer,
    setVideoContainer,
    audioContainer,
    setAudioContainer,
    pdfCanvas,
    setPdfCanvas,
    docxContainer,
    setDocxContainer,
    excelSheets,
    excelActiveSheet,
    loading,
    isFullscreen,
    videoAspectRatio,
    isPortraitVideo,
    dialogClass,
    dialogStyle,
    videoContainerStyle,
    galleryFiles,
    galleryIndex,
    pdfPageNum,
    pdfTotalPages,
    pdfScale,
    pdfLoading,
    textContent,
    isSaving,
    saveMsg,
    saveState,
    markdownPreviewMode,
    isMarkdownRenderedMode,
    editorContainer,
    setEditorContainer,
    isEditorReadOnly,
    cmLanguageName,
    showVideo,
    renderPdfPage,
    pdfPrevPage,
    pdfNextPage,
    pdfZoomIn,
    pdfZoomOut,
    pdfResetZoom,
    saveTextFile,
    setMarkdownPreviewMode,
    navigateImage
  }
}
