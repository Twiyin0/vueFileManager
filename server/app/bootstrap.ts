import './db-init'
import { loadPlugins } from '../plugins/loader'
import { startOfflineDownloadWorker } from '../services/offline-download'

let bootstrapped = false

export function bootstrapApp() {
  if (bootstrapped) return
  bootstrapped = true

  loadPlugins()
  startOfflineDownloadWorker()
}
