<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api'
import { copyToClipboard } from '@/utils/clipboard'
import Icon from '@/components/Icon.vue'
import { useI18n } from '@/composables/useI18n'

interface StoragePoolSummary {
  id: number
  name: string
  isDefault: boolean
}

const authStore = useAuthStore()
const { t } = useI18n()
const frontendUrl = new URL(window.location.origin)
const isDev = import.meta.env.DEV
const token = computed(() => localStorage.getItem('token') || '')
const pools = ref<StoragePoolSummary[]>([])
const loading = ref(false)
const copiedText = ref('')

const backendOrigin = computed(() => {
  const url = new URL(frontendUrl.toString())
  if (import.meta.env.DEV) {
    url.port = '3000'
    if (url.hostname === 'localhost' || url.hostname === '::1') {
      url.hostname = '127.0.0.1'
    }
  }
  return url.origin
})

const baseEndpoint = computed(() => `${backendOrigin.value}/dav`)

function copyButtonLabel(defaultLabel: string, successLabel: string) {
  return copiedText.value === successLabel ? t('webdav.copied', '已复制') : defaultLabel
}

function endpointForPool(poolId?: number) {
  return poolId ? `${baseEndpoint.value}/pool/${poolId}` : baseEndpoint.value
}

function browserUrlForPool(poolId?: number) {
  const endpoint = new URL(endpointForPool(poolId))
  if (token.value) {
    endpoint.searchParams.set('token', token.value)
  }
  return endpoint.toString()
}

async function copy(text: string, successLabel: string) {
  await copyToClipboard(text)
  copiedText.value = successLabel
  window.setTimeout(() => {
    if (copiedText.value === successLabel) copiedText.value = ''
  }, 1800)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await api.get<{ pools: Array<{ id: number; name: string; isDefault: boolean }> }>('/storage-pools')
    pools.value = res.pools || []
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4 px-4 pt-4">
    <div class="card">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('webdav.title', 'WebDAV 接入') }}</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">
            {{ t('webdav.description', '这里集中展示 WebDAV 地址、认证方式和每个存储池的专属入口，方便桌面客户端和自动化脚本接入。') }}
          </p>
        </div>
        <router-link to="/apikeys" class="btn-secondary flex items-center gap-2 text-sm">
          <Icon name="key" class="h-4 w-4" />
          {{ t('webdav.manageApiKey', '管理 API Key') }}
        </router-link>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card">
        <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.recommendedTitle', '推荐连接方式') }}</h3>
        <div class="space-y-3 text-sm">
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.desktopClient', '桌面客户端') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.desktopClientDesc', '使用 /dav 或 /dav/pool/存储池ID 地址，账号密码直接填写站点登录凭据。') }}</p>
            <p v-if="isDev" class="mt-1 text-xs" style="color: var(--text-secondary-color)">
              {{ t('webdav.devHint', '开发环境请直接连接后端 3000 端口，不要使用前端 5173 端口。') }}
            </p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.browserTest', '浏览器快速测试') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.browserTestDesc', '可直接使用带 token 的 URL 验证服务可达性，适合先快速检查。') }}</p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.automation', '自动化脚本') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.automationDesc', '脚本端仍可继续使用 Bearer Token、X-API-Key 或 apiKey 查询参数。') }}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.loginInfo', '登录信息') }}</h3>
        <div class="space-y-3 text-sm">
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('common.username', '用户名') }}</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">{{ authStore.user?.username || '-' }}</code>
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                style="color: var(--text-secondary-color)"
                :disabled="!authStore.user?.username"
                @click="copy(authStore.user?.username || '', 'username')"
              >
                <Icon name="clipboard" class="h-3.5 w-3.5" />
                {{ copyButtonLabel(t('webdav.copy', '复制'), 'username') }}
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('common.password', '密码') }}</p>
            <p style="color: var(--text-color)">{{ t('webdav.passwordHint', '使用你的站点登录密码。当前页面不会回显明文密码。') }}</p>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('webdav.baseEndpoint', '基础入口') }}</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">{{ baseEndpoint }}</code>
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style="color: var(--text-secondary-color)"
                @click="copy(baseEndpoint, 'base-endpoint')"
              >
                <Icon name="clipboard" class="h-3.5 w-3.5" />
                {{ copyButtonLabel(t('webdav.copy', '复制'), 'base-endpoint') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.poolEndpoints', '存储池入口') }}</h3>
          <p class="text-sm" style="color: var(--text-secondary-color)">{{ t('webdav.poolEndpointsDesc', '为每个存储池生成专属 WebDAV 地址，避免客户端接入后还要手动切换上下文。') }}</p>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm" style="color: var(--text-secondary-color)">{{ t('webdav.loadingPools', '正在加载存储池...') }}</div>

      <div v-else-if="pools.length === 0" class="rounded-lg border px-4 py-8 text-center" style="border-color: var(--border-color)">
        <Icon name="server" class="mx-auto mb-3 h-10 w-10" style="color: var(--text-secondary-color)" />
        <p class="text-sm font-medium" style="color: var(--text-color)">{{ t('webdav.noPools', '暂无可用存储池') }}</p>
        <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.noPoolsHint', '先到存储池页面创建或检查默认存储池。') }}</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="pool in pools" :key="pool.id" class="rounded-lg border p-4" style="border-color: var(--border-color)">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-medium" style="color: var(--text-color)">{{ pool.name }}</h4>
                <span v-if="pool.isDefault" class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{{ t('common.default', '默认') }}</span>
              </div>
              <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.clientUrl', '客户端地址') }}</p>
            </div>
          </div>

          <div class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style="background: var(--hover-color)">
            <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">
              {{ endpointForPool(pool.id) }}
            </code>
            <button
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style="color: var(--text-secondary-color)"
              @click="copy(endpointForPool(pool.id), `pool-${pool.id}-client`)"
            >
              <Icon name="clipboard" class="h-3.5 w-3.5" />
              {{ copyButtonLabel(t('webdav.copy', '复制'), `pool-${pool.id}-client`) }}
            </button>
          </div>

          <div class="mt-3 min-w-0">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.browserUrl', '浏览器测试 URL') }}</p>
            <div class="flex items-center gap-2 rounded-lg px-3 py-2" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">
                {{ browserUrlForPool(pool.id) }}
              </code>
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                style="color: var(--text-secondary-color)"
                :disabled="!token"
                @click="copy(browserUrlForPool(pool.id), `pool-${pool.id}-browser`)"
              >
                <Icon name="clipboard" class="h-3.5 w-3.5" />
                {{ copyButtonLabel(t('webdav.copy', '复制'), `pool-${pool.id}-browser`) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.tipsTitle', '接入提示') }}</h3>
      <ul class="space-y-2 text-sm" style="color: var(--text-secondary-color)">
        <li>{{ t('webdav.tip1', 'Windows 资源管理器、macOS Finder、Cyberduck、RaiDrive 等客户端优先使用“客户端地址 + 用户名/密码”。') }}</li>
        <li>{{ t('webdav.tip2', '如果只想快速验证接口，优先使用“浏览器测试 URL”，它会带上当前登录 Token。') }}</li>
        <li>{{ t('webdav.tip3', '桌面客户端优先使用 /dav/pool/ID 这种地址；不带池 ID 时会落到当前默认存储池。') }}</li>
      </ul>
    </div>
  </div>
</template>
