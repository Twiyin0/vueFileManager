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
          console.log('\n📝 检测到程序内部保存 config.yml，跳过开发环境热重启')
          return
        }

        console.log('\n🔄 检测到手动修改 config.yml，正在重启开发服务...')
        const time = new Date()
        fs.utimesSync(serverEntryPath, time, time)
      }, 500)
    })
  } catch {
    // ignore watcher failures in restricted environments
  }
}
