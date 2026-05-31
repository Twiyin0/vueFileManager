<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

interface AdminUser {
  id: number
  username: string
  role: string
  register_ip: string
  last_login_ip: string
  created_at: string
  storage_type: string
  guest_enabled: number
}

const users = ref<AdminUser[]>([])
const loading = ref(true)
const showDeleteConfirm = ref(false)
const userToDelete = ref<AdminUser | null>(null)

async function fetchUsers() {
  loading.value = true
  try {
    const res = await api.get<{ users: AdminUser[] }>('/admin/users')
    users.value = res.users
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchUsers)

async function toggleRole(user: AdminUser) {
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  if (user.role === 'admin') {
    if (!confirm('确定要降级此管理员吗？')) return
  }
  try {
    await api.put(`/admin/users/${user.id}/role`, { role: newRole })
    await fetchUsers()
  } catch (err: any) {
    alert(err.message)
  }
}

function confirmDelete(user: AdminUser) {
  userToDelete.value = user
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!userToDelete.value) return
  try {
    await api.delete(`/admin/users/${userToDelete.value.id}`)
    await fetchUsers()
  } catch (err: any) {
    alert(err.message)
  }
  showDeleteConfirm.value = false
  userToDelete.value = null
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Layout>
    <div class="max-w-5xl mx-auto">
      <h1 class="text-2xl font-bold mb-6 dark:text-dark-text text-light-text">管理面板</h1>

      <!-- 统计卡片 -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">总用户数</p>
          <p class="text-2xl font-bold dark:text-dark-text text-light-text">{{ users.length }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">管理员</p>
          <p class="text-2xl font-bold dark:text-dark-text text-light-text">{{ users.filter(u => u.role === 'admin').length }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">开启访客模式</p>
          <p class="text-2xl font-bold dark:text-dark-text text-light-text">{{ users.filter(u => u.guest_enabled).length }}</p>
        </div>
      </div>

      <!-- 用户列表 -->
      <div class="card overflow-hidden">
        <div v-if="loading" class="flex items-center justify-center py-12">
          <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>

        <div v-else>
          <!-- 表头 -->
          <div class="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-dark-text-secondary border-b dark:border-dark-border border-light-border">
            <div class="col-span-2">用户名</div>
            <div class="col-span-1">角色</div>
            <div class="col-span-2 hidden sm:block">注册 IP</div>
            <div class="col-span-2 hidden md:block">最后登录 IP</div>
            <div class="col-span-2 hidden lg:block">注册时间</div>
            <div class="col-span-1 hidden sm:block">存储</div>
            <div class="col-span-1 hidden sm:block">访客</div>
            <div class="col-span-3 sm:col-span-2 text-right">操作</div>
          </div>

          <!-- 用户行 -->
          <div
            v-for="user in users"
            :key="user.id"
            class="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b dark:border-dark-border/50 border-light-border/50 last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
          >
            <div class="col-span-2 flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                :class="user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'"
              >
                {{ user.username[0].toUpperCase() }}
              </div>
              <span class="truncate text-sm dark:text-dark-text text-light-text">{{ user.username }}</span>
            </div>
            <div class="col-span-1">
              <span class="px-2 py-0.5 rounded text-xs font-medium"
                :class="user.role === 'admin'
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-dark-surface dark:text-dark-text-secondary'"
              >
                {{ user.role === 'admin' ? '管理员' : '用户' }}
              </span>
            </div>
            <div class="col-span-2 hidden sm:block text-xs font-mono text-gray-500 dark:text-dark-text-secondary">
              {{ user.register_ip }}
            </div>
            <div class="col-span-2 hidden md:block text-xs font-mono text-gray-500 dark:text-dark-text-secondary">
              {{ user.last_login_ip }}
            </div>
            <div class="col-span-2 hidden lg:block text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ formatDate(user.created_at) }}
            </div>
            <div class="col-span-1 hidden sm:block text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ user.storage_type === 'upyun' ? '又拍云' : '本地' }}
            </div>
            <div class="col-span-1 hidden sm:block">
              <span v-if="user.guest_enabled" class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              <span v-else class="w-2 h-2 rounded-full bg-gray-300 dark:bg-dark-border inline-block"></span>
            </div>
            <div class="col-span-3 sm:col-span-2 flex items-center justify-end gap-1">
              <button
                @click="toggleRole(user)"
                class="px-2 py-1 rounded text-xs font-medium transition-colors"
                :class="user.role === 'admin'
                  ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-dark-surface dark:text-dark-text-secondary'"
              >
                {{ user.role === 'admin' ? '降级' : '升级' }}
              </button>
              <button
                @click="confirmDelete(user)"
                class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="删除用户"
              >
                <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="删除用户"
      :message="`确定要删除用户「${userToDelete?.username}」吗？该用户的所有数据将被删除。`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />
  </Layout>
</template>
