<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute } from 'vue-router'
import Sidebar from './Sidebar.vue'
import ThemeToggle from './ThemeToggle.vue'
import Icon from '@/components/Icon.vue'
import { headerLinks } from '@/app/modules'
import { useI18n } from '@/composables/useI18n'

const authStore = useAuthStore()
const route = useRoute()
const { t } = useI18n()

const sidebarCollapsed = ref(localStorage.getItem('sidebarCollapsed') === 'true')
watch(sidebarCollapsed, (value) => localStorage.setItem('sidebarCollapsed', String(value)))

const isMobile = ref(window.innerWidth < 640)
const showMobileSidebar = ref(false)
const showMoreMenu = ref(false)
const moreMenuRef = ref<HTMLDivElement>()

const pageTitle = ref('')
const pageTitleKey = ref(0)
const siteConfig = ref({ icp_beian: '', police_beian: '' })
const showBackToTop = ref(false)

let scrollTarget: HTMLElement | null = null

const sortedHeaderLinks = computed(() => [...headerLinks].sort((a, b) => a.order - b.order))

function handleResize() {
  isMobile.value = window.innerWidth < 640
  if (!isMobile.value) showMobileSidebar.value = false
}

function handleMoreMenuOutside(event: MouseEvent) {
  if (moreMenuRef.value && !moreMenuRef.value.contains(event.target as Node)) {
    showMoreMenu.value = false
  }
}

function handleScroll() {
  showBackToTop.value = (scrollTarget?.scrollTop ?? 0) > 300
}

function scrollToTop() {
  scrollTarget?.scrollTo({ top: 0, behavior: 'smooth' })
}

function getRoutePageTitle() {
  const key = route.meta.pageTitleKey as string | undefined
  const fallback = (route.meta.pageTitle as string) || ''
  return key ? t(key, fallback) : fallback
}

