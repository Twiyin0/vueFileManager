import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useI18nStore, type AppLanguage } from '@/stores/i18n'
import './styles/main.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)

  const i18nStore = useI18nStore()

  try {
    const response = await fetch('/api/site-config', { cache: 'no-cache' })
    const siteConfig = response.ok ? await response.json() : { language: 'zh-CN' }
    await i18nStore.initialize((siteConfig.language || 'zh-CN') as AppLanguage)
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
