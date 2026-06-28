<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { FileItem } from '@/stores/files'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'
import type { FileSortDirection, FileSortKey } from '@/utils/fileSort'

type ViewMode = 'list' | 'grid' | 'medium-list'
type ThumbnailStatus = 'idle' | 'loading' | 'ready' | 'pending' | 'unsupported' | 'failed'

interface ThumbnailState {
  status: ThumbnailStatus
  url: string
  duration?: number
  retryCount: number
}

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
  file: { icon: 'file-alt', color: 'text-gray-400' },
}

const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp']
const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'flv']

function getFileIcon(file: FileItem): string {
  if (file.type === 'folder') return 'folder'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (imageExts.includes(ext)) return 'image'
  if (videoExts.includes(ext)) return 'video'
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'].includes(ext)) return 'audio'
  if (['pdf'].includes(ext)) return 'pdf'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['js', 'ts', 'py', 'java', 'go', 'rs', 'vue', 'html', 'css'].includes(ext)) return 'code'
  if (['txt', 'md', 'json', 'yaml', 'yml', 'xml'].includes(ext)) return 'text'
  return 'file'
}

function getFileIconInfo(file: FileItem) {
  return fileIconMap[getFileIcon(file)] || fileIconMap.file
}

const props = withDefaults(defineProps<{
  files: FileItem[]
  loading: boolean
  showActions?: boolean
  readOnlyActions?: boolean
  selectMode?: boolean
  selectedFiles?: Set<string>
  viewMode?: ViewMode
  currentPoolId?: number
  guestBaseUrl?: string
  guestThumbnailBaseUrl?: string
  guestAccessPassword?: string
  sortKey?: FileSortKey
  sortDirection?: FileSortDirection
}>(), {
  viewMode: 'list'
})

const emit = defineEmits<{
  open: [file: FileItem]
  download: [file: FileItem]
  delete: [file: FileItem]
  contextmenu: [e: MouseEvent, file?: FileItem]
  toggleSelect: [path: string]
  detail: [file: FileItem]
  sort: [key: FileSortKey]
}>()

let longPressTimer: ReturnType<typeof setTimeout> | null = null
const longPressThreshold = 500
const contextHighlighted = ref<string | null>(null)
const mediumScrollTop = ref(0)
const mediumViewportHeight = ref(520)
const mediumContainer = ref<HTMLElement | null>(null)
const thumbnailStates = ref<Record<string, ThumbnailState>>({})
const thumbnailRetryTimers = new Map<string, number>()
const thumbnailObjectUrls = new Set<string>()
const queuedThumbnailKeys = new Set<string>()
const mediaAspectRatios = ref<Record<string, number>>({})
const thumbnailRequestQueue: Array<{ key: string; file: FileItem }> = []
const gridVisibleThumbnailKeys = ref<Set<string>>(new Set())
const gridObservedElements = new Map<Element, string>()
const gridThumbnailElements = new Map<string, Element>()
const mediumDefaultRowHeight = 92
const mediumRowVerticalPadding = 24
const mediumThumbMaxWidth = 120
const mediumThumbLandscapeMaxHeight = 92
const mediumThumbPortraitMaxHeight = 148
const mediumOverscan = 6
const maxConcurrentThumbnailRequests = 4
let activeThumbnailRequests = 0
let gridObserver: IntersectionObserver | null = null

const mediumRows = computed(() => {
  let top = 0
  const items = props.files.map((file, index) => {
    const height = getMediumRowHeight(file)
    const row = { file, index, top, height }
    top += height
    return row
  })
  return { items, totalHeight: top }
})
const mediumStartIndex = computed(() => findMediumStartIndex(mediumRows.value.items, mediumScrollTop.value))
const mediumEndIndex = computed(() => {
  const rows = mediumRows.value.items
  const viewportBottom = mediumScrollTop.value + mediumViewportHeight.value
  let index = mediumStartIndex.value

  while (index < rows.length && rows[index].top < viewportBottom) {
    index += 1
  }

  return Math.min(rows.length, index + mediumOverscan)
})
const mediumVisibleFiles = computed(() => mediumRows.value.items.slice(mediumStartIndex.value, mediumEndIndex.value))
const mediumSpacerHeight = computed(() => `${mediumRows.value.totalHeight}px`)

