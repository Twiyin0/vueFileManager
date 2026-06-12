<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import { copyToClipboard } from '@/utils/clipboard'

interface ApiKey {
  id: number
  name: string
  key: string
  permissions: string
  created_at: string
}

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
  { value: 'read', label: '读取', desc: '查看文件列表、预览和下载文件' },
  { value: 'write', label: '写入', desc: '上传文件、创建目录和编辑内容' },
  { value: 'delete', label: '删除', desc: '删除文件或目录' },
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
      permissions,
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
      <button @click="showCreate = true" class="btn-primary flex items-center gap-1 text-sm">
        <Icon name="plus" class="h-4 w-4" />
        创建 Key
      </button>
    </div>

    <p class="mb-4 text-sm text-gray-500 dark:text-dark-text-secondary">
      API Key 用于程序化访问文件管理 API。请求头中添加
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
      <p>暂无 API Key</p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="key in keys" :key="key.id" class="card flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <h3 class="font-medium text-light-text dark:text-dark-text">{{ key.name }}</h3>
          <p class="mt-1 font-mono text-xs text-gray-500 dark:text-dark-text-secondary">
            {{ maskKey(key.key) }}
          </p>
          <div class="mt-2 flex items-center gap-2">
            <span
              v-for="perm in key.permissions.split(',')"
              :key="perm"
              class="rounded px-2 py-0.5 text-xs font-medium"
              :class="{
                'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': perm === 'read',
                'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': perm === 'write',
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': perm === 'delete',
              }"
            >
              {{ perm }}
            </span>
            <span class="text-xs text-gray-400 dark:text-dark-text-secondary">{{ formatDate(key.created_at) }}</span>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <button
            @click="copyKey(key.key, key.id)"
            class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
            title="复制"
          >
            <Icon v-if="copiedId === key.id" name="check" class="h-4 w-4 text-green-500" />
            <Icon v-else name="clipboard" class="h-4 w-4 text-gray-500 dark:text-dark-text-secondary" />
          </button>
          <button
            @click="confirmDelete(key)"
            class="rounded-lg p-2 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
            title="删除"
          >
            <Icon name="trash" class="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="closeCreate" />
      <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto p-6">
        <template v-if="createdKey">
          <h3 class="mb-2 text-lg font-semibold text-light-text dark:text-dark-text">API Key 已创建</h3>
          <p class="mb-4 text-sm text-gray-500 dark:text-dark-text-secondary">
            请妥善保存此 Key。关闭后将无法再次查看完整内容。
          </p>
          <div class="break-all rounded-lg bg-gray-50 p-3 font-mono text-sm text-light-text dark:bg-dark-surface dark:text-dark-text">
            {{ createdKey }}
          </div>
          <div class="mt-4 flex justify-end">
            <button @click="copyKey(createdKey, -1); closeCreate()" class="btn-primary text-sm">
              {{ copiedId === -1 ? '已复制' : '复制并关闭' }}
            </button>
          </div>
        </template>

        <template v-else>
          <h3 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">创建 API Key</h3>
          <div class="space-y-4">
            <div>
              <label class="mb-1.5 block text-sm font-medium text-light-text dark:text-dark-text">名称</label>
              <input v-model="newKeyName" type="text" class="input-field" placeholder="例如：我的应用" />
            </div>
            <div>
              <label class="mb-2 block text-sm font-medium text-light-text dark:text-dark-text">权限</label>
              <div class="space-y-2">
                <label
                  v-for="option in permissionOptions"
                  :key="option.value"
                  class="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors"
                  :class="newKeyPermissions.includes(option.value)
                    ? 'border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
                    : 'border border-light-border hover:bg-gray-50 dark:border-dark-border dark:hover:bg-dark-hover'"
                >
                  <input
                    v-model="newKeyPermissions"
                    type="checkbox"
                    :value="option.value"
                    class="mt-0.5 rounded border-gray-300 text-blue-500 focus:ring-blue-500 dark:border-dark-border"
                  />
                  <div>
                    <p class="text-sm font-medium text-light-text dark:text-dark-text">{{ option.label }}</p>
                    <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ option.desc }}</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-3">
            <button @click="closeCreate" class="btn-secondary text-sm">取消</button>
            <button @click="createKey" class="btn-primary text-sm" :disabled="!newKeyName.trim() || creating">
              {{ creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>

  <ConfirmDialog
    :show="showDeleteConfirm"
    title="删除 API Key"
    :message="`确定要删除「${keyToDelete?.name || ''}」吗？使用此 Key 的应用将无法继续访问。`"
    confirm-text="删除"
    :danger="true"
    @confirm="handleDelete"
    @cancel="showDeleteConfirm = false"
  />
</template>
