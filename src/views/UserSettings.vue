<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore, ThemeMode } from '@/stores/theme'
import Layout from '@/components/Layout.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const origin = window.location.origin

const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

// 设置表单
const form = ref({
  guestEnabled: false,
  theme: 'system' as ThemeMode
})

// 访客分享列表
const guestShares = ref<any[]>([])
const loadingShares = ref(false)
const showShares = ref(true)
const deleteConfirm = ref({ show: false, share: null as any })

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.get<{ settings: any }>('/user/settings')
    form.value = {
      guestEnabled: res.settings.guestEnabled || false,
      theme: (res.settings.theme as ThemeMode) || 'system'
    }
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    loading.value = false
  }
  loadGuestShares()
})

function showMsg(text: string, type: 'success' | 'error') {
  message.value = text
  messageType.value = type
  setTimeout(() => { message.value = '' }, 3000)
}

async function saveSettings() {
  saving.value = true
  try {
    await api.put('/user/settings', {
      guestEnabled: form.value.guestEnabled,
      theme: form.value.theme
    })
    themeStore.setTheme(form.value.theme)
    if (authStore.user?.settings) {
      authStore.user.settings.theme = form.value.theme
      authStore.user.settings.guestEnabled = form.value.guestEnabled
    }
    showMsg('设置已保存', 'success')
  } catch (err: any) {
    showMsg(err.message, 'error')
  } finally {
    saving.value = false
  }
}

async function loadGuestShares() {
  loadingShares.value = true
  try {
    const res = await api.get<{ shares: any[] }>('/user/guest-shares')
    guestShares.value = res.shares
  } catch {} finally {
    loadingShares.value = false
  }
}

function confirmDeleteShare(share: any) {
  deleteConfirm.value = { show: true, share }
}

