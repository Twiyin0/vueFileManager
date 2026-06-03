<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '@/api'

interface TreeNode {
  name: string
  path: string
  expanded: boolean
  children: TreeNode[]
  loaded: boolean
}

const props = defineProps<{
  currentPath: string
  poolId?: number
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const tree = ref<TreeNode[]>([])
const loading = ref(false)

async function loadChildren(node: TreeNode) {
  if (node.loaded) return
  loading.value = true
  try {
    const query = node.path ? `?path=${encodeURIComponent(node.path)}` : ''
    const poolQuery = props.poolId ? `${query ? '&' : '?'}poolId=${props.poolId}` : ''
    const res = await api.get<{ files: any[] }>(`/files/list${query}${poolQuery}`)
    node.children = res.files
      .filter(f => f.type === 'folder')
      .map(f => ({
        name: f.name,
        path: f.path,
        expanded: false,
        children: [],
        loaded: false
      }))
    node.loaded = true
  } catch {} finally {
    loading.value = false
  }
}

function toggleNode(node: TreeNode) {
  node.expanded = !node.expanded
  if (node.expanded && !node.loaded) {
    loadChildren(node)
  }
}

function navigate(node: TreeNode) {
  emit('navigate', node.path)
}

async function loadRoot() {
  loading.value = true
  try {
    const poolQuery = props.poolId ? `?poolId=${props.poolId}` : ''
    const res = await api.get<{ files: any[] }>(`/files/list${poolQuery}`)
    tree.value = res.files
      .filter(f => f.type === 'folder')
      .map(f => ({
        name: f.name,
        path: f.path,
        expanded: false,
        children: [],
        loaded: false
      }))
  } catch {} finally {
    loading.value = false
  }
}

onMounted(loadRoot)

watch(() => props.poolId, loadRoot)

function renderNode(node: TreeNode, depth: number = 0): any {
  return { node, depth }
}
</script>

<template>
  <div class="folder-tree text-sm">
    <!-- 根目录 -->
    <div @click="emit('navigate', '')"
      class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
      :class="currentPath === '' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
      <span>根目录</span>
    </div>

    <!-- 树节点 -->
    <template v-for="node in tree" :key="node.path">
      <div @click="toggleNode(node); navigate(node)"
        class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover ml-2"
        :class="currentPath === node.path ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
        <svg class="w-3 h-3 transition-transform" :class="node.expanded ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
        <span class="text-sm">📁</span>
        <span class="truncate">{{ node.name }}</span>
      </div>

      <!-- 子节点 -->
      <template v-if="node.expanded">
        <div v-for="child in node.children" :key="child.path"
          @click="toggleNode(child); navigate(child)"
          class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover ml-6"
          :class="currentPath === child.path ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
          <svg class="w-3 h-3 transition-transform" :class="child.expanded ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span class="text-sm">📁</span>
          <span class="truncate">{{ child.name }}</span>
        </div>
      </template>
    </template>

    <div v-if="loading" class="text-xs text-gray-400 px-2 py-1">加载中...</div>
  </div>
</template>
