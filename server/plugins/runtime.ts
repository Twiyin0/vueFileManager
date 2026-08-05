import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  FeaturePluginManifest,
  FeaturePluginRuntimeContext,
  FeaturePluginServerModule,
  PluginRecord,
  RemoteUrlTransformContext
} from './types'
import {
  applyRemoteUrlTransformers,
  clearPluginRuntimeHooks,
  registerRemoteUrlTransformer
} from './runtime-hooks'

let runtimeReady: Promise<void> = Promise.resolve()

function isRuntimeFeaturePlugin(plugin: PluginRecord): plugin is PluginRecord & { manifest: FeaturePluginManifest } {
  return plugin.enabled && plugin.kind === 'feature' && !!(plugin.manifest as FeaturePluginManifest).server
}

function createPluginLogger(pluginName: string) {
  return {
    info(message: string) {
      console.log(`[plugin:${pluginName}] ${message}`)
    },
    warn(message: string) {
      console.warn(`[plugin:${pluginName}] ${message}`)
    },
    error(message: string, error?: unknown) {
      console.error(`[plugin:${pluginName}] ${message}`, error)
    }
  }
}

function resolvePluginSetup(moduleValue: unknown) {
  const moduleRecord = moduleValue as Record<string, any>
  if (typeof moduleRecord.setup === 'function') {
    return moduleRecord.setup as FeaturePluginServerModule['setup']
  }
  if (typeof moduleRecord.default === 'function') {
    return moduleRecord.default as FeaturePluginServerModule['setup']
  }
  if (moduleRecord.default && typeof moduleRecord.default.setup === 'function') {
    return moduleRecord.default.setup as FeaturePluginServerModule['setup']
  }
  return null
}

async function loadFeaturePluginRuntime(plugin: PluginRecord & { manifest: FeaturePluginManifest }) {
  const logger = createPluginLogger(plugin.id)
  const serverEntry = plugin.manifest.server
  if (!serverEntry) return

  const moduleUrl = pathToFileURL(path.resolve(plugin.dirPath, serverEntry)).href
  const runtimeModule = await import(moduleUrl)
  const setup = resolvePluginSetup(runtimeModule)

  if (!setup) {
    logger.warn(`Skipped runtime module because it does not export a setup() function: ${serverEntry}`)
    return
  }

  const context: FeaturePluginRuntimeContext = {
    plugin,
    manifest: plugin.manifest,
    pluginDir: plugin.dirPath,
    hooks: {
      registerRemoteUrlTransformer(transformer) {
        registerRemoteUrlTransformer(plugin.id, transformer)
      }
    },
    logger
  }

  await setup(context)
  logger.info(`Loaded server runtime from ${serverEntry}`)
}

export function reloadPluginRuntime(plugins: PluginRecord[]) {
  clearPluginRuntimeHooks()
  runtimeReady = (async () => {
    for (const plugin of plugins) {
      if (!isRuntimeFeaturePlugin(plugin)) continue
      try {
        await loadFeaturePluginRuntime(plugin)
      } catch (error) {
        console.error(`[plugin:${plugin.id}] Failed to load server runtime`, error)
      }
    }
  })()
}

export async function resolveRemoteUrlThroughPlugins(context: RemoteUrlTransformContext) {
  await runtimeReady
  return applyRemoteUrlTransformers(context)
}
