<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{
  name: string
}>()

const svgContent = ref('')
const iconCache = new Map<string, string>()
const iconRequests = new Map<string, Promise<string>>()
const iconBaseUrl = `${import.meta.env.BASE_URL}icon/iconlib/`
const fallbackIcons: Record<string, string> = {
  database: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse cx="12" cy="5.5" rx="7" ry="2.5" stroke="currentColor" stroke-width="2"/><path d="M5 5.5V12.5C5 13.8807 8.13401 15 12 15C15.866 15 19 13.8807 19 12.5V5.5" stroke="currentColor" stroke-width="2"/><path d="M5 12.5V18.5C5 19.8807 8.13401 21 12 21C15.866 21 19 19.8807 19 18.5V12.5" stroke="currentColor" stroke-width="2"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.6C3 6.03985 3 5.25978 3.30396 4.66403C3.57195 4.13803 3.99968 3.71029 4.52569 3.44231C5.12143 3.13835 5.90151 3.13835 7.46166 3.13835H9.21179C9.89256 3.13835 10.2329 3.13835 10.5531 3.21729C10.837 3.28724 11.1082 3.40007 11.3572 3.55198C11.6382 3.7233 11.8788 3.96388 12.36 4.44504L12.9159 5.00094C13.3971 5.48209 13.6377 5.72267 13.9187 5.89399C14.1677 6.0459 14.4389 6.15874 14.7228 6.22868C15.043 6.30763 15.3834 6.30763 16.0641 6.30763H16.5383C18.0985 6.30763 18.8786 6.30763 19.4743 6.61159C20.0003 6.87958 20.428 7.30731 20.696 7.83332C21 8.42906 21 9.20914 21 10.7693V16.5383C21 18.0985 21 18.8786 20.696 19.4743C20.428 20.0003 20.0003 20.428 19.4743 20.696C18.8786 21 18.0985 21 16.5383 21H7.46166C5.90151 21 5.12143 21 4.52569 20.696C3.99968 20.428 3.57195 20.0003 3.30396 19.4743C3 18.8786 3 18.0985 3 16.5383V7.6Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6.2 21H17.8C18.9201 21 19.4802 21 19.908 20.782C20.2843 20.5903 20.5903 20.2843 20.782 19.908C21 19.4802 21 18.9201 21 17.8V6.2C21 5.0799 21 4.51984 20.782 4.09202C20.5903 3.71569 20.2843 3.40973 19.908 3.21799C19.4802 3 18.9201 3 17.8 3H6.2C5.0799 3 4.51984 3 4.09202 3.21799C3.71569 3.40973 3.40973 3.71569 3.21799 4.09202C3 4.51984 3 5.0799 3 6.2V17.8C3 18.9201 3 19.4802 3.21799 19.908C3.40973 20.2843 3.71569 20.5903 4.09202 20.782C4.51984 21 5.07989 21 6.2 21Z" stroke="currentColor" stroke-width="2"/><path d="M3 16L8 11L13 16L15.5 13.5L21 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 10.5L16.5 12L14 13.5V10.5Z" fill="currentColor"/><path d="M2 8.2C2 7.0799 2 6.51984 2.21799 6.09202C2.40973 5.71569 2.71569 5.40973 3.09202 5.21799C3.51984 5 4.0799 5 5.2 5H12.8C13.9201 5 14.4802 5 14.908 5.21799C15.2843 5.40973 15.5903 5.71569 15.782 6.09202C16 6.51984 16 7.0799 16 8.2V8.61356C16 9.14565 16 9.41169 16.1148 9.63345C16.2161 9.82922 16.3778 9.9877 16.5756 10.0851C16.7996 10.1953 17.0657 10.1901 17.5976 10.1798L18.4024 10.1642C19.2763 10.1472 19.7132 10.1388 20.0613 10.3057C20.3673 10.4525 20.6138 10.699 20.7606 11.005C20.9275 11.3531 20.9191 11.79 20.9021 12.6639L20.8864 13.4687C20.8761 14.0006 20.871 14.2666 20.9812 14.4907C21.0786 14.6884 21.2371 14.8502 21.4328 14.9515C21.6546 15.0663 21.9207 15.0663 22.4528 15.0663H22V15.8C22 16.9201 22 17.4802 21.782 17.908C21.5903 18.2843 21.2843 18.5903 20.908 18.782C20.4802 19 19.9201 19 18.8 19H5.2C4.0799 19 3.51984 19 3.09202 18.782C2.71569 18.5903 2.40973 18.2843 2.21799 17.908C2 17.4802 2 16.9201 2 15.8V8.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 4V14.5C14 15.8807 12.8807 17 11.5 17C10.1193 17 9 15.8807 9 14.5C9 13.1193 10.1193 12 11.5 12C12.3949 12 13.18 12.4701 13.6227 13.1763V7.5L20 6V11.5C20 12.8807 18.8807 14 17.5 14C16.1193 14 15 12.8807 15 11.5C15 10.1193 16.1193 9 17.5 9C18.3949 9 19.18 9.47014 19.6227 10.1763V4L14 5.5V4Z" fill="currentColor"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 21H19C20.1046 21 21 20.1046 21 19V7.82843C21 7.29799 20.7893 6.78929 20.4142 6.41421L17.5858 3.58579C17.2107 3.21071 16.702 3 16.1716 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 3V8H16V3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 21V14H16V21" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  'file-alt': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 17H15M9 13H15M9 9H10M13 3H8.2C7.0799 3 6.51984 3 6.09202 3.21799C5.71569 3.40973 5.40973 3.71569 5.21799 4.09202C5 4.51984 5 5.0799 5 6.2V17.8C5 18.9201 5 19.4802 5.21799 19.908C5.40973 20.2843 5.71569 20.5903 6.09202 20.782C6.51984 21 7.0799 21 8.2 21H15.8C16.9201 21 17.4802 21 17.908 20.782C18.2843 20.5903 18.5903 20.2843 18.782 19.908C19 19.4802 19 18.9201 19 17.8V9M13 3L19 9M13 3V7.4C13 7.96005 13 8.24008 13.109 8.45399C13.2049 8.64215 13.3578 8.79513 13.546 8.89101C13.7599 9 14.0399 9 14.6 9H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'box-archive': '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 14H15M4.6 10H19.4C19.9601 10 20.2401 10 20.454 9.89101C20.6422 9.79513 20.7951 9.64215 20.891 9.45399C21 9.24008 21 8.96005 21 8.4V5.6C21 5.03995 21 4.75992 20.891 4.54601C20.7951 4.35785 20.6422 4.20487 20.454 4.10899C20.2401 4 19.9601 4 19.4 4H4.6C4.03995 4 3.75992 4 3.54601 4.10899C3.35785 4.20487 3.20487 4.35785 3.10899 4.54601C3 4.75992 3 5.03995 3 5.6V8.4C3 8.96005 3 9.24008 3.10899 9.45399C3.20487 9.64215 3.35785 9.79513 3.54601 9.89101C3.75992 10 4.03995 10 4.6 10ZM5 10H19V16.8C19 17.9201 19 18.4802 18.782 18.908C18.5903 19.2843 18.2843 19.5903 17.908 19.782C17.4802 20 16.9201 20 15.8 20H8.2C7.07989 20 6.51984 20 6.09202 19.782C5.71569 19.5903 5.40973 19.2843 5.21799 18.908C5 18.4802 5 17.9201 5 16.8V10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 8L3 11.6923L7 16M17 8L21 11.6923L17 16M14 4L10 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3V21M9 21H15M19 6V3H5V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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

  const request = fetch(`${iconBaseUrl}${name}.svg`, { cache: 'force-cache' })
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
