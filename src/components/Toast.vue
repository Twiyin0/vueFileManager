<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import Icon from '@/components/Icon.vue'

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
        <div class="px-4 py-2.5 rounded-lg shadow-sm text-sm font-medium flex items-center gap-2 pointer-events-auto"
          :class="{
            'bg-green-500 text-white': type === 'success',
            'bg-red-500 text-white': type === 'error',
            'bg-blue-500 text-white': type === 'info' || !type
          }">
          <Icon v-if="type === 'success'" name="check" class="w-4 h-4" />
          <Icon v-else-if="type === 'error'" name="xmark" class="w-4 h-4" />
          <Icon v-else name="circle-information" class="w-4 h-4" />
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
