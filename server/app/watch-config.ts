import fs from 'fs'
import path from 'path'

interface WatchConfigFileOptions {
  enabled?: boolean
  internalWriteMarkerPath?: string
}

export function watchConfigFile(
  rootDir: string,
  serverEntryPath: string,
  options: WatchConfigFileOptions = {}
) {
  if (options.enabled === false) return

  const configFilePath = path.join(rootDir, 'config.yml')
  let configWatchDebounce: NodeJS.Timeout | null = null
  let skipNextRestart = false

  if (options.internalWriteMarkerPath) {
    try {
      fs.watch(options.internalWriteMarkerPath, () => {
        skipNextRestart = true
        setTimeout(() => {
          skipNextRestart = false
        }, 1500)
      })
    } catch {
      // ignore watcher failures in restricted environments
    }
  }

  try {
    fs.watch(configFilePath, () => {
      if (configWatchDebounce) return
      configWatchDebounce = setTimeout(() => {
        configWatchDebounce = null

        if (skipNextRestart) {
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
