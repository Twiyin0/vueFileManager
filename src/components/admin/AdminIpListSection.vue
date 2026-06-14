<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import type { IpBlacklistEntry } from '@/composables/useAdminPage'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  entries: IpBlacklistEntry[]
  ipListMode: 'blacklist' | 'whitelist'
  formatDate: (dateStr: string) => string
}>()

defineEmits<{
  toggleMode: []
  add: []
  delete: [entry: IpBlacklistEntry]
}>()

const { t } = useI18n()
</script>

<template>
  <section class="mt-8">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-bold text-light-text dark:text-dark-text">
        <Icon name="shield" class="h-5 w-5 text-red-500" />
        IP {{ ipListMode === 'whitelist' ? t('admin.whitelist', '白名单') : t('admin.blacklist', '黑名单') }}
        <span
          class="rounded-full px-2 py-0.5 text-xs font-medium"
          :class="ipListMode === 'whitelist'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'"
        >
          {{ ipListMode === 'whitelist' ? t('admin.whitelistMode', '白名单模式') : t('admin.blacklistMode', '黑名单模式') }}
        </span>
      </h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary flex items-center gap-1.5 text-sm" @click="$emit('toggleMode')">
          <Icon :name="ipListMode === 'whitelist' ? 'ban' : 'check'" class="h-4 w-4" />
          {{ ipListMode === 'whitelist' ? t('admin.switchToBlacklist', '切换为黑名单') : t('admin.switchToWhitelist', '切换为白名单') }}
        </button>
        <button class="btn-primary flex items-center gap-1.5 text-sm" @click="$emit('add')">
          <Icon name="plus" class="h-4 w-4" />
          {{ t('admin.addIpEntry', '添加 IP 条目') }}
        </button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="entries.length === 0" class="py-8 text-center text-sm text-gray-400">
        {{ t('admin.noIpEntries', '暂无 IP 条目') }}
      </div>

      <div v-else>
        <div class="grid grid-cols-12 gap-2 border-b border-light-border px-4 py-2 text-xs font-medium text-gray-500 dark:border-dark-border dark:text-dark-text-secondary">
          <div class="col-span-4">IP / CIDR</div>
          <div class="col-span-3">{{ t('admin.reason', '原因') }}</div>
          <div class="col-span-2 hidden sm:block">{{ t('admin.createdBy', '添加人') }}</div>
          <div class="col-span-2 hidden md:block">{{ t('admin.createdAt', '添加时间') }}</div>
          <div class="col-span-1 text-right">{{ t('common.actions', '操作') }}</div>
        </div>

        <div
          v-for="entry in entries"
          :key="entry.id"
          class="grid grid-cols-12 items-center gap-2 border-b border-light-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50 dark:border-dark-border/50 dark:hover:bg-dark-hover"
        >
          <div class="col-span-4 truncate font-mono text-sm text-light-text dark:text-dark-text">{{ entry.ip_pattern }}</div>
          <div class="col-span-3 truncate text-sm text-gray-500 dark:text-dark-text-secondary">{{ entry.reason || '-' }}</div>
          <div class="col-span-2 hidden text-sm text-gray-500 dark:text-dark-text-secondary sm:block">{{ entry.created_by_name || '-' }}</div>
          <div class="col-span-2 hidden text-xs text-gray-500 dark:text-dark-text-secondary md:block">{{ formatDate(entry.created_at) }}</div>
          <div class="col-span-1 flex justify-end">
            <button
              v-if="ipListMode === 'whitelist' && entry.ip_pattern === '127.0.0.1'"
              class="cursor-not-allowed p-1.5"
              :title="t('admin.whitelistProtected', '白名单模式下 127.0.0.1 不允许删除')"
            >
              <Icon name="lock" class="h-4 w-4 text-gray-400" />
            </button>
            <button
              v-else
              class="rounded p-1.5 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              :title="t('common.delete', '删除')"
              @click="$emit('delete', entry)"
            >
              <Icon name="trash" class="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
