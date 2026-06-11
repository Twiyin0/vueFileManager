import fs from 'fs'
import path from 'path'

export function watchConfigFile(rootDir: string, serverEntryPath: string) {
  const configFilePath = path.join(rootDir, 'config.yml')
  let configWatchDebounce: NodeJS.Timeout | null = null

  try {
    fs.watch(configFilePath, () => {
      if (configWatchDebounce) return
      configWatchDebounce = setTimeout(() => {
        configWatchDebounce = null
        console.log('\n🔄 检测到 config.yml 变更，正在重启...')
        const time = new Date()
        fs.utimesSync(serverEntryPath, time, time)
      }, 500)
    })
  } catch {
    // ignore watcher failures in restricted environments
  }
}
