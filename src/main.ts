import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

// 加载主题样式
fetch('/api/themes/styles')
  .then(res => res.json())
  .then(data => {
    for (const style of data.styles || []) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = style.cssPath
      link.dataset.theme = style.name
      document.head.appendChild(link)
    }
  })
  .catch(() => {})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