watch(
  () => [route.path, route.meta.pageTitleKey, route.meta.pageTitle, route.fullPath, t('app.name', 'VueFileManager')],
  () => {
    const nextTitle = getRoutePageTitle()
    if (nextTitle !== pageTitle.value) {
      pageTitleKey.value += 1
      pageTitle.value = nextTitle
    }
    showMobileSidebar.value = false
  },
  { immediate: true }
)

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('click', handleMoreMenuOutside)

  try {
    const response = await fetch('/api/site-config')
    if (response.ok) {
      const data = await response.json()
      siteConfig.value = {
        icp_beian: data.icp_beian || '',
        police_beian: data.police_beian || ''
      }
    }
  } catch {}

  window.setTimeout(() => {
    scrollTarget = document.querySelector('main.flex-1.overflow-auto')
    scrollTarget?.addEventListener('scroll', handleScroll)
  }, 100)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('click', handleMoreMenuOutside)
  scrollTarget?.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="layout-wrapper">
    <header class="header-bar">
      <div class="min-w-0 flex items-center gap-2">
        <button
          v-if="isMobile && authStore.isLoggedIn"
          class="flex-shrink-0 rounded-lg p-1.5 transition-opacity hover:opacity-80"
          style="color: var(--text-secondary-color)"
          @click="showMobileSidebar = !showMobileSidebar"
        >
          <Icon name="menu" class="h-5 w-5" />
        </button>

        <router-link to="/" class="flex flex-shrink-0 items-center gap-2 text-lg font-bold">
          <img src="/logo.svg" :alt="t('app.name', 'VueFileManager')" class="rounded" style="width: 28px; height: 28px;" />
          <span class="hidden sm:inline" style="color: var(--text-color)">{{ t('app.name', 'VueFileManager') }}</span>
        </router-link>

        <Transition name="page-title" mode="out-in">
          <span v-if="pageTitle && !isMobile" :key="pageTitleKey" class="truncate text-sm font-medium" style="color: var(--text-secondary-color)">
            / {{ pageTitle }}
          </span>
        </Transition>
      </div>

      <div class="flex flex-shrink-0 items-center gap-2">
        <template v-if="!isMobile">
          <router-link
            v-for="link in sortedHeaderLinks"
            :key="link.to"
            :to="link.to"
            class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-opacity hover:opacity-80"
            :title="link.labelKey ? t(link.labelKey, link.label) : link.label"
            style="color: var(--text-secondary-color)"
          >
            <Icon :name="link.icon" class="h-5 w-5" />
            <span class="text-sm font-medium">{{ link.labelKey ? t(link.labelKey, link.label) : link.label }}</span>
          </router-link>
          <a
            href="https://github.com/Twiyin0/vueFileManager"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-1.5 transition-opacity hover:opacity-80"
            :title="t('app.github', 'GitHub')"
            style="color: var(--text-secondary-color)"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
          <ThemeToggle />
          <template v-if="authStore.isLoggedIn">
            <router-link
              to="/settings"
              class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-opacity hover:opacity-80"
              :title="t('app.settings', '设置')"
              style="color: var(--text-color)"
            >
              <Icon name="gear" class="h-5 w-5" />
            </router-link>
            <div class="flex items-center gap-2">
              <span class="text-sm" style="color: var(--text-secondary-color)">{{ authStore.user?.username }}</span>
              <button class="text-sm text-red-500 hover:text-red-600" @click="authStore.logout()">
                {{ t('app.logout', '退出') }}
              </button>
            </div>
          </template>
          <template v-else>
            <router-link to="/login" class="btn-primary text-sm">{{ t('app.login', '登录') }}</router-link>
          </template>
        </template>

        <template v-else>
          <ThemeToggle />
          <div ref="moreMenuRef" class="relative">
            <button
              class="rounded-lg p-1.5 transition-opacity hover:opacity-80"
              style="color: var(--text-secondary-color)"
              @click.stop="showMoreMenu = !showMoreMenu"
            >
              <Icon name="dots-vertical" class="h-5 w-5" />
            </button>

            <Transition name="dropdown">
              <div
                v-if="showMoreMenu"
                class="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-lg border py-1 shadow-sm"
                style="background-color: var(--card-color); border-color: var(--border-color)"
              >
                <router-link
                  v-for="link in sortedHeaderLinks"
                  :key="link.to"
                  :to="link.to"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--text-color)"
                  @click="showMoreMenu = false"
                >
                  <Icon :name="link.icon" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                  {{ link.labelKey ? t(link.labelKey, link.label) : link.label }}
                </router-link>
                <a
                  href="https://github.com/Twiyin0/vueFileManager"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                  style="color: var(--text-color)"
                  @click="showMoreMenu = false"
                >
                  <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" style="color: var(--text-secondary-color)"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  {{ t('app.github', 'GitHub') }}
                </a>
                <div class="my-1 border-t" style="border-color: var(--border-color)" />
                <template v-if="authStore.isLoggedIn">
                  <router-link
                    to="/settings"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    style="color: var(--text-color)"
                    @click="showMoreMenu = false"
                  >
                    <Icon name="gear" class="h-4 w-4" style="color: var(--text-secondary-color)" />
                    {{ t('app.settings', '设置') }}
                  </router-link>
                  <button
                    class="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    @click="authStore.logout(); showMoreMenu = false"
                  >
                    <Icon name="arrow-right-from-bracket" class="h-4 w-4" />
                    {{ t('app.logout', '退出') }} ({{ authStore.user?.username }})
                  </button>
                </template>
                <template v-else>
                  <router-link
                    to="/login"
                    class="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:hover:bg-dark-hover"
                    style="color: var(--accent-color)"
                    @click="showMoreMenu = false"
                  >
                    <Icon name="arrow-right-to-bracket" class="h-4 w-4" />
                    {{ t('app.login', '登录') }}
                  </router-link>
                </template>
              </div>
            </Transition>
          </div>
        </template>
      </div>
    </header>

    <div class="content-row">
      <Transition name="sidebar-overlay">
        <div
          v-if="isMobile && showMobileSidebar"
          class="fixed inset-0 z-40 bg-black/40 dark:bg-black/60"
          @click="showMobileSidebar = false"
        />
      </Transition>

      <Sidebar v-if="authStore.isLoggedIn && !isMobile" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />

      <Transition name="sidebar-slide">
        <Sidebar v-if="authStore.isLoggedIn && isMobile && showMobileSidebar" :collapsed="false" :mobile="true" @toggle="showMobileSidebar = false" />
      </Transition>

      <main class="min-w-0 flex-1 overflow-auto">
        <slot />
        <footer class="flex-shrink-0 px-4 py-1.5 text-center" style="color: var(--text-secondary-color)">
          <p class="text-xs opacity-60" style="line-height: 1.4">
            © {{ new Date().getFullYear() }}
            <a href="https://github.com/Twiyin0/vueFileManager" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">VueFileManager</a>
            by <a href="https://github.com/Twiyin0" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100" style="color: var(--accent-color)">Twiyin0</a>
            · MIT License
            <template v-if="siteConfig.icp_beian || siteConfig.police_beian">
              <span class="mx-1">·</span>
              <a v-if="siteConfig.icp_beian" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100">{{ siteConfig.icp_beian }}</a>
              <span v-if="siteConfig.icp_beian && siteConfig.police_beian" class="mx-1">|</span>
              <a v-if="siteConfig.police_beian" href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer" class="transition-opacity hover:opacity-100">{{ siteConfig.police_beian }}</a>
            </template>
          </p>
        </footer>
      </main>
    </div>

    <Transition name="back-to-top">
      <button v-if="showBackToTop" class="back-to-top-btn" :title="t('common.backToTop', '回到顶部')" @click="scrollToTop">
        <Icon name="arrow-up" class="h-5 w-5" />
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

.back-to-top-btn {
  position: fixed;
  right: 1.5rem;
  bottom: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
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

.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.sidebar-overlay-enter-active,
.sidebar-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.sidebar-overlay-enter-from,
.sidebar-overlay-leave-to {
  opacity: 0;
}

.sidebar-slide-enter-active,
.sidebar-slide-leave-active {
  transition: transform 0.25s ease;
}

.sidebar-slide-enter-from,
.sidebar-slide-leave-to {
  transform: translateX(-100%);
}
</style>
