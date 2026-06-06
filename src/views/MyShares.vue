<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'

interface Share {
  id: number
  file_path: string
  file_type: string
  share_code: string
  password: string | null
  expires_at: string | null
  download_count: number
  max_downloads: number | null
  created_at: string
  sign_key: string
  signUrl: string
}

const shares = ref<Share[]>([])
const loading = ref(true)
const showDeleteConfirm = ref(false)
const shareToDelete = ref<Share | null>(null)
const copiedId = ref<number | null>(null)
const copyType = ref<'link' | 'sign'>('link')

const origin = window.location.origin

async function fetchShares() {
  loading.value = true
  try {
    const res = await api.get<{ shares: Share[] }>('/share/list')
    shares.value = res.shares
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

onMounted(fetchShares)

function confirmDelete(share: Share) {
  shareToDelete.value = share
  showDeleteConfirm.value = true
}

async function handleDelete() {
  if (!shareToDelete.value) return
  try {
    await api.delete(`/share/${shareToDelete.value.id}`)
    await fetchShares()
  } catch (err: any) {
    alert(err.message)
  }
  showDeleteConfirm.value = false
  shareToDelete.value = null
}

async function copyLink(code: string, id: number, type: 'link' | 'sign', signUrl?: string) {
  copyType.value = type
  const url = type === 'sign' && signUrl
    ? `${origin}${signUrl}`
    : `${origin}/s/${code}`
  await navigator.clipboard.writeText(url)
  copiedId.value = id
  setTimeout(() => { copiedId.value = null }, 2000)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function isExpired(share: Share): boolean {
  return share.expires_at ? new Date(share.expires_at) < new Date() : false
}

function isMaxedOut(share: Share): boolean {
  return share.max_downloads ? share.download_count >= share.max_downloads : false
}
</script>

<template>
  <Layout>
    <div class="px-4 pt-4">
      <!-- 加载状态 -->
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 空状态 -->
      <div v-else-if="shares.length === 0" class="card flex flex-col items-center justify-center py-16 text-gray-400 dark:text-dark-text-secondary">
        <Icon name="link" class="w-16 h-16 mb-3" />
        <p>暂无分享链接</p>
        <p class="text-sm mt-1">在文件列表中右键点击文件即可创建分享</p>
      </div>

      <!-- 分享列表 -->
      <div v-else class="space-y-3">
        <div v-for="share in shares" :key="share.id" class="card">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-medium dark:text-dark-text text-light-text truncate">
                  {{ share.file_path.split('/').pop() }}
                </h3>
                <span
                  v-if="isExpired(share)"
                  class="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                >
                  已过期
                </span>
                <span
                  v-else-if="isMaxedOut(share)"
                  class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                >
                  已达上限
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  有效
                </span>
              </div>

              <!-- 签名链接 -->
              <p class="text-xs font-mono text-gray-500 dark:text-dark-text-secondary mb-1">
                {{ origin }}{{ share.signUrl }}
              </p>

              <!-- 签名密钥 -->
              <p class="text-xs text-gray-400 dark:text-dark-text-secondary mb-2">
                signKey: {{ share.sign_key }}
              </p>

              <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-dark-text-secondary">
                <span>下载次数：{{ share.download_count }}{{ share.max_downloads ? `/${share.max_downloads}` : '' }}</span>
                <span v-if="share.password">🔒 有密码</span>
                <span v-if="share.expires_at">过期：{{ formatDate(share.expires_at) }}</span>
                <span>创建：{{ formatDate(share.created_at) }}</span>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="copyLink(share.share_code, share.id, 'sign', share.signUrl)"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                title="复制签名链接"
              >
                <Icon v-if="copiedId === share.id && copyType === 'sign'" name="check" class="w-4 h-4 text-green-500" />
                <Icon v-else name="key" class="w-4 h-4 text-gray-500 dark:text-dark-text-secondary" />
              </button>
              <button
                @click="confirmDelete(share)"
                class="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="删除分享"
              >
                <Icon name="trash" class="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="showDeleteConfirm"
      title="删除分享"
      :message="`确定要删除「${shareToDelete?.file_path.split('/').pop()}」的分享链接吗？`"
      confirm-text="删除"
      :danger="true"
      @confirm="handleDelete"
      @cancel="showDeleteConfirm = false"
    />
  </Layout>
</template>