watch(() => [props.files, props.currentPoolId, props.guestThumbnailBaseUrl] as const, () => {
  mediumScrollTop.value = 0
  pruneThumbnailStates()
  void nextTick(updateMediumViewport)
}, { deep: false })

watch(() => props.viewMode, () => {
  void nextTick(updateMediumViewport)
  if (props.viewMode === 'medium-list') {
    requestVisibleMediumThumbnails()
  } else if (props.viewMode === 'grid') {
    requestVisibleGridThumbnails()
  }
})

watch(mediumVisibleFiles, () => {
  if (props.viewMode !== 'medium-list') return
  requestVisibleMediumThumbnails()
}, { immediate: true })

watch(() => props.guestAccessPassword, () => {
  clearThumbnailStates()
  if (props.viewMode === 'medium-list') requestVisibleMediumThumbnails()
  if (props.viewMode === 'grid') requestVisibleGridThumbnails()
})

function handleTouchStart(e: TouchEvent, file: FileItem) {
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    const touch = e.touches[0]
    const syntheticEvent = new MouseEvent('contextmenu', {
      clientX: touch.clientX,
      clientY: touch.clientY,
      bubbles: false
    }) as MouseEvent
    contextHighlighted.value = file.path
    emit('contextmenu', syntheticEvent, file)
  }, longPressThreshold)
}

function handleTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleTouchMove() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function handleItemContext(e: MouseEvent, file: FileItem) {
  contextHighlighted.value = file.path
  emit('contextmenu', e, file)
}

