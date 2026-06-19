<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '@/api'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  folderPath: string
  folderName: string
  poolId?: number
  editShare?: { id: number; label: string; permissions: string } | null
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const { t } = useI18n()
const label = ref(props.folderName || '')
const loading = ref(false)
const error = ref('')

const perms = ref({
  read: true,
  write: false,
  delete: false,
  edit: false
})

watch(
  () => props.editShare,
  (share) => {
    if (share) {
      label.value = share.label
      const parts = share.permissions.split(',').map((item) => item.trim())
      perms.value.read = parts.includes('read') || parts.includes('preview') || parts.includes('download')
      perms.value.write = parts.includes('write') || parts.includes('upload')
      perms.value.delete = parts.includes('delete')
      perms.value.edit = parts.includes('edit')
    }
  },
  { immediate: true }
)

watch(
  () => props.show,
  (value) => {
    if (value && !props.editShare) {
      label.value = props.folderName || ''
      perms.value = { read: true, write: false, delete: false, edit: false }
    }
    if (value) error.value = ''
  }
)

function getPermissionsString(): string {
  return Object.entries(perms.value)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key)
    .join(',')
}

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    const permissions = getPermissionsString()
    if (props.editShare) {
      await api.put(`/user/guest-shares/${props.editShare.id}`, {
        label: label.value || props.folderName,
        permissions
      })
    } else {
      await api.post('/user/guest-shares', {
        folderPath: props.folderPath,
        storagePoolId: props.poolId,
        label: label.value || props.folderName,
        permissions
      })
    }
    emit('done')
    emit('close')
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="dialog-overlay">
      <div class="dialog-backdrop" @click="emit('close')" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-md">
        <div class="dialog-section">
        <h3 class="dialog-title mb-2">
          {{ editShare ? t('guestShare.editTitle', 'Edit Guest Share') : t('guestShare.createTitle', 'Share to Guest Mode') }}
        </h3>
        <p class="dialog-description mb-4">
          {{
            editShare
              ? t('guestShare.editDescription', 'Update guest share permissions and display name.')
              : t('guestShare.createDescription', 'Share folder {name} to guest mode.').replace('{name}', folderName)
          }}
        </p>

        <div class="space-y-4">
          <div>
            <label class="dialog-form-label">{{ t('guestShare.displayName', 'Display Name') }}</label>
            <input v-model="label" type="text" class="input-field" :placeholder="t('guestShare.displayNamePlaceholder', 'Folder name shown to guests')" />
          </div>

          <div>
            <label class="dialog-form-label mb-2">{{ t('guestShare.permissionsTitle', 'Guest Permissions') }}</label>
            <div class="space-y-2.5">
              <label class="dialog-muted-block-strong flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.read" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.read', 'Read') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.readHint', '(preview and download files)') }}</span>
              </label>
              <label class="dialog-muted-block-strong flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.write" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.write', 'Write') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.writeHint', '(upload files and create folders)') }}</span>
              </label>
              <label class="dialog-muted-block-strong flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.delete" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.delete', 'Delete') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.deleteHint', '(delete files and folders)') }}</span>
              </label>
              <label class="dialog-muted-block-strong flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.edit" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.edit', 'Text Edit') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.editHint', '(edit file content and rename)') }}</span>
              </label>
            </div>
          </div>

          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </div>

        <div class="dialog-footer mt-5">
          <button class="btn-secondary text-sm" @click="emit('close')">{{ t('common.cancel', 'Cancel') }}</button>
          <button class="btn-primary text-sm" :disabled="loading" @click="handleSubmit">
            <span v-if="loading">{{ editShare ? t('guestShare.saving', 'Saving...') : t('guestShare.sharing', 'Sharing...') }}</span>
            <span v-else>{{ editShare ? t('common.save', 'Save') : t('guestShare.confirmShare', 'Confirm Share') }}</span>
          </button>
        </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
