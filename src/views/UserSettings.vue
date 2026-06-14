<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GuestShareDialog from '@/components/GuestShareDialog.vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const { t } = useI18n()
const origin = window.location.origin

const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const form = ref({
  guestEnabled: false,
  theme: 'system' as ThemeMode,
  uploadConcurrency: 0
})

const guestShares = ref<any[]>([])
const loadingShares = ref(false)
const showShares = ref(true)
const deleteConfirm = ref({ show: false, share: null as any })
const editShare = ref<any>(null)
const showEditDialog = ref(false)

const permLabels = {
  read: t('permissions.read', '读取'),
  write: t('permissions.write', '写入'),
  delete: t('permissions.delete', '删除'),
  edit: t('permissions.edit', '文本编辑'),
  preview: t('permissions.preview', '预览'),
  download: t('permissions.download', '下载'),
  upload: t('permissions.upload', '上传')
}

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  window.setTimeout(() => {
    message.value = ''
  }, 3000)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

async function loadGuestShares() {
  loadingShares.value = true
  try {
    const res = await api.get<{ shares: any[] }>('/user/guest-shares')
    guestShares.value = res.shares
  } finally {
    loadingShares.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.get<{ settings: any }>('/user/settings')
    form.value = {
      guestEnabled: res.settings.guestEnabled || false,
      theme: (res.settings.theme as ThemeMode) || 'system',
      uploadConcurrency: Number(res.settings.uploadConcurrency || 0)
    }
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    loading.value = false
  }

  await loadGuestShares()
})

async function saveSettings() {
  saving.value = true
  try {
    await api.put('/user/settings', {
      guestEnabled: form.value.guestEnabled,
      theme: form.value.theme,
      uploadConcurrency: form.value.uploadConcurrency
    })

    themeStore.setTheme(form.value.theme)
    if (authStore.user?.settings) {
      authStore.user.settings.theme = form.value.theme
      authStore.user.settings.guestEnabled = form.value.guestEnabled
      authStore.user.settings.uploadConcurrency = form.value.uploadConcurrency
    }

    showMsg(t('settings.saved', '设置已保存'), 'success')
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    saving.value = false
  }
}

function confirmDeleteShare(share: any) {
  deleteConfirm.value = { show: true, share }
}

function openEditShare(share: any) {
  editShare.value = {
    ...share,
    permissions: share.permissions || 'preview,download'
  }
  showEditDialog.value = true
}

