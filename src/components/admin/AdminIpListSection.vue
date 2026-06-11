<script setup lang="ts">
import Icon from '@/components/Icon.vue'
import type { IpBlacklistEntry } from '@/composables/useAdminPage'

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
</script>

<template>
  <section class="mt-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold dark:text-dark-text text-light-text flex items-center gap-2">
        <Icon name="shield" class="w-5 h-5 text-red-500" />
        IP {{ ipListMode === 'whitelist' ? '白名单' : '黑名单' }}
        <span
          class="px-2 py-0.5 text-xs font-medium rounded-full"
          :class="ipListMode === 'whitelist'
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'"
        >
          {{ ipListMode === 'whitelist' ? '白名单模式' : '黑名单模式' }}
        </span>
      </h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm flex items-center gap-1.5" @click="$emit('toggleMode')">
          <Icon :name="ipListMode === 'whitelist' ? 'ban' : 'check'" class="w-4 h-4" />
          切换为{{ ipListMode === 'whitelist' ? '黑名单' : '白名单' }}
        </button>
        <button class="btn-primary text-sm flex items-center gap-1.5" @click="$emit('add')">
          <Icon name="plus" class="w-4 h-4" />
          添加
        </button>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div v-if="entries.length === 0" class="py-8 text-center text-gray-400 text-sm">
        暂无 IP {{ ipListMode === 'whitelist' ? '白名单' : '黑名单' }}条目
      </div>

      <div v-else>
        <div class="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-dark-text-secondary border-b dark:border-dark-border border-light-border">
          <div class="col-span-4">IP / 网段</div>
          <div class="col-span-3">原因</div>
          <div class="col-span-2 hidden sm:block">添加者</div>
          <div class="col-span-2 hidden md:block">添加时间</div>
          <div class="col-span-1 text-right">操作</div>
        </div>

        <div
          v-for="entry in entries"
          :key="entry.id"
          class="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b dark:border-dark-border/50 border-light-border/50 last:border-0 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
        >
          <div class="col-span-4 font-mono text-sm dark:text-dark-text text-light-text truncate">{{ entry.ip_pattern }}</div>
          <div class="col-span-3 text-sm text-gray-500 dark:text-dark-text-secondary truncate">{{ entry.reason || '-' }}</div>
          <div class="col-span-2 hidden sm:block text-sm text-gray-500 dark:text-dark-text-secondary">{{ entry.created_by_name || '-' }}</div>
          <div class="col-span-2 hidden md:block text-xs text-gray-500 dark:text-dark-text-secondary">{{ formatDate(entry.created_at) }}</div>
          <div class="col-span-1 flex justify-end">
            <button
              v-if="ipListMode === 'whitelist' && entry.ip_pattern === '127.0.0.1'"
              class="p-1.5 cursor-not-allowed"
              title="白名单模式下不可删除"
            >
              <Icon name="lock" class="w-4 h-4 text-gray-400" />
            </button>
            <button
              v-else
              class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="删除"
              @click="$emit('delete', entry)"
            >
              <Icon name="trash" class="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
