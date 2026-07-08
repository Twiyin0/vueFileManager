export type PluginKind = 'theme' | 'feature'
export type RemoteTransferOperation = 'remote-upload' | 'offline-download'

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
  server?: string
  capabilities?: string[]
  docs?: string
}

export type PluginManifest = ThemePluginManifest | FeaturePluginManifest

export interface RemoteUrlTransformContext {
  url: string
  operation: RemoteTransferOperation
  userId: number
  poolId?: number
  dirPath: string
}

export type RemoteUrlTransformer = (
  context: RemoteUrlTransformContext
) => string | void | Promise<string | void>

export interface PluginRecord {
  id: string
  dirName: string
  dirPath: string
  manifestPath: string
  manifest: PluginManifest
  kind: PluginKind
  enabled: boolean
}

export interface FeaturePluginRuntimeHooks {
  registerRemoteUrlTransformer(transformer: RemoteUrlTransformer): void
}

export interface FeaturePluginRuntimeLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string, error?: unknown): void
}

export interface FeaturePluginRuntimeContext {
  plugin: PluginRecord
  manifest: FeaturePluginManifest
  pluginDir: string
  hooks: FeaturePluginRuntimeHooks
  logger: FeaturePluginRuntimeLogger
}

export interface FeaturePluginServerModule {
  setup?: (context: FeaturePluginRuntimeContext) => void | Promise<void>
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
