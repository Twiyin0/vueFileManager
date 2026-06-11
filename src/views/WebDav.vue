<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api'
import { copyToClipboard } from '@/utils/clipboard'
import Icon from '@/components/Icon.vue'

interface StoragePoolSummary {
  id: number
  name: string
  isDefault: boolean
}

const authStore = useAuthStore()
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
  return copiedText.value === successLabel ? '已复制' : defaultLabel
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
  <div class="px-4 pt-4 space-y-4">
    <div class="card">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">WebDAV 接入</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">
            现在后端已经支持 WebDAV。这里把地址、认证方式和每个存储池的入口整理成统一面板，方便后续扩展更多客户端集成。
          </p>
        </div>
        <router-link to="/apikeys" class="btn-secondary text-sm flex items-center gap-2">
          <Icon name="key" class="w-4 h-4" />
          管理 API Key
        </router-link>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card">
        <h3 class="text-base font-semibold mb-3" style="color: var(--text-color)">推荐连接方式</h3>
        <div class="space-y-3 text-sm">
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="font-medium mb-1" style="color: var(--text-color)">桌面客户端</p>
            <p style="color: var(--text-secondary-color)">地址用 `{{ baseEndpoint }}` 或 `/dav/pool/存储池ID` 的专属地址，账号密码直接使用你的站点登录凭据。</p>
            <p v-if="isDev" class="mt-1 text-xs" style="color: var(--text-secondary-color)">开发环境请直接连后端 `{{ backendOrigin }}`，不要使用前端的 `5173` 端口。</p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="font-medium mb-1" style="color: var(--text-color)">浏览器快速测试</p>
            <p style="color: var(--text-secondary-color)">可直接使用带 `token` 的 URL 访问，适合先验证服务可达性；浏览器直接打开根地址不会像 Finder/Cyberduck 那样列目录。</p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="font-medium mb-1" style="color: var(--text-color)">自动化脚本</p>
            <p style="color: var(--text-secondary-color)">脚本侧仍可继续使用 `Bearer Token`、`X-API-Key` 或 `?apiKey=`，不影响现有接口调用方式。</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="text-base font-semibold mb-3" style="color: var(--text-color)">登录信息</h3>
        <div class="space-y-3 text-sm">
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">用户名</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 text-sm break-all" style="color: var(--text-color)">{{ authStore.user?.username || '-' }}</code>
              <button
                @click="copy(authStore.user?.username || '', 'username')"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                style="color: var(--text-secondary-color)"
                :disabled="!authStore.user?.username"
              >
                <Icon name="clipboard" class="w-3.5 h-3.5" />
                {{ copyButtonLabel('复制', 'username') }}
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">密码</p>
            <p style="color: var(--text-color)">使用你的站点登录密码。当前页面不会回显明文密码。</p>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">基础入口</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 text-sm break-all" style="color: var(--text-color)">{{ baseEndpoint }}</code>
              <button
                @click="copy(baseEndpoint, 'base-endpoint')"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                style="color: var(--text-secondary-color)"
              >
                <Icon name="clipboard" class="w-3.5 h-3.5" />
                {{ copyButtonLabel('复制', 'base-endpoint') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 class="text-base font-semibold" style="color: var(--text-color)">存储池入口</h3>
          <p class="text-sm" style="color: var(--text-secondary-color)">为不同存储池生成专属 WebDAV 地址，避免客户端接入后还要手动切换上下文。</p>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm" style="color: var(--text-secondary-color)">正在加载存储池...</div>

      <div v-else-if="pools.length === 0" class="rounded-lg border px-4 py-8 text-center" style="border-color: var(--border-color)">
        <Icon name="server" class="w-10 h-10 mx-auto mb-3" style="color: var(--text-secondary-color)" />
        <p class="text-sm font-medium" style="color: var(--text-color)">暂无可用存储池</p>
        <p class="text-xs mt-1" style="color: var(--text-secondary-color)">先到“存储池”页面创建或检查你的默认存储池。</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="pool in pools" :key="pool.id" class="rounded-lg border p-4" style="border-color: var(--border-color)">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h4 class="font-medium" style="color: var(--text-color)">{{ pool.name }}</h4>
                <span v-if="pool.isDefault" class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">默认</span>
              </div>
              <p class="text-xs mt-1" style="color: var(--text-secondary-color)">客户端地址</p>
            </div>
          </div>

          <div class="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style="background: var(--hover-color)">
            <code class="min-w-0 flex-1 text-sm break-all" style="color: var(--text-color)">
              {{ endpointForPool(pool.id) }}
            </code>
            <button
              @click="copy(endpointForPool(pool.id), `pool-${pool.id}-client`)"
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style="color: var(--text-secondary-color)"
            >
              <Icon name="clipboard" class="w-3.5 h-3.5" />
              {{ copyButtonLabel('复制', `pool-${pool.id}-client`) }}
            </button>
          </div>

          <div class="mt-3 min-w-0">
            <p class="text-xs mb-1" style="color: var(--text-secondary-color)">浏览器测试 URL</p>
            <div class="flex items-center gap-2 rounded-lg px-3 py-2" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 text-sm break-all" style="color: var(--text-color)">
                {{ browserUrlForPool(pool.id) }}
              </code>
              <button
                @click="copy(browserUrlForPool(pool.id), `pool-${pool.id}-browser`)"
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                style="color: var(--text-secondary-color)"
                :disabled="!token"
              >
                <Icon name="clipboard" class="w-3.5 h-3.5" />
                {{ copyButtonLabel('复制', `pool-${pool.id}-browser`) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="text-base font-semibold mb-3" style="color: var(--text-color)">接入提示</h3>
      <ul class="space-y-2 text-sm" style="color: var(--text-secondary-color)">
        <li>Windows 资源管理器、macOS Finder、Cyberduck、RaiDrive 等客户端优先使用“客户端地址 + 用户名/密码”方式。</li>
        <li>如果你只想快速验证接口，优先用“浏览器测试 URL”，它已经带上当前登录 Token。</li>
        <li>桌面客户端优先使用 `/dav/pool/ID` 这种路径式地址；不带时会落到当前默认存储池。</li>
      </ul>
    </div>
  </div>
</template>
