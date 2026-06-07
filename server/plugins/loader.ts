import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '../config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface PluginManifest {
  name: string
  version: string
  description?: string
  author?: string
  type: 'theme' | 'hook' | 'storage'
  entry?: {
    style?: string
    hooks?: string
    driver?: string
  }
}

interface LoadedPlugin {
  manifest: PluginManifest
  dirPath: string
}

const loadedPlugins: LoadedPlugin[] = []

/** 获取插件目录的绝对路径 */
function getPluginsDir(): string {
  return path.resolve(config.plugins?.dir || './plugins')
}

/** 加载所有插件 */
export function loadPlugins(): void {
  if (!config.plugins?.enabled) {
    console.log('📦 插件系统已禁用')
    return
  }

  const pluginsDir = getPluginsDir()
  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
    console.log('📦 已创建插件目录:', pluginsDir)
    return
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  let loaded = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const manifestPath = path.join(pluginsDir, entry.name, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue

    try {
      const manifest: PluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const dirPath = path.join(pluginsDir, entry.name)

      loadedPlugins.push({ manifest, dirPath })
      loaded++

      // 处理 hook 类型插件
      if (manifest.type === 'hook' && manifest.entry?.hooks) {
        console.log(`  📌 hook 插件: ${manifest.name}`)
      }

      // 处理 theme 类型插件
      if (manifest.type === 'theme' && manifest.entry?.style) {
        console.log(`  🎨 theme 插件: ${manifest.name}`)
      }

      // 处理 storage 类型插件
      if (manifest.type === 'storage' && manifest.entry?.driver) {
        console.log(`  💾 storage 插件: ${manifest.name}`)
      }
    } catch (err: any) {
      console.error(`  ⚠️ 加载插件 ${entry.name} 失败:`, err.message)
    }
  }

  if (loaded > 0) {
    console.log(`📦 已加载 ${loaded} 个插件`)
  }
}

/** 获取所有主题插件的 CSS 路径 */
export function getPluginStyles(): { name: string; cssPath: string }[] {
  return loadedPlugins
    .filter(p => p.manifest.type === 'theme' && p.manifest.entry?.style)
    .map(p => ({
      name: p.manifest.name,
      cssPath: `/plugins/${p.manifest.name}/${p.manifest.entry!.style!}`,
    }))
}

/** 获取所有 hook 插件并执行 onLoad */
export async function initHookPlugins(app: any): Promise<void> {
  for (const plugin of loadedPlugins) {
    if (plugin.manifest.type !== 'hook' || !plugin.manifest.entry?.hooks) continue

    try {
      const hooksPath = path.join(plugin.dirPath, plugin.manifest.entry.hooks)
      // 动态 import 支持 .js 和 .mjs
      const hooksModule = await import(hooksPath)
      if (hooksModule.onLoad) {
        await hooksModule.onLoad(app)
        console.log(`  ✅ hook 插件 ${plugin.manifest.name} 已初始化`)
      }
    } catch (err: any) {
      console.error(`  ⚠️ hook 插件 ${plugin.manifest.name} 初始化失败:`, err.message)
    }
  }
}

/** 获取所有存储驱动插件 */
export function getStorageDrivers(): Record<string, any> {
  const drivers: Record<string, any> = {}
  for (const plugin of loadedPlugins) {
    if (plugin.manifest.type !== 'storage' || !plugin.manifest.entry?.driver) continue
    try {
      const driverPath = path.join(plugin.dirPath, plugin.manifest.entry.driver)
      const driverModule = require(driverPath)
      drivers[plugin.manifest.name] = driverModule.default || driverModule
    } catch {
      // ESM 模块需要异步加载，此处仅做同步占位
    }
  }
  return drivers
}

/** 获取已加载插件列表（供 API 返回） */
export function getLoadedPlugins(): { name: string; version: string; description: string; type: string }[] {
  return loadedPlugins.map(p => ({
    name: p.manifest.name,
    version: p.manifest.version,
    description: p.manifest.description || '',
    type: p.manifest.type,
  }))
}
