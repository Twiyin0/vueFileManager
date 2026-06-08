<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('cancel')"/>
      <!-- 对话框 -->
      <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">{{ title }}</h3>
        <p class="text-sm mb-6" style="color: var(--text-secondary-color)">{{ message }}</p>
        <div class="flex justify-end gap-3">
          <button @click="emit('cancel')" class="btn-secondary text-sm">
            {{ cancelText || '取消' }}
          </button>
          <button @click="emit('confirm')" :class="danger ? 'btn-danger text-sm' : 'btn-primary text-sm'">
            {{ confirmText || '确认' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
