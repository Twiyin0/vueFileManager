import { storeToRefs } from 'pinia'
import { useI18nStore } from '@/stores/i18n'

export function useI18n() {
  const store = useI18nStore()
  const { language, loaded } = storeToRefs(store)

  function format(key: string, fallback?: string, params: Record<string, string | number> = {}) {
    let text = store.t(key, fallback)
    for (const [name, value] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value))
    }
    return text
  }

  return {
    language,
    loaded,
    t: store.t,
    format,
    setLanguage: store.loadLanguage
  }
}
