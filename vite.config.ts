import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

function getCodemirrorChunkName(id: string) {
  const normalized = id.replace(/\\/g, '/')
  if (normalized.includes('/@codemirror/lang-')) {
    const match = normalized.match(/\/@codemirror\/(lang-[^/]+)/)
    return match ? `cm-${match[1]}` : 'cm-languages'
  }
  if (normalized.includes('/@codemirror/legacy-modes/')) return 'cm-legacy'
  if (normalized.includes('/@lezer/')) return 'cm-core'
  if (
    normalized.includes('/codemirror/') ||
    normalized.includes('/@codemirror/view/') ||
    normalized.includes('/@codemirror/state/') ||
    normalized.includes('/@codemirror/commands/') ||
    normalized.includes('/@codemirror/language/')
  ) return 'cm-core'
  return null
}

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const normalized = id.replace(/\\/g, '/')
            if (normalized.includes('/vue/') ||
                normalized.includes('/vue-router/') ||
                normalized.includes('/pinia/')) return 'vue-vendor'
            if (normalized.includes('/aplayer/')) return 'media-aplayer'
            if (normalized.includes('/artplayer/')) return 'media-artplayer'
            if (normalized.includes('/viewerjs/')) return 'media-viewer'
            if (normalized.includes('/docx-preview/')) return 'office-docx'
            if (normalized.includes('/exceljs/')) return 'office-excel'
            const codemirrorChunk = getCodemirrorChunkName(normalized)
            if (codemirrorChunk) return codemirrorChunk
            if (normalized.includes('/marked/') || normalized.includes('/dompurify/')) return 'markdown-vendor'
          }
        }
      }
    }
  }
})
