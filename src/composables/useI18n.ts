import { storeToRefs } from 'pinia'
import { useI18nStore } from '@/stores/i18n'

export function useI18n() {
  const store = useI18nStore()
  const { language, loaded } = storeToRefs(store)

  return {
    language,
    loaded,
    t: store.t,
    setLanguage: store.loadLanguage
  }
}
