<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import { copyToClipboard } from '@/utils/clipboard'
import { useI18n } from '@/composables/useI18n'

interface ApiKey {
  id: number
  name: string
  key: string
  permissions: string
  created_at: string
}

const { t } = useI18n()
const keys = ref<ApiKey[]>([])
const loading = ref(true)
const creating = ref(false)
const showCreate = ref(false)
const showDeleteConfirm = ref(false)
const keyToDelete = ref<ApiKey | null>(null)
const newKeyName = ref('')
const newKeyPermissions = ref<string[]>(['read'])
const createdKey = ref<string | null>(null)
const copiedId = ref<number | null>(null)

const permissionOptions = [
  { value: 'read', label: t('permissions.read', 'Read'), desc: t('apiKeys.readDesc', 'View file lists, preview files, and download files') },
  { value: 'write', label: t('permissions.write', 'Write'), desc: t('apiKeys.writeDesc', 'Upload files, create directories, and edit content') },
  { value: 'delete', label: t('permissions.delete', 'Delete'), desc: t('apiKeys.deleteDesc', 'Delete files or directories') }
]

async function fetchKeys() {
  loading.value = true
  try {
    const res = await api.get<{ keys: ApiKey[] }>('/user/apikeys')
    keys.value = res.keys
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchKeys)

async function createKey() {
  if (!newKeyName.value.trim() || creating.value) return

  creating.value = true
  try {
    const permissions = newKeyPermissions.value.length > 0 ? newKeyPermissions.value.join(',') : 'read'
    const res = await api.post<{ key: string }>('/user/apikeys', {
      name: newKeyName.value.trim(),
      permissions
    })
    createdKey.value = res.key
    await fetchKeys()
  } catch (err: any) {
    alert(err.message)
  } finally {
    creating.value = false
  }
}

function closeCreate() {
  showCreate.value = false
  newKeyName.value = ''
  newKeyPermissions.value = ['read']
  createdKey.value = null
  creating.value = false
}

function confirmDelete(key: ApiKey) {
  keyToDelete.value = key
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!keyToDelete.value) return
  try {
    await api.delete(`/user/apikeys/${keyToDelete.value.id}`)
    await fetchKeys()
  } catch (err: any) {
    alert(err.message)
  } finally {
    showDeleteConfirm.value = false
    keyToDelete.value = null
  }
}

