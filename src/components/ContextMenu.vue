<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  item?: any
  selectedItems?: any[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string, item?: any): void
}>()

const menuRef = ref<HTMLElement>()

function handleClickOutside(e: MouseEvent) {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

function handleAction(action: string) {
  emit('action', action, props.item)
  emit('close')
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('contextmenu', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('contextmenu', handleClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" ref="menuRef"
      class="fixed z-50 bg-white dark:bg-dark-card rounded-lg shadow-xl border dark:border-dark-border border-light-border py-1 min-w-[180px]"
      :style="{ left: x + 'px', top: y + 'px' }">
      <!-- 单文件操作 -->
      <template v-if="item">
        <button @click="handleAction('open')" v-if="item.type === 'folder'"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📂 打开
        </button>
        <button @click="handleAction('preview')" v-if="item.type === 'file'"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          👁️ 预览
        </button>
        <button @click="handleAction('download')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          ⬇️ 下载
        </button>
        <div class="border-t dark:border-dark-border border-light-border my-1"></div>
        <button @click="handleAction('rename')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          ✏️ 重命名
        </button>
        <button @click="handleAction('move')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📦 移动到
        </button>
        <button @click="handleAction('copy')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📋 复制
        </button>
        <button @click="handleAction('share')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          🔗 分享
        </button>
        <button @click="handleAction('favourite')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          ⭐ 收藏
        </button>
        <div class="border-t dark:border-dark-border border-light-border my-1"></div>
        <button @click="handleAction('info')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          ℹ️ 详情
        </button>
        <button @click="handleAction('delete')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2">
          🗑️ 删除
        </button>
      </template>

      <!-- 批量操作 -->
      <template v-else-if="selectedItems && selectedItems.length > 0">
        <div class="px-4 py-2 text-xs text-gray-500 dark:text-dark-text-secondary">
          已选择 {{ selectedItems.length }} 项
        </div>
        <button @click="handleAction('batch-download')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          ⬇️ 打包下载
        </button>
        <button @click="handleAction('batch-move')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📦 批量移动
        </button>
        <div class="border-t dark:border-dark-border border-light-border my-1"></div>
        <button @click="handleAction('batch-delete')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2">
          🗑️ 批量删除
        </button>
      </template>

      <!-- 空白区域 -->
      <template v-else>
        <button @click="handleAction('new-folder')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📁 新建文件夹
        </button>
        <button @click="handleAction('upload')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          📤 上传文件
        </button>
        <button @click="handleAction('remote-upload')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          🌐 远程上传
        </button>
        <button @click="handleAction('refresh')"
          class="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-hover dark:text-dark-text text-light-text flex items-center gap-2">
          🔄 刷新
        </button>
      </template>
    </div>
  </Teleport>
</template>
