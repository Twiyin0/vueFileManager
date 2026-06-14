<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'

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

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('cancel')" />
      <div class="relative card max-h-[90vh] w-full max-w-sm overflow-y-auto" style="padding: 1.5rem">
        <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ title }}</h3>
        <p class="mb-6 text-sm" style="color: var(--text-secondary-color)">{{ message }}</p>
        <div class="flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="emit('cancel')">
            {{ cancelText || t('common.cancel', 'Cancel') }}
          </button>
          <button :class="danger ? 'btn-danger text-sm' : 'btn-primary text-sm'" @click="emit('confirm')">
            {{ confirmText || t('common.confirm', 'Confirm') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
