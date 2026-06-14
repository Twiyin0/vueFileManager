import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore, type AppLanguage } from '@/stores/i18n'
import './styles/main.css'

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'en-US' ? 'en-US' : 'zh-CN'
}

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  const i18nStore = useI18nStore()
  const authStore = useAuthStore()

  try {
    if (localStorage.getItem('token')) {
      await authStore.fetchUser()
    }
    const userLanguage = authStore.user?.settings?.language
    await i18nStore.initialize(normalizeLanguage(userLanguage || 'zh-CN'))
  } catch {
    await i18nStore.initialize('zh-CN')
  }

  fetch('/api/themes/styles')
    .then((res) => res.json())
    .then((data) => {
      for (const style of data.styles || []) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = style.cssPath
        link.dataset.theme = style.name
        document.head.appendChild(link)
      }
    })
    .catch(() => {})

  app.mount('#app')
}

void bootstrap()
