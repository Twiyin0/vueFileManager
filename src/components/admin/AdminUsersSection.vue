<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import type { AdminUser } from '@/composables/useAdminPage'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  users: AdminUser[]
  loading: boolean
  stats: {
    total: number
    admins: number
    banned: number
    guests: number
  }
  formatBytes: (bytes: number) => string
  formatDate: (dateStr: string) => string
}>()

const search = defineModel<string>('search', { required: true })

defineEmits<{
  create: []
  verify: [user: AdminUser]
  quota: [user: AdminUser]
  detail: [user: AdminUser]
  role: [user: AdminUser]
  resetPassword: [user: AdminUser]
  ban: [user: AdminUser]
  delete: [user: AdminUser]
}>()

const { t } = useI18n()
</script>

<template>
  <section>
    <div class="mb-4 flex justify-end">
      <button class="btn-primary flex items-center gap-1.5 text-sm" @click="$emit('create')">
        <Icon name="plus" class="h-4 w-4" />
        {{ t('admin.createUser', '创建用户') }}
      </button>
    </div>

    <div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div class="card">
        <p class="text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('admin.totalUsers', '用户总数') }}</p>
        <p class="text-2xl font-bold text-light-text dark:text-dark-text">{{ stats.total }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('admin.adminUsers', '管理员') }}</p>
        <p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{{ stats.admins }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('admin.bannedUsers', '已封禁') }}</p>
        <p class="text-2xl font-bold text-red-500">{{ stats.banned }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-gray-500 dark:text-dark-text-secondary">{{ t('admin.guestEnabledUsers', '已开启访客') }}</p>
        <p class="text-2xl font-bold text-green-500">{{ stats.guests }}</p>
      </div>
    </div>

    <div class="mb-4 flex items-center gap-2">
      <Icon name="search" class="h-4 w-4 flex-shrink-0" style="color: var(--text-secondary-color)" />
      <input
        v-model="search"
        type="text"
        :placeholder="t('admin.userSearchPlaceholder', '搜索用户名、邮箱、角色或 IP')"
        class="input-field text-sm"
      />
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>

      <div v-else-if="users.length === 0" class="py-12 text-center text-gray-400">
        {{ search ? t('admin.noMatchedUsers', '没有匹配的用户') : t('admin.noUsers', '暂无用户') }}
      </div>

      <div v-else>
        <div
          class="flex items-center gap-3 border-b px-4 py-2 text-xs font-medium"
          style="color: var(--text-secondary-color); border-color: var(--border-color)"
        >
          <div class="w-40">{{ t('common.username', '用户名') }}</div>
          <div class="hidden w-36 sm:block">{{ t('common.email', '邮箱') }}</div>
          <div class="w-16 text-center">{{ t('common.role', '角色') }}</div>
          <div class="w-14 text-center">{{ t('common.status', '状态') }}</div>
          <div class="hidden min-w-[140px] flex-1 md:block">{{ t('admin.storageUsage', '存储用量') }}</div>
          <div class="hidden w-24 lg:block">{{ t('admin.loginIp', '登录 IP') }}</div>
          <div class="hidden w-32 xl:block">{{ t('admin.registerTime', '注册时间') }}</div>
          <div class="hidden w-32 2xl:block">{{ t('admin.lastLoginTime', '最近登录') }}</div>
          <div class="w-28 text-right">{{ t('common.actions', '操作') }}</div>
        </div>

        <div
          v-for="user in users"
          :key="user.id"
          class="flex items-center gap-3 border-b px-4 py-2.5 transition-colors"
          :class="{ 'opacity-50': user.banned }"
          style="border-color: var(--border-color)"
          @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
          @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
        >
          <div class="flex min-w-0 w-40 items-center gap-2">
            <div
              class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
              :class="user.banned ? 'bg-red-400' : user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'"
            >
              {{ user.username[0].toUpperCase() }}
            </div>
            <span class="truncate text-sm" style="color: var(--text-color)">{{ user.username }}</span>
          </div>

          <div class="hidden w-36 truncate text-xs sm:block" style="color: var(--text-secondary-color)">{{ user.email || '-' }}</div>

          <div class="w-16 text-center">
            <span
              class="rounded px-1.5 py-0.5 text-xs"
              :style="user.role === 'admin'
                ? 'background: var(--accent-soft-color); color: var(--accent-color)'
                : 'background: var(--hover-color); color: var(--text-secondary-color)'"
            >
              {{ user.role === 'admin' ? t('settings.roleAdmin', '管理员') : t('settings.roleUser', '普通用户') }}
            </span>
          </div>

          <div class="flex w-14 justify-center">
            <span
              v-if="user.banned"
              class="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400"
            >
              {{ t('admin.banUser', '封禁用户') }}
            </span>
            <template v-else>
              <span
                v-if="!user.verified"
                class="rounded bg-yellow-100 px-1.5 py-0.5 text-xs text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              >
                {{ t('admin.verifyUser', '手动验证') }}
              </span>
              <span v-else class="h-2 w-2 rounded-full bg-green-500"></span>
            </template>
          </div>

          <div class="hidden min-w-[140px] flex-1 md:block">
            <button class="group w-full text-left" :title="t('admin.editQuota', '调整存储配额')" @click="$emit('quota', user)">
              <div class="flex items-center gap-1.5">
                <div class="h-1.5 min-w-[40px] flex-1 rounded-full" style="background: var(--hover-color)">
                  <div
                    class="h-1.5 rounded-full transition-all"
                    :class="(user.storage_quota > 0 && (user.storage_used || 0) / user.storage_quota > 0.9)
                      ? 'bg-red-500'
                      : ((user.storage_used || 0) / user.storage_quota > 0.7 ? 'bg-yellow-500' : 'bg-green-500')"
                    :style="{ width: (user.storage_quota > 0 ? Math.min(Math.round((user.storage_used || 0) / user.storage_quota * 100), 100) : 0) + '%' }"
                  />
                </div>
                <span class="whitespace-nowrap text-xs group-hover:underline" style="color: var(--text-secondary-color)">
                  {{ formatBytes(user.storage_used || 0) }}/{{ formatBytes(user.storage_quota) }}
                </span>
              </div>
            </button>
          </div>

          <div class="hidden w-24 truncate font-mono text-xs lg:block" style="color: var(--text-secondary-color)">{{ user.last_login_ip || '-' }}</div>
          <div class="hidden w-32 text-xs xl:block" style="color: var(--text-secondary-color)">{{ formatDate(user.created_at) }}</div>
          <div class="hidden w-32 text-xs 2xl:block" style="color: var(--text-secondary-color)">{{ formatDate(user.last_login_at) }}</div>

          <div class="flex w-28 flex-wrap items-center justify-end gap-0.5">
            <button
              v-if="!user.verified"
              class="rounded p-1.5 transition-colors hover:bg-green-50 dark:hover:bg-green-900/20"
              :title="t('admin.verifyUser', '手动验证')"
              @click="$emit('verify', user)"
            >
              <Icon name="badge-check" class="h-4 w-4 text-green-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
              :title="`${t('common.quota', '配额')}: ${formatBytes(user.storage_quota)}`"
              @click="$emit('quota', user)"
            >
              <Icon name="database" class="h-4 w-4 text-cyan-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20"
              :title="t('admin.userDetails', '用户详情')"
              @click="$emit('detail', user)"
            >
              <Icon name="eye" class="h-4 w-4 text-blue-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors hover:bg-purple-50 dark:hover:bg-purple-900/20"
              :title="user.role === 'admin' ? t('admin.demoteToUser', '降级为普通用户') : t('admin.promoteToAdmin', '升级为管理员')"
              @click="$emit('role', user)"
            >
              <Icon :name="user.role === 'admin' ? 'arrow-down' : 'arrow-up'" class="h-4 w-4 text-purple-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
              :title="t('admin.resetPassword', '重置密码')"
              @click="$emit('resetPassword', user)"
            >
              <Icon name="key" class="h-4 w-4 text-yellow-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors"
              :class="user.banned ? 'hover:bg-green-50 dark:hover:bg-green-900/20' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'"
              :title="user.banned ? t('admin.unbanUser', '解封用户') : t('admin.banUser', '封禁用户')"
              @click="$emit('ban', user)"
            >
              <Icon v-if="user.banned" name="check" class="h-4 w-4 text-green-500" />
              <Icon v-else name="ban" class="h-4 w-4 text-orange-500" />
            </button>
            <button
              class="rounded p-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              :title="t('admin.deleteUser', '删除用户')"
              @click="$emit('delete', user)"
            >
              <Icon name="trash" class="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
