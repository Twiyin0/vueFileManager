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
      :language="state.language"
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
            {{ t('admin.addIpEntry', '添加 IP 条目') }}
          </h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.ipPattern', 'IP 地址或 CIDR 网段') }}</label>
              <input
                v-model="state.ipForm.ip_pattern"
                type="text"
                :placeholder="t('admin.ipPatternPlaceholder', '例如 192.168.1.1 或 192.168.1.0/24')"
                class="input-field"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.reasonOptional', '原因（可选）') }}</label>
              <input
                v-model="state.ipForm.reason"
                type="text"
                :placeholder="t('admin.reasonPlaceholder', '例如 恶意扫描')"
                class="input-field"
              />
            </div>
            <p v-if="state.ipError" class="text-sm text-red-500">{{ state.ipError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showAddIpDialog = false">{{ t('common.cancel', '取消') }}</button>
            <button class="btn-primary text-sm" @click="state.handleAddIp">{{ t('common.save', '保存') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showCreateDialog = false" />
        <div class="relative card max-h-[90vh] w-full max-w-md overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.createUser', '创建用户') }}</h3>
          <div class="space-y-3">
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.username', '用户名') }}</label>
              <input v-model="state.createForm.username" type="text" placeholder="3-20" class="input-field" />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.password', '密码') }}</label>
              <input v-model="state.createForm.password" type="password" placeholder="6+" class="input-field" />
            </div>
            <div>
              <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('common.role', '角色') }}</label>
              <select v-model="state.createForm.role" class="input-field">
                <option value="user">{{ t('settings.roleUser', '普通用户') }}</option>
                <option value="admin">{{ t('settings.roleAdmin', '管理员') }}</option>
              </select>
            </div>
            <p v-if="state.createError" class="text-sm text-red-500">{{ state.createError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showCreateDialog = false">{{ t('common.cancel', '取消') }}</button>
            <button class="btn-primary text-sm" :disabled="state.creating" @click="state.handleCreate">
              {{ state.creating ? t('admin.saving', '保存中...') : t('common.create', '创建') }}
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
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.userDetails', '用户详情') }}</h3>
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
                    {{ state.detailUser.role === 'admin' ? t('settings.roleAdmin', '管理员') : t('settings.roleUser', '普通用户') }}
                  </span>
                  <span
                    v-if="state.detailUser.banned"
                    class="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  >
                    {{ t('admin.banUser', '封禁用户') }}
                  </span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerIp', '注册 IP') }}</p>
                <p class="mt-0.5 font-mono" style="color: var(--text-color)">{{ state.detailUser.registerIp || '-' }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginIp', '最后登录 IP') }}</p>
                <p class="mt-0.5 font-mono" style="color: var(--text-color)">{{ state.detailUser.lastLoginIp || '-' }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.registerTime', '注册时间') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.createdAt) }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.lastLoginTime', '最近登录') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.lastLoginAt) }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.theme', '主题') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ themeLabelMap[state.detailUser.settings.theme] || state.detailUser.settings.theme }}</p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.guestModeStatus', '访客模式') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">
                  {{ state.detailUser.settings.guestEnabled ? t('common.enabled', '已启用') : t('common.disabled', '未启用') }}
                </p>
              </div>
              <div class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('admin.guestPath', '访客路径') }}</p>
                <p class="mt-0.5 truncate font-mono" style="color: var(--text-color)">{{ state.detailUser.settings.guestPath || '/' }}</p>
              </div>
              <div v-if="state.detailUser.storage" class="rounded bg-gray-50 p-2 dark:bg-dark-hover">
                <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('common.quota', '配额') }}</p>
                <p class="mt-0.5" style="color: var(--text-color)">
                  {{ formatBytes(state.detailUser.storage.used) }} / {{ formatBytes(state.detailUser.storage.quota) }}
                </p>
              </div>
            </div>

            <div>
              <p class="mb-2 text-sm font-medium" style="color: var(--text-color)">{{ t('admin.stats', '数据统计') }}</p>
              <div class="grid grid-cols-4 gap-2">
                <div class="rounded bg-gray-50 p-2 text-center dark:bg-dark-hover">
                  <p class="text-lg font-bold text-blue-500">{{ state.detailUser.stats.trashCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.trash', '回收站') }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 text-center dark:bg-dark-hover">
                  <p class="text-lg font-bold text-yellow-500">{{ state.detailUser.stats.favCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.favourites', '我的收藏') }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 text-center dark:bg-dark-hover">
                  <p class="text-lg font-bold text-green-500">{{ state.detailUser.stats.shareCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.myShares', '我的分享') }}</p>
                </div>
                <div class="rounded bg-gray-50 p-2 text-center dark:bg-dark-hover">
                  <p class="text-lg font-bold text-purple-500">{{ state.detailUser.stats.apiKeyCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">{{ t('nav.apiKeys', 'API Keys') }}</p>
                </div>
              </div>
            </div>

            <div>
              <p class="mb-2 text-sm font-medium" style="color: var(--text-color)">
                {{ t('admin.storagePools', '存储池') }}（{{ state.detailUser.pools.length }}）
              </p>
              <div v-if="state.detailUser.pools.length === 0" class="py-2 text-sm text-gray-400">
                {{ t('admin.noStoragePools', '暂无存储池') }}
              </div>
              <div v-else class="space-y-2">
                <div
                  v-for="pool in state.detailUser.pools"
                  :key="pool.id"
                  class="flex items-center gap-3 rounded bg-gray-50 p-2 dark:bg-dark-hover"
                >
                  <Icon :name="pool.storageType === 'local' ? 'hard-drive' : 'cloud'" class="h-5 w-5 text-blue-500" />
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium" style="color: var(--text-color)">{{ pool.name }}</p>
                    <p class="text-xs text-gray-500 dark:text-dark-text-secondary">
                      {{ pool.storageType === 'local' ? t('admin.localStorage', '本地存储') : t('admin.remoteStorage', '云端存储') }}
                      <span v-if="pool.isDefault" class="ml-1 text-blue-500">{{ t('common.default', '默认') }}</span>
                    </p>
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
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="mb-1 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.resetPassword', '重置密码') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('admin.setNewPasswordFor', '为 {username} 设置新密码').replace('{username}', state.resetPwdUser?.username || '') }}
          </p>
          <div>
            <input
              v-model="state.resetPwdForm.password"
              type="password"
              :placeholder="t('admin.newPasswordPlaceholder', '新密码，至少 6 位')"
              class="input-field"
            />
            <p v-if="state.resetPwdError" class="mt-1 text-sm text-red-500">{{ state.resetPwdError }}</p>
          </div>
          <div class="mt-5 flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showResetPwdDialog = false">{{ t('common.cancel', '取消') }}</button>
            <button class="btn-primary text-sm" @click="state.handleResetPwd">{{ t('admin.resetPassword', '重置密码') }}</button>
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

    <Teleport to="body">
      <div v-if="state.quotaDialog.show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.quotaDialog.show = false" />
        <div class="relative card max-h-[90vh] w-full max-w-sm overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.editQuota', '调整存储配额') }}</h3>
          <p class="mb-4 text-sm" style="color: var(--text-secondary-color)">
            {{ t('common.user', '用户') }}：
            <span class="font-medium" style="color: var(--text-color)">{{ state.quotaDialog.username }}</span>
          </p>
          <div class="mb-4">
            <label class="mb-1.5 block text-sm font-medium" style="color: var(--text-color)">{{ t('admin.quotaMb', '配额（MB）') }}</label>
            <input v-model.number="state.quotaDialog.quotaMB" type="number" min="0" class="input-field" placeholder="10240" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">
              {{ t('admin.currentQuota', '当前配额') }}：
              {{ state.quotaDialog.quotaMB }} MB ({{ formatBytes(state.quotaDialog.quotaMB * 1024 * 1024) }})
            </p>
          </div>
          <div class="flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.quotaDialog.show = false">{{ t('common.cancel', '取消') }}</button>
            <button class="btn-primary text-sm" @click="state.saveQuota">{{ t('common.save', '保存') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showUploadLimitDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showUploadLimitDialog = false" />
        <div class="relative card max-h-[90vh] w-full max-w-sm overflow-y-auto" style="padding: 1.5rem">
          <h3 class="mb-4 text-lg font-semibold" style="color: var(--text-color)">{{ t('admin.editUploadLimit', '修改系统设置') }}</h3>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.uploadLimitMb', '单文件上传大小限制（MB）') }}</label>
            <input v-model="state.newUploadLimit" type="number" min="1" max="10240" class="input-field" placeholder="100" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('admin.uploadLimitHint', '请输入 1 到 10240 之间的整数') }}</p>
          </div>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.maxConcurrentUploads', '最大同时上传文件数') }}</label>
            <input v-model="state.newMaxConcurrentUploads" type="number" min="1" max="16" class="input-field" placeholder="3" />
            <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('admin.maxConcurrentUploadsHint', '请输入 1 到 16 之间的整数') }}</p>
          </div>

          <div class="mb-4">
            <label class="mb-1 block text-sm" style="color: var(--text-secondary-color)">{{ t('admin.language', '默认语言') }}</label>
            <select v-model="state.newLanguage" class="input-field">
              <option value="zh-CN">{{ t('language.zh-CN', '简体中文') }}</option>
              <option value="en-US">{{ t('language.en-US', 'English') }}</option>
            </select>
          </div>

          <div class="flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showUploadLimitDialog = false">{{ t('common.cancel', '取消') }}</button>
            <button class="btn-primary text-sm" @click="state.saveUploadLimit">{{ t('common.save', '保存') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
