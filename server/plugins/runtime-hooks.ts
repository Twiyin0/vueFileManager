import type { RemoteUrlTransformContext, RemoteUrlTransformer } from './types'

interface RegisteredRemoteUrlTransformer {
  pluginName: string
  transform: RemoteUrlTransformer
}

const remoteUrlTransformers: RegisteredRemoteUrlTransformer[] = []

export function clearPluginRuntimeHooks() {
  remoteUrlTransformers.length = 0
}

export function registerRemoteUrlTransformer(pluginName: string, transform: RemoteUrlTransformer) {
  remoteUrlTransformers.push({ pluginName, transform })
}

export async function applyRemoteUrlTransformers(context: RemoteUrlTransformContext): Promise<string> {
  let currentUrl = context.url

  for (const hook of remoteUrlTransformers) {
    try {
      const nextUrl = await hook.transform({
        ...context,
        url: currentUrl
      })
      if (typeof nextUrl === 'string' && nextUrl.trim()) {
        currentUrl = nextUrl
      }
    } catch (error) {
      console.error(`[plugin:${hook.pluginName}] Remote URL transform failed`, error)
    }
  }

  return currentUrl
}
