<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

interface AdminUser {
  id: number
  username: string
  role: string
  banned: number
  register_ip: string
  last_login_ip: string
  last_login_at: string
  created_at: string
  guest_enabled: number
}

interface UserDetail {
  id: number
  username: string
  role: string
  banned: boolean
  registerIp: string
  lastLoginIp: string
  lastLoginAt: string
  createdAt: string
  settings: { guestEnabled: boolean; guestPath: string; theme: string }
  pools: { id: number; name: string; storageType: string; isDefault: boolean; config: any; createdAt: string }[]
  stats: { trashCount: number; favCount: number; shareCount: number; apiKeyCount: number }
}

const users = ref<AdminUser[]>([])
const loading = ref(true)
const search = ref('')

// 创建用户
const showCreateDialog = ref(false)
const createForm = ref({ username: '', password: '', role: 'user' })
const createError = ref('')
const creating = ref(false)

// 用户详情
const showDetailDialog = ref(false)
const detailUser = ref<UserDetail | null>(null)
const detailLoading = ref(false)

// 重置密码
const showResetPwdDialog = ref(false)
const resetPwdUser = ref<AdminUser | null>(null)
const resetPwdForm = ref({ password: '' })
const resetPwdError = ref('')

// 确认弹窗
const confirmAction = ref<{ show: boolean; title: string; message: string; confirmText: string; danger: boolean; onConfirm: () => void }>({
  show: false, title: '', message: '', confirmText: '确认', danger: false, onConfirm: () => {}
})

const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const q = search.value.toLowerCase()
  return users.value.filter(u =>
    u.username.toLowerCase().includes(q) ||
    u.role.includes(q) ||
    (u.register_ip && u.register_ip.includes(q)) ||
    (u.last_login_ip && u.last_login_ip.includes(q))
  )
})

const stats = computed(() => ({
  total: users.value.length,
  admins: users.value.filter(u => u.role === 'admin').length,
  banned: users.value.filter(u => u.banned).length,
  guests: users.value.filter(u => u.guest_enabled).length
}))

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

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  // SQLite CURRENT_TIMESTAMP 返回 UTC 时间，需追加 Z 以正确解析为 UTC
  const d = new Date(dateStr.replace(' ', 'T') + 'Z')
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// ---- 创建用户 ----
function openCreateDialog() {
  createForm.value = { username: '', password: '', role: 'user' }
  createError.value = ''
  showCreateDialog.value = true
}

async function handleCreate() {
  createError.value = ''
  creating.value = true
  try {
    await api.post('/admin/users', createForm.value)
    showCreateDialog.value = false
    await fetchUsers()
  } catch (err: any) {
    createError.value = err.message
  } finally {
    creating.value = false
  }
}

// ---- 查看详情 ----
async function viewDetail(user: AdminUser) {
  showDetailDialog.value = true
  detailLoading.value = true
  detailUser.value = null
  try {
    const res = await api.get<{ user: UserDetail }>(`/admin/users/${user.id}`)
    detailUser.value = res.user
  } catch (err: any) {
    alert(err.message)
  } finally {
    detailLoading.value = false
  }
}

// ---- 重置密码 ----
function openResetPwd(user: AdminUser) {
  resetPwdUser.value = user
  resetPwdForm.value = { password: '' }
  resetPwdError.value = ''
  showResetPwdDialog.value = true
}

async function handleResetPwd() {
  resetPwdError.value = ''
  try {
    await api.put(`/admin/users/${resetPwdUser.value!.id}/password`, resetPwdForm.value)
    showResetPwdDialog.value = false
    alert('密码已重置')
  } catch (err: any) {
    resetPwdError.value = err.message
  }
}

// ---- 升降级 ----
function toggleRole(user: AdminUser) {
  const newRole = user.role === 'admin' ? 'user' : 'admin'
  confirmAction.value = {
    show: true,
    title: newRole === 'admin' ? '升级为管理员' : '降级为普通用户',
    message: `确定要将「${user.username}」${newRole === 'admin' ? '升级为管理员' : '降级为普通用户'}吗？`,
    confirmText: newRole === 'admin' ? '升级' : '降级',
    danger: newRole !== 'admin',
    onConfirm: async () => {
      try {
        await api.put(`/admin/users/${user.id}/role`, { role: newRole })
        await fetchUsers()
      } catch (err: any) {
        alert(err.message)
      }
    }
  }
}

// ---- 封禁/解封 ----
function toggleBan(user: AdminUser) {
  const isBanning = !user.banned
  confirmAction.value = {
    show: true,
    title: isBanning ? '封禁用户' : '解封用户',
    message: isBanning
      ? `确定要封禁「${user.username}」吗？该用户将无法登录。`
      : `确定要解封「${user.username}」吗？`,
    confirmText: isBanning ? '封禁' : '解封',
    danger: isBanning,
    onConfirm: async () => {
      try {
        await api.put(`/admin/users/${user.id}/ban`)
        await fetchUsers()
      } catch (err: any) {
        alert(err.message)
      }
    }
  }
}

