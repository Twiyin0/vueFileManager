<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'

interface ApiKey {
  id: number
  name: string
  key: string
  permissions: string
  created_at: string
}

const keys = ref<ApiKey[]>([])
const loading = ref(true)
const showCreate = ref(false)
const showDeleteConfirm = ref(false)
const keyToDelete = ref<ApiKey | null>(null)
const newKeyName = ref('')
const newKeyPermissions = ref<string[]>(['read'])
const createdKey = ref<string | null>(null)
const copiedId = ref<number | null>(null)

const permissionOptions = [
  { value: 'read', label: '读取', desc: '查看文件列表、下载文件' },
  { value: 'write', label: '写入', desc: '上传文件、创建文件夹' },
  { value: 'delete', label: '删除', desc: '删除文件和文件夹' },
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
  if (!newKeyName.value.trim()) return
  try {
    const res = await api.post<{ key: string }>('/user/apikeys', {
      name: newKeyName.value,
      permissions: newKeyPermissions.value.join(',')
    })
    createdKey.value = res.key
    await fetchKeys()
  } catch (err: any) {
    alert(err.message)
  }
}

function closeCreate() {
  showCreate.value = false
  newKeyName.value = ''
  newKeyPermissions.value = ['read']
  createdKey.value = null
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
  }
  showDeleteConfirm.value = false
  keyToDelete.value = null
}

async function copyKey(key: string, id: number) {
  await navigator.clipboard.writeText(key)
  copiedId.value = id
  setTimeout(() => { copiedId.value = null }, 2000)
}

function maskKey(key: string): string {
  return key.slice(0, 12) + '...' + key.slice(-6)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Layout>
    <div class="max-w-3xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-dark-text text-light-text">API Keys</h1>
        <button @click="showCreate = true" class="btn-primary text-sm flex items-center gap-1">
          <Icon name="plus" class="w-4 h-4" />
          创建 Key
        </button>
      </div>

      <p class="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
        API Key 可用于程序化访问文件管理 API。在请求头中添加 <code class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-surface font-mono text-xs">X-API-Key: your-key</code>
      </p>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 空状态 -->
      <div v-else-if="keys.length === 0" class="card flex flex-col items-center justify-center py-16 text-gray-400 dark:text-dark-text-secondary">
        <Icon name="key" class="w-16 h-16 mb-3" />
        <p>暂无 API Key</p>
      </div>

      <!-- Key 列表 -->
      <div v-else class="space-y-3">
        <div v-for="key in keys" :key="key.id" class="card flex items-center gap-4">
          <div class="flex-1 min-w-0">
            <h3 class="font-medium dark:text-dark-text text-light-text">{{ key.name }}</h3>
            <p class="text-xs font-mono text-gray-500 dark:text-dark-text-secondary mt-1">
              {{ maskKey(key.key) }}
            </p>
            <div class="flex items-center gap-2 mt-2">
              <span
                v-for="perm in key.permissions.split(',')"
                :key="perm"
                class="px-2 py-0.5 rounded text-xs font-medium"
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
              @click="copyKey(key.key, key.id)"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              title="复制"
            >
              <Icon v-if="copiedId === key.id" name="check" class="w-4 h-4 text-green-500" />
              <Icon v-else name="clipboard" class="w-4 h-4 text-gray-500 dark:text-dark-text-secondary" />
            </button>
            <button
              @click="confirmDelete(key)"
              class="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="删除"
            >
              <Icon name="trash" class="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建对话框 -->
    <Teleport to="body">
      <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="closeCreate"/>
        <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
          <!-- 创建成功 -->
          <template v-if="createdKey">
            <h3 class="text-lg font-semibold mb-2 dark:text-dark-text text-light-text">API Key 已创建</h3>
            <p class="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
              请妥善保存此 Key，关闭后将无法再次查看完整内容。
            </p>
            <div class="p-3 rounded-lg bg-gray-50 dark:bg-dark-surface font-mono text-sm break-all dark:text-dark-text text-light-text">
              {{ createdKey }}
            </div>
            <div class="flex justify-end mt-4">
              <button @click="copyKey(createdKey!, -1); closeCreate()" class="btn-primary text-sm">
                {{ copiedId === -1 ? '已复制' : '复制并关闭' }}
              </button>
            </div>
          </template>

          <!-- 创建表单 -->
          <template v-else>
            <h3 class="text-lg font-semibold mb-4 dark:text-dark-text text-light-text">创建 API Key</h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">名称</label>
                <input v-model="newKeyName" type="text" class="input-field" placeholder="例如：我的应用" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-2 dark:text-dark-text text-light-text">权限</label>
                <div class="space-y-2">
                  <label
                    v-for="option in permissionOptions"
                    :key="option.value"
                    class="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                    :class="newKeyPermissions.includes(option.value)
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                      : 'border dark:border-dark-border border-light-border hover:bg-gray-50 dark:hover:bg-dark-hover'"
                  >
                    <input
                      v-model="newKeyPermissions"
                      type="checkbox"
                      :value="option.value"
                      class="mt-0.5 rounded border-gray-300 dark:border-dark-border text-blue-500 focus:ring-blue-500"
                    />
                    <div>
                      <p class="text-sm font-medium dark:text-dark-text text-light-text">{{ option.label }}</p>
                      <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ option.desc }}</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
              <button @click="closeCreate" class="btn-secondary text-sm">取消</button>
              <button @click="createKey" class="btn-primary text-sm" :disabled="!newKeyName.trim()">创建</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="删除 API Key"
      :message="`确定要删除「${keyToDelete?.name}」吗？使用此 Key 的应用将无法访问。`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />
  </Layout>
</template>
