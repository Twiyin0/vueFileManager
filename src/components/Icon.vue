<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  name: string
}>()

const svgContent = ref('')
const cache: Record<string, string> = {}

async function loadIcon(name: string) {
  if (cache[name]) {
    svgContent.value = cache[name]
    return
  }
  try {
    const res = await fetch(`/icon/iconlib/${name}.svg`)
    if (!res.ok) return
    let text = await res.text()
    // 替换黑色为 currentColor 以支持暗色模式
    text = text.replace(/#000000/gi, 'currentColor')
    // 移除固定宽高，保留 viewBox
    text = text.replace(/\s*width="[^"]*"/, '')
    text = text.replace(/\s*height="[^"]*"/, '')
    // 移除 XML 声明和注释
    text = text.replace(/<\?xml[^>]*\?>\s*/g, '')
    text = text.replace(/<!--[^>]*-->\s*/g, '')
    cache[name] = text
    svgContent.value = text
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
