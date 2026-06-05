<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FilePreview from '@/components/FilePreview.vue'
import Icon from '@/components/Icon.vue'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareInfo = ref<any>(null)
const showPreview = ref(false)

const shareCode = route.params.code as string
const sign = route.query.sign as string
const timestamp = route.query.t as string

async function fetchShare(providedPassword?: string) {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams()
    if (providedPassword) params.set('password', providedPassword)
    const url = `/share/s/${shareCode}${params.toString() ? '?' + params.toString() : ''}`
    const res = await api.get<any>(url)

    if (res.needPassword) {
      needPassword.value = true
      shareInfo.value = res
    } else {
      needPassword.value = false
      shareInfo.value = res
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => fetchShare())

function submitPassword() {
  fetchShare(password.value)
}

function handleDownload() {
  const params = new URLSearchParams()
  if (password.value) params.set('password', password.value)
  if (sign) params.set('sign', sign)
  if (timestamp) params.set('t', timestamp)
  const url = `/api/share/download/${shareCode}?${params.toString()}`
  window.open(url, '_blank')
}

const previewUrl = computed(() => {
  const params = new URLSearchParams()
  if (password.value) params.set('password', password.value)
  if (sign) params.set('sign', sign)
  if (timestamp) params.set('t', timestamp)
  return `/api/share/preview/${shareCode}?${params.toString()}`
})
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--surface-color)">
      <router-link to="/" class="flex items-center gap-2 font-bold text-lg">
        <Icon name="folder" class="w-6 h-6 text-blue-500" />
        <span class="dark:text-dark-text text-light-text">VueFileManager</span>
      </router-link>
      <ThemeToggle />
    </header>

    <!-- 内容 -->
    <main class="flex-1 flex items-center justify-center p-4">
      <!-- 加载中 -->
      <div v-if="loading" class="flex items-center justify-center">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <!-- 错误 -->
      <div v-else-if="error" class="card max-w-md w-full p-8 text-center">
        <Icon name="exclamation" class="w-16 h-16 mx-auto mb-4 text-red-400" />
        <h2 class="text-xl font-semibold mb-2 dark:text-dark-text text-light-text">访问失败</h2>
        <p class="text-gray-500 dark:text-dark-text-secondary">{{ error }}</p>
        <router-link to="/" class="btn-primary mt-6 inline-block text-sm">返回首页</router-link>
      </div>

      <!-- 需要密码 -->
      <div v-else-if="needPassword" class="card max-w-md w-full p-8">
        <div class="text-center mb-6">
          <Icon name="lock" class="w-16 h-16 mx-auto mb-4 text-blue-400" />
          <h2 class="text-xl font-semibold mb-2 dark:text-dark-text text-light-text">需要密码</h2>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">
            此分享链接需要密码才能访问
          </p>
          <p v-if="shareInfo?.owner" class="text-xs text-gray-400 dark:text-dark-text-secondary mt-1">
            分享者：{{ shareInfo.owner }}
          </p>
        </div>
        <form @submit.prevent="submitPassword" class="space-y-4">
          <input
            v-model="password"
            type="password"
            class="input-field"
            placeholder="请输入访问密码"
            autofocus
          />
          <button type="submit" class="btn-primary w-full" :disabled="loading || !password">
            {{ loading ? '验证中...' : '验证' }}
          </button>
        </form>
      </div>

      <!-- 文件信息 -->
      <div v-else-if="shareInfo" class="card max-w-lg w-full p-8">
        <div class="text-center mb-6">
          <!-- 文件图标 -->
          <Icon name="file-alt" class="w-16 h-16 mx-auto mb-4 text-blue-400" />
          <h2 class="text-xl font-semibold mb-2 dark:text-dark-text text-light-text">
            {{ shareInfo.fileName }}
          </h2>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">
            分享者：{{ shareInfo.owner }}
          </p>
        </div>

        <!-- 无签名参数警告 -->
        <div v-if="!sign" class="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400 text-sm">
          此分享链接需要签名参数才能下载，请使用带签名的完整链接访问。
        </div>

        <div class="flex flex-col gap-3">
          <button @click="handleDownload" class="btn-primary w-full flex items-center justify-center gap-2" :disabled="!sign">
            <Icon name="download" class="w-5 h-5" />
            下载文件
          </button>
          <button
            v-if="sign"
            @click="showPreview = true"
            class="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Icon name="eye" class="w-5 h-5" />
            预览文件
          </button>
        </div>
      </div>
    </main>

    <!-- 预览 -->
    <FilePreview
      v-if="shareInfo && sign"
      :show="showPreview"
      :file-path="previewUrl"
      :file-name="shareInfo.fileName"
      @close="showPreview = false"
    />

  </div>
</template>
