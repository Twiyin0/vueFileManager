<script setup lang="ts">
import { ref } from 'vue'
import { api } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import Icon from '@/components/Icon.vue'
import { useKeepAliveRefresh } from '@/composables/useKeepAliveRefresh'
import { useI18n } from '@/composables/useI18n'

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

const { t } = useI18n()
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

useKeepAliveRefresh(fetchShares)

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
  const url = type === 'sign' && signUrl ? `${origin}${signUrl}` : `${origin}/s/${code}`
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = url
    textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
  copiedId.value = id
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

function isExpired(share: Share): boolean {
  return share.expires_at ? new Date(share.expires_at) < new Date() : false
}

function isMaxedOut(share: Share): boolean {
  return share.max_downloads ? share.download_count >= share.max_downloads : false
}
</script>

<template>
  <div class="px-4 pt-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <div v-else-if="shares.length === 0" class="card flex flex-col items-center justify-center py-16 text-gray-400 dark:text-dark-text-secondary">
      <Icon name="link" class="mb-3 h-16 w-16" />
      <p>{{ t('myShares.emptyTitle', 'No share links yet') }}</p>
      <p class="mt-1 text-sm">{{ t('myShares.emptyDescription', 'Right-click a file in the file list to create a share') }}</p>
    </div>

    <div v-else class="space-y-3">
      <div v-for="share in shares" :key="share.id" class="card">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-center gap-2">
              <h3 class="truncate font-medium text-light-text dark:text-dark-text">
                {{ share.file_path.split('/').pop() }}
              </h3>
              <span
                v-if="isExpired(share)"
                class="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                {{ t('myShares.expired', 'Expired') }}
              </span>
              <span
                v-else-if="isMaxedOut(share)"
                class="rounded bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
              >
                {{ t('myShares.maxedOut', 'Limit Reached') }}
              </span>
              <span
                v-else
                class="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                {{ t('myShares.active', 'Active') }}
              </span>
            </div>

            <p class="mb-1 font-mono text-xs text-gray-500 dark:text-dark-text-secondary">{{ origin }}{{ share.signUrl }}</p>
            <p class="mb-2 text-xs text-gray-400 dark:text-dark-text-secondary">signKey: {{ share.sign_key }}</p>

            <div class="flex items-center gap-4 text-xs text-gray-500 dark:text-dark-text-secondary">
              <span>
                {{ t('myShares.downloadCount', 'Downloads: {count}').replace('{count}', `${share.download_count}${share.max_downloads ? `/${share.max_downloads}` : ''}`) }}
              </span>
              <span v-if="share.password" class="flex items-center gap-0.5">
                <Icon name="lock" class="h-3 w-3" />
                {{ t('myShares.hasPassword', 'Password Protected') }}
              </span>
              <span v-if="share.expires_at">{{ t('myShares.expireAt', 'Expires: {time}').replace('{time}', formatDate(share.expires_at)) }}</span>
              <span>{{ t('myShares.createdAt', 'Created: {time}').replace('{time}', formatDate(share.created_at)) }}</span>
            </div>
          </div>

          <div class="flex items-center gap-1">
            <button
              class="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
              :title="t('share.copySignedLink', 'Copy Signed Link')"
              @click="copyLink(share.share_code, share.id, 'sign', share.signUrl)"
            >
              <Icon v-if="copiedId === share.id && copyType === 'sign'" name="check" class="h-4 w-4 text-green-500" />
              <Icon v-else name="key" class="h-4 w-4 text-gray-500 dark:text-dark-text-secondary" />
            </button>
            <button
              class="rounded-lg p-2 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              :title="t('myShares.deleteTitle', 'Delete Share')"
              @click="confirmDelete(share)"
            >
              <Icon name="trash" class="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :show="showDeleteConfirm"
    :title="t('myShares.deleteTitle', 'Delete Share')"
    :message="t('myShares.deleteMessage', 'Delete the share link for {name}?').replace('{name}', shareToDelete?.file_path.split('/').pop() || '')"
    :confirm-text="t('common.delete', 'Delete')"
    :danger="true"
    @confirm="handleDelete"
    @cancel="showDeleteConfirm = false"
  />
</template>
