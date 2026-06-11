import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'

export interface AdminUser {
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

export interface UserDetail {
  id: number
  username: string
  email?: string | null
  role: string
  banned: boolean
  registerIp: string
  lastLoginIp: string
  lastLoginAt: string
  createdAt: string
  settings: { guestEnabled: boolean; guestPath: string; theme: string }
  pools: { id: number; name: string; storageType: string; isDefault: boolean; config: any; createdAt: string }[]
  stats: { trashCount: number; favCount: number; shareCount: number; apiKeyCount: number }
  storage?: { quota: number; used: number; remaining: number }
}

export interface DatabaseStatus {
  type: 'sqlite' | 'mysql' | 'postgres'
  runtime: 'sqlite' | 'external'
  configured: boolean
  supported: boolean
  message: string
  note?: string
}

export interface DatabaseConfigForm {
  type: 'sqlite' | 'mysql' | 'postgres'
  sqlite: { path: string }
  mysql: { host: string; port: number; user: string; password: string; database: string; ssl: boolean }
  postgres: { host: string; port: number; user: string; password: string; database: string; ssl: boolean }
}

export interface IpBlacklistEntry {
  id: number
  ip_pattern: string
  reason: string
  created_by: number
  created_by_name: string | null
  created_at: string
}

interface ConfirmAction {
  show: boolean
  title: string
  message: string
  confirmText: string
  danger: boolean
  onConfirm: () => void | Promise<void>
}

export function createDefaultDatabaseForm(): DatabaseConfigForm {
  return {
    type: 'sqlite',
    sqlite: { path: './data/filemanager.db' },
    mysql: { host: '127.0.0.1', port: 3306, user: '', password: '', database: '', ssl: false },
    postgres: { host: '127.0.0.1', port: 5432, user: '', password: '', database: '', ssl: false }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr.replace(' ', 'T') + 'Z')
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function useAdminPage() {
  const users = ref<AdminUser[]>([])
  const loading = ref(true)
  const search = ref('')

  const showCreateDialog = ref(false)
  const createForm = ref({ username: '', password: '', role: 'user' })
  const createError = ref('')
  const creating = ref(false)

  const showDetailDialog = ref(false)
  const detailUser = ref<UserDetail | null>(null)
  const detailLoading = ref(false)

  const showResetPwdDialog = ref(false)
  const resetPwdUser = ref<AdminUser | null>(null)
  const resetPwdForm = ref({ password: '' })
  const resetPwdError = ref('')

  const confirmAction = ref<ConfirmAction>({
    show: false,
    title: '',
    message: '',
    confirmText: '确认',
    danger: false,
    onConfirm: () => {}
  })

  const quotaDialog = ref({ show: false, userId: 0, username: '', quotaMB: 0 })

  const uploadLimit = ref(100)
  const showUploadLimitDialog = ref(false)
  const newUploadLimit = ref('')
  const databaseSaving = ref(false)
  const databaseTesting = ref(false)
  const databaseMessage = ref('')
  const databaseMessageType = ref<'success' | 'error' | 'info'>('info')
  const databaseStatus = ref<DatabaseStatus | null>(null)
  const databaseForm = ref<DatabaseConfigForm>(createDefaultDatabaseForm())

  const ipBlacklist = ref<IpBlacklistEntry[]>([])
  const ipListMode = ref<'blacklist' | 'whitelist'>('blacklist')
  const showAddIpDialog = ref(false)
  const ipForm = ref({ ip_pattern: '', reason: '' })
  const ipError = ref('')

  const filteredUsers = computed(() => {
    if (!search.value) return users.value
    const q = search.value.toLowerCase()
    return users.value.filter((user) =>
      user.username.toLowerCase().includes(q) ||
      (user.email && user.email.toLowerCase().includes(q)) ||
      user.role.includes(q) ||
      (user.register_ip && user.register_ip.includes(q)) ||
      (user.last_login_ip && user.last_login_ip.includes(q))
    )
  })

  const stats = computed(() => ({
    total: users.value.length,
    admins: users.value.filter((user) => user.role === 'admin').length,
    banned: users.value.filter((user) => user.banned).length,
    guests: users.value.filter((user) => user.guest_enabled).length
  }))

  function setDatabaseMessage(message: string, type: 'success' | 'error' | 'info' = 'info') {
    databaseMessage.value = message
    databaseMessageType.value = type
  }

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

  async function fetchUploadLimit() {
    try {
      const res = await api.get<{ upload_limit: number }>('/admin/upload-limit')
      uploadLimit.value = res.upload_limit
    } catch {}
  }

  async function fetchDatabaseConfig() {
    try {
      const res = await api.get<{ database: DatabaseConfigForm; status: DatabaseStatus }>('/admin/database')
      databaseForm.value = res.database
      databaseStatus.value = res.status
    } catch (err: any) {
      setDatabaseMessage(err.message, 'error')
    }
  }

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

  function verifyUser(user: AdminUser) {
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

  function handleConfirm() {
    confirmAction.value.onConfirm()
    confirmAction.value.show = false
  }

  function openUploadLimitDialog() {
    newUploadLimit.value = String(uploadLimit.value)
    showUploadLimitDialog.value = true
  }

  async function saveUploadLimit() {
    const val = parseInt(newUploadLimit.value)
    if (isNaN(val) || val < 1 || val > 10240) {
      alert('请输入 1-10240 之间的数字')
      return
    }
    try {
      await api.put('/admin/upload-limit', { upload_limit: val })
      uploadLimit.value = val
      showUploadLimitDialog.value = false
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function saveDatabaseConfig() {
    databaseSaving.value = true
    try {
      const res = await api.put<{ message: string; status: DatabaseStatus }>('/admin/database', {
        database: databaseForm.value
      })
      databaseStatus.value = res.status
      setDatabaseMessage(res.message, 'success')
    } catch (err: any) {
      setDatabaseMessage(err.message, 'error')
    } finally {
      databaseSaving.value = false
    }
  }

  async function testDatabaseConfig() {
    databaseTesting.value = true
    try {
      const res = await api.post<{ success: boolean; message: string; status?: DatabaseStatus }>('/admin/database/test', {
        database: databaseForm.value
      })
      if (res.status) databaseStatus.value = res.status
      setDatabaseMessage(res.message, res.success ? 'success' : 'error')
    } catch (err: any) {
      setDatabaseMessage(err.message, 'error')
    } finally {
      databaseTesting.value = false
    }
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
    fetchUsers()
    fetchUploadLimit()
    fetchDatabaseConfig()
    fetchIpBlacklist()
    fetchIpListMode()
  })

  return {
    users,
    loading,
    search,
    showCreateDialog,
    createForm,
    createError,
    creating,
    showDetailDialog,
    detailUser,
    detailLoading,
    showResetPwdDialog,
    resetPwdUser,
    resetPwdForm,
    resetPwdError,
    confirmAction,
    quotaDialog,
    uploadLimit,
    showUploadLimitDialog,
    newUploadLimit,
    databaseSaving,
    databaseTesting,
    databaseMessage,
    databaseMessageType,
    databaseStatus,
    databaseForm,
    ipBlacklist,
    ipListMode,
    showAddIpDialog,
    ipForm,
    ipError,
    filteredUsers,
    stats,
    fetchUsers,
    openCreateDialog,
    handleCreate,
    viewDetail,
    openResetPwd,
    handleResetPwd,
    openQuotaDialog,
    saveQuota,
    toggleRole,
    toggleBan,
    confirmDelete,
    verifyUser,
    handleConfirm,
    openUploadLimitDialog,
    saveUploadLimit,
    saveDatabaseConfig,
    testDatabaseConfig,
    toggleIpListMode,
    openAddIpDialog,
    handleAddIp,
    confirmDeleteIp
  }
}
