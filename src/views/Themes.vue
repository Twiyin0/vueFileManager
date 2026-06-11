<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import Icon from '@/components/Icon.vue'

interface PluginSummary {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  kind: 'theme' | 'feature'
  capabilities: string[]
  docs?: string
  entry?: string
  assetBasePath: string
}

const plugins = ref<PluginSummary[]>([])
const loading = ref(true)
const toggling = ref<string | null>(null)
const siteConfig = ref({ themes_enabled: false, plugins_enabled: false })

const themePlugins = computed(() => plugins.value.filter((plugin) => plugin.kind === 'theme'))
const featurePlugins = computed(() => plugins.value.filter((plugin) => plugin.kind === 'feature'))

onMounted(async () => {
  try {
    const [configRes, pluginsRes] = await Promise.all([
      fetch('/api/site-config'),
      fetch('/api/plugins/list'),
    ])
    if (configRes.ok) siteConfig.value = await configRes.json()
    if (pluginsRes.ok) {
      const data = await pluginsRes.json()
      plugins.value = data.plugins || []
    }
  } catch {} finally {
    loading.value = false
  }
})

async function togglePlugin(plugin: PluginSummary) {
  const newState = !plugin.enabled
  toggling.value = plugin.id
  try {
    const endpoint = plugin.kind === 'theme'
      ? `/api/themes/${plugin.name}/toggle`
      : `/api/plugins/${plugin.name}/toggle`

    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ enabled: newState }),
    })
    if (res.ok) plugin.enabled = newState
  } catch {} finally {
    toggling.value = null
  }
}
</script>

<template>
  <div class="px-4 pt-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>

    <template v-else>
      <div v-if="!siteConfig.plugins_enabled" class="card p-8 text-center">
        <Icon name="palette" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
        <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">插件系统未启用</h2>
        <p class="text-sm" style="color: var(--text-secondary-color)">
          在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">config.yml</code> 中设置
          <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins.enabled: true</code>
        </p>
      </div>

      <template v-else>
        <div class="card p-5 mb-6">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold" style="color: var(--text-color)">插件中心</h2>
              <p class="text-sm mt-1" style="color: var(--text-secondary-color)">
                统一管理主题插件与功能插件。修改启用状态后需重启服务生效。
              </p>
            </div>
            <RouterLink to="/theme-docs" class="btn-secondary text-sm inline-flex items-center gap-1.5">
              <Icon name="book-open" class="w-4 h-4" />
              开发文档
            </RouterLink>
          </div>
        </div>

        <section class="mb-8">
          <div class="flex items-center gap-2 mb-4">
            <Icon name="palette" class="w-5 h-5" style="color: var(--accent-color)" />
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">主题插件</h3>
          </div>

          <div v-if="themePlugins.length === 0" class="card p-8 text-center">
            <Icon name="palette" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
            <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">暂无主题插件</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins/</code> 目录中创建主题目录，并提供
              <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">manifest.json</code> 与
              <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">style.css</code>。
            </p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="plugin in themePlugins" :key="plugin.id" class="card" :class="{ 'opacity-50': !plugin.enabled }">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background: var(--accent-soft-color); color: var(--accent-color)">
                  <Icon name="palette" class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium truncate" style="color: var(--text-color)">{{ plugin.name }}</h3>
                    <span v-if="!plugin.enabled" class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">已禁用</span>
                  </div>
                  <p class="text-xs mt-0.5" style="color: var(--text-secondary-color)">v{{ plugin.version }}</p>
                  <p v-if="plugin.description" class="text-xs mt-1" style="color: var(--text-secondary-color)">{{ plugin.description }}</p>
                  <p v-if="plugin.author" class="text-xs mt-1" style="color: var(--text-secondary-color)">作者：{{ plugin.author }}</p>
                  <div class="flex justify-end mt-3">
                    <button
                      class="relative inline-flex items-center w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0"
                      :disabled="toggling === plugin.id"
                      :style="plugin.enabled ? 'background-color: var(--accent-color)' : 'background-color: var(--border-color)'"
                      @click="togglePlugin(plugin)"
                    >
                      <span class="absolute w-4 h-4 bg-white rounded-full shadow transition-transform" :style="plugin.enabled ? 'left: 18px; top: 2px' : 'left: 2px; top: 2px'" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div class="flex items-center gap-2 mb-4">
            <Icon name="sparkles" class="w-5 h-5" style="color: var(--accent-color)" />
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">功能插件</h3>
          </div>

          <div v-if="featurePlugins.length === 0" class="card p-8 text-center">
            <Icon name="sparkles" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
            <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">暂无功能插件</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              功能插件可以声明入口文件、静态资源和能力说明。当前版本先提供统一注册与开关管理，便于后续继续扩展挂载能力。
            </p>
          </div>

          <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div v-for="plugin in featurePlugins" :key="plugin.id" class="card" :class="{ 'opacity-50': !plugin.enabled }">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background: var(--accent-soft-color); color: var(--accent-color)">
                  <Icon name="sparkles" class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium truncate" style="color: var(--text-color)">{{ plugin.name }}</h3>
                    <span v-if="!plugin.enabled" class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">已禁用</span>
                  </div>
                  <p class="text-xs mt-0.5" style="color: var(--text-secondary-color)">v{{ plugin.version }}</p>
                  <p v-if="plugin.description" class="text-sm mt-2" style="color: var(--text-secondary-color)">{{ plugin.description }}</p>
                  <div class="flex flex-wrap gap-2 mt-3">
                    <span v-for="capability in plugin.capabilities" :key="capability" class="px-2 py-1 rounded-full text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">
                      {{ capability }}
                    </span>
                  </div>
                  <div class="flex flex-wrap items-center gap-2 mt-4">
                    <a v-if="plugin.docs" :href="plugin.docs" target="_blank" rel="noreferrer" class="btn-secondary text-xs inline-flex items-center gap-1">
                      <Icon name="book-open" class="w-3.5 h-3.5" />
                      插件文档
                    </a>
                    <span v-if="plugin.entry" class="text-xs font-mono" style="color: var(--text-secondary-color)">
                      entry: {{ plugin.entry }}
                    </span>
                    <button
                      class="ml-auto relative inline-flex items-center w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0"
                      :disabled="toggling === plugin.id"
                      :style="plugin.enabled ? 'background-color: var(--accent-color)' : 'background-color: var(--border-color)'"
                      @click="togglePlugin(plugin)"
                    >
                      <span class="absolute w-4 h-4 bg-white rounded-full shadow transition-transform" :style="plugin.enabled ? 'left: 18px; top: 2px' : 'left: 2px; top: 2px'" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
