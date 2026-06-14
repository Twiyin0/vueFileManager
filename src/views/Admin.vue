<script setup lang="ts">
import { reactive } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import AdminIpListSection from '@/components/admin/AdminIpListSection.vue'
import AdminSystemSection from '@/components/admin/AdminSystemSection.vue'
import AdminUsersSection from '@/components/admin/AdminUsersSection.vue'
import { formatBytes, formatDate, useAdminPage } from '@/composables/useAdminPage'
import { useI18n } from '@/composables/useI18n'

const state = reactive(useAdminPage())
const { t } = useI18n()

const themeLabelMap: Record<string, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System'
}
</script>

<template>
  <div class="px-4 pt-4">
    <AdminUsersSection
      v-model:search="state.search"
      :users="state.filteredUsers"
      :loading="state.loading"
      :stats="state.stats"
      :format-bytes="formatBytes"
      :format-date="formatDate"
      @create="state.openCreateDialog"
      @verify="state.verifyUser"
      @quota="state.openQuotaDialog"
      @detail="state.viewDetail"
      @role="state.toggleRole"
      @reset-password="state.openResetPwd"
      @ban="state.toggleBan"
      @delete="state.confirmDelete"
    />

    <AdminSystemSection
      v-model:database-form="state.databaseForm"
      :upload-limit="state.uploadLimit"
      :max-concurrent-uploads="state.maxConcurrentUploads"
      :log-level="state.logLevel"
      :database-saving="state.databaseSaving"
      :database-testing="state.databaseTesting"
      :database-message="state.databaseMessage"
      :database-message-type="state.databaseMessageType"
      :database-status="state.databaseStatus"
      @open-upload-limit="state.openUploadLimitDialog"
      @save-database="state.saveDatabaseConfig"
      @test-database="state.testDatabaseConfig"
    />

    <AdminIpListSection
      :entries="state.ipBlacklist"
      :ip-list-mode="state.ipListMode"
      :format-date="formatDate"
      @toggle-mode="state.toggleIpListMode"
      @add="state.openAddIpDialog"
      @delete="state.confirmDeleteIp"
    />

    <Teleport to="body">
      <div v-if="state.showAddIpDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showAddIpDialog = false" />
        <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">
            {{ t('admin.addIpEntry', 'Add IP Entry') }}
          </h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.ipPattern', 'IP or CIDR') }}</label>
              <input
                v-model="state.ipForm.ip_pattern"
                type="text"
                :placeholder="t('admin.ipPatternPlaceholder', 'For example 192.168.1.1 or 192.168.1.0/24')"
                class="input-field"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.reasonOptional', 'Reason (optional)') }}</label>
              <input
                v-model="state.ipForm.reason"
                type="text"
                :placeholder="t('admin.reasonPlaceholder', 'For example malicious scanning')"
                class="input-field"
              />
            </div>
            <p v-if="state.ipError" class="text-sm text-red-500">{{ state.ipError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showAddIpDialog = false">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" @click="state.handleAddIp">{{ t('common.save', 'Save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showCreateDialog = false" />
        <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.createUser', 'Create User') }}</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.username', 'Username') }}</label>
              <input v-model="state.createForm.username" type="text" placeholder="3-20" class="input-field" />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.password', 'Password') }}</label>
              <input v-model="state.createForm.password" type="password" placeholder="6+" class="input-field" />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.role', 'Role') }}</label>
              <select v-model="state.createForm.role" class="input-field">
                <option value="user">{{ t('settings.roleUser', 'User') }}</option>
                <option value="admin">{{ t('settings.roleAdmin', 'Admin') }}</option>
              </select>
            </div>
            <p v-if="state.createError" class="text-sm text-red-500">{{ state.createError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showCreateDialog = false">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" :disabled="state.creating" @click="state.handleCreate">
              {{ state.creating ? t('admin.saving', 'Saving...') : t('common.create', 'Create') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showDetailDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showDetailDialog = false" />
        <div class="relative card max-h-[80vh] w-full max-w-lg overflow-y-auto" style="padding: 1.5rem">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.userDetails', 'User Details') }}</h3>
            <button class="rounded p-1 hover:bg-gray-100 dark:hover:bg-dark-hover" @click="state.showDetailDialog = false">
              <Icon name="xmark" class="h-5 w-5" style="color: var(--text-secondary-color)" />
            </button>
          </div>

          <div v-if="state.detailLoading" class="flex justify-center py-8">
            <svg class="h-6 w-6 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>

          <div v-else-if="state.detailUser" class="space-y-4">
            <div class="flex items-center gap-3">
              <div
                class="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                :class="state.detailUser.banned ? 'bg-red-400' : state.detailUser.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'"
              >
                {{ state.detailUser.username[0].toUpperCase() }}
              </div>
              <div>
                <p class="text-lg font-semibold" style="color: var(--text-color)">{{ state.detailUser.username }}</p>
                <div class="mt-0.5 flex items-center gap-2">
                  <span
                    class="rounded px-2 py-0.5 text-xs font-medium"
                    :class="state.detailUser.role === 'admin'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-dark-surface dark:text-dark-text-secondary'"
                  >
                    {{ state.detailUser.role === 'admin' ? t('settings.roleAdmin', 'Admin') : t('settings.roleUser', 'User') }}
                  </span>
                  <span
                    v-if="state.detailUser.banned"
                    class="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {{ t('admin.banUser', 'Ban User') }}
                  </span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerIp', 'Register IP') }}</p>
                <p class="mt-0.5 font-mono" style="color: var(--text-color)">{{ state.detailUser.registerIp || '-' }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginIp', 'Last Login IP') }}</p>
                <p class="mt-0.5 font-mono" style="color: var(--text-color)">{{ state.detailUser.lastLoginIp || '-' }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerTime', 'Created At') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.createdAt) }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginTime', 'Last Login') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.lastLoginAt) }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.theme', 'Theme') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ themeLabelMap[state.detailUser.settings.theme] || state.detailUser.settings.theme }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.guestModeStatus', 'Guest Mode') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">
                  {{ state.detailUser.settings.guestEnabled ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled') }}
                </p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.guestPath', 'Guest Path') }}</p>
                <p class="mt-0.5 truncate font-mono" style="color: var(--text-color)">{{ state.detailUser.settings.guestPath || '/' }}</p>
              </div>
              <div v-if="state.detailUser.storage" class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('common.quota', 'Quota') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">
                  {{ formatBytes(state.detailUser.storage.used) }} / {{ formatBytes(state.detailUser.storage.quota) }}
                </p>
              </div>
            </div>

            <div>
              <p class="mb-2 text-sm font-medium" style="color: var(--text-color)">{{ t('admin.stats', 'Statistics') }}</p>
              <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.trash', 'Trash') }}</p>
                  <p class="mt-0.5 font-semibold" style="color: var(--text-color)">{{ state.detailUser.stats.trashCount }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.favourites', 'Favourites') }}</p>
                  <p class="mt-0.5 font-semibold" style="color: var(--text-color)">{{ state.detailUser.stats.favCount }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.myShares', 'My Shares') }}</p>
                  <p class="mt-0.5 font-semibold" style="color: var(--text-color)">{{ state.detailUser.stats.shareCount }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">API Keys</p>
                  <p class="mt-0.5 font-semibold" style="color: var(--text-color)">{{ state.detailUser.stats.apiKeyCount }}</p>
                </div>
              </div>
            </div>

            <div>
              <p class="mb-2 text-sm font-medium" style="color: var(--text-color)">
                {{ t('admin.storagePools', 'Storage Pools') }} ({{ state.detailUser.pools.length }})
              </p>
              <div v-if="state.detailUser.pools.length === 0" class="text-sm text-gray-500 dark:text-dark-text-secondary">
                {{ t('admin.noStoragePools', 'No storage pools') }}
              </div>
              <div v-else class="space-y-2">
                <div v-for="pool in state.detailUser.pools" :key="pool.id" class="rounded bg-gray-50 p-3 text-sm dark:bg-dark-hover">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-medium" style="color: var(--text-color)">{{ pool.name }}</p>
                      <p class="mt-0.5 text-xs text-gray-500 dark:text-dark-text-secondary">
                        {{ pool.storageType === 'local' ? t('admin.localStorage', 'Local Storage') : t('admin.remoteStorage', 'Remote Storage') }}
                        <span v-if="pool.isDefault" class="ml-1 text-blue-500">{{ t('common.default', 'Default') }}</span>
                      </p>
                    </div>
                    <span class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ formatDate(pool.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showResetPwdDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showResetPwdDialog = false" />
        <div class="relative card w-full max-w-md" style="padding: 1.5rem">
          <h3 class="mb-1 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.resetPassword', 'Reset Password') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('admin.setNewPasswordFor', 'Set a new password for {username}').replace('{username}', state.resetPwdUser?.username || '') }}
          </p>
          <div class="space-y-3">
            <input
              v-model="state.resetPwdForm.password"
              type="password"
              class="input-field"
              :placeholder="t('admin.newPasswordPlaceholder', 'New password, at least 6 characters')"
            />
            <p v-if="state.resetPwdError" class="text-sm text-red-500">{{ state.resetPwdError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showResetPwdDialog = false">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" @click="state.handleResetPwd">{{ t('admin.resetPassword', 'Reset Password') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.quotaDialog.show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.quotaDialog.show = false" />
        <div class="relative card w-full max-w-md" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.editQuota', 'Adjust Storage Quota') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('common.user', 'User') }}{{ t('common.colon', ': ') }}
            <span class="font-medium" style="color: var(--text-color)">{{ state.quotaDialog.username }}</span>
          </p>
          <div class="space-y-2">
            <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('admin.quotaMb', 'Quota (MB)') }}</label>
            <input v-model.number="state.quotaDialog.quotaMB" type="number" min="1" class="input-field" />
            <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
              {{ t('admin.currentQuota', 'Current Quota') }}{{ t('common.colon', ': ') }}
              {{ state.quotaDialog.quotaMB }} MB
            </p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.quotaDialog.show = false">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" @click="state.saveQuota">{{ t('common.save', 'Save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showUploadLimitDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showUploadLimitDialog = false" />
        <div class="relative card max-h-[90vh] w-full max-w-sm overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.editUploadLimit', 'Edit System Settings') }}</h3>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.uploadLimitMb', 'Single file upload size limit (MB)') }}</label>
            <input v-model="state.newUploadLimit" type="number" min="1" max="10240" class="input-field" placeholder="100" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('admin.uploadLimitHint', 'Enter an integer between 1 and 10240') }}</p>
          </div>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.maxConcurrentUploads', 'Max concurrent uploads') }}</label>
            <input v-model="state.newMaxConcurrentUploads" type="number" min="1" max="16" class="input-field" placeholder="3" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('admin.maxConcurrentUploadsHint', 'Enter an integer between 1 and 16') }}</p>
          </div>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.logLevel', 'Log Level') }}</label>
            <input v-model="state.newLogLevel" type="number" min="1" max="3" class="input-field" placeholder="2" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('admin.logLevelHint', '1 = error, 2 = info, 3 = debug') }}</p>
          </div>

          <div class="flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showUploadLimitDialog = false">{{ t('common.cancel', 'Cancel') }}</button>
            <button class="btn-primary text-sm" @click="state.saveUploadLimit">{{ t('common.save', 'Save') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog
      :show="state.confirmAction.show"
      :title="state.confirmAction.title"
      :message="state.confirmAction.message"
      :confirm-text="state.confirmAction.confirmText"
      :danger="state.confirmAction.danger"
      @confirm="state.handleConfirm"
      @cancel="state.confirmAction.show = false"
    />
  </div>
</template>