async function handleDeleteShare() {
  if (!deleteConfirm.value.share) return
  try {
    await api.delete(`/user/guest-shares/${deleteConfirm.value.share.id}`)
    showMsg(t('settings.cancelShare', '取消分享'), 'success')
    await loadGuestShares()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
  deleteConfirm.value = { show: false, share: null }
}
</script>

<template>
  <div class="px-4 pt-4">
    <div
      v-if="message"
      class="mb-4 rounded-lg border p-3 text-sm"
      :class="messageType === 'success'
        ? 'border-green-200 bg-green-50 text-green-600 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400'
        : 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400'"
    >
      {{ message }}
    </div>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <form v-else class="space-y-6" @submit.prevent="saveSettings">
      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.theme', '主题设置') }}</h2>
        <div class="flex gap-3">
          <label
            v-for="option in [
              { value: 'light', label: 'Light', icon: 'sun' },
              { value: 'dark', label: 'Dark', icon: 'moon' },
              { value: 'system', label: t('settings.followSystem', '跟随系统'), icon: 'monitor' }
            ]"
            :key="option.value"
            class="flex-1 cursor-pointer"
          >
            <input v-model="form.theme" type="radio" :value="option.value" class="peer hidden" />
            <div class="rounded-lg border-2 p-3 text-center transition-all peer-checked:border-blue-500 peer-checked:bg-blue-50 hover:border-blue-300 dark:border-dark-border dark:hover:border-blue-600 dark:peer-checked:bg-blue-900/20">
              <Icon :name="option.icon" class="mx-auto h-7 w-7" />
              <p class="mt-1 text-sm text-light-text dark:text-dark-text">{{ option.label }}</p>
            </div>
          </label>
        </div>
      </div>

      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.upload', '上传设置') }}</h2>
        <div class="space-y-2">
          <label class="block text-sm font-medium text-light-text dark:text-dark-text">{{ t('settings.uploadConcurrency', '最大同时上传文件数') }}</label>
          <input v-model.number="form.uploadConcurrency" type="number" min="0" max="16" class="input-field" />
          <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('settings.uploadConcurrencyHint', '设置为 0 表示跟随服务端默认值') }}</p>
        </div>
      </div>

      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.storage', '存储管理') }}</h2>
        <p class="mb-4 text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('settings.storageDescription', '可在存储池页面中管理本地、又拍云及其他后端存储。') }}</p>
        <router-link to="/storage-pools" class="btn-primary inline-flex items-center gap-2">
          <Icon name="server" class="h-5 w-5" />
          {{ t('settings.manageStoragePools', '管理存储池') }}
        </router-link>
      </div>

      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.guestMode', '访客模式') }}</h2>
        <div class="mb-4 flex items-center gap-3">
          <label class="relative inline-flex cursor-pointer items-center">
            <input v-model="form.guestEnabled" type="checkbox" class="peer sr-only" />
            <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full dark:bg-dark-border"></div>
          </label>
          <span class="text-sm text-light-text dark:text-dark-text">{{ t('settings.enableGuestMode', '启用访客模式') }}</span>
        </div>

        <div v-if="form.guestEnabled">
          <div class="mb-4 rounded-lg p-3" style="background-color: var(--hover-color)">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('settings.guestLink', '访客链接') }}</p>
            <p class="font-mono text-sm" style="color: var(--accent-color)">{{ origin }}/guest/{{ authStore.user?.username }}</p>
          </div>

          <div class="overflow-hidden rounded-lg border" style="border-color: var(--border-color)">
            <button
              type="button"
              class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover"
              style="color: var(--text-color)"
              @click="showShares = !showShares"
            >
              <span>{{ t('settings.guestShares', '分享目录') }}（{{ guestShares.length }}）</span>
              <Icon name="chevron-down" class="h-4 w-4 transition-transform duration-200" :class="showShares ? 'rotate-180' : ''" />
            </button>

            <div v-show="showShares">
              <div v-if="loadingShares" class="flex items-center justify-center py-6">
                <svg class="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>

              <div v-else-if="guestShares.length === 0" class="px-4 py-6 text-center text-sm" style="color: var(--text-secondary-color)">
                {{ t('settings.noGuestShares', '暂无分享目录，可在文件列表中对文件夹执行访客分享') }}
              </div>

              <div v-else class="divide-y" style="border-color: var(--border-color)">
                <div v-for="share in guestShares" :key="share.id" class="flex items-center justify-between px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium" style="color: var(--text-color)">{{ share.label || share.folder_path }}</p>
                    <p class="mt-0.5 text-xs" style="color: var(--text-secondary-color)">
                      <span class="font-mono">{{ share.folder_path }}</span>
                      <span class="mx-1">·</span>
                      {{ share.pool_name }}
                      <span class="mx-1">·</span>
                      {{ formatDate(share.created_at) }}
                    </p>
                    <div v-if="share.permissions" class="mt-1.5 flex flex-wrap gap-1">
                      <span
                        v-for="permission in share.permissions.split(',')"
                        :key="permission"
                        class="rounded px-1.5 py-0.5 text-xs"
                        style="background-color: var(--accent-soft-color); color: var(--accent-color)"
                      >
                        {{ permLabels[permission.trim() as keyof typeof permLabels] || permission.trim() }}
                      </span>
                    </div>
                  </div>
                  <div class="ml-3 flex items-center gap-1">
                    <button
                      type="button"
                      class="rounded-md p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                      :title="t('settings.editPermissions', '编辑权限')"
                      @click="openEditShare(share)"
                    >
                      <Icon name="pen" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                    </button>
                    <button
                      type="button"
                      class="rounded-md p-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                      :title="t('settings.cancelShare', '取消分享')"
                      @click="confirmDeleteShare(share)"
                    >
                      <Icon name="trash" class="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.userInfo', '用户信息') }}</h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('common.username', '用户名') }}</span>
            <span class="text-light-text dark:text-dark-text">{{ authStore.user?.username }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('common.role', '角色') }}</span>
            <span class="text-light-text dark:text-dark-text">
              {{ authStore.user?.role === 'admin' ? t('settings.roleAdmin', '管理员') : t('settings.roleUser', '普通用户') }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerIp', '注册 IP') }}</span>
            <span class="font-mono text-light-text dark:text-dark-text">{{ authStore.user?.registerIp || '-' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginIp', '最后登录 IP') }}</span>
            <span class="font-mono text-light-text dark:text-dark-text">{{ authStore.user?.lastLoginIp || '-' }}</span>
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="btn-primary px-8" :disabled="saving">
          <span v-if="saving" class="flex items-center gap-2">
            <svg class="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ t('admin.saving', '保存中...') }}
          </span>
          <span v-else>{{ t('settings.save', '保存设置') }}</span>
        </button>
      </div>
    </form>

    <ConfirmDialog
      :show="deleteConfirm.show"
      :title="t('settings.cancelShare', '取消分享')"
      :message="`确认取消“${deleteConfirm.share?.label || deleteConfirm.share?.folder_path || ''}”的访客分享吗？`"
      :confirm-text="t('settings.cancelShare', '取消分享')"
      :danger="true"
      @confirm="handleDeleteShare"
      @cancel="deleteConfirm = { show: false, share: null }"
    />

    <GuestShareDialog
      :show="showEditDialog"
      :folder-path="editShare?.folder_path || ''"
      :folder-name="editShare?.label || ''"
      :edit-share="editShare"
      @close="showEditDialog = false; editShare = null"
      @done="loadGuestShares()"
    />
  </div>
</template>
