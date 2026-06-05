<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'

interface TreeNode {
  name: string
  path: string
  expanded: boolean
  children: TreeNode[]
  loaded: boolean
  poolId?: number
  isPool?: boolean
}

const props = defineProps<{
  currentPath: string
  poolId?: number
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string, poolId?: number): void
}>()

const tree = ref<TreeNode[]>([])
const pools = ref<{ id: number; name: string }[]>([])
const loading = ref(false)

async function loadChildren(node: TreeNode) {
  if (node.loaded) return
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (node.path) params.set('path', node.path)
    if (props.poolId) params.set('poolId', String(props.poolId))
    const query = params.toString() ? `?${params}` : ''
    const res = await api.get<{ files: any[] }>(`/files/list${query}`)
    node.children = res.files
      .filter(f => f.type === 'folder')
      .map(f => ({
        name: f.name,
        path: f.path,
        expanded: false,
        children: [],
        loaded: false,
        poolId: f.poolId,
        isPool: f.isPool
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
  if (node.isPool && node.poolId) {
    emit('navigate', '', node.poolId)
  } else {
    emit('navigate', node.path, props.poolId)
  }
}

async function loadPools() {
  try {
    const res = await api.get<{ pools: any[] }>('/storage-pools')
    pools.value = res.pools.map(p => ({ id: p.id, name: p.name }))
  } catch {}
}

async function loadRoot() {
  if (!props.poolId) {
    // 无 poolId 时加载存储池列表
    await loadPools()
    tree.value = pools.value.map(p => ({
      name: p.name,
      path: '',
      expanded: false,
      children: [],
      loaded: false,
      poolId: p.id,
      isPool: true
    }))
    return
  }

  loading.value = true
  try {
    const res = await api.get<{ files: any[] }>(`/files/list?poolId=${props.poolId}`)
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
</script>

<template>
  <div class="folder-tree text-sm">
    <!-- 根目录 / 存储池列表入口 -->
    <div @click="emit('navigate', '')"
      class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover"
      :class="!poolId && currentPath === '' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
      <Icon name="house-line" class="w-4 h-4" />
      <span>{{ poolId ? '返回存储池' : '全部存储池' }}</span>
    </div>

    <!-- 树节点 -->
    <template v-for="node in tree" :key="node.poolId ? `pool-${node.poolId}` : node.path">
      <div @click="toggleNode(node); navigate(node)"
        class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover ml-2"
        :class="(node.isPool && poolId === node.poolId) || (!node.isPool && currentPath === node.path) ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
        <Icon v-if="!node.isPool" name="chevron-right" class="w-3 h-3 transition-transform" :class="node.expanded ? 'rotate-90' : ''" />
        <Icon v-if="node.isPool" name="container-storage" class="w-4 h-4 text-blue-500" />
        <Icon v-else :name="node.expanded ? 'folder-minus' : 'folder-plus'" class="w-4 h-4 text-blue-500" />
        <span class="truncate">{{ node.name }}</span>
      </div>

      <!-- 子节点 -->
      <template v-if="node.expanded && !node.isPool">
        <div v-for="child in node.children" :key="child.path"
          @click="toggleNode(child); navigate(child)"
          class="flex items-center gap-1 px-2 py-1.5 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-dark-hover ml-6"
          :class="currentPath === child.path ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'dark:text-dark-text text-light-text'">
          <Icon name="chevron-right" class="w-3 h-3 transition-transform" :class="child.expanded ? 'rotate-90' : ''" />
          <Icon :name="child.expanded ? 'folder-minus' : 'folder-plus'" class="w-4 h-4 text-blue-500" />
          <span class="truncate">{{ child.name }}</span>
        </div>
      </template>
    </template>

    <div v-if="loading" class="text-xs text-gray-400 px-2 py-1">加载中...</div>
  </div>
</template>
