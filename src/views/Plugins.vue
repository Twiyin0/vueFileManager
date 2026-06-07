<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

interface Plugin {
  name: string
  version: string
  description: string
  type: string
}

const plugins = ref<Plugin[]>([])
const loading = ref(true)
const siteConfig = ref({ plugins_enabled: false })

const typeLabels: Record<string, string> = {
  theme: '主题',
  hook: '钩子',
  storage: '存储驱动',
}

const typeIcons: Record<string, string> = {
  theme: 'palette',
  hook: 'plug',
  storage: 'hard-drive',
}

const typeColors: Record<string, string> = {
  theme: 'background-color: var(--accent-soft-color); color: var(--accent-color)',
  hook: 'background-color: #fef3c7; color: #d97706',
  storage: 'background-color: #d1fae5; color: #059669',
}

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
</script>

<template>
  <Layout>
    <div class="px-4 pt-4">
      <div v-if="loading" class="flex items-center justify-center py-20">
        <svg class="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      <template v-else>
        <!-- 插件系统未启用 -->
        <div v-if="!siteConfig.plugins_enabled" class="card p-8 text-center">
          <Icon name="plug" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
          <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">插件系统未启用</h2>
          <p class="text-sm mb-4" style="color: var(--text-secondary-color)">
            在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">config.yml</code> 中设置
            <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins.enabled: true</code> 启用插件系统
          </p>
        </div>

        <!-- 插件列表 -->
        <template v-else>
          <div v-if="plugins.length === 0" class="card p-8 text-center">
            <Icon name="plug" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
            <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">暂无插件</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins/</code> 目录下创建插件文件夹，包含
              <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">manifest.json</code> 即可
            </p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="plugin in plugins" :key="plugin.name" class="card">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" :style="typeColors[plugin.type] || typeColors.theme">
                  <Icon :name="typeIcons[plugin.type] || 'plug'" class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-medium truncate" style="color: var(--text-color)">{{ plugin.name }}</h3>
                  <p class="text-xs mt-0.5" style="color: var(--text-secondary-color)">v{{ plugin.version }}</p>
                  <p v-if="plugin.description" class="text-xs mt-1" style="color: var(--text-secondary-color)">{{ plugin.description }}</p>
                  <span class="inline-block mt-1.5 px-2 py-0.5 rounded text-xs" :style="typeColors[plugin.type] || typeColors.theme">
                    {{ typeLabels[plugin.type] || plugin.type }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
  </Layout>
</template>