async function handleDeleteShare() {
  if (!deleteConfirm.value.share) return
  try {
    await api.delete(`/user/guest-shares/${deleteConfirm.value.share.id}`)
    showMsg('已取消访客分享', 'success')
    await loadGuestShares()
  } catch (err: any) {
    showMsg(err.message, 'error')
  }
  deleteConfirm.value = { show: false, share: null }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN') + ' ' + new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Layout>
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold mb-6 dark:text-dark-text text-light-text">设置</h1>

      <!-- 提示消息 -->
      <div v-if="message" class="mb-4 p-3 rounded-lg text-sm"
        :class="messageType === 'success'
          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
          : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'"
      >
        {{ message }}
      </div>

      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <form v-else @submit.prevent="saveSettings" class="space-y-6">
        <!-- 主题设置 -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4 dark:text-dark-text text-light-text">主题设置</h2>
          <div class="flex gap-3">
            <label
              v-for="option in [
                { value: 'light', label: '亮色', icon: '☀️' },
                { value: 'dark', label: '暗色', icon: '🌙' },
                { value: 'system', label: '跟随系统', icon: '💻' }
              ]"
              :key="option.value"
              class="flex-1 cursor-pointer"
            >
              <input
                v-model="form.theme"
                type="radio"
                :value="option.value"
                class="hidden peer"
              />
              <div class="p-3 rounded-lg border-2 text-center transition-all peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 dark:border-dark-border border-light-border hover:border-blue-300 dark:hover:border-blue-600">
                <span class="text-2xl">{{ option.icon }}</span>
                <p class="text-sm mt-1 dark:text-dark-text text-light-text">{{ option.label }}</p>
              </div>
            </label>
          </div>
        </div>

        <!-- 存储池管理入口 -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4 dark:text-dark-text text-light-text">存储管理</h2>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary mb-4">
            在存储池管理页面中，您可以添加、编辑和删除多个存储池，支持本地存储和又拍云。
          </p>
          <router-link to="/storage-pools" class="btn-primary inline-flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
            </svg>
            管理存储池
          </router-link>
        </div>

        <!-- 访客模式 -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4 dark:text-dark-text text-light-text">访客模式</h2>

          <!-- 全局开关 -->
          <div class="flex items-center gap-3 mb-4">
            <label class="relative inline-flex items-center cursor-pointer">
              <input v-model="form.guestEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-11 h-6 bg-gray-200 dark:bg-dark-border rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
            <span class="text-sm dark:text-dark-text text-light-text">启用访客模式</span>
          </div>

          <div v-if="form.guestEnabled">
            <!-- 访客链接 -->
            <div class="p-3 rounded-lg mb-4" style="background-color: var(--hover-color)">
              <p class="text-xs mb-1" style="color: var(--text-secondary-color)">访客链接</p>
              <p class="font-mono text-sm" style="color: var(--accent-color)">{{ origin }}/guest/{{ authStore.user?.username }}</p>
            </div>

            <!-- 分享文件夹列表 -->
            <div class="border rounded-lg overflow-hidden" style="border-color: var(--border-color)">
              <button
                type="button"
                @click="showShares = !showShares"
                class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-gray-50 dark:hover:bg-dark-hover"
                style="color: var(--text-color)"
              >
                <span>分享文件夹 ({{ guestShares.length }})</span>
                <svg class="w-4 h-4 transition-transform duration-200" :class="showShares ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              <div v-show="showShares">
                <!-- 加载中 -->
                <div v-if="loadingShares" class="flex items-center justify-center py-6">
                  <svg class="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>

                <!-- 空状态 -->
                <div v-else-if="guestShares.length === 0" class="px-4 py-6 text-center text-sm" style="color: var(--text-secondary-color)">
                  暂无分享文件夹，在文件列表中右键文件夹即可分享
                </div>

                <!-- 列表 -->
                <div v-else class="divide-y" style="border-color: var(--border-color)">
                  <div
                    v-for="share in guestShares"
                    :key="share.id"
                    class="flex items-center justify-between px-4 py-3"
                  >
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate" style="color: var(--text-color)">{{ share.label || share.folder_path }}</p>
                      <p class="text-xs mt-0.5" style="color: var(--text-secondary-color)">
                        <span class="font-mono">{{ share.folder_path }}</span>
                        <span class="mx-1">·</span>
                        {{ share.pool_name }}
                        <span class="mx-1">·</span>
                        {{ formatDate(share.created_at) }}
                      </p>
                    </div>
                    <button
                      type="button"
                      @click="confirmDeleteShare(share)"
                      class="ml-3 p-1.5 rounded-md transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="取消分享"
                    >
                      <svg class="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 用户信息 -->
        <div class="card">
          <h2 class="text-lg font-semibold mb-4 dark:text-dark-text text-light-text">用户信息</h2>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-dark-text-secondary">用户名</span>
              <span class="dark:text-dark-text text-light-text">{{ authStore.user?.username }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-dark-text-secondary">角色</span>
              <span class="dark:text-dark-text text-light-text">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-dark-text-secondary">注册 IP</span>
              <span class="dark:text-dark-text text-light-text font-mono">{{ authStore.user?.registerIp }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500 dark:text-dark-text-secondary">最后登录 IP</span>
              <span class="dark:text-dark-text text-light-text font-mono">{{ authStore.user?.lastLoginIp }}</span>
            </div>
          </div>
        </div>

        <!-- 保存按钮 -->
        <div class="flex justify-end">
          <button type="submit" class="btn-primary px-8" :disabled="saving">
            <span v-if="saving" class="flex items-center gap-2">
              <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              保存中...
            </span>
            <span v-else>保存设置</span>
          </button>
        </div>
      </form>
    </div>

    <!-- 删除确认 -->
    <ConfirmDialog
      :show="deleteConfirm.show"
      title="取消访客分享"
      :message="`确定要取消「${deleteConfirm.share?.label || deleteConfirm.share?.folder_path}」的访客分享吗？`"
      confirm-text="取消分享"
      :danger="true"
      @confirm="handleDeleteShare"
      @cancel="deleteConfirm = { show: false, share: null }"
    />
  </Layout>
</template>
