<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
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
  '/api-docs': 'API 文档',
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

// 回到顶部按钮
const showBackToTop = ref(false)
let scrollTarget: HTMLElement | null = null

function handleScroll() {
  showBackToTop.value = (scrollTarget?.scrollTop ?? 0) > 300
}

function scrollToTop() {
  scrollTarget?.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  // 延迟获取 scrollTarget（main 元素）
  setTimeout(() => {
    scrollTarget = document.querySelector('main.flex-1.overflow-auto')
    scrollTarget?.addEventListener('scroll', handleScroll)
  }, 100)
})

onUnmounted(() => {
  scrollTarget?.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="layout-wrapper">
    <!-- Header -->
    <header class="header-bar">
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
        <router-link to="/api-docs" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-opacity" title="API 文档" style="color: var(--text-secondary-color)">
          <Icon name="book-open" class="w-5 h-5" />
          <span class="text-sm font-medium">API 文档</span>
        </router-link>
        <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-lg hover:opacity-80 transition-opacity" title="GitHub" style="color: var(--text-secondary-color)">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
        </a>
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

    <!-- 侧边栏 + 内容区 -->
    <div class="content-row">
      <Sidebar v-if="authStore.isLoggedIn" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />
      <main class="flex-1 overflow-auto min-w-0">
        <slot />
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

    <!-- 回到顶部按钮 -->
    <Transition name="back-to-top">
      <button v-if="showBackToTop" @click="scrollToTop"
        class="back-to-top-btn"
        title="回到顶部">
        <Icon name="arrow-up" class="w-5 h-5" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.layout-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-color);
}

.header-bar {
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--surface-color);
  flex-shrink: 0;
}

.content-row {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 回到顶部按钮 */
.back-to-top-btn {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  background-color: var(--accent-color);
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s, opacity 0.2s;
  z-index: 30;
}
.back-to-top-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 从下方冒出 + 弹跳 */
.back-to-top-enter-active {
  animation: bounceIn 0.6s ease;
}
.back-to-top-leave-active {
  transition: all 0.2s ease;
}
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

@keyframes bounceIn {
  0% { opacity: 0; transform: translateY(40px) scale(0.8); }
  50% { opacity: 1; transform: translateY(-8px) scale(1.05); }
  70% { transform: translateY(4px) scale(0.98); }
  85% { transform: translateY(-2px) scale(1.01); }
  100% { transform: translateY(0) scale(1); }
}

/* 页面标题切换动效 */
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
