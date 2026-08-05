import fs from 'node:fs'
import path from 'node:path'

const CONFIG_FILE_NAME = 'config.json'
const SUPPORTED_OPERATIONS = new Set(['remote-upload', 'offline-download'])

let cachedMtimeMs = -1
let cachedRules = []
let lastConfigError = ''

function normalizeRule(rule) {
  const sourceHost = String(rule?.sourceHost ?? '').trim().toLowerCase()
  const targetHost = String(rule?.targetHost ?? '').trim()
  if (!sourceHost || !targetHost) {
    return null
  }

  const operations = Array.isArray(rule?.operations)
    ? rule.operations
      .map((item) => String(item ?? '').trim())
      .filter((item) => SUPPORTED_OPERATIONS.has(item))
    : null

  return {
    sourceHost,
    targetHost,
    operations
  }
}

function loadRules(pluginDir, logger) {
  const configPath = path.join(pluginDir, CONFIG_FILE_NAME)

  try {
    const stat = fs.statSync(configPath)
    if (stat.mtimeMs === cachedMtimeMs) {
      return cachedRules
    }

    const raw = fs.readFileSync(configPath, 'utf8')
    const parsed = JSON.parse(raw)
    cachedRules = Array.isArray(parsed?.rules)
      ? parsed.rules
        .map((rule) => normalizeRule(rule))
        .filter(Boolean)
      : []
    cachedMtimeMs = stat.mtimeMs
    lastConfigError = ''
    return cachedRules
  } catch (error) {
    cachedMtimeMs = -1
    cachedRules = []

    const nextError = error instanceof Error ? error.message : String(error)
    if (nextError !== lastConfigError) {
      logger.warn(`Unable to load ${CONFIG_FILE_NAME}: ${nextError}`)
      lastConfigError = nextError
    }

    return cachedRules
  }
}

function rewriteRemoteUrl(inputUrl, rule) {
  try {
    const targetUrl = new URL(inputUrl)
    const currentHost = targetUrl.host.toLowerCase()
    const currentHostname = targetUrl.hostname.toLowerCase()

    if (currentHost !== rule.sourceHost && currentHostname !== rule.sourceHost) {
      return inputUrl
    }

    targetUrl.host = rule.targetHost
    return targetUrl.toString()
  } catch {
    return inputUrl
  }
}

export async function setup(context) {
  context.hooks.registerRemoteUrlTransformer(({ url, operation }) => {
    const rules = loadRules(context.pluginDir, context.logger)
    if (rules.length === 0) {
      return url
    }

    for (const rule of rules) {
      if (rule.operations && !rule.operations.includes(operation)) {
        continue
      }

      const nextUrl = rewriteRemoteUrl(url, rule)
      if (nextUrl !== url) {
        return nextUrl
      }
    }

    return url
  })

  context.logger.info('Registered remote transfer mirror hook')
}
