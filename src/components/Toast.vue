<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const props = defineProps<{
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.show, (val) => {
  if (val) {
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
      setTimeout(() => emit('close'), 300)
    }, props.duration || 2500)
  }
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
        <div class="px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 pointer-events-auto"
          :class="{
            'bg-green-500 text-white': type === 'success',
            'bg-red-500 text-white': type === 'error',
            'bg-blue-500 text-white': type === 'info' || !type
          }">
          <svg v-if="type === 'success'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <svg v-else-if="type === 'error'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          {{ message }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
