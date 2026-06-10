<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  name: string
}>()

const svgContent = ref('')
const iconCache = new Map<string, string>()
const iconRequests = new Map<string, Promise<string>>()

async function fetchIcon(name: string): Promise<string> {
  if (iconCache.has(name)) {
    return iconCache.get(name) || ''
  }
  if (iconRequests.has(name)) {
    return iconRequests.get(name)!
  }

  const request = fetch(`/icon/iconlib/${name}.svg`, { cache: 'force-cache' })
    .then(async res => {
      if (!res.ok) return ''
      let text = await res.text()
      // 替换黑色为 currentColor 以支持暗色模式
      text = text.replace(/#000000/gi, 'currentColor')
      // 移除固定宽高，保留 viewBox
      text = text.replace(/\s*width="[^"]*"/, '')
      text = text.replace(/\s*height="[^"]*"/, '')
      // 移除 XML 声明和注释
      text = text.replace(/<\?xml[^>]*\?>\s*/g, '')
      text = text.replace(/<!--[^>]*-->\s*/g, '')
      iconCache.set(name, text)
      return text
    })
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
    // ignore
  }
}

onMounted(() => loadIcon(props.name))
watch(() => props.name, (n) => loadIcon(n))
</script>

<template>
  <span class="inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full" v-html="svgContent" />
</template>
