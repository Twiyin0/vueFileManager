<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'

type StorageType = 'local' | 'upyun' | 'ftp' | 'sftp' | 's3'

interface StoragePool {
  id: number
  name: string
  storageType: StorageType
  isDefault: boolean
  config: Record<string, any>
  resolvedPath: string
  createdAt: string
}

const { t, format } = useI18n()

const loading = ref(false)
const saving = ref(false)
const testing = ref<number | null>(null)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const pools = ref<StoragePool[]>([])
const showDialog = ref(false)
const editingPool = ref<StoragePool | null>(null)
const selectedPoolIds = ref<Set<number>>(new Set())

const storageInfo = ref({ quota: 0, used: 0, remaining: 0, quotaFormatted: '0 B', usedFormatted: '0 B' })

const defaultConfig = () => ({
  upyunOperator: '',
  upyunPassword: '',
  upyunBucket: '',
  upyunEndpoint: 'v0.api.upyun.com',
  ftpHost: '',
  ftpPort: 21,
  ftpUser: '',
  ftpPassword: '',
  ftpRemotePath: '/',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPassword: '',
  sftpPrivateKey: '',
  sftpRootPath: '/',
  s3Endpoint: '',
  s3Region: 'us-east-1',
  s3AccessKeyId: '',
  s3SecretAccessKey: '',
  s3Bucket: '',
  s3Prefix: '',
  s3ForcePathStyle: true,
  rootPath: '/'
})

const form = ref({
  name: '',
  storageType: 'local' as StorageType,
  config: defaultConfig()
})

const canBulkDelete = computed(() => {
  if (selectedPoolIds.value.size === 0) return false
  return pools.value.some((pool) => selectedPoolIds.value.has(pool.id) && !pool.isDefault)
})

const storageTypeOptions = computed(() => [
  { value: 'local' as StorageType, label: getStorageLabel('local') },
  { value: 'upyun' as StorageType, label: getStorageLabel('upyun') },
  { value: 'ftp' as StorageType, label: getStorageLabel('ftp') },
  { value: 'sftp' as StorageType, label: getStorageLabel('sftp') },
  { value: 's3' as StorageType, label: getStorageLabel('s3') },
])

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  window.setTimeout(() => {
    if (message.value === text) message.value = ''
  }, 3000)
}

async function loadStorageInfo() {
  try {
    const res = await api.get<any>('/user/info')
    if (res.user?.storage) storageInfo.value = res.user.storage
  } catch {}
}

async function loadPools() {
  loading.value = true
  try {
    const res = await api.get<{ pools: StoragePool[] }>('/storage-pools')
    pools.value = res.pools
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    name: '',
    storageType: 'local',
    config: defaultConfig()
  }
}

function openAddDialog() {
  editingPool.value = null
  resetForm()
  showDialog.value = true
}

function openEditDialog(pool: StoragePool) {
  editingPool.value = pool
  form.value = {
    name: pool.name,
    storageType: pool.storageType,
    config: {
      ...defaultConfig(),
      ...pool.config,
      upyunPassword: '',
      ftpPassword: '',
      sftpPassword: '',
      sftpPrivateKey: pool.config.sftpPrivateKey ? '*** hidden ***' : '',
      s3SecretAccessKey: ''
    }
  }
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingPool.value = null
}

