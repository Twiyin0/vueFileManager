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
  return copiedText.value === successLabel ? t('webdav.copied', 'Copied') : defaultLabel
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
          <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('webdav.title', 'WebDAV Access') }}</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">
            {{ t('webdav.description', 'This page centralizes WebDAV URLs, authentication methods, and per-pool endpoints for desktop clients and automation.') }}
          </p>
        </div>
        <router-link to="/apikeys" class="btn-secondary flex items-center gap-2 text-sm">
          <Icon name="key" class="h-4 w-4" />
          {{ t('webdav.manageApiKey', 'Manage API Keys') }}
        </router-link>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card">
        <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.recommendedTitle', 'Recommended Access Methods') }}</h3>
        <div class="space-y-3 text-sm">
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.desktopClient', 'Desktop Clients') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.desktopClientDesc', 'Use /dav or /dav/pool/storagePoolId and sign in with your site username and password.') }}</p>
            <p v-if="isDev" class="mt-1 text-xs" style="color: var(--text-secondary-color)">
              {{ t('webdav.devHint', 'In development, connect to the backend on port 3000 directly instead of the frontend on port 5173.') }}
            </p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.browserTest', 'Browser Quick Test') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.browserTestDesc', 'Use a tokenized URL to quickly verify endpoint reachability in the browser.') }}</p>
          </div>
          <div class="rounded-lg border p-3" style="border-color: var(--border-color)">
            <p class="mb-1 font-medium" style="color: var(--text-color)">{{ t('webdav.automation', 'Automation Scripts') }}</p>
            <p style="color: var(--text-secondary-color)">{{ t('webdav.automationDesc', 'Scripts can continue using Bearer Token, X-API-Key, or the apiKey query parameter.') }}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.loginInfo', 'Login Information') }}</h3>
        <div class="space-y-3 text-sm">
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('common.username', 'Username') }}</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">{{ authStore.user?.username || '-' }}</code>
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
                style="color: var(--text-secondary-color)"
                :disabled="!authStore.user?.username"
                @click="copy(authStore.user?.username || '', 'username')"
              >
                <Icon name="clipboard" class="h-3.5 w-3.5" />
                {{ copyButtonLabel(t('webdav.copy', 'Copy'), 'username') }}
              </button>
            </div>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('common.password', 'Password') }}</p>
            <p style="color: var(--text-color)">{{ t('webdav.passwordHint', 'Use your site login password. This page does not reveal the plaintext password.') }}</p>
          </div>
          <div>
            <p class="mb-1" style="color: var(--text-secondary-color)">{{ t('webdav.baseEndpoint', 'Base Endpoint') }}</p>
            <div class="flex items-center gap-2 rounded-lg px-2 py-1.5" style="background: var(--hover-color)">
              <code class="min-w-0 flex-1 break-all text-sm" style="color: var(--text-color)">{{ baseEndpoint }}</code>
              <button
                class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style="color: var(--text-secondary-color)"
                @click="copy(baseEndpoint, 'base-endpoint')"
              >
                <Icon name="clipboard" class="h-3.5 w-3.5" />
                {{ copyButtonLabel(t('webdav.copy', 'Copy'), 'base-endpoint') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.poolEndpoints', 'Storage Pool Endpoints') }}</h3>
          <p class="text-sm" style="color: var(--text-secondary-color)">{{ t('webdav.poolEndpointsDesc', 'Generate a dedicated WebDAV URL for each pool so clients do not need to switch context manually.') }}</p>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-sm" style="color: var(--text-secondary-color)">{{ t('webdav.loadingPools', 'Loading storage pools...') }}</div>

      <div v-else-if="pools.length === 0" class="rounded-lg border px-4 py-8 text-center" style="border-color: var(--border-color)">
        <Icon name="server" class="mx-auto mb-3 h-10 w-10" style="color: var(--text-secondary-color)" />
        <p class="text-sm font-medium" style="color: var(--text-color)">{{ t('webdav.noPools', 'No storage pools available') }}</p>
        <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.noPoolsHint', 'Create or verify a default storage pool from the storage pools page first.') }}</p>
      </div>

      <div v-else class="space-y-3">
        <div v-for="pool in pools" :key="pool.id" class="rounded-lg border p-4" style="border-color: var(--border-color)">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="font-medium" style="color: var(--text-color)">{{ pool.name }}</h4>
                <span v-if="pool.isDefault" class="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{{ t('common.default', 'Default') }}</span>
              </div>
              <p class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.clientUrl', 'Client URL') }}</p>
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
              {{ copyButtonLabel(t('webdav.copy', 'Copy'), `pool-${pool.id}-client`) }}
            </button>
          </div>

          <div class="mt-3 min-w-0">
            <p class="mb-1 text-xs" style="color: var(--text-secondary-color)">{{ t('webdav.browserUrl', 'Browser Test URL') }}</p>
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
                {{ copyButtonLabel(t('webdav.copy', 'Copy'), `pool-${pool.id}-browser`) }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 text-base font-semibold" style="color: var(--text-color)">{{ t('webdav.tipsTitle', 'Integration Tips') }}</h3>
      <ul class="space-y-2 text-sm" style="color: var(--text-secondary-color)">
        <li>{{ t('webdav.tip1', 'Windows Explorer, macOS Finder, Cyberduck, RaiDrive, and similar clients should prefer the client URL with username and password.') }}</li>
        <li>{{ t('webdav.tip2', 'For quick endpoint checks, prefer the browser test URL, which already includes the current login token.') }}</li>
        <li>{{ t('webdav.tip3', 'Desktop clients should prefer /dav/pool/ID. Without a pool ID, the default storage pool is used.') }}</li>
      </ul>
    </div>
  </div>
</template>
