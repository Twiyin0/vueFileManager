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

// 移动端 sidebar 覆盖层
const isMobile = ref(window.innerWidth < 640)
const showMobileSidebar = ref(false)

function handleResize() {
  isMobile.value = window.innerWidth < 640
  if (!isMobile.value) showMobileSidebar.value = false
}
onMounted(() => window.addEventListener('resize', handleResize))
onUnmounted(() => window.removeEventListener('resize', handleResize))

// 移动端更多菜单
const showMoreMenu = ref(false)
const moreMenuRef = ref<HTMLDivElement>()

function handleMoreMenuOutside(e: MouseEvent) {
  if (moreMenuRef.value && !moreMenuRef.value.contains(e.target as Node)) {
    showMoreMenu.value = false
  }
}
onMounted(() => document.addEventListener('click', handleMoreMenuOutside))
onUnmounted(() => document.removeEventListener('click', handleMoreMenuOutside))

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
  '/themes': '主题管理',
  '/theme-docs': '主题开发文档',
}

const pageTitle = ref('')
const pageTitleKey = ref(0)

watch(() => route.path, (path) => {
  const newTitle = pageTitleMap[path] || (route.meta.pluginTitle as string) || ''
  if (newTitle !== pageTitle.value) {
    pageTitleKey.value++
    pageTitle.value = newTitle
  }
  // 移动端切换路由时关闭 sidebar
  showMobileSidebar.value = false
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
      <!-- 左侧 -->
      <div class="flex items-center gap-2 min-w-0">
        <!-- 移动端汉堡菜单（控制 sidebar） -->
        <button v-if="isMobile && authStore.isLoggedIn"
          @click="showMobileSidebar = !showMobileSidebar"
          class="p-1.5 rounded-lg hover:opacity-80 transition-opacity flex-shrink-0"
          style="color: var(--text-secondary-color)">
          <Icon name="menu" class="w-5 h-5" />
        </button>
        <router-link to="/" class="flex items-center gap-2 font-bold text-lg flex-shrink-0">
          <img src="/logo.svg" alt="VueFileManager" class="rounded" style="width: 28px; height: 28px;" />
          <span class="hidden sm:inline" style="color: var(--text-color)">VueFileManager</span>
        </router-link>
        <Transition name="page-title" mode="out-in">
          <span v-if="pageTitle && !isMobile" :key="pageTitleKey" class="text-sm font-medium truncate" style="color: var(--text-secondary-color)">
            / {{ pageTitle }}
          </span>
        </Transition>
      </div>

      <!-- 右侧 -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- 桌面端：直接显示链接 -->
        <template v-if="!isMobile">
          <router-link to="/api-docs" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-opacity" title="API 文档" style="color: var(--text-secondary-color)">
            <Icon name="book-open" class="w-5 h-5" />
            <span class="text-sm font-medium">API 文档</span>
          </router-link>
          <router-link to="/theme-docs" class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:opacity-80 transition-opacity" title="主题开发" style="color: var(--text-secondary-color)">
            <Icon name="palette" class="w-5 h-5" />
            <span class="text-sm font-medium">主题开发</span>
          </router-link>
          <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="p-1.5 rounded-lg hover:opacity-80 transition-opacity" title="GitHub" style="color: var(--text-secondary-color)">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
          <ThemeToggle />
          <template v-if="authStore.isLoggedIn">
            <router-link to="/settings" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:opacity-80 transition-opacity" title="设置" style="color: var(--text-color)">
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
        </template>

        <!-- 移动端：主题 + 更多菜单 -->
        <template v-else>
          <ThemeToggle />
          <div ref="moreMenuRef" class="relative">
            <button @click.stop="showMoreMenu = !showMoreMenu"
              class="p-1.5 rounded-lg hover:opacity-80 transition-opacity"
              style="color: var(--text-secondary-color)">
              <Icon name="dots-vertical" class="w-5 h-5" />
            </button>
            <Transition name="dropdown">
              <div v-if="showMoreMenu"
                class="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border py-1 shadow-sm"
                style="background-color: var(--card-color); border-color: var(--border-color)">
                <router-link to="/api-docs" @click="showMoreMenu = false"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--text-color)">
                  <Icon name="book-open" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                  API 文档
                </router-link>
                <router-link to="/theme-docs" @click="showMoreMenu = false"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--text-color)">
                  <Icon name="palette" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                  主题开发
                </router-link>
                <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" @click="showMoreMenu = false"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--text-color)">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style="color: var(--text-secondary-color)"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub
                </a>
                <div class="border-t my-1" style="border-color: var(--border-color)" />
                <template v-if="authStore.isLoggedIn">
                  <router-link to="/settings" @click="showMoreMenu = false"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    style="color: var(--text-color)">
                    <Icon name="gear" class="w-4 h-4" style="color: var(--text-secondary-color)" />
                    设置
                  </router-link>
                  <button @click="authStore.logout(); showMoreMenu = false"
                    class="w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover text-red-500">
                    <Icon name="arrow-right-from-bracket" class="w-4 h-4" />
                    退出 ({{ authStore.user?.username }})
                  </button>
                </template>
                <template v-else>
                  <router-link to="/login" @click="showMoreMenu = false"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    style="color: var(--accent-color)">
                    <Icon name="arrow-right-to-bracket" class="w-4 h-4" />
                    登录
                  </router-link>
                </template>
              </div>
            </Transition>
          </div>
        </template>
      </div>
    </header>

    <!-- 侧边栏 + 内容区 -->
    <div class="content-row">
      <!-- 移动端 sidebar 遮罩 -->
      <Transition name="sidebar-overlay">
        <div v-if="isMobile && showMobileSidebar"
          class="fixed inset-0 z-40 bg-black/40 dark:bg-black/60"
          @click="showMobileSidebar = false" />
      </Transition>

      <!-- 桌面端 sidebar -->
      <Sidebar v-if="authStore.isLoggedIn && !isMobile" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />

      <!-- 移动端 sidebar（覆盖层） -->
      <Transition name="sidebar-slide">
        <Sidebar v-if="authStore.isLoggedIn && isMobile && showMobileSidebar"
          :collapsed="false"
          :mobile="true"
          @toggle="showMobileSidebar = false" />
      </Transition>

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
  padding: 0 0.75rem;
  background-color: var(--surface-color);
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.dark .header-bar {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

@media (min-width: 640px) {
  .header-bar {
    padding: 0 1rem;
  }
}

.content-row {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 移动端 sidebar 覆盖层 */
@media (max-width: 639px) {
  .content-row :deep(aside) {
    position: fixed;
    top: 2.75rem;
    left: 0;
    bottom: 0;
    z-index: 45;
    width: 240px !important;
    border-right: 1px solid var(--border-color);
    box-shadow: 4px 0 12px rgba(0, 0, 0, 0.1);
  }
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
  transition: opacity 0.2s;
  z-index: 30;
}
.back-to-top-btn:hover {
  opacity: 0.85;
}

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

/* 下拉菜单动效 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}
.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* sidebar 遮罩动效 */
.sidebar-overlay-enter-active,
.sidebar-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.sidebar-overlay-enter-from,
.sidebar-overlay-leave-to {
  opacity: 0;
}

/* 页面切换动效 */
.page-fade-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-fade-leave-active {
  transition: opacity 0.12s ease;
}
.page-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.page-fade-leave-to {
  opacity: 0;
}

/* sidebar 滑入动效 */
.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.25s ease;
}
.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}
</style>
