<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api'
import ThemeToggle from '@/components/ThemeToggle.vue'
import FilePreview from '@/components/FilePreview.vue'

const route = useRoute()

const loading = ref(true)
const error = ref('')
const needPassword = ref(false)
const password = ref('')
const shareInfo = ref<any>(null)
const showPreview = ref(false)

const shareCode = route.params.code as string

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
  const url = `/api/share/download/${shareCode}${params.toString() ? '?' + params.toString() : ''}`
  window.open(url, '_blank')
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--color-light-bg)">
    <!-- 顶部导航 -->
    <header class="h-14 flex items-center justify-between px-4 border-b dark:border-dark-border border-light-border" style="background-color: var(--color-light-surface)">
      <router-link to="/" class="flex items-center gap-2 font-bold text-lg">
        <svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
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
        <svg class="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
        </svg>
        <h2 class="text-xl font-semibold mb-2 dark:text-dark-text text-light-text">访问失败</h2>
        <p class="text-gray-500 dark:text-dark-text-secondary">{{ error }}</p>
        <router-link to="/" class="btn-primary mt-6 inline-block text-sm">返回首页</router-link>
      </div>

      <!-- 需要密码 -->
      <div v-else-if="needPassword" class="card max-w-md w-full p-8">
        <div class="text-center mb-6">
          <svg class="w-16 h-16 mx-auto mb-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
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
          <svg class="w-16 h-16 mx-auto mb-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
          <h2 class="text-xl font-semibold mb-2 dark:text-dark-text text-light-text">
            {{ shareInfo.fileName }}
          </h2>
          <p class="text-sm text-gray-500 dark:text-dark-text-secondary">
            分享者：{{ shareInfo.owner }}
          </p>
        </div>

        <div class="flex flex-col gap-3">
          <button @click="handleDownload" class="btn-primary w-full flex items-center justify-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            下载文件
          </button>
          <button
            v-if="['image', 'video', 'audio', 'pdf', 'text', 'markdown'].includes(shareInfo.fileType)"
            @click="showPreview = true"
            class="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            预览文件
          </button>
        </div>
      </div>
    </main>

    <!-- 预览 -->
    <FilePreview
      v-if="shareInfo"
      :show="showPreview"
      :file-path="`/api/share/preview/${shareCode}`"
      :file-name="shareInfo.fileName"
      @close="showPreview = false"
    />
  </div>
</template>
