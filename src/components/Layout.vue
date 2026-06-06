<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import ThemeToggle from './ThemeToggle.vue'
import Icon from '@/components/Icon.vue'

const authStore = useAuthStore()
const route = useRoute()
const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
watch(sidebarCollapsed, (v) => localStorage.setItem('sidebarCollapsed', String(v)))

const pageTitleMap: Record<string, string> = {
  '/': '文件管理',
  '/favourites': '我的收藏',
  '/my-shares': '我的分享',
  '/trash': '回收站',
  '/storage-pools': '存储池管理',
  '/settings': '设置',
  '/apikeys': 'API Keys',
  '/admin': '管理面板',
}

const pageTitle = ref('')
const pageTitleKey = ref(0)

watch(() => route.path, (path) => {
  const newTitle = pageTitleMap[path] || ''
  if (newTitle !== pageTitle.value) {
    pageTitleKey.value++
    pageTitle.value = newTitle
  }
}, { immediate: true })

const siteConfig = ref({ icp_beian: '', police_beian: '' })

onMounted(async () => {
  try {
    const res = await fetch('/api/site-config')
    if (res.ok) siteConfig.value = await res.json()
  } catch {}
})
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background-color: var(--bg-color)">
    <header class="h-11 flex items-center justify-between px-4 border-b flex-shrink-0" style="background-color: var(--surface-color); border-color: var(--border-color)">
      <div class="flex items-center gap-3 min-w-0">
        <router-link to="/" class="flex items-center gap-2 font-bold text-lg flex-shrink-0">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
          <span style="color: var(--text-color)">VueFileManager</span>
        </router-link>
        <Transition name="page-title" mode="out-in">
          <span v-if="pageTitle" :key="pageTitleKey" class="text-sm font-medium truncate" style="color: var(--text-secondary-color)">
            / {{ pageTitle }}
          </span>
        </Transition>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <ThemeToggle />
        <template v-if="authStore.isLoggedIn">
          <router-link to="/settings" class="p-2 rounded-lg hover:opacity-80" title="设置" style="color: var(--text-color)">
            <Icon name="gear" class="w-5 h-5" />
          </router-link>
          <div class="flex items-center gap-2">
            <span class="text-sm" style="color: var(--text-secondary-color)">{{ authStore.user?.username }}</span>
            <button @click="authStore.logout()" class="text-sm text-red-500 hover:text-red-600">退出</button>
          </div>
        </template>
        <template v-else>
          <router-link to="/login" class="btn-primary text-sm">登录</router-link>
        </template>
      </div>
    </header>

    <div class="flex flex-1">
      <Sidebar v-if="authStore.isLoggedIn" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />
      <main class="flex-1 overflow-auto flex flex-col">
        <div class="flex-1">
          <slot />
        </div>
        <footer class="px-4 py-1.5 text-center flex-shrink-0" style="color: var(--text-secondary-color)">
          <p class="text-xs opacity-60" style="line-height: 1.4">
            © {{ new Date().getFullYear() }}
            <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">VueFileManager</a>
            by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity" style="color: var(--accent-color)">Twiyin0</a>
            · MIT License
            <template v-if="siteConfig.icp_beian || siteConfig.police_beian">
              <span class="mx-1">·</span>
              <a v-if="siteConfig.icp_beian" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity">{{ siteConfig.icp_beian }}</a>
              <span v-if="siteConfig.icp_beian && siteConfig.police_beian" class="mx-1">|</span>
              <a v-if="siteConfig.police_beian" href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer" class="hover:opacity-100 transition-opacity">{{ siteConfig.police_beian }}</a>
            </template>
          </p>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-title-enter-active,
.page-title-leave-active {
  transition: all 0.2s ease;
}
.page-title-enter-from {
  opacity: 0;
  transform: translateX(8px);
}
.page-title-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
