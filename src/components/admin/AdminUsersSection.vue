<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import type { AdminUser } from '@/composables/useAdminPage'

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
</script>

<template>
  <section>
    <div class="flex justify-end mb-4">
      <button class="btn-primary text-sm flex items-center gap-1.5" @click="$emit('create')">
        <Icon name="plus" class="w-4 h-4" />
        创建用户
      </button>
    </div>

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

    <div class="mb-4 flex items-center gap-2">
      <Icon name="search" class="w-4 h-4 flex-shrink-0" style="color: var(--text-secondary-color)" />
      <input v-model="search" type="text" placeholder="搜索用户名、IP、角色..." class="input-field text-sm" />
    </div>

    <div class="card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <div v-else-if="users.length === 0" class="py-12 text-center text-gray-400">
        {{ search ? '没有匹配的用户' : '暂无用户' }}
      </div>

      <div v-else>
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

        <div
          v-for="user in users"
          :key="user.id"
          class="flex items-center px-4 py-2.5 border-b gap-3 transition-colors"
          :class="{ 'opacity-50': user.banned }"
          style="border-color: var(--border-color)"
          @mouseenter="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', 'var(--hover-color)')"
          @mouseleave="($event.currentTarget as HTMLElement)?.style.setProperty('background-color', '')"
        >
          <div class="w-40 flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
              :class="user.banned ? 'bg-red-400' : user.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'">
              {{ user.username[0].toUpperCase() }}
            </div>
            <span class="truncate text-sm" style="color: var(--text-color)">{{ user.username }}</span>
          </div>
          <div class="w-36 hidden sm:block text-xs truncate" style="color: var(--text-secondary-color)">{{ user.email || '-' }}</div>
          <div class="w-16 text-center">
            <span class="px-1.5 py-0.5 rounded text-xs" :style="user.role === 'admin' ? 'background: var(--accent-soft-color); color: var(--accent-color)' : 'background: var(--hover-color); color: var(--text-secondary-color)'">
              {{ user.role === 'admin' ? '管理' : '用户' }}
            </span>
          </div>
          <div class="w-14 flex justify-center">
            <span v-if="user.banned" class="px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">封禁</span>
            <template v-else>
              <span v-if="!user.verified" class="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">未验证</span>
              <span v-else class="w-2 h-2 rounded-full bg-green-500"></span>
            </template>
          </div>
          <div class="flex-1 hidden md:block min-w-[140px]">
            <button class="w-full text-left group" title="点击修改配额" @click="$emit('quota', user)">
              <div class="flex items-center gap-1.5">
                <div class="flex-1 h-1.5 rounded-full min-w-[40px]" style="background: var(--hover-color)">
                  <div
                    class="h-1.5 rounded-full transition-all"
                    :class="(user.storage_quota > 0 && (user.storage_used || 0) / user.storage_quota > 0.9) ? 'bg-red-500' : ((user.storage_used || 0) / user.storage_quota > 0.7 ? 'bg-yellow-500' : 'bg-green-500')"
                    :style="{ width: (user.storage_quota > 0 ? Math.min(Math.round((user.storage_used || 0) / user.storage_quota * 100), 100) : 0) + '%' }"
                  />
                </div>
                <span class="text-xs whitespace-nowrap group-hover:underline" style="color: var(--text-secondary-color)">{{ formatBytes(user.storage_used || 0) }}/{{ formatBytes(user.storage_quota) }}</span>
              </div>
            </button>
          </div>
          <div class="w-24 hidden lg:block text-xs font-mono truncate" style="color: var(--text-secondary-color)">{{ user.last_login_ip || '-' }}</div>
          <div class="w-32 hidden xl:block text-xs" style="color: var(--text-secondary-color)">{{ formatDate(user.created_at) }}</div>
          <div class="w-32 hidden 2xl:block text-xs" style="color: var(--text-secondary-color)">{{ formatDate(user.last_login_at) }}</div>
          <div class="w-28 flex items-center justify-end gap-0.5 flex-wrap">
            <button v-if="!user.verified" class="p-1.5 rounded hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="手动验证" @click="$emit('verify', user)">
              <Icon name="badge-check" class="w-4 h-4 text-green-500" />
            </button>
            <button class="p-1.5 rounded hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors" :title="`存储配额: ${formatBytes(user.storage_quota)}`" @click="$emit('quota', user)">
              <Icon name="database" class="w-4 h-4 text-cyan-500" />
            </button>
            <button class="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="查看详情" @click="$emit('detail', user)">
              <Icon name="eye" class="w-4 h-4 text-blue-500" />
            </button>
            <button class="p-1.5 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors" :title="user.role === 'admin' ? '降级为用户' : '升级为管理员'" @click="$emit('role', user)">
              <Icon :name="user.role === 'admin' ? 'arrow-down' : 'arrow-up'" class="w-4 h-4 text-purple-500" />
            </button>
            <button class="p-1.5 rounded hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors" title="重置密码" @click="$emit('resetPassword', user)">
              <Icon name="key" class="w-4 h-4 text-yellow-500" />
            </button>
            <button class="p-1.5 rounded transition-colors" :class="user.banned ? 'hover:bg-green-50 dark:hover:bg-green-900/20' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20'" :title="user.banned ? '解封' : '封禁'" @click="$emit('ban', user)">
              <Icon v-if="user.banned" name="check" class="w-4 h-4 text-green-500" />
              <Icon v-else name="ban" class="w-4 h-4 text-orange-500" />
            </button>
            <button class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="删除用户" @click="$emit('delete', user)">
              <Icon name="trash" class="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
