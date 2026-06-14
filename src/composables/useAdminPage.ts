import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useI18nStore } from '@/stores/i18n'

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
  verified?: boolean
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

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''))
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
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 0 ? 1 : 0)} ${units[index]}`
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr.replace(' ', 'T') + 'Z')
  return `${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
}

export function useAdminPage() {
  const i18n = useI18nStore()

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
    confirmText: i18n.t('common.confirm', 'Confirm'),
    danger: false,
    onConfirm: () => {}
  })
  const confirmLoading = ref(false)

  const quotaDialog = ref({ show: false, userId: 0, username: '', quotaMB: 0 })

  const uploadLimit = ref(100)
  const maxConcurrentUploads = ref(3)
  const logLevel = ref(2)
  const showUploadLimitDialog = ref(false)
  const newUploadLimit = ref('100')
  const newMaxConcurrentUploads = ref('3')
  const newLogLevel = ref('2')

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
    const keyword = search.value.toLowerCase()
    return users.value.filter((user) =>
      user.username.toLowerCase().includes(keyword) ||
      (user.email && user.email.toLowerCase().includes(keyword)) ||
      user.role.toLowerCase().includes(keyword) ||
      (user.register_ip && user.register_ip.includes(keyword)) ||
      (user.last_login_ip && user.last_login_ip.includes(keyword))
    )
  })

  const stats = computed(() => ({
    total: users.value.length,
    admins: users.value.filter((user) => user.role === 'admin').length,
    banned: users.value.filter((user) => user.banned).length,
    guests: users.value.filter((user) => user.guest_enabled).length
  }))

  function t(key: string, fallback?: string) {
    return i18n.t(key, fallback)
  }

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

  async function fetchSystemSettings() {
    try {
      const res = await api.get<{ upload_limit: number; max_concurrent_uploads: number; log_level: number }>('/admin/upload-limit')
      uploadLimit.value = res.upload_limit
      maxConcurrentUploads.value = Number(res.max_concurrent_uploads || 3)
      logLevel.value = Number(res.log_level || 2)
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
    if (!resetPwdUser.value) return
    if (resetPwdForm.value.password.length < 6) {
      resetPwdError.value = t('admin.newPasswordPlaceholder', 'New password, at least 6 characters')
      return
    }
    try {
      await api.put(`/admin/users/${resetPwdUser.value.id}/password`, resetPwdForm.value)
      showResetPwdDialog.value = false
      alert(t('admin.passwordReset', 'Password has been reset'))
    } catch (err: any) {
      resetPwdError.value = err.message
    }
  }

  function openQuotaDialog(user: AdminUser) {
    quotaDialog.value = {
      show: true,
      userId: user.id,
      username: user.username,
      quotaMB: Math.round((user.storage_quota || 0) / 1024 / 1024)
    }
  }

  async function saveQuota() {
    try {
      const quotaBytes = Math.max(0, Math.round(Number(quotaDialog.value.quotaMB || 0) * 1024 * 1024))
      await api.put(`/admin/users/${quotaDialog.value.userId}/quota`, {
        quota: quotaBytes,
        quotaMB: quotaDialog.value.quotaMB
      })
      quotaDialog.value.show = false
      await fetchUsers()
    } catch (err: any) {
      alert(err.message)
    }
  }

  function toggleRole(user: AdminUser) {
    const isPromote = user.role !== 'admin'
    confirmAction.value = {
      show: true,
      title: t(isPromote ? 'admin.confirmRoleTitleAdmin' : 'admin.confirmRoleTitleUser', isPromote ? 'Promote to Admin' : 'Demote to User'),
      message: interpolate(
        t(isPromote ? 'admin.confirmRoleMessageAdmin' : 'admin.confirmRoleMessageUser', isPromote ? 'Promote "{username}" to admin?' : 'Demote "{username}" to a regular user?'),
        { username: user.username }
      ),
      confirmText: t('common.confirm', 'Confirm'),
      danger: false,
      onConfirm: async () => {
        await api.put(`/admin/users/${user.id}/role`, { role: isPromote ? 'admin' : 'user' })
        await fetchUsers()
      }
    }
  }

  function toggleBan(user: AdminUser) {
    const isBan = !user.banned
    confirmAction.value = {
      show: true,
      title: t(isBan ? 'admin.confirmBanTitle' : 'admin.confirmUnbanTitle', isBan ? 'Ban User' : 'Unban User'),
      message: interpolate(
        t(isBan ? 'admin.confirmBanMessage' : 'admin.confirmUnbanMessage', isBan ? 'Ban "{username}"? The user will no longer be able to sign in.' : 'Unban "{username}"?'),
        { username: user.username }
      ),
      confirmText: t('common.confirm', 'Confirm'),
      danger: isBan,
      onConfirm: async () => {
        await api.put(`/admin/users/${user.id}/ban`, { banned: isBan })
        await fetchUsers()
      }
    }
  }

  function confirmDelete(user: AdminUser) {
    confirmAction.value = {
      show: true,
      title: t('common.delete', 'Delete'),
      message: interpolate(t('admin.confirmDeleteUserMessage', 'Delete user "{username}"? Related user data will be removed permanently.'), { username: user.username }),
      confirmText: t('common.delete', 'Delete'),
      danger: true,
      onConfirm: async () => {
        await api.delete(`/admin/users/${user.id}`)
        await fetchUsers()
      }
    }
  }

  function verifyUser(user: AdminUser) {
    confirmAction.value = {
      show: true,
      title: t('admin.verifyUser', 'Verify User'),
      message: interpolate(t('admin.verifyUserMessage', 'Verify "{username}" manually?'), { username: user.username }),
      confirmText: t('admin.verifyUser', 'Verify User'),
      danger: false,
      onConfirm: async () => {
        await api.put(`/admin/users/${user.id}/verify`)
        await fetchUsers()
      }
    }
  }

  async function handleConfirm() {
    if (confirmLoading.value) return
    confirmLoading.value = true
    try {
      await confirmAction.value.onConfirm()
      confirmAction.value.show = false
    } catch (err: any) {
      alert(err?.message || t('common.operationFailed', 'Operation failed'))
    } finally {
      confirmLoading.value = false
    }
  }

  function openUploadLimitDialog() {
    newUploadLimit.value = String(uploadLimit.value)
    newMaxConcurrentUploads.value = String(maxConcurrentUploads.value)
    newLogLevel.value = String(logLevel.value)
    showUploadLimitDialog.value = true
  }

  async function saveUploadLimit() {
    const limit = parseInt(newUploadLimit.value, 10)
    const concurrency = parseInt(newMaxConcurrentUploads.value, 10)
    const nextLogLevel = parseInt(newLogLevel.value, 10)

    if (Number.isNaN(limit) || limit < 1 || limit > 10240) {
      alert(t('admin.uploadLimitValidation', 'Enter an upload limit between 1 and 10240'))
      return
    }

    if (Number.isNaN(concurrency) || concurrency < 1 || concurrency > 16) {
      alert(t('admin.concurrencyValidation', 'Enter a concurrency value between 1 and 16'))
      return
    }

    if (Number.isNaN(nextLogLevel) || ![1, 2, 3].includes(nextLogLevel)) {
      alert(t('admin.logLevelValidation', 'Enter a log level between 1 and 3'))
      return
    }

    try {
      const res = await api.put<{ message: string }>('/admin/upload-limit', {
        upload_limit: limit,
        max_concurrent_uploads: concurrency,
        log_level: nextLogLevel
      })
      uploadLimit.value = limit
      maxConcurrentUploads.value = concurrency
      logLevel.value = nextLogLevel
      showUploadLimitDialog.value = false
      setDatabaseMessage(res.message || t('admin.settingsSaved', 'Upload settings saved. The service will not restart automatically.'), 'success')
    } catch (err: any) {
      setDatabaseMessage(err.message, 'error')
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
    const confirmed = window.confirm(
      t(
        newMode === 'whitelist' ? 'admin.switchWhitelistWarning' : 'admin.switchBlacklistWarning',
        newMode === 'whitelist'
          ? 'After switching to whitelist mode, only listed IPs can access the site. Continue?'
          : 'After switching to blacklist mode, only listed IPs will be blocked. Continue?'
      )
    )
    if (!confirmed) return

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
      title: t('common.delete', 'Delete'),
      message: interpolate(t('admin.confirmDeleteIpMessage', 'Delete IP entry "{pattern}"?'), { pattern: entry.ip_pattern }),
      confirmText: t('common.delete', 'Delete'),
      danger: true,
      onConfirm: async () => {
        await api.delete(`/admin/ip-blacklist/${entry.id}`)
        await fetchIpBlacklist()
      }
    }
  }

  onMounted(async () => {
    await Promise.all([
      fetchUsers(),
      fetchSystemSettings(),
      fetchDatabaseConfig(),
      fetchIpBlacklist(),
      fetchIpListMode()
    ])
  })

  return {
    users,
    loading,
    search,
    filteredUsers,
    stats,
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
    confirmLoading,
    quotaDialog,
    uploadLimit,
    maxConcurrentUploads,
    logLevel,
    showUploadLimitDialog,
    newUploadLimit,
    newMaxConcurrentUploads,
    newLogLevel,
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
