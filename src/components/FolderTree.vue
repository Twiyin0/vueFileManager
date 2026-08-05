<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import { useI18n } from '@/composables/useI18n'
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

const { t } = useI18n()

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
      .filter((file) => file.type === 'folder')
      .map((file) => ({
        name: file.name,
        path: file.path,
        expanded: false,
        children: [],
        loaded: false,
        poolId: file.poolId,
        isPool: file.isPool
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
    return
  }
  emit('navigate', node.path, props.poolId)
}

async function loadPools() {
  try {
    const res = await api.get<{ pools: any[] }>('/storage-pools')
    pools.value = res.pools.map((pool) => ({ id: pool.id, name: pool.name }))
  } catch {}
}

async function loadRoot() {
  if (!props.poolId) {
    await loadPools()
    tree.value = pools.value.map((pool) => ({
      name: pool.name,
      path: '',
      expanded: false,
      children: [],
      loaded: false,
      poolId: pool.id,
      isPool: true
    }))
    return
  }

  loading.value = true
  try {
    const res = await api.get<{ files: any[] }>(`/files/list?poolId=${props.poolId}`)
    tree.value = res.files
      .filter((file) => file.type === 'folder')
      .map((file) => ({
        name: file.name,
        path: file.path,
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
    <div
      class="flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover"
      :class="!poolId && currentPath === '' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'dark:text-dark-text text-light-text'"
      @click="emit('navigate', '')"
    >
      <Icon name="house-line" class="h-4 w-4" />
      <span>{{ poolId ? t('folderTree.backToPools', 'Back to Storage Pools') : t('folderTree.allPools', 'All Storage Pools') }}</span>
    </div>

    <template v-for="node in tree" :key="node.poolId ? `pool-${node.poolId}` : node.path">
      <div
        class="ml-2 flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover"
        :class="(node.isPool && poolId === node.poolId) || (!node.isPool && currentPath === node.path)
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
          : 'dark:text-dark-text text-light-text'"
        @click="toggleNode(node); navigate(node)"
      >
        <Icon v-if="!node.isPool" name="chevron-right" class="h-3 w-3 transition-transform" :class="node.expanded ? 'rotate-90' : ''" />
        <Icon v-if="node.isPool" name="container-storage" class="h-4 w-4 text-blue-500" />
        <Icon v-else :name="node.expanded ? 'folder-minus' : 'folder-plus'" class="h-4 w-4 text-blue-500" />
        <span class="truncate">{{ node.name }}</span>
      </div>

      <template v-if="node.expanded && !node.isPool">
        <div
          v-for="child in node.children"
          :key="child.path"
          class="ml-6 flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover"
          :class="currentPath === child.path ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'dark:text-dark-text text-light-text'"
          @click="toggleNode(child); navigate(child)"
        >
          <Icon name="chevron-right" class="h-3 w-3 transition-transform" :class="child.expanded ? 'rotate-90' : ''" />
          <Icon :name="child.expanded ? 'folder-minus' : 'folder-plus'" class="h-4 w-4 text-blue-500" />
          <span class="truncate">{{ child.name }}</span>
        </div>
      </template>
    </template>

    <div v-if="loading" class="px-2 py-1 text-xs text-gray-400">{{ t('folderTree.loading', 'Loading...') }}</div>
  </div>
</template>
