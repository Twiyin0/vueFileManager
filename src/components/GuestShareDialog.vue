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
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="emit('close')" />
      <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto" style="padding: 1.5rem">
        <h3 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">
          {{ editShare ? t('guestShare.editTitle', '编辑访客分享') : t('guestShare.createTitle', '分享至访客模式') }}
        </h3>
        <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
          {{
            editShare
              ? t('guestShare.editDescription', '修改访客分享的权限和显示名称。')
              : t('guestShare.createDescription', '将文件夹 {name} 分享至访客模式。').replace('{name}', folderName)
          }}
        </p>

        <div class="space-y-4">
          <div>
            <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('guestShare.displayName', '显示名称') }}</label>
            <input v-model="label" type="text" class="input-field" :placeholder="t('guestShare.displayNamePlaceholder', '访客看到的文件夹名称')" />
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium" style="color: var(--text-color)">{{ t('guestShare.permissionsTitle', '访客权限') }}</label>
            <div class="space-y-2.5">
              <label class="flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.read" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.read', '读取') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.readHint', '（预览、下载文件）') }}</span>
              </label>
              <label class="flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.write" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.write', '写入') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.writeHint', '（上传文件、创建文件夹）') }}</span>
              </label>
              <label class="flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.delete" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.delete', '删除') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.deleteHint', '（删除文件与文件夹）') }}</span>
              </label>
              <label class="flex cursor-pointer items-center gap-2.5">
                <input v-model="perms.edit" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span class="text-sm" style="color: var(--text-color)">{{ t('permissions.edit', '文本编辑') }}</span>
                <span class="text-xs" style="color: var(--text-secondary-color)">{{ t('guestShare.editHint', '（编辑文件内容、重命名）') }}</span>
              </label>
            </div>
          </div>

          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
        </div>

        <div class="mt-5 flex justify-end gap-3">
          <button class="btn-secondary text-sm" @click="emit('close')">{{ t('common.cancel', '取消') }}</button>
          <button class="btn-primary text-sm" :disabled="loading" @click="handleSubmit">
            <span v-if="loading">{{ editShare ? t('guestShare.saving', '保存中...') : t('guestShare.sharing', '分享中...') }}</span>
            <span v-else>{{ editShare ? t('common.save', '保存') : t('guestShare.confirmShare', '确认分享') }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
