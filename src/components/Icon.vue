<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  name: string
}>()

const svgContent = ref('')
const iconCache = new Map<string, string>()
const iconRequests = new Map<string, Promise<string>>()
const fallbackIcons: Record<string, string> = {
  trash: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7H20M9 3H15M10 11V17M14 11V17M6 7L6.8 18.2C6.87 19.2 7.7 20 8.71 20H15.29C16.3 20 17.13 19.2 17.2 18.2L18 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
}

function normalizeSvg(text: string): string {
  let normalized = text
  normalized = normalized.replace(/#000000/gi, 'currentColor')
  normalized = normalized.replace(/\s*width="[^"]*"/, '')
  normalized = normalized.replace(/\s*height="[^"]*"/, '')
  normalized = normalized.replace(/<\?xml[^>]*\?>\s*/g, '')
  normalized = normalized.replace(/<!--[\s\S]*?-->\s*/g, '')
  normalized = normalized.trim()
  return normalized.includes('<svg') ? normalized : ''
}

async function fetchIcon(name: string): Promise<string> {
  if (iconCache.has(name)) {
    return iconCache.get(name) || ''
  }
  if (iconRequests.has(name)) {
    return iconRequests.get(name)!
  }

  const request = fetch(`/icon/iconlib/${name}.svg`, { cache: 'force-cache' })
    .then(async res => {
      if (!res.ok) {
        return fallbackIcons[name] || ''
      }

      const normalized = normalizeSvg(await res.text())
      const svg = normalized || fallbackIcons[name] || ''

      if (svg) {
        iconCache.set(name, svg)
      }

      return svg
    })
    .catch(() => fallbackIcons[name] || '')
    .finally(() => {
      iconRequests.delete(name)
    })

  iconRequests.set(name, request)
  return request
}

async function loadIcon(name: string) {
  try {
    svgContent.value = await fetchIcon(name)
  } catch {
    svgContent.value = fallbackIcons[name] || ''
  }
}

onMounted(() => loadIcon(props.name))
watch(() => props.name, (n) => loadIcon(n))
</script>

<template>
  <span class="inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" v-html="svgContent" />
</template>
