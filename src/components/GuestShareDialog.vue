<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  show: boolean
  folderPath: string
  folderName: string
  poolId?: number
  editShare?: { id: number; label: string; permissions: string; has_password?: boolean } | null
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const { t } = useI18n()
const authStore = useAuthStore()
const label = ref(props.folderName || '')
const loading = ref(false)
const error = ref('')
const password = ref('')
const usePassword = ref(false)
const displayFolderName = computed(() => props.folderName || t('common.rootDirectory', 'Root directory'))

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
      password.value = ''
      usePassword.value = !!share.has_password
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
      password.value = ''
      usePassword.value = false
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
    const passwordPayload = getPasswordPayload()
    if (props.editShare) {
      const payload: Record<string, unknown> = {
        label: label.value || props.folderName,
        permissions
      }
      if (passwordPayload !== undefined) payload.password = passwordPayload
      await api.put(`/user/guest-shares/${props.editShare.id}`, payload)
    } else {
      const res = await api.post<{ guestEnabled?: boolean }>('/user/guest-shares', {
        folderPath: props.folderPath,
        storagePoolId: props.poolId,
        label: label.value || props.folderName,
        permissions,
        password: passwordPayload
      })
      if (res.guestEnabled && authStore.user?.settings) {
        authStore.user.settings.guestEnabled = true
      }
      if (res.guestEnabled) {
        void authStore.fetchUser()
      }
    }
    emit('done')
    emit('close')
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function getPasswordPayload() {
  if (!usePassword.value) return ''
  const value = password.value.trim()
  if (!props.editShare) return value || undefined
  if (props.editShare.has_password && !value) return undefined
  return value || undefined
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
              : t('guestShare.createDescription', 'Share folder {name} to guest mode.').replace('{name}', displayFolderName)
          }}
        </p>

        <div class="space-y-4">
          <div>
            <label class="dialog-form-label">{{ t('guestShare.displayName', 'Display Name') }}</label>
            <input v-model="label" type="text" class="input-field" :placeholder="t('guestShare.displayNamePlaceholder', 'Folder name shown to guests')" />
          </div>

          <div>
            <label class="flex cursor-pointer items-center justify-between">
              <span class="text-sm" style="color: var(--text-color)">{{ t('share.passwordProtection', 'Password Protection') }}</span>
              <div class="relative inline-flex items-center">
                <input v-model="usePassword" type="checkbox" class="peer sr-only" />
                <div class="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full dark:bg-dark-border"></div>
              </div>
            </label>
            <input
              v-if="usePassword"
              v-model="password"
              type="text"
              class="input-field mt-2"
              :placeholder="editShare?.has_password ? t('guestShare.passwordPlaceholderEdit', 'Leave blank to keep current password') : t('share.passwordPlaceholder', 'Set access password')"
            />
            <p v-if="usePassword && editShare?.has_password" class="dialog-form-help">
              {{ t('guestShare.passwordUnchangedHint', 'Leave the password blank to keep the current password.') }}
            </p>
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
