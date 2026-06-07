<script setup lang="ts">
import { ref, computed } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'

const props = defineProps<{
  show: boolean
  filePath: string
  fileName: string
  poolId?: number
  fileType?: 'file' | 'folder'
}>()

const emit = defineEmits<{
  close: []
}>()

const password = ref('')
const usePassword = ref(false)
const expiresIn = ref<number | ''>('')
const maxDownloads = ref<number | ''>('')
const loading = ref(false)
const shareResult = ref<{ shareCode: string; url: string; signUrl: string; signKey: string } | null>(null)
const copied = ref(false)
const copyType = ref<'link' | 'sign'>('link')

const origin = window.location.origin

const expirationOptions = [
  { value: '', label: '永不过期' },
  { value: 1, label: '1 小时' },
  { value: 24, label: '1 天' },
  { value: 72, label: '3 天' },
  { value: 168, label: '7 天' },
  { value: 720, label: '30 天' },
]

async function createShare() {
  loading.value = true
  try {
    const res = await api.post<{ shareCode: string; url: string; signUrl: string; signKey: string }>('/share/create', {
      filePath: props.filePath,
      fileType: props.fileType || 'file',
      storagePoolId: props.poolId,
      password: usePassword.value ? password.value : undefined,
      expiresIn: expiresIn.value || undefined,
      maxDownloads: maxDownloads.value || undefined,
    })
    shareResult.value = res
  } catch (err: any) {
    alert(err.message)
  } finally {
    loading.value = false
  }
}

async function copyLink(type: 'link' | 'sign') {
  if (!shareResult.value) return
  copyType.value = type
  const url = type === 'sign'
    ? `${origin}${shareResult.value.signUrl}`
    : `${origin}${shareResult.value.url}`
  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // HTTP 环境 fallback
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.cssText = 'position:fixed;left:-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => {
    copied.value = false
    close()
  }, 800)
}

function close() {
  shareResult.value = null
  password.value = ''
  usePassword.value = false
  expiresIn.value = ''
  maxDownloads.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40 dark:bg-black/60" @click="close"/>
      <div class="relative card w-full max-w-md max-h-[90vh] overflow-y-auto" style="padding: 1.5rem">
        <!-- 分享结果 -->
        <template v-if="shareResult">
          <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">分享链接已创建</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
            文件：{{ fileName }}
          </p>

          <!-- 分享链接（需要签名才能下载） -->
          <div class="p-3 rounded-lg mb-3" style="background-color: var(--hover-color)">
            <p class="text-xs mb-1" style="color: var(--text-secondary-color)">分享链接（需签名鉴权）</p>
            <p class="font-mono text-sm break-all" style="color: var(--text-color)">
              {{ origin }}{{ shareResult.signUrl }}
            </p>
          </div>

          <!-- 签名密钥 -->
          <div class="p-3 rounded-lg mb-3" style="background-color: var(--hover-color)">
            <p class="text-xs mb-1" style="color: var(--text-secondary-color)">签名密钥（signKey）</p>
            <p class="font-mono text-sm" style="color: var(--text-color)">{{ shareResult.signKey }}</p>
            <p class="text-xs mt-1" style="color: var(--text-secondary-color)">
              用于生成临时授权签名，公式：MD5(username + signKey).slice(4,12) + timestamp
            </p>
          </div>

          <div v-if="usePassword && password" class="p-3 rounded-lg mb-3" style="background-color: var(--hover-color)">
            <p class="text-xs mb-1" style="color: var(--text-secondary-color)">访问密码</p>
            <p class="font-mono text-sm" style="color: var(--text-color)">{{ password }}</p>
          </div>

          <div class="flex justify-end gap-3">
            <button @click="copyLink('link')" class="btn-secondary text-sm flex items-center gap-1">
              <Icon v-if="copied && copyType === 'link'" name="circle-check" class="w-4 h-4" />
              <span>{{ copied && copyType === 'link' ? '已复制' : '复制链接' }}</span>
            </button>
            <button @click="copyLink('sign')" class="btn-primary text-sm flex items-center gap-1">
              <Icon v-if="copied && copyType === 'sign'" name="circle-check" class="w-4 h-4" />
              <span>{{ copied && copyType === 'sign' ? '已复制' : '复制签名链接' }}</span>
            </button>
          </div>
        </template>

        <!-- 创建表单 -->
        <template v-else>
          <h3 class="text-lg font-semibold mb-2" style="color: var(--text-color)">创建分享链接</h3>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
            文件：{{ fileName }}
          </p>

          <div class="space-y-4">
            <!-- 密码保护 -->
            <div>
              <label class="flex items-center justify-between cursor-pointer">
                <span class="text-sm" style="color: var(--text-color)">密码保护</span>
                <div class="relative inline-flex items-center">
                  <input v-model="usePassword" type="checkbox" class="sr-only peer" />
                  <div class="w-9 h-5 bg-gray-200 dark:bg-dark-border rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                </div>
              </label>
              <input
                v-if="usePassword"
                v-model="password"
                type="text"
                class="input-field mt-2"
                placeholder="设置访问密码"
              />
            </div>

            <!-- 过期时间 -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">过期时间</label>
              <select v-model="expiresIn" class="input-field">
                <option v-for="opt in expirationOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <!-- 下载次数限制 -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color: var(--text-color)">最大下载次数</label>
              <input
                v-model="maxDownloads"
                type="number"
                class="input-field [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="留空表示不限制"
                min="1"
              />
            </div>
          </div>

          <div class="flex justify-end gap-3 mt-6">
            <button @click="close" class="btn-secondary text-sm">取消</button>
            <button @click="createShare" class="btn-primary text-sm" :disabled="loading">
              <span v-if="loading">创建中...</span>
              <span v-else>创建分享</span>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
