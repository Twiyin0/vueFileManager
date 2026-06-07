import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import config from '../config'

interface ThemeManifest {
  name: string
  version: string
  description?: string
  author?: string
  enabled?: boolean
  style: string
}

interface LoadedTheme {
  manifest: ThemeManifest
  dirPath: string
}

const loadedThemes: LoadedTheme[] = []

function getThemesDir(): string {
  return path.resolve(config.plugins?.dir || './plugins')
}

/** 加载所有主题插件 */
export function loadPlugins(): void {
  if (!config.plugins?.enabled) {
    console.log('🎨 主题系统已禁用')
    return
  }

  const themesDir = getThemesDir()
  console.log('🎨 主题目录:', themesDir)

  if (!fs.existsSync(themesDir)) {
    fs.mkdirSync(themesDir, { recursive: true })
    console.log('🎨 已创建主题目录')
    return
  }

  const entries = fs.readdirSync(themesDir, { withFileTypes: true })
  let loaded = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(themesDir, entry.name, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue

    try {
      const raw = fs.readFileSync(manifestPath, 'utf8')
      const manifest: ThemeManifest = JSON.parse(raw)
      console.log(`  🎨 发现主题: ${entry.name}, enabled=${manifest.enabled}, style=${manifest.style}`)
      if (manifest.enabled === false) continue
      if (!manifest.style) continue

      loadedThemes.push({ manifest, dirPath: path.join(themesDir, entry.name) })
      loaded++
    } catch (err: any) {
      console.error(`  ⚠️ 加载主题 ${entry.name} 失败:`, err.message)
    }
  }

  console.log(`🎨 已加载 ${loaded} 个主题`)
}

/** 获取所有主题的 CSS 路径 */
export function getThemeStyles(): { name: string; cssPath: string }[] {
  return loadedThemes.map(t => ({
    name: t.manifest.name,
    cssPath: `/plugins/${t.manifest.name}/${t.manifest.style}`,
  }))
}

/** 获取所有主题列表（含禁用） */
export function getAllThemes(): { name: string; version: string; description: string; enabled: boolean }[] {
  if (!config.plugins?.enabled) return []
  const themesDir = getThemesDir()
  if (!fs.existsSync(themesDir)) return []

  const entries = fs.readdirSync(themesDir, { withFileTypes: true })
  const themes: { name: string; version: string; description: string; enabled: boolean }[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(themesDir, entry.name, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const m: ThemeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (!m.style) continue // 只显示有 style 的主题
      themes.push({
        name: m.name || entry.name,
        version: m.version || '0.0.0',
        description: m.description || '',
        enabled: m.enabled !== false,
      })
    } catch {}
  }
  return themes
}

/** 切换主题启用/禁用 */
export function toggleTheme(name: string, enabled: boolean): boolean {
  const manifestPath = path.join(getThemesDir(), name, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return false
  try {
    const manifest: ThemeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.enabled = enabled
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    return true
  } catch { return false }
}
