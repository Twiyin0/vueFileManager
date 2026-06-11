export type PluginKind = 'theme' | 'feature'

export interface BasePluginManifest {
  name: string
  version: string
  description?: string
  author?: string
  enabled?: boolean
  kind?: PluginKind
}

export interface ThemePluginManifest extends BasePluginManifest {
  kind?: 'theme'
  style: string
}

export interface FeaturePluginManifest extends BasePluginManifest {
  kind: 'feature'
  entry?: string
  capabilities?: string[]
  docs?: string
}

export type PluginManifest = ThemePluginManifest | FeaturePluginManifest

export interface PluginRecord {
  id: string
  dirName: string
  dirPath: string
  manifestPath: string
  manifest: PluginManifest
  kind: PluginKind
  enabled: boolean
}

export interface PublicPluginSummary {
  id: string
  name: string
  version: string
  description: string
  author: string
  enabled: boolean
  kind: PluginKind
  capabilities: string[]
  docs?: string
  entry?: string
  assetBasePath: string
}