function handleContainerContext(e: MouseEvent) {
  contextHighlighted.value = null
  emit('contextmenu', e)
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.toLocaleDateString(language.value || 'zh-CN')} ${date.toLocaleTimeString(language.value || 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })}`
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function getPreviewUrl(file: FileItem): string {
  if (file.directUrl) return file.directUrl
  if (file.fileUrl) return file.fileUrl
  if (props.guestBaseUrl) {
    const params = new URLSearchParams({ path: file.path })
    if (props.guestAccessPassword) params.set('password', props.guestAccessPassword)
    return `${props.guestBaseUrl}?${params.toString()}`
  }
  const params = new URLSearchParams({ path: file.path })
  const poolId = file.poolId || props.currentPoolId
  if (poolId) params.set('poolId', String(poolId))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `/api/files/preview?${params.toString()}`
}

function getThumbnailUrl(file: FileItem): string {
  if (props.guestThumbnailBaseUrl) {
    const params = new URLSearchParams({ path: file.path })
    if (props.guestAccessPassword) params.set('password', props.guestAccessPassword)
    return `${props.guestThumbnailBaseUrl}?${params.toString()}`
  }

  const params = new URLSearchParams({ path: file.path })
  const poolId = file.poolId || props.currentPoolId
  if (poolId) params.set('poolId', String(poolId))
  const token = localStorage.getItem('token')
  if (token) params.set('token', token)
  return `/api/files/thumbnail?${params.toString()}`
}

function isActiveSort(key: FileSortKey) {
  return props.sortKey === key
}

function sortIconName(key: FileSortKey) {
  if (!isActiveSort(key)) return 'chevron-down'
  return props.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'
}

function updateMediumViewport() {
  if (!mediumContainer.value) return
  mediumViewportHeight.value = mediumContainer.value.clientHeight || 520
}

function handleMediumScroll(event: Event) {
  const target = event.target as HTMLElement
  mediumScrollTop.value = target.scrollTop
  mediumViewportHeight.value = target.clientHeight || mediumViewportHeight.value
}

function ensureGridObserver() {
  if (gridObserver || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return gridObserver
  }

  gridObserver = new IntersectionObserver((entries) => {
    let nextVisible = new Set(gridVisibleThumbnailKeys.value)
    let changed = false

    for (const entry of entries) {
      const key = gridObservedElements.get(entry.target)
      if (!key) continue

      if (entry.isIntersecting) {
        if (!nextVisible.has(key)) {
          nextVisible.add(key)
          changed = true
        }
        const file = props.files.find((item) => getThumbnailKey(item) === key)
        if (file) requestThumbnailIfNeeded(file)
      } else if (nextVisible.delete(key)) {
        changed = true
      }
    }

    if (changed) {
      gridVisibleThumbnailKeys.value = nextVisible
    }
  }, {
    root: null,
    rootMargin: '160px 0px',
    threshold: 0.01
  })

  return gridObserver
}

function setGridThumbnailRef(element: Element | ComponentPublicInstance | null, file: FileItem) {
  const key = getThumbnailKey(file)
  const existingElement = gridThumbnailElements.get(key)

  if (existingElement && existingElement !== element) {
    gridObserver?.unobserve(existingElement)
    gridObservedElements.delete(existingElement)
    gridThumbnailElements.delete(key)
  }

  if (!(element instanceof Element) || !isVideoFile(file)) {
    if (!element && existingElement) {
      removeGridVisibleThumbnailKey(key)
    }
    return
  }

  const observer = ensureGridObserver()
  gridObservedElements.set(element, key)
  gridThumbnailElements.set(key, element)

  if (!observer) {
    addGridVisibleThumbnailKey(key)
    requestThumbnailIfNeeded(file)
    return
  }

  observer.observe(element)
}

function addGridVisibleThumbnailKey(key: string) {
  if (gridVisibleThumbnailKeys.value.has(key)) return
  gridVisibleThumbnailKeys.value = new Set([...gridVisibleThumbnailKeys.value, key])
}

function removeGridVisibleThumbnailKey(key: string) {
  if (!gridVisibleThumbnailKeys.value.has(key)) return
  const next = new Set(gridVisibleThumbnailKeys.value)
  next.delete(key)
  gridVisibleThumbnailKeys.value = next
}

function requestVisibleMediumThumbnails() {
  for (const item of mediumVisibleFiles.value) {
    requestThumbnailIfNeeded(item.file)
  }
}

function requestVisibleGridThumbnails() {
  for (const file of props.files) {
    const key = getThumbnailKey(file)
    if (gridVisibleThumbnailKeys.value.has(key)) {
      requestThumbnailIfNeeded(file)
    }
  }
}

function isVideoFile(file: FileItem) {
  return file.type === 'file' && getFileIcon(file) === 'video'
}

function isMediaThumbnailFile(file: FileItem) {
  return file.type === 'file' && (getFileIcon(file) === 'image' || isVideoFile(file))
}

function getThumbnailKey(file: FileItem) {
  const scope = props.guestThumbnailBaseUrl || props.guestBaseUrl || file.poolId || props.currentPoolId || 'default'
  return `${scope}:${file.path}:${file.modified}:${file.size}`
}

function clampAspectRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(2.4, Math.max(0.35, value))
}

function getDisplayAspectRatio(file: FileItem) {
  if (!isMediaThumbnailFile(file)) return 1
  const ratio = mediaAspectRatios.value[getThumbnailKey(file)]
  if (ratio) return clampAspectRatio(ratio)
  return isVideoFile(file) ? 16 / 9 : 1
}

function getGridThumbnailFrameStyle(file: FileItem) {
  const ratio = getDisplayAspectRatio(file)
  const width = Math.min(100, ratio * 100)
  const height = Math.min(100, 100 / ratio)
  return {
    width: `${width}%`,
    height: `${height}%`
  }
}

function getMediumThumbnailSize(file: FileItem) {
  const ratio = getDisplayAspectRatio(file)
  const maxWidth = mediumThumbMaxWidth
  const maxHeight = ratio < 1 ? mediumThumbPortraitMaxHeight : mediumThumbLandscapeMaxHeight
  let width = maxWidth
  let height = Math.round(maxWidth / ratio)

  if (height > maxHeight) {
    height = maxHeight
    width = Math.round(maxHeight * ratio)
  }

  return { width, height }
}

function getMediumThumbnailFrameStyle(file: FileItem) {
  const { width, height } = getMediumThumbnailSize(file)

  return {
    width: `${width}px`,
    height: `${height}px`
  }
}

function getMediumRowHeight(file: FileItem) {
  if (!isMediaThumbnailFile(file)) return mediumDefaultRowHeight
  const { height } = getMediumThumbnailSize(file)
  return Math.max(mediumDefaultRowHeight, height + mediumRowVerticalPadding)
}

function findMediumStartIndex(rows: Array<{ top: number; height: number }>, scrollTop: number) {
  if (rows.length === 0) return 0
  let low = 0
  let high = rows.length - 1
  let result = 0

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (rows[mid].top + rows[mid].height < scrollTop) {
      low = mid + 1
    } else {
      result = mid
      high = mid - 1
    }
  }

  return Math.max(0, result - mediumOverscan)
}

function handleThumbnailLoad(event: Event, file: FileItem) {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return
  const ratio = image.naturalWidth / image.naturalHeight
  if (!Number.isFinite(ratio) || ratio <= 0) return
  const key = getThumbnailKey(file)
  if (mediaAspectRatios.value[key] === ratio) return
  mediaAspectRatios.value = {
    ...mediaAspectRatios.value,
    [key]: ratio
  }
}

function getThumbnailState(file: FileItem) {
  return thumbnailStates.value[getThumbnailKey(file)]
}

function hasThumbnailKey(thumbnailKey: string) {
  return props.files.some((file) => getThumbnailKey(file) === thumbnailKey)
}

function isVisibleThumbnailFile(thumbnailKey: string) {
  if (props.viewMode === 'medium-list') {
    return mediumVisibleFiles.value.some((item) => getThumbnailKey(item.file) === thumbnailKey)
  }
  if (props.viewMode === 'grid') {
    return gridVisibleThumbnailKeys.value.has(thumbnailKey)
  }
  return false
}

function clearThumbnailRetryTimer(thumbnailKey: string) {
  const timer = thumbnailRetryTimers.get(thumbnailKey)
  if (timer) window.clearTimeout(timer)
  thumbnailRetryTimers.delete(thumbnailKey)
}

function setThumbnailState(thumbnailKey: string, state: ThumbnailState) {
  if (!hasThumbnailKey(thumbnailKey)) return
  thumbnailStates.value = {
    ...thumbnailStates.value,
    [thumbnailKey]: state
  }
}

function enqueueThumbnailRequest(file: FileItem) {
  const key = getThumbnailKey(file)
  if (queuedThumbnailKeys.has(key)) return
  queuedThumbnailKeys.add(key)
  thumbnailRequestQueue.push({ key, file })
  drainThumbnailQueue()
}

function drainThumbnailQueue() {
  while (activeThumbnailRequests < maxConcurrentThumbnailRequests && thumbnailRequestQueue.length > 0) {
    const { key, file } = thumbnailRequestQueue.shift()!
    queuedThumbnailKeys.delete(key)

    if (!hasThumbnailKey(key)) {
      continue
    }

    if (!isVisibleThumbnailFile(key)) {
      const state = thumbnailStates.value[key]
      if (state?.status === 'loading') {
        setThumbnailState(key, { ...state, status: 'idle' })
      }
      continue
    }

    activeThumbnailRequests += 1
    void fetchThumbnail(key, file).finally(() => {
      activeThumbnailRequests -= 1
      drainThumbnailQueue()
    })
  }
}

function requestThumbnailIfNeeded(file: FileItem, force = false) {
  if (!isVideoFile(file)) return
  const key = getThumbnailKey(file)
  if (!isVisibleThumbnailFile(key)) {
    const current = thumbnailStates.value[key]
    if (force && current?.status === 'pending') {
      setThumbnailState(key, { ...current, status: 'idle' })
    }
    return
  }

  const current = thumbnailStates.value[key]
  if (current && ['loading', 'ready', 'unsupported', 'failed'].includes(current.status)) return
  if (!force && current?.status === 'pending') return

  clearThumbnailRetryTimer(key)
  setThumbnailState(key, {
    status: 'loading',
    url: current?.url || '',
    duration: current?.duration,
    retryCount: current?.retryCount || 0
  })

  enqueueThumbnailRequest(file)
}

async function fetchThumbnail(key: string, file: FileItem) {
  const state = thumbnailStates.value[key]
  const retryCount = state?.retryCount || 0

  try {
    const response = await fetch(getThumbnailUrl(file), { credentials: 'include' })
    if (!hasThumbnailKey(key)) return

    const durationHeader = response.headers.get('X-Video-Duration')
    const duration = durationHeader ? Number(durationHeader) : state?.duration

    if (response.status === 202) {
      const nextRetry = retryCount + 1
      setThumbnailState(key, { status: 'pending', url: state?.url || '', duration, retryCount: nextRetry })
      if (nextRetry <= 8) {
        clearThumbnailRetryTimer(key)
        const timer = window.setTimeout(() => {
          thumbnailRetryTimers.delete(key)
          requestThumbnailIfNeeded(file, true)
        }, Math.min(1000 + nextRetry * 750, 6000))
        thumbnailRetryTimers.set(key, timer)
      }
      return
    }

    if (response.status === 415) {
      setThumbnailState(key, { status: 'unsupported', url: '', duration, retryCount })
      return
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const blob = await response.blob()
    if (!hasThumbnailKey(key)) return

    const url = URL.createObjectURL(blob)
    thumbnailObjectUrls.add(url)
    const currentState = thumbnailStates.value[key]
    if (currentState?.url) {
      URL.revokeObjectURL(currentState.url)
      thumbnailObjectUrls.delete(currentState.url)
    }
    setThumbnailState(key, { status: 'ready', url, duration, retryCount })
  } catch {
    setThumbnailState(key, { status: 'failed', url: state?.url || '', duration: state?.duration, retryCount })
  }
}

function pruneThumbnailStates() {
  const keys = new Set(props.files.map((file) => getThumbnailKey(file)))
  const next: Record<string, ThumbnailState> = {}
  const nextRatios: Record<string, number> = {}
  for (const [key, state] of Object.entries(thumbnailStates.value)) {
    if (keys.has(key)) {
      next[key] = state
      continue
    }
    if (state.url) {
      URL.revokeObjectURL(state.url)
      thumbnailObjectUrls.delete(state.url)
    }
    const timer = thumbnailRetryTimers.get(key)
    if (timer) window.clearTimeout(timer)
    thumbnailRetryTimers.delete(key)
    queuedThumbnailKeys.delete(key)
    const element = gridThumbnailElements.get(key)
    if (element) {
      gridObserver?.unobserve(element)
      gridObservedElements.delete(element)
      gridThumbnailElements.delete(key)
    }
    removeGridVisibleThumbnailKey(key)
  }
  for (const [key, ratio] of Object.entries(mediaAspectRatios.value)) {
    if (keys.has(key)) nextRatios[key] = ratio
  }
  mediaAspectRatios.value = nextRatios
  thumbnailStates.value = next
}

function clearThumbnailStates() {
  for (const state of Object.values(thumbnailStates.value)) {
    if (state.url) {
      URL.revokeObjectURL(state.url)
      thumbnailObjectUrls.delete(state.url)
    }
  }
  for (const timer of thumbnailRetryTimers.values()) {
    window.clearTimeout(timer)
  }
  thumbnailRetryTimers.clear()
  queuedThumbnailKeys.clear()
  thumbnailRequestQueue.length = 0
  thumbnailStates.value = {}
  mediaAspectRatios.value = {}
}

onBeforeUnmount(() => {
  for (const timer of thumbnailRetryTimers.values()) {
    window.clearTimeout(timer)
  }
  thumbnailRetryTimers.clear()
  for (const url of thumbnailObjectUrls) {
    URL.revokeObjectURL(url)
  }
  thumbnailObjectUrls.clear()
  queuedThumbnailKeys.clear()
  thumbnailRequestQueue.length = 0
  gridObserver?.disconnect()
  gridObserver = null
  gridObservedElements.clear()
  gridThumbnailElements.clear()
  gridVisibleThumbnailKeys.value = new Set()
  mediaAspectRatios.value = {}
})
</script>

<template>
  <div class="card overflow-hidden" style="padding: 0" @contextmenu.prevent="handleContainerContext">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>

    <div
      v-else-if="files.length === 0"
      class="flex flex-col items-center justify-center py-12"
      style="color: var(--text-secondary-color)"
    >
      <Icon name="folder" class="mb-3 h-16 w-16" />
      <p>{{ t('file.empty', 'No files yet') }}</p>
    </div>

    <div v-else-if="viewMode === 'grid'" class="p-3">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        <div
          v-for="file in files"
          :key="file.path"
          class="file-grid-item group cursor-pointer overflow-hidden rounded-lg border transition-all"
          :class="[
            selectedFiles?.has(file.path) ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-600' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600',
            contextHighlighted === file.path ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''
          ]"
          style="background-color: var(--hover-color); touch-action: manipulation"
          @click.prevent="emit('open', file)"
          @contextmenu.prevent.stop="handleItemContext($event, file)"
          @touchstart.passive="handleTouchStart($event, file)"
          @touchend="handleTouchEnd"
          @touchmove="handleTouchMove"
        >
          <div :ref="(element) => setGridThumbnailRef(element, file)" class="thumb-container relative">
            <div v-if="selectMode" class="absolute left-1.5 top-1.5 z-10" @click.stop>
              <input type="checkbox" :checked="selectedFiles?.has(file.path)" @change="emit('toggleSelect', file.path)" />
            </div>

            <div v-if="getFileIcon(file) === 'image'" class="thumb-media-frame" :style="getGridThumbnailFrameStyle(file)">
              <img
                :src="getPreviewUrl(file)"
                :alt="file.name"
                class="thumb-img"
                loading="lazy"
                draggable="false"
                @load="handleThumbnailLoad($event, file)"
              />
            </div>

            <div v-else-if="getThumbnailState(file)?.status === 'ready'" class="thumb-media-frame relative" :style="getGridThumbnailFrameStyle(file)">
              <img
                :src="getThumbnailState(file)?.url"
                :alt="file.name"
                class="thumb-img"
                loading="lazy"
                draggable="false"
                @load="handleThumbnailLoad($event, file)"
              />
              <span
                v-if="formatDuration(getThumbnailState(file)?.duration)"
                class="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-none text-white"
              >
                {{ formatDuration(getThumbnailState(file)?.duration) }}
              </span>
            </div>

            <div v-else class="thumb-icon">
              <Icon :name="getFileIconInfo(file).icon" :class="['h-10 w-10', getFileIconInfo(file).color]" />
            </div>
          </div>

          <div class="px-2 py-1.5">
            <p class="truncate text-center text-xs" style="color: var(--text-color)" :title="file.name">{{ file.name }}</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="viewMode === 'medium-list'"
      ref="mediumContainer"
      class="max-h-[calc(100vh-14rem)] min-h-[22rem] overflow-auto"
      @scroll="handleMediumScroll"
    >
      <div class="relative" :style="{ height: mediumSpacerHeight }">
        <div
          v-for="{ file, top, height } in mediumVisibleFiles"
          :key="file.path"
          class="file-row absolute left-0 right-0 flex cursor-pointer items-center gap-3 border-b px-3 py-3 transition-colors sm:px-4"
          :class="[
            selectedFiles?.has(file.path) ? 'bg-blue-50 dark:bg-blue-900/20' : '',
            contextHighlighted === file.path ? 'bg-blue-50/70 dark:bg-blue-900/30' : ''
          ]"
          :style="{ top: `${top}px`, height: `${height}px`, borderColor: 'var(--border-color)', touchAction: 'manipulation' }"
          @click.prevent="emit('open', file)"
          @contextmenu.prevent.stop="handleItemContext($event, file)"
          @touchstart.passive="handleTouchStart($event, file)"
          @touchend="handleTouchEnd"
          @touchmove="handleTouchMove"
        >
          <input
            v-if="selectMode"
            type="checkbox"
            class="flex-shrink-0"
            :checked="selectedFiles?.has(file.path)"
            @change="emit('toggleSelect', file.path)"
            @click.stop
          />

          <div class="medium-thumb-slot flex w-[120px] flex-shrink-0 items-center justify-center self-stretch">
            <div v-if="getFileIcon(file) === 'image'" class="medium-thumb-frame" :style="getMediumThumbnailFrameStyle(file)">
              <img
                :src="getPreviewUrl(file)"
                :alt="file.name"
                class="thumb-img"
                loading="lazy"
                draggable="false"
                @load="handleThumbnailLoad($event, file)"
              />
            </div>
            <div v-else-if="getThumbnailState(file)?.status === 'ready'" class="medium-thumb-frame relative" :style="getMediumThumbnailFrameStyle(file)">
              <img
                :src="getThumbnailState(file)?.url"
                :alt="file.name"
                class="thumb-img"
                loading="lazy"
                draggable="false"
                @load="handleThumbnailLoad($event, file)"
              />
              <span
                v-if="formatDuration(getThumbnailState(file)?.duration)"
                class="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-none text-white"
              >
                {{ formatDuration(getThumbnailState(file)?.duration) }}
              </span>
            </div>
            <div v-else class="medium-thumb-placeholder">
              <Icon :name="getFileIconInfo(file).icon" :class="['h-8 w-8', getFileIconInfo(file).color]" />
            </div>
          </div>

          <div class="min-w-0 flex-1">
            <p class="line-clamp-2 text-sm font-medium leading-5" style="color: var(--text-color)" :title="file.name">
              {{ file.name }}
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style="color: var(--text-secondary-color)">
              <span>{{ formatDate(file.modified) }}</span>
              <span v-if="formatDuration(getThumbnailState(file)?.duration)">{{ formatDuration(getThumbnailState(file)?.duration) }}</span>
              <span v-if="file.type === 'file'">{{ formatSize(file.size) }}</span>
            </div>
          </div>

          <div v-if="showActions" class="flex flex-shrink-0 items-center gap-0.5" @click.stop>
            <button
              class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
              :title="t('common.details', 'Details')"
              @click="emit('detail', file)"
            >
              <Icon name="circle-information" class="h-4 w-4" style="color: var(--text-secondary-color)" />
            </button>
            <button
              v-if="file.type === 'file'"
              class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
              :title="t('file.download', 'Download')"
              @click="emit('download', file)"
            >
              <Icon name="download" class="h-4 w-4" style="color: var(--text-secondary-color)" />
            </button>
            <button
              v-if="!readOnlyActions"
              class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
              :title="t('common.delete', 'Delete')"
              @click="emit('delete', file)"
            >
              <Icon name="trash" class="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div
        class="grid grid-cols-12 gap-2 border-b px-4 py-2 text-xs font-medium"
        style="color: var(--text-secondary-color); border-color: var(--border-color)"
      >
        <button class="col-span-8 flex items-center gap-1 text-left sm:col-span-5" @click="emit('sort', 'name')">
          <span>{{ t('file.name', 'Name') }}</span>
          <Icon :name="sortIconName('name')" class="h-3.5 w-3.5" :class="isActiveSort('name') ? '' : 'opacity-40'" />
        </button>
        <button class="col-span-2 hidden items-center justify-end gap-1 text-right sm:flex" @click="emit('sort', 'size')">
          <span>{{ t('file.size', 'Size') }}</span>
          <Icon :name="sortIconName('size')" class="h-3.5 w-3.5" :class="isActiveSort('size') ? '' : 'opacity-40'" />
        </button>
        <button class="col-span-3 hidden items-center justify-end gap-1 text-right md:flex" @click="emit('sort', 'modified')">
          <span>{{ t('file.modified', 'Modified') }}</span>
          <Icon :name="sortIconName('modified')" class="h-3.5 w-3.5" :class="isActiveSort('modified') ? '' : 'opacity-40'" />
        </button>
        <div v-if="showActions" class="col-span-4 text-right sm:col-span-2">{{ t('common.actions', 'Actions') }}</div>
      </div>

      <div
        v-for="file in files"
        :key="file.path"
        class="file-row grid grid-cols-12 items-center gap-2 border-b px-4 py-2.5 last:border-0"
        :class="[
          selectedFiles?.has(file.path) ? 'bg-blue-50 dark:bg-blue-900/20' : '',
          contextHighlighted === file.path ? 'bg-blue-50/70 dark:bg-blue-900/30' : '',
          'cursor-pointer'
        ]"
        style="border-color: var(--border-color); touch-action: manipulation"
        @click.prevent="emit('open', file)"
        @contextmenu.prevent.stop="handleItemContext($event, file)"
        @touchstart.passive="handleTouchStart($event, file)"
        @touchend="handleTouchEnd"
        @touchmove="handleTouchMove"
      >
        <div class="col-span-8 flex min-w-0 items-center gap-1.5 sm:col-span-5">
          <input
            v-if="selectMode"
            type="checkbox"
            :checked="selectedFiles?.has(file.path)"
            @change="emit('toggleSelect', file.path)"
            @click.stop
          />
          <Icon :name="getFileIconInfo(file).icon" :class="['h-5 w-5 flex-shrink-0', getFileIconInfo(file).color]" />
          <span class="truncate text-sm" style="color: var(--text-color)">{{ file.name }}</span>
        </div>

        <div class="col-span-2 hidden text-right text-xs sm:block" style="color: var(--text-secondary-color)">
          {{ file.type === 'folder' ? '-' : formatSize(file.size) }}
        </div>

        <div class="col-span-3 hidden text-right text-xs md:block" style="color: var(--text-secondary-color)">
          {{ formatDate(file.modified) }}
        </div>

        <div v-if="showActions" class="col-span-4 flex items-center justify-end gap-0.5 sm:col-span-2 sm:gap-1" @click.stop>
          <button
            class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
            :title="t('common.details', 'Details')"
            @click="emit('detail', file)"
          >
            <Icon name="circle-information" class="h-4 w-4" style="color: var(--text-secondary-color)" />
          </button>

          <button
            v-if="file.type === 'file'"
            class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
            :title="t('file.download', 'Download')"
            @click="emit('download', file)"
          >
            <Icon name="download" class="h-4 w-4" style="color: var(--text-secondary-color)" />
          </button>

          <button
            v-if="!readOnlyActions"
            class="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md p-2 transition-colors hover:opacity-80 sm:p-1.5"
            :title="t('common.delete', 'Delete')"
            @click="emit('delete', file)"
          >
            <Icon name="trash" class="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
