<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'

interface AdminUser {
  id: number
  username: string
  email: string | null
  verified: number
  role: string
  banned: number
  storage_quota: number
  storage_used: number
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

// 配额调整对话框
const quotaDialog = ref({ show: false, userId: 0, username: '', quotaMB: 0 })

function openQuotaDialog(user: AdminUser) {
  quotaDialog.value = { show: true, userId: user.id, username: user.username, quotaMB: Math.round(user.storage_quota / 1024 / 1024) }
}

async function saveQuota() {
  try {
    await api.put(`/admin/users/${quotaDialog.value.userId}/quota`, { quota: quotaDialog.value.quotaMB * 1024 * 1024 })
    quotaDialog.value.show = false
    await fetchUsers()
  } catch (err: any) {
    alert(err.message)
  }
}

// IP 黑名单
interface IpBlacklistEntry {
  id: number
  ip_pattern: string
  reason: string
  created_by: number
  created_by_name: string | null
  created_at: string
}
const ipBlacklist = ref<IpBlacklistEntry[]>([])
const ipListMode = ref<'blacklist' | 'whitelist'>('blacklist')
const showAddIpDialog = ref(false)
const ipForm = ref({ ip_pattern: '', reason: '' })
const ipError = ref('')

const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const q = search.value.toLowerCase()
  return users.value.filter(u =>
    u.username.toLowerCase().includes(q) ||
    (u.email && u.email.toLowerCase().includes(q)) ||
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

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

// ---- 用户验证 ----
function adjustQuota(user: AdminUser) {
  openQuotaDialog(user)
}

async function verifyUser(user: AdminUser) {
  confirmAction.value = {
    show: true,
    title: '手动验证',
    message: `确定要手动验证「${user.username}」吗？这将允许该用户无需邮箱验证码即可登录。`,
    confirmText: '验证',
    danger: false,
    onConfirm: async () => {
      await api.put(`/admin/users/${user.id}/verify`)
      await fetchUsers()
    }
  }
}

// ---- IP 黑名单 ----
async function fetchIpBlacklist() {
  try {
    const res = await api.get<{ entries: IpBlacklistEntry[] }>('/admin/ip-blacklist')
    ipBlacklist.value = res.entries
  } catch {}
}

async function fetchIpListMode() {
  try {
    const res = await api.get<{ mode: 'blacklist' | 'whitelist' }>('/admin/ip-list/mode')
    ipListMode.value = res.mode
  } catch {}
}

async function toggleIpListMode() {
  const newMode = ipListMode.value === 'blacklist' ? 'whitelist' : 'blacklist'
  const msg = newMode === 'whitelist'
    ? '切换为白名单模式，仅列表中的 IP 可访问。本地默认地址（127.0.0.1 等）将自动补充。确定切换？'
    : '切换为黑名单模式，列表中的 IP 将被拦截访问。确定切换？'
  if (!confirm(msg)) return
  try {
    await api.put('/admin/ip-list/mode', { mode: newMode })
    ipListMode.value = newMode
    await fetchIpBlacklist()
  } catch (err: any) {
    alert(err.message)
  }
}

function openAddIpDialog() {
  ipForm.value = { ip_pattern: '', reason: '' }
  ipError.value = ''
  showAddIpDialog.value = true
}

async function handleAddIp() {
  ipError.value = ''
  try {
    await api.post('/admin/ip-blacklist', ipForm.value)
    showAddIpDialog.value = false
    await fetchIpBlacklist()
  } catch (err: any) {
    ipError.value = err.message
  }
}

function confirmDeleteIp(entry: IpBlacklistEntry) {
  confirmAction.value = {
    show: true,
    title: `删除${ipListMode.value === 'whitelist' ? '白名单' : '黑名单'}条目`,
    message: `确定要删除「${entry.ip_pattern}」吗？该 IP/网段将${ipListMode.value === 'whitelist' ? '不再被允许访问' : '恢复访问'}。`,
    confirmText: '删除',
    danger: true,
    onConfirm: async () => {
      try {
        await api.delete(`/admin/ip-blacklist/${entry.id}`)
        await fetchIpBlacklist()
      } catch (err: any) {
        alert(err.message)
      }
    }
  }
}

onMounted(() => {
  fetchIpBlacklist()
  fetchIpListMode()
})
</script>

<template>
  <Layout>
    <div class="px-4 pt-4">
      <div class="flex justify-end mb-4">
        <button @click="openCreateDialog" class="btn-primary text-sm flex items-center gap-1.5">
          <Icon name="plus" class="w-4 h-4" />
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
      <div class="mb-4 flex items-center gap-2">
        <Icon name="search" class="w-4 h-4 flex-shrink-0" style="color: var(--text-secondary-color)" />
        <input v-model="search" type="text" placeholder="搜索用户名、IP、角色..."
          class="input-field text-sm" />
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
          <div class="flex items-center px-4 py-2 text-xs font-medium border-b gap-3" style="color: var(--text-secondary-color); border-color: var(--border-color)">
            <div class="w-40">用户名</div>
            <div class="w-36 hidden sm:block">邮箱</div>
            <div class="w-16 text-center">角色</div>
            <div class="w-14 text-center">状态</div>
            <div class="flex-1 hidden md:block min-w-[140px]">存储用量</div>
            <div class="w-24 hidden lg:block">登录 IP</div>
            <div class="w-32 hidden xl:block">注册时间</div>
            <div class="w-32 hidden 2xl:block">上次登录</div>
            <div class="w-28 text-right">操作</div>
          </div>

          <!-- 用户行 -->
          <div
            v-for="user in filteredUsers"
            :key="user.id"
            class="flex items-center px-4 py-2.5 border-b gap-3 transition-colors"
            :class="{ 'opacity-50': user.banned }"
            style="border-color: var(--border-color)"
            @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
            @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
          >
            <!-- 用户名 -->
            <div class="w-40 flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
                :class="user.banned ? 'bg-red-400' : user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'">
                {{ user.username[0].toUpperCase() }}
              </div>
              <span class="truncate text-sm" style="color: var(--text-color)">{{ user.username }}</span>
            </div>
            <!-- 邮箱 -->
            <div class="w-36 hidden sm:block text-xs truncate" style="color: var(--text-secondary-color)">{{ user.email || '-' }}</div>
            <!-- 角色 -->
            <div class="w-16 text-center">
              <span class="px-1.5 py-0.5 rounded text-xs" :style="user.role === 'admin' ? 'background: var(--accent-soft-color); color: var(--accent-color)' : 'background: var(--hover-color); color: var(--text-secondary-color)'">
                {{ user.role === 'admin' ? '管理' : '用户' }}
              </span>
            </div>
            <!-- 状态 -->
            <div class="w-14 flex justify-center">
              <span v-if="user.banned" class="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">封禁</span>
              <template v-else>
                <span v-if="!user.verified" class="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">未验证</span>
                <span v-else class="w-2 h-2 rounded-full bg-green-500"></span>
              </template>
            </div>
            <!-- 存储用量 -->
            <div class="flex-1 hidden md:block min-w-[140px]">
              <button @click="adjustQuota(user)" class="w-full text-left group" title="点击修改配额">
                <div class="flex items-center gap-1.5">
                  <div class="flex-1 h-1.5 rounded-full min-w-[40px]" style="background: var(--hover-color)">
                    <div class="h-1.5 rounded-full transition-all"
                      :class="(user.storage_quota > 0 && (user.storage_used || 0) / user.storage_quota > 0.9) ? 'bg-red-500' : ((user.storage_used || 0) / user.storage_quota > 0.7 ? 'bg-yellow-500' : 'bg-green-500')"
                      :style="{ width: (user.storage_quota > 0 ? Math.min(Math.round((user.storage_used || 0) / user.storage_quota * 100), 100) : 0) + '%' }" />
                  </div>
                  <span class="text-xs whitespace-nowrap group-hover:underline" style="color: var(--text-secondary-color)">{{ formatBytes(user.storage_used || 0) }}/{{ formatBytes(user.storage_quota) }}</span>
                </div>
              </button>
            </div>
            <!-- 登录 IP -->
            <div class="w-24 hidden lg:block text-xs font-mono truncate" style="color: var(--text-secondary-color)">{{ user.last_login_ip || '-' }}</div>
            <!-- 注册时间 -->
            <div class="w-32 hidden xl:block text-xs" style="color: var(--text-secondary-color)">{{ formatDate(user.created_at) }}</div>
            <!-- 上次登录 -->
            <div class="w-32 hidden 2xl:block text-xs" style="color: var(--text-secondary-color)">{{ formatDate(user.last_login_at) }}</div>
            <!-- 操作 -->
            <div class="w-28 flex items-center justify-end gap-0.5 flex-wrap">
              <button v-if="!user.verified" @click="verifyUser(user)" class="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="手动验证">
                <Icon name="badge-check" class="w-4 h-4 text-green-500" />
              </button>
              <button @click="adjustQuota(user)" class="p-1.5 rounded hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors" :title="`存储配额: ${formatBytes(user.storage_quota)}`">
                <Icon name="database" class="w-4 h-4 text-cyan-500" />
              </button>
              <button @click="viewDetail(user)" class="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="查看详情">
                <Icon name="eye" class="w-4 h-4 text-blue-500" />
              </button>
              <button @click="toggleRole(user)" class="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                :title="user.role === 'admin' ? '降级为用户' : '升级为管理员'">
                <Icon :name="user.role === 'admin' ? 'arrow-down' : 'arrow-up'" class="w-4 h-4 text-purple-500" />
              </button>
              <button @click="openResetPwd(user)" class="p-1.5 rounded hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors" title="重置密码">
                <Icon name="key" class="w-4 h-4 text-yellow-500" />
              </button>
              <button @click="toggleBan(user)" class="p-1.5 rounded transition-colors"
                :class="user.banned ? 'hover:bg-green-50 dark:hover:bg-green-900/20' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'"
                :title="user.banned ? '解封' : '封禁'">
                <Icon v-if="user.banned" name="check" class="w-4 h-4 text-green-500" />
                <Icon v-else name="ban" class="w-4 h-4 text-orange-500" />
              </button>
              <button @click="confirmDelete(user)" class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="删除用户">
                <Icon name="trash" class="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- IP 黑名单/白名单 -->
      <div class="mt-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold dark:text-dark-text text-light-text flex items-center gap-2">
            <Icon name="shield" class="w-5 h-5 text-red-500" />
            IP {{ ipListMode === 'whitelist' ? '白名单' : '黑名单' }}
            <span class="px-2 py-0.5 text-xs font-medium rounded-full"
              :class="ipListMode === 'whitelist'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'">
              {{ ipListMode === 'whitelist' ? '白名单模式' : '黑名单模式' }}
            </span>
          </h2>
          <div class="flex items-center gap-2">
            <button @click="toggleIpListMode" class="btn-secondary text-sm flex items-center gap-1.5">
              <Icon :name="ipListMode === 'whitelist' ? 'ban' : 'check'" class="w-4 h-4" />
              切换为{{ ipListMode === 'whitelist' ? '黑名单' : '白名单' }}
            </button>
            <button @click="openAddIpDialog" class="btn-primary text-sm flex items-center gap-1.5">
              <Icon name="plus" class="w-4 h-4" />
              添加
            </button>
          </div>
        </div>

        <div class="card overflow-hidden">
          <div v-if="ipBlacklist.length === 0" class="py-8 text-center text-gray-400 text-sm">
            暂无 IP {{ ipListMode === 'whitelist' ? '白名单' : '黑名单' }}条目
          </div>

          <div v-else>
            <div class="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-dark-text-secondary border-b dark:border-dark-border border-light-border">
              <div class="col-span-4">IP / 网段</div>
              <div class="col-span-3">原因</div>
              <div class="col-span-2 hidden sm:block">添加者</div>
              <div class="col-span-2 hidden md:block">添加时间</div>
              <div class="col-span-1 text-right">操作</div>
            </div>

            <div v-for="entry in ipBlacklist" :key="entry.id"
              class="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b dark:border-dark-border/50 border-light-border/50 last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
              <div class="col-span-4 font-mono text-sm dark:text-dark-text text-light-text truncate">{{ entry.ip_pattern }}</div>
              <div class="col-span-3 text-sm text-gray-500 dark:text-dark-text-secondary truncate">{{ entry.reason || '-' }}</div>
              <div class="col-span-2 hidden sm:block text-sm text-gray-500 dark:text-dark-text-secondary">{{ entry.created_by_name || '-' }}</div>
              <div class="col-span-2 hidden md:block text-xs text-gray-500 dark:text-dark-text-secondary">{{ formatDate(entry.created_at) }}</div>
              <div class="col-span-1 flex justify-end">
                <button v-if="ipListMode === 'whitelist' && entry.ip_pattern === '127.0.0.1'"
                  class="p-1.5 cursor-not-allowed" title="白名单模式下不可删除">
                  <Icon name="lock" class="w-4 h-4 text-gray-400" />
                </button>
                <button v-else @click="confirmDeleteIp(entry)" class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="删除">
                  <Icon name="trash" class="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加 IP 黑名单弹窗 -->
    <Teleport to="body">
      <div v-if="showAddIpDialog" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="showAddIpDialog = false"/>
        <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">添加 IP {{ ipListMode === 'whitelist' ? '白名单' : '黑名单' }}</h3>
          <div class="space-y-3">
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">IP 地址或 CIDR 网段</label>
              <input v-model="ipForm.ip_pattern" type="text" placeholder="如 192.168.1.1 或 192.168.1.0/24"
                class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">封禁原因（可选）</label>
              <input v-model="ipForm.reason" type="text" placeholder="如：恶意扫描"
                class="input-field" />
            </div>
            <p v-if="ipError" class="text-sm text-red-500">{{ ipError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button @click="showAddIpDialog = false" class="btn-secondary text-sm">取消</button>
            <button @click="handleAddIp" class="btn-primary text-sm">添加</button>
          </div>
        </div>
      </div>
    </Teleport>

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
                class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">密码</label>
              <input v-model="createForm.password" type="password" placeholder="至少 6 位"
                class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">角色</label>
              <select v-model="createForm.role"
                class="input-field">
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
              <Icon name="xmark" class="w-5 h-5" style="color: var(--text-secondary-color)" />
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
                  <Icon :name="pool.storageType === 'local' ? 'hard-drive' : 'cloud'" class="w-5 h-5 text-blue-500" />
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
              class="input-field" />
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

    <!-- 配额调整对话框 -->
    <Teleport to="body">
      <div v-if="quotaDialog.show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="quotaDialog.show = false"/>
        <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">调整存储配额</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">用户：<span class="font-medium" style="color: var(--text-color)">{{ quotaDialog.username }}</span></p>
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">配额 (MB)</label>
            <input v-model.number="quotaDialog.quotaMB" type="number" class="input-field" min="0" placeholder="10240" />
            <p class="text-xs mt-1" style="color: var(--text-secondary-color)">当前：{{ quotaDialog.quotaMB }} MB ({{ formatBytes(quotaDialog.quotaMB * 1024 * 1024) }})</p>
          </div>
          <div class="flex justify-end gap-3">
            <button @click="quotaDialog.show = false" class="btn-secondary text-sm">取消</button>
            <button @click="saveQuota" class="btn-primary text-sm">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </Layout>
</template>
