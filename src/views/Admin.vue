<script setup lang="ts">
import { reactive } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import AdminIpListSection from '@/components/admin/AdminIpListSection.vue'
import AdminSystemSection from '@/components/admin/AdminSystemSection.vue'
import AdminUsersSection from '@/components/admin/AdminUsersSection.vue'
import { formatBytes, formatDate, useAdminPage } from '@/composables/useAdminPage'

const state = reactive(useAdminPage())
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
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showAddIpDialog = false"/>
        <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">添加 IP {{ state.ipListMode === 'whitelist' ? '白名单' : '黑名单' }}</h3>
          <div class="space-y-3">
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">IP 地址或 CIDR 网段</label>
              <input v-model="state.ipForm.ip_pattern" type="text" placeholder="如 192.168.1.1 或 192.168.1.0/24" class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">封禁原因（可选）</label>
              <input v-model="state.ipForm.reason" type="text" placeholder="如：恶意扫描" class="input-field" />
            </div>
            <p v-if="state.ipError" class="text-sm text-red-500">{{ state.ipError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button class="btn-secondary text-sm" @click="state.showAddIpDialog = false">取消</button>
            <button class="btn-primary text-sm" @click="state.handleAddIp">添加</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showCreateDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showCreateDialog = false"/>
        <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">创建用户</h3>
          <div class="space-y-3">
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">用户名</label>
              <input v-model="state.createForm.username" type="text" placeholder="3-20 个字符" class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">密码</label>
              <input v-model="state.createForm.password" type="password" placeholder="至少 6 位" class="input-field" />
            </div>
            <div>
              <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">角色</label>
              <select v-model="state.createForm.role" class="input-field">
                <option value="user">普通用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
            <p v-if="state.createError" class="text-sm text-red-500">{{ state.createError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button class="btn-secondary text-sm" @click="state.showCreateDialog = false">取消</button>
            <button class="btn-primary text-sm" :disabled="state.creating" @click="state.handleCreate">
              {{ state.creating ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showDetailDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showDetailDialog = false"/>
        <div class="relative card w-full max-w-lg max-h-[80vh] overflow-y-auto" style="padding: 1.5rem">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">用户详情</h3>
            <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-dark-hover" @click="state.showDetailDialog = false">
              <Icon name="xmark" class="w-5 h-5" style="color: var(--text-secondary-color)" />
            </button>
          </div>

          <div v-if="state.detailLoading" class="flex justify-center py-8">
            <svg class="animate-spin h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>

          <div v-else-if="state.detailUser" class="space-y-4">
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg font-bold" :class="state.detailUser.banned ? 'bg-red-400' : state.detailUser.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'">
                {{ state.detailUser.username[0].toUpperCase() }}
              </div>
              <div>
                <p class="font-semibold text-lg" style="color: var(--text-color)">{{ state.detailUser.username }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="px-2 py-0.5 rounded text-xs font-medium" :class="state.detailUser.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-700 dark:bg-dark-surface dark:text-dark-text-secondary'">
                    {{ state.detailUser.role === 'admin' ? '管理员' : '用户' }}
                  </span>
                  <span v-if="state.detailUser.banned" class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">已封禁</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">注册 IP</p>
                <p class="font-mono mt-0.5" style="color: var(--text-color)">{{ state.detailUser.registerIp || '-' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">最后登录 IP</p>
                <p class="font-mono mt-0.5" style="color: var(--text-color)">{{ state.detailUser.lastLoginIp || '-' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">注册时间</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.createdAt) }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">上次登录时间</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ formatDate(state.detailUser.lastLoginAt) }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">主题</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ { light: '浅色', dark: '深色', system: '跟随系统' }[state.detailUser.settings.theme] || state.detailUser.settings.theme }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">访客模式</p>
                <p class="mt-0.5" style="color: var(--text-color)">{{ state.detailUser.settings.guestEnabled ? '已开启' : '未开启' }}</p>
              </div>
              <div class="p-2 rounded bg-gray-50 dark:bg-dark-hover">
                <p class="text-gray-500 dark:text-dark-text-secondary text-xs">访客路径</p>
                <p class="mt-0.5 font-mono truncate" style="color: var(--text-color)">{{ state.detailUser.settings.guestPath || '/' }}</p>
              </div>
            </div>

            <div>
              <p class="text-sm font-medium mb-2" style="color: var(--text-color)">数据统计</p>
              <div class="grid grid-cols-4 gap-2">
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-blue-500">{{ state.detailUser.stats.trashCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">回收站</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-yellow-500">{{ state.detailUser.stats.favCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">收藏</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-green-500">{{ state.detailUser.stats.shareCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">分享</p>
                </div>
                <div class="text-center p-2 rounded bg-gray-50 dark:bg-dark-hover">
                  <p class="text-lg font-bold text-purple-500">{{ state.detailUser.stats.apiKeyCount }}</p>
                  <p class="text-xs text-gray-500 dark:text-dark-text-secondary">API Key</p>
                </div>
              </div>
            </div>

            <div>
              <p class="text-sm font-medium mb-2" style="color: var(--text-color)">存储池 ({{ state.detailUser.pools.length }})</p>
              <div v-if="state.detailUser.pools.length === 0" class="text-sm text-gray-400 py-2">暂无存储池</div>
              <div v-else class="space-y-2">
                <div v-for="pool in state.detailUser.pools" :key="pool.id" class="flex items-center gap-3 p-2 rounded bg-gray-50 dark:bg-dark-hover">
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

    <Teleport to="body">
      <div v-if="state.showResetPwdDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showResetPwdDialog = false"/>
        <div class="relative card w-full max-w-sm" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-1" style="color: var(--text-color)">重置密码</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">为「{{ state.resetPwdUser?.username }}」设置新密码</p>
          <div>
            <input v-model="state.resetPwdForm.password" type="password" placeholder="新密码（至少 6 位）" class="input-field" />
            <p v-if="state.resetPwdError" class="text-sm text-red-500 mt-1">{{ state.resetPwdError }}</p>
          </div>
          <div class="flex justify-end gap-3 mt-5">
            <button class="btn-secondary text-sm" @click="state.showResetPwdDialog = false">取消</button>
            <button class="btn-primary text-sm" @click="state.handleResetPwd">重置</button>
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
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.quotaDialog.show = false"/>
        <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">调整存储配额</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">用户：<span class="font-medium" style="color: var(--text-color)">{{ state.quotaDialog.username }}</span></p>
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">配额 (MB)</label>
            <input v-model.number="state.quotaDialog.quotaMB" type="number" class="input-field" min="0" placeholder="10240" />
            <p class="text-xs mt-1" style="color: var(--text-secondary-color)">当前：{{ state.quotaDialog.quotaMB }} MB ({{ formatBytes(state.quotaDialog.quotaMB * 1024 * 1024) }})</p>
          </div>
          <div class="flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.quotaDialog.show = false">取消</button>
            <button class="btn-primary text-sm" @click="state.saveQuota">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="state.showUploadLimitDialog" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="state.showUploadLimitDialog = false"/>
        <div class="relative card w-full max-w-sm max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
          <h3 class="text-lg font-semibold mb-4" style="color: var(--text-color)">修改上传限制</h3>
          <div class="mb-4">
            <label class="text-sm mb-1 block" style="color: var(--text-secondary-color)">单文件大小限制（MB）</label>
            <input v-model="state.newUploadLimit" type="number" min="1" max="10240" class="input-field" placeholder="100" />
            <p class="text-xs mt-1" style="color: var(--text-secondary-color)">范围：1 - 10240 MB</p>
          </div>
          <div class="flex justify-end gap-3">
            <button class="btn-secondary text-sm" @click="state.showUploadLimitDialog = false">取消</button>
            <button class="btn-primary text-sm" @click="state.saveUploadLimit">保存</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
