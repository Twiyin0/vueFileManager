<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'
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
  return pools.value.some(pool => selectedPoolIds.value.has(pool.id) && !pool.isDefault)
})

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  setTimeout(() => {
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
  const deletable = pools.value.filter(pool => !pool.isDefault).map(pool => pool.id)
  selectedPoolIds.value = new Set(
    selectedPoolIds.value.size === deletable.length ? [] : deletable
  )
}

async function savePool() {
  if (!form.value.name.trim()) {
    showMsg('请输入存储池名称', 'error')
    return
  }

  saving.value = true
  try {
    if (editingPool.value) {
      await api.put(`/storage-pools/${editingPool.value.id}`, form.value)
      showMsg('存储池已更新', 'success')
    } else {
      await api.post('/storage-pools', form.value)
      showMsg('存储池已创建', 'success')
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
    showMsg('不能删除默认存储池', 'error')
    return
  }
  if (!confirm(`确定删除存储池“${pool.name}”吗？`)) return

  try {
    await api.delete(`/storage-pools/${pool.id}`)
    showMsg('存储池已删除', 'success')
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function deleteSelectedPools() {
  const ids = Array.from(selectedPoolIds.value)
  if (ids.length === 0) return
  const deletableIds = pools.value.filter(pool => ids.includes(pool.id) && !pool.isDefault).map(pool => pool.id)
  if (deletableIds.length === 0) {
    showMsg('所选存储池均不可删除', 'error')
    return
  }
  if (!confirm(`确定批量删除 ${deletableIds.length} 个存储池吗？`)) return

  try {
    const res = await api.post<{ message: string; errors?: string[] }>('/storage-pools/batch-delete', { ids: deletableIds })
    showMsg(res.errors?.length ? `${res.message}，部分失败：${res.errors[0]}` : res.message, res.errors?.length === deletableIds.length ? 'error' : 'success')
    clearSelection()
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function setDefault(pool: StoragePool) {
  try {
    await api.post(`/storage-pools/${pool.id}/set-default`)
    showMsg('默认存储池已更新', 'success')
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
  if (type === 'local') return '本地存储'
  if (type === 'upyun') return '又拍云'
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
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium" style="color: var(--text-color)">本地存储用量</span>
        <span class="text-sm" style="color: var(--text-secondary-color)">{{ storageInfo.usedFormatted }} / {{ storageInfo.quotaFormatted }}</span>
      </div>
      <div class="w-full h-2 rounded-full" style="background: var(--hover-color)">
        <div
          class="h-2 rounded-full transition-all"
          :class="storageInfo.quota > 0 && storageInfo.used / storageInfo.quota > 0.9 ? 'bg-red-500' : storageInfo.used / storageInfo.quota > 0.7 ? 'bg-yellow-500' : 'bg-green-500'"
          :style="{ width: (storageInfo.quota > 0 ? Math.min(Math.round(storageInfo.used / storageInfo.quota * 100), 100) : 0) + '%' }"
        />
      </div>
      <p class="text-xs mt-1" style="color: var(--text-secondary-color)">剩余 {{ formatBytes(storageInfo.remaining) }}</p>
    </div>

    <div class="flex flex-wrap justify-end gap-2 mb-4">
      <button v-if="pools.length > 1" @click="selectDeletablePools" class="btn-secondary flex items-center gap-2">
        <Icon name="square-check" class="w-4 h-4" />
        {{ selectedPoolIds.size > 0 ? '取消批量选择' : '批量选择' }}
      </button>
      <button v-if="selectedPoolIds.size > 0" @click="deleteSelectedPools" :disabled="!canBulkDelete" class="btn-danger flex items-center gap-2 disabled:opacity-50">
        <Icon name="trash" class="w-4 h-4" />
        批量删除
      </button>
      <button @click="openAddDialog" class="btn-primary flex items-center gap-2">
        <Icon name="plus" class="w-5 h-5" />
        添加存储池
      </button>
    </div>

    <div v-if="selectedPoolIds.size > 0" class="mb-4 p-3 rounded-lg text-sm flex items-center justify-between" style="background-color: var(--accent-soft-color); border: 1px solid var(--accent-color)">
      <span style="color: var(--text-color)">已选 {{ selectedPoolIds.size }} 个存储池，默认存储池不会被删除</span>
      <button @click="clearSelection" class="text-sm hover:underline" style="color: var(--accent-color)">清空</button>
    </div>

    <div
      v-if="message"
      class="mb-4 p-3 rounded-lg text-sm"
      :class="messageType === 'success'
        ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
        : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'"
    >
      {{ message }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
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
          <Icon :name="getStorageIconName(pool.storageType)" class="w-8 h-8 text-blue-500" />
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-semibold dark:text-dark-text text-light-text">{{ pool.name }}</h3>
              <span class="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-dark-text-secondary rounded">#{{ pool.id }}</span>
              <span v-if="pool.isDefault" class="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">默认</span>
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
          <button @click="testConnection(pool)" :disabled="testing === pool.id" class="btn-secondary text-sm px-3 py-1.5">
            <span v-if="testing === pool.id">测试中...</span>
            <span v-else>测试连接</span>
          </button>
          <button v-if="!pool.isDefault" @click="setDefault(pool)" class="btn-secondary text-sm px-3 py-1.5">设为默认</button>
          <button @click="openEditDialog(pool)" class="btn-secondary text-sm px-3 py-1.5">编辑</button>
          <button v-if="!pool.isDefault" @click="deletePool(pool)" class="btn-danger text-sm px-3 py-1.5">删除</button>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-20">
      <Icon name="container-storage" class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
      <h3 class="text-lg font-semibold dark:text-dark-text text-light-text mb-2">还没有存储池</h3>
      <p class="text-gray-500 dark:text-dark-text-secondary mb-4">添加存储池来管理你的文件存储</p>
      <button @click="openAddDialog" class="btn-primary">添加第一个存储池</button>
    </div>

    <div v-if="showDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div class="card w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto shadow-sm">
        <div class="p-6">
          <h2 class="text-xl font-bold mb-4 dark:text-dark-text text-light-text">
            {{ editingPool ? '编辑存储池' : '添加存储池' }}
          </h2>

          <form @submit.prevent="savePool" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">存储池名称</label>
              <input v-model="form.name" type="text" class="input-field" placeholder="例如：主存储、备份存储" required />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">存储类型</label>
              <select v-model="form.storageType" class="input-field" :disabled="!!editingPool">
                <option value="local">本地存储</option>
                <option value="upyun">又拍云</option>
                <option value="ftp">FTP</option>
                <option value="sftp">SFTP</option>
                <option value="s3">S3 / OSS</option>
              </select>
            </div>

            <div v-if="form.storageType === 'local'" class="space-y-3">
              <div class="p-3 rounded-lg text-sm" style="background: var(--hover-color); color: var(--text-secondary-color)">
                本地存储会自动按用户名隔离目录，无需单独填写磁盘路径。
              </div>
              <div>
                <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">根路径映射</label>
                <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="/" />
              </div>
            </div>

            <div v-if="form.storageType === 'upyun'" class="space-y-3">
              <input v-model="form.config.upyunOperator" type="text" class="input-field" placeholder="操作员" />
              <input v-model="form.config.upyunPassword" type="password" class="input-field" placeholder="密码，编辑时留空表示不修改" />
              <input v-model="form.config.upyunBucket" type="text" class="input-field" placeholder="Bucket" />
              <input v-model="form.config.upyunEndpoint" type="text" class="input-field" placeholder="v0.api.upyun.com" />
              <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="映射根路径 /" />
            </div>

            <div v-if="form.storageType === 'ftp'" class="space-y-3">
              <input v-model="form.config.ftpHost" type="text" class="input-field" placeholder="主机地址" />
              <input v-model.number="form.config.ftpPort" type="number" class="input-field" placeholder="端口 21" />
              <input v-model="form.config.ftpUser" type="text" class="input-field" placeholder="用户名" />
              <input v-model="form.config.ftpPassword" type="password" class="input-field" placeholder="密码，编辑时留空表示不修改" />
              <input v-model="form.config.ftpRemotePath" type="text" class="input-field" placeholder="远程根目录 /" />
              <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="映射根路径 /" />
            </div>

            <div v-if="form.storageType === 'sftp'" class="space-y-3">
              <input v-model="form.config.sftpHost" type="text" class="input-field" placeholder="主机地址" />
              <input v-model.number="form.config.sftpPort" type="number" class="input-field" placeholder="端口 22" />
              <input v-model="form.config.sftpUser" type="text" class="input-field" placeholder="用户名" />
              <input v-model="form.config.sftpPassword" type="password" class="input-field" placeholder="密码，编辑时留空表示不修改" />
              <textarea v-model="form.config.sftpPrivateKey" class="input-field min-h-28" placeholder="私钥内容，可替代密码"></textarea>
              <input v-model="form.config.sftpRootPath" type="text" class="input-field" placeholder="远程根目录 /" />
              <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="映射根路径 /" />
            </div>

            <div v-if="form.storageType === 's3'" class="space-y-3">
              <input v-model="form.config.s3Endpoint" type="text" class="input-field" placeholder="Endpoint" />
              <input v-model="form.config.s3Region" type="text" class="input-field" placeholder="Region" />
              <input v-model="form.config.s3AccessKeyId" type="text" class="input-field" placeholder="Access Key ID" />
              <input v-model="form.config.s3SecretAccessKey" type="password" class="input-field" placeholder="Secret Access Key，编辑时留空表示不修改" />
              <input v-model="form.config.s3Bucket" type="text" class="input-field" placeholder="Bucket" />
              <input v-model="form.config.s3Prefix" type="text" class="input-field" placeholder="Prefix" />
              <label class="flex items-center gap-2 text-sm" style="color: var(--text-color)">
                <input v-model="form.config.s3ForcePathStyle" type="checkbox" />
                强制 Path Style
              </label>
              <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="映射根路径 /" />
            </div>

            <div class="flex justify-end gap-3 pt-4">
              <button type="button" @click="closeDialog" class="btn-secondary">取消</button>
              <button type="submit" class="btn-primary" :disabled="saving">
                <span v-if="saving">保存中...</span>
                <span v-else>{{ editingPool ? '更新' : '创建' }}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
