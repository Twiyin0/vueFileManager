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
    <div v-if="show" class="dialog-overlay">
      <div class="dialog-backdrop" @click="emit('cancel')" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-sm">
        <div class="dialog-section">
          <h3 class="dialog-title mb-2">{{ title }}</h3>
          <p class="dialog-description">{{ message }}</p>
          <div class="dialog-footer">
          <button class="btn-secondary text-sm" @click="emit('cancel')">
            {{ cancelText || t('common.cancel', 'Cancel') }}
          </button>
          <button :class="danger ? 'btn-danger text-sm' : 'btn-primary text-sm'" @click="emit('confirm')">
            {{ confirmText || t('common.confirm', 'Confirm') }}
          </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
