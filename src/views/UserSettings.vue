<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import GuestShareDialog from '@/components/GuestShareDialog.vue'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

const authStore = useAuthStore()
const { t, setLanguage, language } = useI18n()
const origin = window.location.origin

const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const form = ref({
  guestEnabled: false,
  language: 'zh-CN' as 'zh-CN' | 'en-US',
  uploadConcurrency: 0
})

const guestShares = ref<any[]>([])
const loadingShares = ref(false)
const showShares = ref(false)
const deleteConfirm = ref({ show: false, share: null as any })
const editShare = ref<any>(null)
const showEditDialog = ref(false)

const permLabels = {
  read: t('permissions.read', 'Read'),
  write: t('permissions.write', 'Write'),
  delete: t('permissions.delete', 'Delete'),
  edit: t('permissions.edit', 'Text Edit'),
  preview: t('permissions.preview', 'Preview'),
  download: t('permissions.download', 'Download'),
  upload: t('permissions.upload', 'Upload')
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
  return `${date.toLocaleDateString(language.value || 'zh-CN')} ${date.toLocaleTimeString(language.value || 'zh-CN', { hour: '2-digit', minute: '2-digit' })}`
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
      language: res.settings.language === 'en-US' ? 'en-US' : 'zh-CN',
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
      language: form.value.language,
      uploadConcurrency: form.value.uploadConcurrency
    })

    await setLanguage(form.value.language)

    if (authStore.user?.settings) {
      authStore.user.settings.language = form.value.language
      authStore.user.settings.guestEnabled = form.value.guestEnabled
      authStore.user.settings.uploadConcurrency = form.value.uploadConcurrency
    }

    showMsg(t('settings.saved', 'Settings saved'), 'success')
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
    showMsg(t('settings.cancelShare', 'Cancel Share'), 'success')
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

    <form v-else class="space-y-6 pb-6" @submit.prevent="saveSettings">
      <div class="card">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.userInfo', 'User Information') }}</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('settings.languageHint', 'Language is saved to the current account and will be reused on future sign-ins.') }}</p>
          </div>
          <div class="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-semibold text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            {{ authStore.user?.username?.slice(0, 1).toUpperCase() }}
          </div>
        </div>

        <div class="grid gap-3 text-sm sm:grid-cols-2">
          <div class="rounded-lg bg-gray-50 px-4 py-3 dark:bg-dark-hover">
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('common.username', 'Username') }}</p>
            <p class="mt-1 font-medium text-light-text dark:text-dark-text">{{ authStore.user?.username }}</p>
          </div>
          <div class="rounded-lg bg-gray-50 px-4 py-3 dark:bg-dark-hover">
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('common.role', 'Role') }}</p>
            <p class="mt-1 font-medium text-light-text dark:text-dark-text">
              {{ authStore.user?.role === 'admin' ? t('settings.roleAdmin', 'Admin') : t('settings.roleUser', 'User') }}
            </p>
          </div>
          <div class="rounded-lg bg-gray-50 px-4 py-3 dark:bg-dark-hover">
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerIp', 'Register IP') }}</p>
            <p class="mt-1 font-mono text-light-text dark:text-dark-text">{{ authStore.user?.registerIp || '-' }}</p>
          </div>
          <div class="rounded-lg bg-gray-50 px-4 py-3 dark:bg-dark-hover">
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginIp', 'Last Login IP') }}</p>
            <p class="mt-1 font-mono text-light-text dark:text-dark-text">{{ authStore.user?.lastLoginIp || '-' }}</p>
          </div>
        </div>
      </div>

      <div class="card space-y-6">
        <div>
          <h2 class="mb-4 text-lg font-semibold text-light-text dark:text-dark-text">{{ t('settings.title', 'User Settings') }}</h2>
          <div class="space-y-5">
            <div class="space-y-2">
              <label class="block text-sm font-medium text-light-text dark:text-dark-text">{{ t('settings.language', 'Interface Language') }}</label>
              <select v-model="form.language" class="input-field">
                <option value="zh-CN">{{ t('language.zh-CN', 'Simplified Chinese') }}</option>
                <option value="en-US">{{ t('language.en-US', 'English') }}</option>
              </select>
            </div>

            <div class="space-y-2">
              <label class="block text-sm font-medium text-light-text dark:text-dark-text">{{ t('settings.uploadConcurrency', 'Max concurrent uploads') }}</label>
              <input v-model.number="form.uploadConcurrency" type="number" min="0" max="16" class="input-field" />
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('settings.uploadConcurrencyHint', 'Set to 0 to follow the server default') }}</p>
            </div>
          </div>
        </div>

        <div class="border-t pt-6" style="border-color: var(--border-color)">
          <div class="mb-4 flex items-center gap-3">
            <label class="relative inline-flex cursor-pointer items-center">
              <input v-model="form.guestEnabled" type="checkbox" class="peer sr-only" />
              <div class="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-500 peer-checked:after:translate-x-full dark:bg-dark-border"></div>
            </label>
            <div>
              <p class="text-sm font-medium text-light-text dark:text-dark-text">{{ t('settings.enableGuestMode', 'Enable Guest Mode') }}</p>
              <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('settings.guestMode', 'Guest Mode') }}</p>
            </div>
          </div>

          <div v-if="form.guestEnabled">
            <div class="mb-4 rounded-lg p-3" style="background-color: var(--hover-color)">
              <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('settings.guestLink', 'Guest Link') }}</p>
              <p class="font-mono text-sm" style="color: var(--accent-color)">{{ origin }}/guest/{{ authStore.user?.username }}</p>
            </div>

            <div class="overflow-hidden rounded-lg border" style="border-color: var(--border-color)">
              <button
                type="button"
                class="flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover"
                style="color: var(--text-color)"
                @click="showShares = !showShares"
              >
                <span>{{ t('settings.guestSharesWithCount', 'Guest Folders ({count})').replace('{count}', String(guestShares.length)) }}</span>
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
                  {{ t('settings.noGuestShares', 'No guest folders yet. Create guest shares from the file list.') }}
                </div>

                <div v-else class="divide-y" style="border-color: var(--border-color)">
                  <div v-for="share in guestShares" :key="share.id" class="flex items-center justify-between px-4 py-3">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium" style="color: var(--text-color)">{{ share.label || share.folder_path }}</p>
                      <p class="mt-0.5 text-xs" style="color: var(--text-secondary-color)">
                        <span class="font-mono">{{ share.folder_path }}</span>
                        <span class="mx-1">{{ t('common.separator', ' | ') }}</span>
                        {{ share.pool_name }}
                        <span class="mx-1">{{ t('common.separator', ' | ') }}</span>
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
                        :title="t('settings.editPermissions', 'Edit Permissions')"
                        @click="openEditShare(share)"
                      >
                        <Icon name="pen" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                      </button>
                      <button
                        type="button"
                        class="rounded-md p-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                        :title="t('settings.cancelShare', 'Cancel Share')"
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
      </div>

      <div class="flex justify-start">
        <button type="submit" class="btn-primary min-w-[9rem]" :disabled="saving">
          <span v-if="saving" class="flex items-center gap-2">
            <svg class="h-4 w-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ t('admin.saving', 'Saving...') }}
          </span>
          <span v-else>{{ t('settings.save', 'Save Settings') }}</span>
        </button>
      </div>
    </form>

    <ConfirmDialog
      :show="deleteConfirm.show"
      :title="t('settings.cancelShare', 'Cancel Share')"
      :message="t('settings.cancelShareMessage', 'Cancel guest share {name}?').replace('{name}', deleteConfirm.share?.label || deleteConfirm.share?.folder_path || '')"
      :confirm-text="t('settings.cancelShare', 'Cancel Share')"
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
