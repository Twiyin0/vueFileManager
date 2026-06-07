<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import Icon from '@/components/Icon.vue'

interface Theme {
  name: string
  version: string
  description: string
  enabled: boolean
}

const themes = ref<Theme[]>([])
const loading = ref(true)
const toggling = ref<string | null>(null)
const siteConfig = ref({ themes_enabled: false })

onMounted(async () => {
  try {
    const [configRes, themesRes] = await Promise.all([
      fetch('/api/site-config'),
      fetch('/api/themes/list'),
    ])
    if (configRes.ok) siteConfig.value = await configRes.json()
    if (themesRes.ok) {
      const data = await themesRes.json()
      themes.value = data.themes || []
    }
  } catch {} finally {
    loading.value = false
  }
})

async function toggleTheme(theme: Theme) {
  const newState = !theme.enabled
  toggling.value = theme.name
  try {
    const res = await fetch(`/api/themes/${theme.name}/toggle`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ enabled: newState }),
    })
    if (res.ok) theme.enabled = newState
  } catch {} finally {
    toggling.value = null
  }
}
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
        <div v-if="!siteConfig.themes_enabled" class="card p-8 text-center">
          <Icon name="palette" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
          <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">主题系统未启用</h2>
          <p class="text-sm" style="color: var(--text-secondary-color)">
            在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">config.yml</code> 中设置
            <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins.enabled: true</code>
          </p>
        </div>

        <template v-else>
          <div v-if="themes.length === 0" class="card p-8 text-center">
            <Icon name="palette" class="w-16 h-16 mx-auto mb-4" style="color: var(--text-secondary-color)" />
            <h2 class="text-lg font-semibold mb-2" style="color: var(--text-color)">暂无自定义主题</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              在 <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">plugins/</code> 目录下创建主题文件夹，包含
              <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">manifest.json</code> 和
              <code class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color)">style.css</code>
            </p>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="theme in themes" :key="theme.name" class="card" :class="{ 'opacity-50': !theme.enabled }">
              <div class="flex items-start gap-3">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style="background: var(--accent-soft-color); color: var(--accent-color)">
                  <Icon name="palette" class="w-5 h-5" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="font-medium truncate" style="color: var(--text-color)">{{ theme.name }}</h3>
                    <span v-if="!theme.enabled" class="px-1.5 py-0.5 rounded text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">已禁用</span>
                  </div>
                  <p class="text-xs mt-0.5" style="color: var(--text-secondary-color)">v{{ theme.version }}</p>
                  <p v-if="theme.description" class="text-xs mt-1" style="color: var(--text-secondary-color)">{{ theme.description }}</p>
                  <div class="flex justify-end mt-2">
                    <button
                      @click="toggleTheme(theme)"
                      :disabled="toggling === theme.name"
                      class="relative inline-flex items-center w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0"
                      :style="theme.enabled ? 'background-color: var(--accent-color)' : 'background-color: var(--border-color)'"
                    >
                      <span class="absolute w-4 h-4 bg-white rounded-full shadow transition-transform"
                        :style="theme.enabled ? 'left: 18px; top: 2px' : 'left: 2px; top: 2px'" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <p class="text-xs mt-4 text-center" style="color: var(--text-secondary-color)">修改开关后需重启服务生效</p>
        </template>
      </template>
    </div>
  </Layout>
</template>
