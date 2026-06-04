<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'

interface StoragePool {
  id: number
  name: string
  storageType: 'local' | 'upyun'
  isDefault: boolean
  config: any
  createdAt: string
}

const loading = ref(false)
const saving = ref(false)
const testing = ref<number | null>(null)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const pools = ref<StoragePool[]>([])
const showAddDialog = ref(false)
const editingPool = ref<StoragePool | null>(null)

// 新建/编辑表单
const form = ref({
  name: '',
  storageType: 'local' as 'local' | 'upyun',
  config: {
    localPath: './uploads',
    upyunOperator: '',
    upyunPassword: '',
    upyunBucket: '',
    upyunEndpoint: 'v0.api.upyun.com',
    rootPath: '/'
  }
})

onMounted(async () => {
  await loadPools()
})

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

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}

function openAddDialog() {
  editingPool.value = null
  form.value = {
    name: '',
    storageType: 'local',
    config: {
      localPath: './uploads',
      upyunOperator: '',
      upyunPassword: '',
      upyunBucket: '',
      upyunEndpoint: 'v0.api.upyun.com',
      rootPath: '/'
    }
  }
  showAddDialog.value = true
}

function openEditDialog(pool: StoragePool) {
  editingPool.value = pool
  form.value = {
    name: pool.name,
    storageType: pool.storageType,
    config: {
      localPath: pool.config.localPath || './uploads',
      upyunOperator: pool.config.upyunOperator || '',
      upyunPassword: '', // 不显示密码
      upyunBucket: pool.config.upyunBucket || '',
      upyunEndpoint: pool.config.upyunEndpoint || 'v0.api.upyun.com',
      rootPath: pool.config.rootPath || '/'
    }
  }
  showAddDialog.value = true
}

function closeDialog() {
  showAddDialog.value = false
  editingPool.value = null
}

