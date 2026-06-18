import fs from 'fs'
import path from 'path'

interface WatchConfigFileOptions {
  enabled?: boolean
  shouldSkipRestart?: () => boolean
}

export function watchConfigFile(
  rootDir: string,
  serverEntryPath: string,
  options: WatchConfigFileOptions = {}
) {
  if (options.enabled === false) return

  const configFilePath = path.join(rootDir, 'config.yml')
  let configWatchDebounce: NodeJS.Timeout | null = null

  try {
    fs.watch(configFilePath, () => {
      if (configWatchDebounce) return
      configWatchDebounce = setTimeout(() => {
        configWatchDebounce = null

        if (options.shouldSkipRestart?.()) {
          console.log('\nDetected internal config.yml write. Skipping dev hot restart.')
          return
        }

        console.log('\nDetected manual config.yml change. Restarting dev server...')
        const time = new Date()
        fs.utimesSync(serverEntryPath, time, time)
      }, 500)
    })
  } catch {
    // ignore watcher failures in restricted environments
  }
}
