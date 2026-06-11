import fs from 'fs'
import path from 'path'
import config from '../config'
import type {
  FeaturePluginManifest,
  PluginKind,
  PluginManifest,
  PluginRecord,
  PublicPluginSummary,
  ThemePluginManifest
} from './types'

const pluginRegistry = new Map<string, PluginRecord>()

function getPluginsDir(): string {
  return path.resolve(config.plugins?.dir || './plugins')
}

function isIgnoredEntry(name: string) {
  return name.startsWith('._') || name === '.DS_Store'
}

function normalizePluginKind(manifest: PluginManifest): PluginKind {
  if (manifest.kind === 'feature') return 'feature'
  return 'theme'
}

function isThemeManifest(manifest: PluginManifest): manifest is ThemePluginManifest {
  return normalizePluginKind(manifest) === 'theme'
}

function isSafeRelativeAssetPath(assetPath: string): boolean {
  if (!assetPath || path.isAbsolute(assetPath)) return false
  const normalized = assetPath.replace(/\\/g, '/')
  return !normalized.split('/').some((segment) => segment === '..')
}

function ensurePluginAssetPath(dirPath: string, assetPath: string, fieldName: string): string {
  if (!isSafeRelativeAssetPath(assetPath)) {
    throw new Error(`${fieldName} 只能是插件目录内的相对路径`)
  }

  const resolvedPath = path.resolve(dirPath, assetPath)
  if (!resolvedPath.startsWith(path.resolve(dirPath) + path.sep) && resolvedPath !== path.resolve(dirPath, '.')) {
    throw new Error(`${fieldName} 超出插件目录范围`)
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`${fieldName} 指向的文件不存在: ${assetPath}`)
  }
  return resolvedPath
}

function createPluginRecord(dirName: string, dirPath: string, manifestPath: string, manifest: PluginManifest): PluginRecord | null {
  const kind = normalizePluginKind(manifest)
  const enabled = manifest.enabled !== false

  if (!manifest.name || !manifest.version) {
    throw new Error('manifest 缺少 name 或 version')
  }

  if (kind === 'theme') {
    const themeManifest = manifest as ThemePluginManifest
    if (!themeManifest.style) {
      throw new Error('theme 插件缺少 style 字段')
    }
    ensurePluginAssetPath(dirPath, themeManifest.style, 'style')
  } else {
    const featureManifest = manifest as FeaturePluginManifest
    if (featureManifest.entry) {
      ensurePluginAssetPath(dirPath, featureManifest.entry, 'entry')
    }
    if (featureManifest.docs) {
      ensurePluginAssetPath(dirPath, featureManifest.docs, 'docs')
    }
  }

  return {
    id: manifest.name,
    dirName,
    dirPath,
    manifestPath,
    manifest,
    kind,
    enabled
  }
}

function loadPluginManifest(dirName: string, dirPath: string): PluginRecord | null {
  const manifestPath = path.join(dirPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null

  const raw = fs.readFileSync(manifestPath, 'utf8')
  const manifest = JSON.parse(raw) as PluginManifest
  return createPluginRecord(dirName, dirPath, manifestPath, manifest)
}

export function loadPlugins(): void {
  pluginRegistry.clear()

  if (!config.plugins?.enabled) {
    console.log('🎨 插件系统已禁用')
    return
  }

  const pluginsDir = getPluginsDir()
  console.log('🎨 插件目录:', pluginsDir)

  if (!fs.existsSync(pluginsDir)) {
    fs.mkdirSync(pluginsDir, { recursive: true })
    console.log('🎨 已创建插件目录')
    return
  }

  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
  let loaded = 0

  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnoredEntry(entry.name)) continue
    const dirPath = path.join(pluginsDir, entry.name)

    try {
      const record = loadPluginManifest(entry.name, dirPath)
      if (!record) continue

      pluginRegistry.set(record.id, record)
      console.log(`  🎨 发现插件: ${record.id}, kind=${record.kind}, enabled=${record.enabled}`)
      if (record.enabled) loaded++
    } catch (err: any) {
      console.error(`  ⚠️ 加载插件 ${entry.name} 失败:`, err.message)
    }
  }

  console.log(`🎨 已发现 ${pluginRegistry.size} 个插件，启用 ${loaded} 个`)
}

export function getPluginsDirPath() {
  return getPluginsDir()
}

export function getAllPlugins(): PluginRecord[] {
  return Array.from(pluginRegistry.values())
}

export function getEnabledPlugins(): PluginRecord[] {
  return getAllPlugins().filter((plugin) => plugin.enabled)
}

export function getEnabledThemes() {
  return getEnabledPlugins().filter((plugin) => plugin.kind === 'theme') as Array<PluginRecord & { manifest: ThemePluginManifest }>
}

export function getThemeStyles(): { name: string; cssPath: string }[] {
  return getEnabledThemes().map((plugin) => ({
    name: plugin.manifest.name,
    cssPath: `/plugins/${plugin.dirName}/${plugin.manifest.style}`,
  }))
}

export function getAllThemes(): { name: string; version: string; description: string; enabled: boolean }[] {
  return getAllPlugins()
    .filter((plugin) => plugin.kind === 'theme')
    .map((plugin) => ({
      name: plugin.manifest.name,
      version: plugin.manifest.version || '0.0.0',
      description: plugin.manifest.description || '',
      enabled: plugin.enabled,
    }))
}

export function getPluginSummaries(): PublicPluginSummary[] {
  return getAllPlugins().map((plugin) => ({
    ...(plugin.kind === 'feature'
      ? (() => {
          const manifest = plugin.manifest as FeaturePluginManifest
          return {
            capabilities: manifest.capabilities || [],
            docs: manifest.docs ? `/plugins/${plugin.dirName}/${manifest.docs}` : undefined,
            entry: manifest.entry ? `/plugins/${plugin.dirName}/${manifest.entry}` : undefined
          }
        })()
      : {
          capabilities: ['theme-style'],
          docs: undefined,
          entry: undefined
        }),
    id: plugin.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    description: plugin.manifest.description || '',
    author: plugin.manifest.author || '',
    enabled: plugin.enabled,
    kind: plugin.kind,
    assetBasePath: `/plugins/${plugin.dirName}`
  }))
}

export function togglePlugin(name: string, enabled: boolean): boolean {
  const plugin = pluginRegistry.get(name)
  if (!plugin) return false

  try {
    const manifest = JSON.parse(fs.readFileSync(plugin.manifestPath, 'utf8')) as PluginManifest
    manifest.enabled = enabled
    fs.writeFileSync(plugin.manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    pluginRegistry.set(name, {
      ...plugin,
      manifest,
      enabled
    })
    return true
  } catch {
    return false
  }
}
