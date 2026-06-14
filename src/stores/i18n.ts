import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import YAML from 'yaml'

export type AppLanguage = 'zh-CN' | 'en-US'

type Dictionary = Record<string, any>

function getValueByPath(dictionary: Dictionary, path: string): string | undefined {
  const segments = path.split('.')
  let current: any = dictionary

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined
    }
    current = current[segment]
  }

  return typeof current === 'string' ? current : undefined
}

export const useI18nStore = defineStore('i18n', () => {
  const language = ref<AppLanguage>('zh-CN')
  const dictionary = ref<Dictionary>({})
  const loaded = ref(false)

  const htmlLang = computed(() => language.value)

  async function loadLanguage(nextLanguage: AppLanguage) {
    const response = await fetch(`/i18n/${nextLanguage}.yml`, { cache: 'no-cache' })
    if (!response.ok) {
      throw new Error(`Failed to load locale file: ${nextLanguage}`)
    }

    const content = await response.text()
    dictionary.value = (YAML.parse(content) as Dictionary) || {}
    language.value = nextLanguage
    loaded.value = true
    document.documentElement.lang = nextLanguage
  }

  async function initialize(defaultLanguage: AppLanguage) {
    await loadLanguage(defaultLanguage)
  }

  function t(key: string, fallback?: string) {
    return getValueByPath(dictionary.value, key) || fallback || key
  }

  return {
    language,
    dictionary,
    loaded,
    htmlLang,
    initialize,
    loadLanguage,
    t
  }
})
