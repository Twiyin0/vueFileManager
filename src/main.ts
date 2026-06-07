import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

// ---- Monaco Editor setup (local node_modules, no CDN dependency) ----
import { loader } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

loader.config({ monaco })

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
