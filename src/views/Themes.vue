<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/composables/useI18n'
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

const { t, format } = useI18n()

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
      fetch('/api/plugins/list')
    ])
    if (configRes.ok) siteConfig.value = await configRes.json()
    if (pluginsRes.ok) {
      const data = await pluginsRes.json()
      plugins.value = data.plugins || []
    }
  } catch {
  } finally {
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
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ enabled: newState })
    })

    if (res.ok) plugin.enabled = newState
  } catch {
  } finally {
    toggling.value = null
  }
}
</script>

<template>
  <div class="px-4 pt-4">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg class="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>

    <template v-else>
      <div v-if="!siteConfig.plugins_enabled" class="card p-8 text-center">
        <Icon name="palette" class="mx-auto mb-4 h-16 w-16" style="color: var(--text-secondary-color)" />
        <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.disabledTitle', 'Plugin system disabled') }}</h2>
        <p class="text-sm" style="color: var(--text-secondary-color)">
          {{ t('pluginsPage.disabledHint', 'Set plugins.enabled: true in config.yml') }}
        </p>
      </div>

      <template v-else>
        <div class="card mb-6 p-5">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.centerTitle', 'Plugin Center') }}</h2>
              <p class="mt-1 text-sm" style="color: var(--text-secondary-color)">
                {{ t('pluginsPage.centerDescription', 'Manage theme and feature plugins in one place. Restart the service after changing enable states.') }}
              </p>
            </div>
            <RouterLink to="/theme-docs" class="btn-secondary inline-flex items-center gap-1.5 text-sm">
              <Icon name="book-open" class="h-4 w-4" />
              {{ t('pluginsPage.docs', 'Development Docs') }}
            </RouterLink>
          </div>
        </div>

        <section class="mb-8">
          <div class="mb-4 flex items-center gap-2">
            <Icon name="palette" class="h-5 w-5" style="color: var(--accent-color)" />
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.themesTitle', 'Theme Plugins') }}</h3>
          </div>

          <div v-if="themePlugins.length === 0" class="card p-8 text-center">
            <Icon name="palette" class="mx-auto mb-4 h-16 w-16" style="color: var(--text-secondary-color)" />
            <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.noThemesTitle', 'No theme plugins yet') }}</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              {{ t('pluginsPage.noThemesDescription', 'Create a theme directory inside plugins/ with manifest.json and style.css.') }}
            </p>
          </div>

          <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="plugin in themePlugins" :key="plugin.id" class="card" :class="{ 'opacity-50': !plugin.enabled }">
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style="background: var(--accent-soft-color); color: var(--accent-color)">
                  <Icon name="palette" class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h3 class="truncate font-medium" style="color: var(--text-color)">{{ plugin.name }}</h3>
                    <span v-if="!plugin.enabled" class="rounded px-1.5 py-0.5 text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">
                      {{ t('pluginsPage.disabledBadge', 'Disabled') }}
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs" style="color: var(--text-secondary-color)">v{{ plugin.version }}</p>
                  <p v-if="plugin.description" class="mt-1 text-xs" style="color: var(--text-secondary-color)">{{ plugin.description }}</p>
                  <p v-if="plugin.author" class="mt-1 text-xs" style="color: var(--text-secondary-color)">
                    {{ format('pluginsPage.author', 'Author: {author}', { author: plugin.author }) }}
                  </p>
                  <div class="mt-3 flex justify-end">
                    <button
                      class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors"
                      :disabled="toggling === plugin.id"
                      :style="plugin.enabled ? 'background-color: var(--accent-color)' : 'background-color: var(--border-color)'"
                      @click="togglePlugin(plugin)"
                    >
                      <span class="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" :style="plugin.enabled ? 'left: 18px; top: 2px' : 'left: 2px; top: 2px'" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div class="mb-4 flex items-center gap-2">
            <Icon name="sparkles" class="h-5 w-5" style="color: var(--accent-color)" />
            <h3 class="text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.featuresTitle', 'Feature Plugins') }}</h3>
          </div>

          <div v-if="featurePlugins.length === 0" class="card p-8 text-center">
            <Icon name="sparkles" class="mx-auto mb-4 h-16 w-16" style="color: var(--text-secondary-color)" />
            <h2 class="mb-2 text-lg font-semibold" style="color: var(--text-color)">{{ t('pluginsPage.noFeaturesTitle', 'No feature plugins yet') }}</h2>
            <p class="text-sm" style="color: var(--text-secondary-color)">
              {{ t('pluginsPage.noFeaturesDescription', 'Feature plugins can declare entry files, static assets, and capabilities. This version focuses on unified registration and toggles for future expansion.') }}
            </p>
          </div>

          <div v-else class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div v-for="plugin in featurePlugins" :key="plugin.id" class="card" :class="{ 'opacity-50': !plugin.enabled }">
              <div class="flex items-start gap-3">
                <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style="background: var(--accent-soft-color); color: var(--accent-color)">
                  <Icon name="sparkles" class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <h3 class="truncate font-medium" style="color: var(--text-color)">{{ plugin.name }}</h3>
                    <span v-if="!plugin.enabled" class="rounded px-1.5 py-0.5 text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">
                      {{ t('pluginsPage.disabledBadge', 'Disabled') }}
                    </span>
                  </div>
                  <p class="mt-0.5 text-xs" style="color: var(--text-secondary-color)">v{{ plugin.version }}</p>
                  <p v-if="plugin.description" class="mt-2 text-sm" style="color: var(--text-secondary-color)">{{ plugin.description }}</p>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span v-for="capability in plugin.capabilities" :key="capability" class="rounded-full px-2 py-1 text-xs" style="background: var(--hover-color); color: var(--text-secondary-color)">
                      {{ capability }}
                    </span>
                  </div>
                  <div class="mt-4 flex flex-wrap items-center gap-2">
                    <a v-if="plugin.docs" :href="plugin.docs" target="_blank" rel="noreferrer" class="btn-secondary inline-flex items-center gap-1 text-xs">
                      <Icon name="book-open" class="h-3.5 w-3.5" />
                      {{ t('pluginsPage.pluginDocs', 'Plugin Docs') }}
                    </a>
                    <span v-if="plugin.entry" class="text-xs font-mono" style="color: var(--text-secondary-color)">
                      {{ format('pluginsPage.entryPrefix', `entry: ${plugin.entry}`, { entry: plugin.entry }) }}
                    </span>
                    <button
                      class="relative ml-auto inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors"
                      :disabled="toggling === plugin.id"
                      :style="plugin.enabled ? 'background-color: var(--accent-color)' : 'background-color: var(--border-color)'"
                      @click="togglePlugin(plugin)"
                    >
                      <span class="absolute h-4 w-4 rounded-full bg-white shadow transition-transform" :style="plugin.enabled ? 'left: 18px; top: 2px' : 'left: 2px; top: 2px'" />
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