// ---- 删除用户 ----
function confirmDelete(user: AdminUser) {
  confirmAction.value = {
    show: true,
    title: '删除用户',
    message: `确定要删除用户「${user.username}」吗？该用户的所有数据（文件、存储池、分享等）将被永久删除，此操作不可撤销。`,
    confirmText: '删除',
    danger: true,
    onConfirm: async () => {
      try {
        await api.delete(`/admin/users/${user.id}`)
        await fetchUsers()
      } catch (err: any) {
        alert(err.message)
      }
    }
  }
}

function handleConfirm() {
  confirmAction.value.onConfirm()
  confirmAction.value.show = false
}
</script>

<template>
  <Layout>
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold dark:text-dark-text text-light-text">管理面板</h1>
        <button @click="openCreateDialog" class="btn-primary text-sm flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          创建用户
        </button>
      </div>

      <!-- 统计卡片 -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">总用户数</p>
          <p class="text-2xl font-bold dark:text-dark-text text-light-text">{{ stats.total }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">管理员</p>
          <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ stats.admins }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">已封禁</p>
          <p class="text-2xl font-bold text-red-500">{{ stats.banned }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">开启访客</p>
          <p class="text-2xl font-bold text-green-500">{{ stats.guests }}</p>
        </div>
      </div>

      <!-- 搜索 -->
      <div class="mb-4">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input v-model="search" type="text" placeholder="搜索用户名、IP、角色..."
            class="w-full pl-10 pr-4 py-2 rounded-lg border dark:border-dark-border border-light-border bg-white dark:bg-dark-surface text-sm dark:text-dark-text text-light-text dark:placeholder-dark-placeholder focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
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

        <div v-else-if="filteredUsers.length === 0" class="py-12 text-center text-gray-400">
          {{ search ? '没有匹配的用户' : '暂无用户' }}
        </div>

        <div v-else>
          <!-- 表头 -->
          <div class="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-dark-text-secondary border-b dark:border-dark-border border-light-border">
            <div class="col-span-2">用户名</div>
            <div class="col-span-1">角色</div>
            <div class="col-span-1 text-center">状态</div>
            <div class="col-span-1 hidden sm:block">注册 IP</div>
            <div class="col-span-1 hidden md:block">最后登录 IP</div>
            <div class="col-span-2 hidden lg:block">注册时间</div>
            <div class="col-span-2 hidden xl:block">上次登录时间</div>
            <div class="col-span-2 text-right">操作</div>
          </div>

          <!-- 用户行 -->
          <div
            v-for="user in filteredUsers"
            :key="user.id"
            class="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b dark:border-dark-border/50 border-light-border/50 last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
            :class="{ 'opacity-50': user.banned }"
          >
            <div class="col-span-2 flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium flex-shrink-0"
                :class="user.banned ? 'bg-red-400' : user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'"
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
            <div class="col-span-1 flex justify-center">
              <span v-if="user.banned" class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">封禁</span>
              <span v-else class="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            </div>
            <div class="col-span-1 hidden sm:block text-xs font-mono text-gray-500 dark:text-dark-text-secondary truncate">
              {{ user.register_ip || '-' }}
            </div>
            <div class="col-span-1 hidden md:block text-xs font-mono text-gray-500 dark:text-dark-text-secondary truncate">
              {{ user.last_login_ip || '-' }}
            </div>
            <div class="col-span-2 hidden lg:block text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ formatDate(user.created_at) }}
            </div>
            <div class="col-span-2 hidden xl:block text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ formatDate(user.last_login_at) }}
            </div>
            <div class="col-span-2 flex items-center justify-end gap-0.5 flex-wrap">
              <button @click="viewDetail(user)" class="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="查看详情">
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
              </button>
              <button @click="toggleRole(user)" class="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                :title="user.role === 'admin' ? '降级为用户' : '升级为管理员'">
                <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12"/></svg>
              </button>
              <button @click="openResetPwd(user)" class="p-1.5 rounded hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors" title="重置密码">
                <svg class="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
              </button>
              <button @click="toggleBan(user)" class="p-1.5 rounded transition-colors"
                :class="user.banned ? 'hover:bg-green-50 dark:hover:bg-green-900/20' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'"
                :title="user.banned ? '解封' : '封禁'">
                <svg v-if="user.banned" class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <svg v-else class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
              </button>
              <button @click="confirmDelete(user)" class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="删除用户">
                <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建用户弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showCreateDialog = false"/>
        <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">创建用户</h3>
          <div class="space-y-3">
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">用户名</label>
              <input v-model="createForm.username" type="text" placeholder="3-20 个字符"
                class="w-full px-3 py-2 rounded-lg border dark:border-dark-border border-light-border bg-white dark:bg-dark-surface text-sm dark:text-dark-text text-light-text dark:placeholder-dark-placeholder focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">密码</label>
              <input v-model="createForm.password" type="password" placeholder="至少 6 位"
                class="w-full px-3 py-2 rounded-lg border dark:border-dark-border border-light-border bg-white dark:bg-dark-surface text-sm dark:text-dark-text text-light-text focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">角色</label>
              <select v-model="createForm.role"
                class="w-full px-3 py-2 rounded-lg border dark:border-dark-border border-light-border bg-white dark:bg-dark-surface text-sm dark:text-dark-text text-light-text focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <p v-if="createError" class="text-sm text-red-500">{{ createError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button @click="showCreateDialog = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleCreate" :disabled="creating" class="btn-primary text-sm">
              {{ creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 用户详情弹窗 -->
    <Teleport to="body">
      <div v-if="showDetailDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showDetailDialog = false"/>
        <div class="relative card w-full max-w-lg max-h-[80vh] overflow-y-auto" style="padding: 1.5rem">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">用户详情</h3>
            <button @click="showDetailDialog = false" class="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover">
              <svg class="w-5 h-5" style="color: var(--text-secondary-color)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div v-if="detailLoading" class="flex justify-center py-8">
            <svg class="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>

          <div v-else-if="detailUser" class="space-y-4">
            <!-- 基本信息 -->
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold"
                :class="detailUser.banned ? 'bg-red-400' : detailUser.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'">
                {{ detailUser.username[0].toUpperCase() }}
              </div>
              <div>
                <p class="font-semibold text-lg" style="color: var(--text-color)">{{ detailUser.username }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="detailUser.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-700 dark:bg-dark-surface dark:text-dark-text-secondary'">
                    {{ detailUser.role === 'admin' ? '管理员' : '用户' }}
                  </span>
                  <span v-if="detailUser.banned" class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">已封禁</span>
                </div>
              </div>
            </div>

            <!-- 信息网格 -->
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">注册 IP</p>
                <p class="font-mono mt-0.5" style="color: var(--text-color)">{{ detailUser.registerIp || '-' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">最后登录 IP</p>
                <p class="font-mono mt-0.5" style="color: var(--text-color)">{{ detailUser.lastLoginIp || '-' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">注册时间</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(detailUser.createdAt) }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">上次登录时间</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(detailUser.lastLoginAt) }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">主题</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ { light: '浅色', dark: '深色', system: '跟随系统' }[detailUser.settings.theme] || detailUser.settings.theme }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">访客模式</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ detailUser.settings.guestEnabled ? '已开启' : '未开启' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">访客路径</p>
                <p class="mt-0.5 font-mono truncate" style="color: var(--text-color)">{{ detailUser.settings.guestPath || '/' }}</p>
              </div>
            </div>

            <!-- 统计 -->
            <div>
              <p class="text-sm font-medium mb-2" style="color: var(--text-color)">数据统计</p>
              <div class="grid grid-cols-4 gap-2">
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-blue-500">{{ detailUser.stats.trashCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">回收站</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-yellow-500">{{ detailUser.stats.favCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">收藏</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-green-500">{{ detailUser.stats.shareCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">分享</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-purple-500">{{ detailUser.stats.apiKeyCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">API Key</p>
                </div>
              </div>
            </div>

            <!-- 存储池 -->
            <div>
              <p class="text-sm font-medium mb-2" style="color: var(--text-color)">存储池 ({{ detailUser.pools.length }})</p>
              <div v-if="detailUser.pools.length === 0" class="text-sm text-gray-400 py-2">暂无存储池</div>
              <div v-else class="space-y-2">
                <div v-for="pool in detailUser.pools" :key="pool.id"
                  class="flex items-center gap-3 p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <span class="text-xl">{{ pool.storageType === 'local' ? '💾' : '☁️' }}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate" style="color: var(--text-color)">{{ pool.name }}</p>
                    <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {{ pool.storageType === 'local' ? '本地存储' : '又拍云' }}
                      <span v-if="pool.isDefault" class="ml-1 text-blue-500">默认</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 重置密码弹窗 -->
    <Teleport to="body">
      <div v-if="showResetPwdDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showResetPwdDialog = false"/>
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-1" style="color: var(--text-color)">重置密码</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">为「{{ resetPwdUser?.username }}」设置新密码</p>
          <div>
            <input v-model="resetPwdForm.password" type="password" placeholder="新密码（至少 6 位）"
              class="w-full px-3 py-2 rounded-lg border dark:border-dark-border border-light-border bg-white dark:bg-dark-surface text-sm dark:text-dark-text text-light-text focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
            <p v-if="resetPwdError" class="text-sm text-red-500 mt-1">{{ resetPwdError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button @click="showResetPwdDialog = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleResetPwd" class="btn-primary text-sm">重置</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 通用确认弹窗 -->
    <ConfirmDialog
      :show="confirmAction.show"
      :title="confirmAction.title"
      :message="confirmAction.message"
      :confirm-text="confirmAction.confirmText"
      :danger="confirmAction.danger"
      @confirm="handleConfirm"
      @cancel="confirmAction.show = false"
    />
  </Layout>
</template>
