import { onActivated, onMounted } from 'vue'

export function useKeepAliveRefresh(load: () => void | Promise<unknown>) {
  let hasActivatedOnce = false

  onMounted(() => {
    void load()
  })

  onActivated(() => {
    if (!hasActivatedOnce) {
      hasActivatedOnce = true
      return
    }
    void load()
  })
}