function toggleSelectPool(id: number) {
  const next = new Set(selectedPoolIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedPoolIds.value = next
}

function clearSelection() {
  selectedPoolIds.value = new Set()
}

function selectDeletablePools() {
  const deletable = pools.value.filter((pool) => !pool.isDefault).map((pool) => pool.id)
  selectedPoolIds.value = new Set(selectedPoolIds.value.size === deletable.length ? [] : deletable)
}

async function savePool() {
  if (!form.value.name.trim()) {
    showMsg(t('storagePoolsPage.validationNameRequired', 'Please enter a storage pool name'), 'error')
    return
  }

  saving.value = true
  try {
    if (editingPool.value) {
      await api.put(`/storage-pools/${editingPool.value.id}`, form.value)
      showMsg(t('storagePoolsPage.updated', 'Storage pool updated'), 'success')
    } else {
      await api.post('/storage-pools', form.value)
      showMsg(t('storagePoolsPage.created', 'Storage pool created'), 'success')
    }
    closeDialog()
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function deletePool(pool: StoragePool) {
  if (pool.isDefault) {
    showMsg(t('storagePoolsPage.defaultCannotDelete', 'The default storage pool cannot be deleted'), 'error')
    return
  }

  if (!window.confirm(format('storagePoolsPage.deleteConfirm', 'Delete storage pool \\"{name}\\"?', { name: pool.name }))) return

  try {
    await api.delete(`/storage-pools/${pool.id}`)
    showMsg(t('storagePoolsPage.deleted', 'Storage pool deleted'), 'success')
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function deleteSelectedPools() {
  const ids = Array.from(selectedPoolIds.value)
  if (ids.length === 0) return

  const deletableIds = pools.value
    .filter((pool) => ids.includes(pool.id) && !pool.isDefault)
    .map((pool) => pool.id)

  if (deletableIds.length === 0) {
    showMsg(t('storagePoolsPage.noDeletableSelected', 'None of the selected storage pools can be deleted'), 'error')
    return
  }

  if (!window.confirm(format('storagePoolsPage.bulkDeleteConfirm', 'Delete {count} storage pools?', { count: deletableIds.length }))) return

  try {
    const res = await api.post<{ message: string; errors?: string[] }>('/storage-pools/batch-delete', { ids: deletableIds })
    const firstError = res.errors?.[0]
    const text = firstError
      ? format('storagePoolsPage.batchPartialFailure', '{message}. Partial failure: {error}', { message: res.message, error: firstError })
      : res.message
    showMsg(text, res.errors?.length === deletableIds.length ? 'error' : 'success')
    clearSelection()
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function setDefault(pool: StoragePool) {
  try {
    await api.post(`/storage-pools/${pool.id}/set-default`)
    showMsg(t('storagePoolsPage.defaultUpdated', 'Default storage pool updated'), 'success')
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function testConnection(pool: StoragePool) {
  testing.value = pool.id
  try {
    const res = await api.post<{ success: boolean; message: string }>(`/storage-pools/${pool.id}/test`)
    showMsg(res.message, res.success ? 'success' : 'error')
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    testing.value = null
  }
}

function getStorageIconName(type: StorageType) {
  if (type === 'local') return 'hard-drive'
  if (type === 'ftp' || type === 'sftp') return 'server'
  return 'cloud'
}

function getStorageLabel(type: StorageType) {
  if (type === 'local') return t('admin.localStorage', 'Local Storage')
  if (type === 'upyun') return t('storagePoolsPage.upyun', 'UpYun')
  if (type === 'ftp') return 'FTP'
  if (type === 'sftp') return 'SFTP'
  return 'S3 / OSS'
}

useKeepAliveRefresh(async () => {
  await loadPools()
  await loadStorageInfo()
})
</script>

<template>
  <div class="px-4 pt-4">
    <div class="card mb-4">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-sm font-medium" style="color: var(--text-color)">
          {{ t('storagePoolsPage.usageTitle', 'Local Storage Usage') }}
        </span>
        <span class="text-sm" style="color: var(--text-secondary-color)">
          {{ storageInfo.usedFormatted }} / {{ storageInfo.quotaFormatted }}
        </span>
      </div>
      <div class="h-2 w-full rounded-full" style="background: var(--hover-color)">
        <div
          class="h-2 rounded-full transition-all"
          :class="storageInfo.quota > 0 && storageInfo.used / storageInfo.quota > 0.9 ? 'bg-red-500' : storageInfo.used / storageInfo.quota > 0.7 ? 'bg-yellow-500' : 'bg-green-500'"
          :style="{ width: (storageInfo.quota > 0 ? Math.min(Math.round(storageInfo.used / storageInfo.quota * 100), 100) : 0) + '%' }"
        />
      </div>
      <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">
        {{ format('storagePoolsPage.remaining', 'Remaining {size}', { size: formatBytes(storageInfo.remaining) }) }}
      </p>
    </div>

    <div class="mb-4 flex flex-wrap justify-end gap-2">
      <button v-if="pools.length > 1" class="btn-secondary flex items-center gap-2" @click="selectDeletablePools">
        <Icon name="square-check" class="h-4 w-4" />
        {{ selectedPoolIds.size > 0 ? t('storagePoolsPage.clearBulkSelect', 'Clear Selection') : t('storagePoolsPage.toggleBulkSelect', 'Select Multiple') }}
      </button>
      <button
        v-if="selectedPoolIds.size > 0"
        class="btn-danger flex items-center gap-2 disabled:opacity-50"
        :disabled="!canBulkDelete"
        @click="deleteSelectedPools"
      >
        <Icon name="trash" class="h-4 w-4" />
        {{ t('storagePoolsPage.bulkDelete', 'Delete Selected') }}
      </button>
      <button class="btn-primary flex items-center gap-2" @click="openAddDialog">
        <Icon name="plus" class="h-5 w-5" />
        {{ t('storagePoolsPage.add', 'Add Storage Pool') }}
      </button>
    </div>

    <div
      v-if="selectedPoolIds.size > 0"
      class="mb-4 flex items-center justify-between rounded-lg p-3 text-sm"
      style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)"
    >
      <span style="color: var(--text-color)">
        {{ format('storagePoolsPage.selectedSummary', '{count} storage pools selected. The default pool will not be deleted.', { count: selectedPoolIds.size }) }}
      </span>
      <button class="text-sm hover:underline" style="color: var(--accent-color)" @click="clearSelection">
        {{ t('file.clear', 'Clear') }}
      </button>
    </div>

    <div
      v-if="message"
      class="mb-4 rounded-lg p-3 text-sm"
      :class="messageType === 'success'
        ? 'border border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
        : 'border border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'"
    >
      {{ message }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <div v-else-if="pools.length > 0" class="space-y-4">
      <div
        v-for="pool in pools"
        :key="pool.id"
        class="card flex items-center justify-between p-4"
        :class="pool.isDefault ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''"
      >
        <div class="flex items-center gap-4">
          <input v-if="!pool.isDefault" type="checkbox" :checked="selectedPoolIds.has(pool.id)" @change="toggleSelectPool(pool.id)" />
          <Icon :name="getStorageIconName(pool.storageType)" class="h-8 w-8 text-blue-500" />
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-light-text dark:text-dark-text">{{ pool.name }}</h3>
              <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-500 dark:bg-dark-hover dark:text-dark-text-secondary">#{{ pool.id }}</span>
              <span v-if="pool.isDefault" class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                {{ t('common.default', 'Default') }}
              </span>
            </div>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              {{ getStorageLabel(pool.storageType) }}
              <span v-if="pool.storageType === 'local' && pool.resolvedPath" class="ml-2 font-mono text-xs">{{ pool.resolvedPath }}</span>
              <span v-if="pool.storageType === 'upyun'" class="ml-2 font-mono text-xs">{{ pool.config.upyunBucket }}</span>
              <span v-if="pool.storageType === 'ftp'" class="ml-2 font-mono text-xs">{{ pool.config.ftpHost }}</span>
              <span v-if="pool.storageType === 'sftp'" class="ml-2 font-mono text-xs">{{ pool.config.sftpHost }}</span>
              <span v-if="pool.storageType === 's3'" class="ml-2 font-mono text-xs">{{ pool.config.s3Bucket }}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button class="btn-secondary px-3 py-1.5 text-sm" :disabled="testing === pool.id" @click="testConnection(pool)">
            <span v-if="testing === pool.id">{{ t('storagePoolsPage.testing', 'Testing...') }}</span>
            <span v-else>{{ t('storagePoolsPage.testConnection', 'Test Connection') }}</span>
          </button>
          <button v-if="!pool.isDefault" class="btn-secondary px-3 py-1.5 text-sm" @click="setDefault(pool)">
            {{ t('storagePoolsPage.setDefault', 'Set as Default') }}
          </button>
          <button class="btn-secondary px-3 py-1.5 text-sm" @click="openEditDialog(pool)">
            {{ t('common.edit', 'Edit') }}
          </button>
          <button v-if="!pool.isDefault" class="btn-danger px-3 py-1.5 text-sm" @click="deletePool(pool)">
            {{ t('common.delete', 'Delete') }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="py-20 text-center">
      <Icon name="container-storage" class="mx-auto mb-4 h-16 w-16 text-gray-300 dark:text-gray-600" />
      <h3 class="mb-2 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('storagePoolsPage.noPoolsTitle', 'No storage pools yet') }}</h3>
      <p class="mb-4 text-gray-500 dark:text-dark-text-secondary">{{ t('storagePoolsPage.noPoolsDescription', 'Add a storage pool to manage file storage.') }}</p>
      <button class="btn-primary" @click="openAddDialog">{{ t('storagePoolsPage.addFirst', 'Add Your First Storage Pool') }}</button>
    </div>

    <div v-if="showDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="card mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto shadow-sm">
        <div class="p-6">
          <h2 class="mb-4 text-xl font-bold text-light-text dark:text-dark-text">
            {{ editingPool ? t('storagePoolsPage.editTitle', 'Edit Storage Pool') : t('storagePoolsPage.addTitle', 'Add Storage Pool') }}
          </h2>

          <form class="space-y-4" @submit.prevent="savePool">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-light-text dark:text-dark-text">{{ t('storagePoolsPage.name', 'Storage Pool Name') }}</label>
              <input v-model="form.name" type="text" class="input-field" :placeholder="t('storagePoolsPage.namePlaceholder', 'Example: Primary Storage, Backup Storage')" required />
            </div>

            <div>
              <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('storagePoolsPage.type', 'Storage Type') }}</label>
              <select v-model="form.storageType" class="input-field" :disabled="!!editingPool">
                <option v-for="option in storageTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>

            <div v-if="form.storageType === 'local'" class="space-y-3">
              <div class="rounded-lg p-3 text-sm" style="background: var(--hover-color); color: var(--text-secondary-color)">
                {{ t('storagePoolsPage.localHint', 'Local storage automatically isolates directories by username. No extra disk path is required.') }}
              </div>
              <div>
                <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('storagePoolsPage.rootPath', 'Root Path Mapping') }}</label>
                <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="/" />
              </div>
            </div>

            <div v-if="form.storageType === 'upyun'" class="space-y-3">
              <input v-model="form.config.upyunOperator" type="text" class="input-field" :placeholder="t('storagePoolsPage.operatorPlaceholder', 'Operator')" />
              <input v-model="form.config.upyunPassword" type="password" class="input-field" :placeholder="t('storagePoolsPage.passwordPlaceholderEdit', 'Password (leave blank to keep unchanged)')" />
              <input v-model="form.config.upyunBucket" type="text" class="input-field" :placeholder="t('storagePoolsPage.bucketPlaceholder', 'Bucket')" />
              <input v-model="form.config.upyunEndpoint" type="text" class="input-field" placeholder="v0.api.upyun.com" />
              <input v-model="form.config.rootPath" type="text" class="input-field" :placeholder="t('storagePoolsPage.rootPathPlaceholder', 'Mapped root path /')" />
            </div>

            <div v-if="form.storageType === 'ftp'" class="space-y-3">
              <input v-model="form.config.ftpHost" type="text" class="input-field" :placeholder="t('storagePoolsPage.hostPlaceholder', 'Host')" />
              <input v-model.number="form.config.ftpPort" type="number" class="input-field" :placeholder="t('storagePoolsPage.ftpPortPlaceholder', 'Port 21')" />
              <input v-model="form.config.ftpUser" type="text" class="input-field" :placeholder="t('storagePoolsPage.usernamePlaceholder', 'Username')" />
              <input v-model="form.config.ftpPassword" type="password" class="input-field" :placeholder="t('storagePoolsPage.passwordPlaceholderEdit', 'Password (leave blank to keep unchanged)')" />
              <input v-model="form.config.ftpRemotePath" type="text" class="input-field" :placeholder="t('storagePoolsPage.remoteRootPlaceholder', 'Remote root path /')" />
              <input v-model="form.config.rootPath" type="text" class="input-field" :placeholder="t('storagePoolsPage.rootPathPlaceholder', 'Mapped root path /')" />
            </div>

            <div v-if="form.storageType === 'sftp'" class="space-y-3">
              <input v-model="form.config.sftpHost" type="text" class="input-field" :placeholder="t('storagePoolsPage.hostPlaceholder', 'Host')" />
              <input v-model.number="form.config.sftpPort" type="number" class="input-field" :placeholder="t('storagePoolsPage.sftpPortPlaceholder', 'Port 22')" />
              <input v-model="form.config.sftpUser" type="text" class="input-field" :placeholder="t('storagePoolsPage.usernamePlaceholder', 'Username')" />
              <input v-model="form.config.sftpPassword" type="password" class="input-field" :placeholder="t('storagePoolsPage.passwordPlaceholderEdit', 'Password (leave blank to keep unchanged)')" />
              <textarea v-model="form.config.sftpPrivateKey" class="input-field min-h-28" :placeholder="t('storagePoolsPage.privateKeyPlaceholder', 'Private key content, can replace password')" />
              <input v-model="form.config.sftpRootPath" type="text" class="input-field" :placeholder="t('storagePoolsPage.remoteRootPlaceholder', 'Remote root path /')" />
              <input v-model="form.config.rootPath" type="text" class="input-field" :placeholder="t('storagePoolsPage.rootPathPlaceholder', 'Mapped root path /')" />
            </div>

            <div v-if="form.storageType === 's3'" class="space-y-3">
              <input v-model="form.config.s3Endpoint" type="text" class="input-field" :placeholder="t('storagePoolsPage.endpointPlaceholder', 'Endpoint')" />
              <input v-model="form.config.s3Region" type="text" class="input-field" :placeholder="t('storagePoolsPage.regionPlaceholder', 'Region')" />
              <input v-model="form.config.s3AccessKeyId" type="text" class="input-field" :placeholder="t('storagePoolsPage.accessKeyIdPlaceholder', 'Access Key ID')" />
              <input v-model="form.config.s3SecretAccessKey" type="password" class="input-field" :placeholder="t('storagePoolsPage.secretAccessKeyPlaceholder', 'Secret Access Key (leave blank to keep unchanged)')" />
              <input v-model="form.config.s3Bucket" type="text" class="input-field" :placeholder="t('storagePoolsPage.bucketPlaceholder', 'Bucket')" />
              <input v-model="form.config.s3Prefix" type="text" class="input-field" :placeholder="t('storagePoolsPage.prefixPlaceholder', 'Prefix')" />
              <label class="flex items-center gap-2 text-sm" style="color: var(--text-color)">
                <input v-model="form.config.s3ForcePathStyle" type="checkbox" />
                {{ t('storagePoolsPage.forcePathStyle', 'Force Path Style') }}
              </label>
              <input v-model="form.config.rootPath" type="text" class="input-field" :placeholder="t('storagePoolsPage.rootPathPlaceholder', 'Mapped root path /')" />
            </div>

            <div class="flex justify-end gap-3 pt-4">
              <button type="button" class="btn-secondary" @click="closeDialog">{{ t('common.cancel', 'Cancel') }}</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving">{{ t('storagePoolsPage.saveInProgress', 'Saving...') }}</span>
                <span v-else>{{ editingPool ? t('storagePoolsPage.updateAction', 'Update') : t('storagePoolsPage.createAction', 'Create') }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