async function copyKey(key: string, id: number) {
  await copyToClipboard(key)
  copiedId.value = id
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

function maskKey(key: string): string {
  if (key.length <= 18) return key
  return `${key.slice(0, 12)}...${key.slice(-6)}`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}
</script>

<template>
  <div class="px-4 pt-4">
    <div class="mb-4 flex justify-end">
      <button class="btn-primary flex items-center gap-1 text-sm" @click="showCreate = true">
        <Icon name="plus" class="h-4 w-4" />
        {{ t('apiKeys.create', 'Create Key') }}
      </button>
    </div>

    <p class="mb-4 text-sm text-gray-500 dark:text-dark-text-secondary">
      {{ t('apiKeys.description', 'API keys are used for programmatic access to the file management API. Add this request header:') }}
      <code class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-dark-surface">X-API-Key: your-key</code>
    </p>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <div v-else-if="keys.length === 0" class="card flex flex-col items-center justify-center py-16 text-gray-400 dark:text-dark-text-secondary">
      <Icon name="key" class="mb-3 h-16 w-16" />
      <p>{{ t('apiKeys.emptyTitle', 'No API keys yet') }}</p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="key in keys" :key="key.id" class="card flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <h3 class="font-medium text-light-text dark:text-dark-text">{{ key.name }}</h3>
          <p class="mt-1 font-mono text-xs text-gray-500 dark:text-dark-text-secondary">{{ maskKey(key.key) }}</p>
          <div class="mt-2 flex items-center gap-2">
            <span
              v-for="perm in key.permissions.split(',')"
              :key="perm"
              class="rounded px-2 py-0.5 text-xs font-medium"
              :class="{
                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': perm === 'read',
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': perm === 'write',
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': perm === 'delete'
              }"
            >
              {{ perm }}
            </span>
            <span class="text-xs text-gray-400 dark:text-dark-text-secondary">{{ formatDate(key.created_at) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button
            class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            :title="t('apiKeys.copy', 'Copy')"
            @click="copyKey(key.key, key.id)"
          >
            <Icon v-if="copiedId === key.id" name="check" class="h-4 w-4 text-green-500" />
            <Icon v-else name="clipboard" class="h-4 w-4 text-gray-500 dark:text-dark-text-secondary" />
          </button>
          <button
            class="rounded-lg p-2 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            :title="t('common.delete', 'Delete')"
            @click="confirmDelete(key)"
          >
            <Icon name="trash" class="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showCreate" class="dialog-overlay">
      <div class="dialog-backdrop" @click="closeCreate" />
      <div class="dialog-panel dialog-panel-scroll dialog-panel-md">
        <div class="dialog-section">
        <template v-if="createdKey">
          <h3 class="dialog-title mb-2">{{ t('apiKeys.createdTitle', 'API Key Created') }}</h3>
          <p class="dialog-description mb-4">
            {{ t('apiKeys.createdHint', 'Save this key securely. After closing, the full value cannot be viewed again.') }}
          </p>
          <div class="dialog-muted-block-strong break-all font-mono text-sm" style="color: var(--text-color)">
            {{ createdKey }}
          </div>
          <div class="dialog-footer mt-4">
            <button class="btn-primary text-sm" @click="copyKey(createdKey, -1); closeCreate()">
              {{ copiedId === -1 ? t('share.copied', 'Copied') : t('apiKeys.copyAndClose', 'Copy and Close') }}
            </button>
          </div>
        </template>

        <template v-else>
          <h3 class="dialog-title mb-4">{{ t('apiKeys.createTitle', 'Create API Key') }}</h3>
          <div class="space-y-4">
            <div>
              <label class="dialog-form-label">{{ t('apiKeys.name', 'Name') }}</label>
              <input v-model="newKeyName" type="text" class="input-field" :placeholder="t('apiKeys.namePlaceholder', 'Example: My App')" />
            </div>
            <div>
              <label class="dialog-form-label mb-2">{{ t('apiKeys.permissions', 'Permissions') }}</label>
              <div class="space-y-2">
                <label
                  v-for="option in permissionOptions"
                  :key="option.value"
                  class="dialog-muted-block-strong flex cursor-pointer items-start gap-3"
                  :style="newKeyPermissions.includes(option.value)
                    ? 'border-color: var(--accent-color); background-color: var(--accent-soft-color)'
                    : ''"
                >
                  <input
                    v-model="newKeyPermissions"
                    type="checkbox"
                    :value="option.value"
                    class="mt-0.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-dark-border"
                  />
                  <div>
                    <p class="text-sm font-medium" style="color: var(--text-color)">{{ option.label }}</p>
                    <p class="text-xs" style="color: var(--text-secondary-color)">{{ option.desc }}</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn-secondary text-sm" @click="closeCreate">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" :disabled="!newKeyName.trim() || creating" @click="createKey">
              {{ creating ? t('apiKeys.creating', 'Creating...') : t('common.create', 'Create') }}
            </button>
          </div>
        </template>
        </div>
      </div>
    </div>
  </Teleport>

  <ConfirmDialog
    :show="showDeleteConfirm"
    :title="t('apiKeys.deleteTitle', 'Delete API Key')"
    :message="t('apiKeys.deleteMessage', 'Delete {name}? Applications using this key will no longer be able to access the service.').replace('{name}', keyToDelete?.name || '')"
    :confirm-text="t('common.delete', 'Delete')"
    :danger="true"
    @confirm="handleDelete"
    @cancel="showDeleteConfirm = false"
  />
</template>