async function savePool() {
  if (!form.value.name) {
    showMsg('请输入存储池名称', 'error')
    return
  }

  saving.value = true
  try {
    if (editingPool.value) {
      // 更新
      await api.put(`/storage-pools/${editingPool.value.id}`, form.value)
      showMsg('存储池更新成功', 'success')
    } else {
      // 创建
      await api.post('/storage-pools', form.value)
      showMsg('存储池创建成功', 'success')
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

  if (!confirm(`确定要删除存储池"${pool.name}"吗？`)) {
    return
  }

  try {
    await api.delete(`/storage-pools/${pool.id}`)
    showMsg('存储池删除成功', 'success')
    await loadPools()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
}

async function setDefault(pool: StoragePool) {
  try {
    await api.post(`/storage-pools/${pool.id}/set-default`)
    showMsg('默认存储池设置成功', 'success')
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

function getStorageIcon(type: string) {
  return type === 'local' ? '💾' : '☁️'
}

function getStorageLabel(type: string) {
  return type === 'local' ? '本地存储' : '又拍云'
}
</script>

<template>
  <Layout>
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-dark-text text-light-text">存储池管理</h1>
        <button @click="openAddDialog" class="btn-primary flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          添加存储池
        </button>
      </div>

      <!-- 提示消息 -->
      <div v-if="message" class="mb-4 p-3 rounded-lg text-sm"
        :class="messageType === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'"
      >
        {{ message }}
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 存储池列表 -->
      <div v-else-if="pools.length > 0" class="space-y-4">
        <div v-for="pool in pools" :key="pool.id"
          class="card flex items-center justify-between p-4"
          :class="pool.isDefault ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''"
        >
          <div class="flex items-center gap-4">
            <div class="text-3xl">{{ getStorageIcon(pool.storageType) }}</div>
            <div>
              <div class="flex items-center gap-2">
                <h3 class="font-semibold dark:text-dark-text text-light-text">{{ pool.name }}</h3>
                <span class="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-dark-text-secondary rounded">
                  #{{ pool.id }}
                </span>
                <span v-if="pool.isDefault" class="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                  默认
                </span>
              </div>
              <p class="text-sm text-gray-500 dark:text-dark-text-secondary">
                {{ getStorageLabel(pool.storageType) }}
                <span v-if="pool.storageType === 'local'" class="ml-2 font-mono text-xs">
                  {{ pool.config.localPath }}
                </span>
                <span v-else-if="pool.storageType === 'upyun'" class="ml-2 font-mono text-xs">
                  {{ pool.config.upyunBucket }}
                </span>
                <span v-if="pool.config.rootPath && pool.config.rootPath !== '/'" class="ml-1 font-mono text-xs text-blue-500">
                  → {{ pool.config.rootPath }}
                </span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="testConnection(pool)"
              :disabled="testing === pool.id"
              class="btn-secondary text-sm px-3 py-1.5"
            >
              <span v-if="testing === pool.id">测试中...</span>
              <span v-else>测试连接</span>
            </button>
            <button
              v-if="!pool.isDefault"
              @click="setDefault(pool)"
              class="btn-secondary text-sm px-3 py-1.5"
            >
              设为默认
            </button>
            <button
              @click="openEditDialog(pool)"
              class="btn-secondary text-sm px-3 py-1.5"
            >
              编辑
            </button>
            <button
              v-if="!pool.isDefault"
              @click="deletePool(pool)"
              class="btn-danger text-sm px-3 py-1.5"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="text-center py-20">
        <div class="text-6xl mb-4">📦</div>
        <h3 class="text-lg font-semibold dark:text-dark-text text-light-text mb-2">还没有存储池</h3>
        <p class="text-gray-500 dark:text-dark-text-secondary mb-4">添加存储池来管理您的文件存储</p>
        <button @click="openAddDialog" class="btn-primary">添加第一个存储池</button>
      </div>

      <!-- 添加/编辑对话框 -->
      <div v-if="showAddDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white dark:bg-dark-card rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" style="background-color: var(--card-color)">
          <div class="p-6">
            <h2 class="text-xl font-bold mb-4 dark:text-dark-text text-light-text">
              {{ editingPool ? '编辑存储池' : '添加存储池' }}
            </h2>

            <form @submit.prevent="savePool" class="space-y-4">
              <!-- 名称 -->
              <div>
                <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">存储池名称</label>
                <input v-model="form.name" type="text" class="input-field" placeholder="例如：主存储、备份存储" required />
              </div>

              <!-- 存储类型 -->
              <div>
                <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">存储类型</label>
                <div class="flex gap-3">
                  <label class="flex-1 cursor-pointer">
                    <input
                      v-model="form.storageType"
                      type="radio"
                      value="local"
                      class="hidden peer"
                      :disabled="!!editingPool"
                    />
                    <div class="p-3 rounded-lg border-2 text-center transition-all peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 dark:border-dark-border border-light-border"
                      :class="editingPool ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300 dark:hover:border-blue-600'"
                    >
                      <span class="text-2xl">💾</span>
                      <p class="text-sm mt-1 dark:text-dark-text text-light-text">本地存储</p>
                    </div>
                  </label>
                  <label class="flex-1 cursor-pointer">
                    <input
                      v-model="form.storageType"
                      type="radio"
                      value="upyun"
                      class="hidden peer"
                      :disabled="!!editingPool"
                    />
                    <div class="p-3 rounded-lg border-2 text-center transition-all peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 dark:border-dark-border border-light-border"
                      :class="editingPool ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300 dark:hover:border-blue-600'"
                    >
                      <span class="text-2xl">☁️</span>
                      <p class="text-sm mt-1 dark:text-dark-text text-light-text">又拍云</p>
                    </div>
                  </label>
                </div>
              </div>

              <!-- 本地存储配置 -->
              <div v-if="form.storageType === 'local'" class="space-y-3">
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">存储路径</label>
                  <input v-model="form.config.localPath" type="text" class="input-field" placeholder="./uploads" />
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">服务器上的本地目录路径</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">根路径映射</label>
                  <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="/" />
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">存储池映射到的子目录，/ 表示根目录</p>
                </div>
              </div>

              <!-- Upyun 配置 -->
              <div v-if="form.storageType === 'upyun'" class="space-y-3">
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">操作员名称</label>
                  <input v-model="form.config.upyunOperator" type="text" class="input-field" placeholder="又拍云操作员" />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">
                    操作员密码
                    <span v-if="editingPool" class="text-xs text-gray-400">(留空则不修改)</span>
                  </label>
                  <input v-model="form.config.upyunPassword" type="password" class="input-field" placeholder="••••••" />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">服务名（Bucket）</label>
                  <input v-model="form.config.upyunBucket" type="text" class="input-field" placeholder="your-bucket-name" />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">API 端点</label>
                  <input v-model="form.config.upyunEndpoint" type="text" class="input-field" placeholder="v0.api.upyun.com" />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1.5 dark:text-dark-text text-light-text">根路径映射</label>
                  <input v-model="form.config.rootPath" type="text" class="input-field" placeholder="/" />
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">映射到 Bucket 内的子目录，/ 表示 Bucket 根目录</p>
                </div>
              </div>

              <!-- 按钮 -->
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
  </Layout>
</template>
