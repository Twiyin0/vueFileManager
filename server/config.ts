import fs from 'fs'
import yaml from 'js-yaml'
import { isMap, isSeq, parseDocument } from 'yaml'
import { resolveFromRoot } from './runtime-paths'

const configPath = resolveFromRoot('config.yml')
const envPath = resolveFromRoot('.env')
const configWriteMarkerPath = resolveFromRoot('.config-write-marker')

export type AppLanguage = 'zh-CN' | 'en-US'

interface StoragePoolConfig {
  name: string
  type: string
  default: boolean
  config: Record<string, any>
}

interface SmtpConfig {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

interface PluginsConfig {
  enabled: boolean
  dir: string
}

interface SqliteDatabaseConfig {
  path: string
}

interface MysqlDatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

interface PostgresDatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean
}

interface DatabaseConfig {
  type: 'sqlite' | 'mysql' | 'postgres'
  sqlite: SqliteDatabaseConfig
  mysql: MysqlDatabaseConfig
  postgres: PostgresDatabaseConfig
}

interface Config {
  admin: {
    username: string
    password: string
  }
  server: {
    port: number
    host: string
    jwt_secret: string
  }
  default_language: AppLanguage
  storage_root: string
  upload_limit: number
  max_concurrent_uploads: number
  allow_user_registration: boolean
  log_level: 1 | 2 | 3
  resumable_upload_cache_minutes: number
  ip_list_mode: 'blacklist' | 'whitelist'
  site: {
    icp_beian: string
    police_beian: string
  }
  database: DatabaseConfig
  storage_pools: StoragePoolConfig[]
  smtp: SmtpConfig
  plugins: PluginsConfig
}

const defaultConfig: Config = {
  admin: {
    username: 'admin',
    password: '21232f297a57a5a743894a0e4a801fc3'
  },
  server: {
    port: 3000,
    host: '',
    jwt_secret: 'vue-file-manager-secret-key-2024'
  },
  default_language: 'zh-CN',
  storage_root: './uploads',
  upload_limit: 100,
  max_concurrent_uploads: 3,
  allow_user_registration: true,
  log_level: 2,
  resumable_upload_cache_minutes: 120,
  ip_list_mode: 'blacklist',
  site: {
    icp_beian: '',
    police_beian: ''
  },
  database: {
    type: 'sqlite',
    sqlite: {
      path: './data/filemanager.db'
    },
    mysql: {
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: '',
      database: 'vue_file_manager',
      ssl: false
    },
    postgres: {
      host: '127.0.0.1',
      port: 5432,
      user: 'postgres',
      password: '',
      database: 'vue_file_manager',
      ssl: false
    }
  },
  storage_pools: [
    {
      name: 'Default Storage',
      type: 'local',
      default: true,
      config: {}
    }
  ],
  smtp: {
    enabled: false,
    host: '',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    from: ''
  },
  plugins: {
    enabled: true,
    dir: './plugins'
  }
}

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function normalizeLogLevel(level: unknown): 1 | 2 | 3 {
  const parsed = Number(level)
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed
  }
  return 2
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  return fallback
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key || key in process.env) continue

    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function resolveDefaultLanguage(): AppLanguage {
  return normalizeLanguage(process.env.DEFAULT_LANGUAGE || defaultConfig.default_language)
}

function mergeConfig(loaded: any): Config {
  return {
    admin: { ...defaultConfig.admin, ...loaded.admin },
    server: {
      ...defaultConfig.server,
      ...loaded.server,
      port: toNumber(loaded.server?.port, defaultConfig.server.port)
    },
    default_language: resolveDefaultLanguage(),
    storage_root: loaded.storage_root || defaultConfig.storage_root,
    upload_limit: toNumber(loaded.upload_limit, defaultConfig.upload_limit),
    max_concurrent_uploads: toNumber(loaded.max_concurrent_uploads, defaultConfig.max_concurrent_uploads),
    allow_user_registration: toBoolean(
      loaded.allow_user_registration,
      defaultConfig.allow_user_registration
    ),
    log_level: normalizeLogLevel(loaded.log_level ?? process.env.LOG_LEVEL ?? defaultConfig.log_level),
    resumable_upload_cache_minutes: toNumber(
      loaded.resumable_upload_cache_minutes,
      defaultConfig.resumable_upload_cache_minutes
    ),
    ip_list_mode: loaded.ip_list_mode === 'whitelist' ? 'whitelist' : 'blacklist',
    site: { ...defaultConfig.site, ...loaded.site },
    database: {
      type: loaded.database?.type || defaultConfig.database.type,
      sqlite: { ...defaultConfig.database.sqlite, ...loaded.database?.sqlite },
      mysql: {
        ...defaultConfig.database.mysql,
        ...loaded.database?.mysql,
        port: toNumber(loaded.database?.mysql?.port, defaultConfig.database.mysql.port)
      },
      postgres: {
        ...defaultConfig.database.postgres,
        ...loaded.database?.postgres,
        port: toNumber(loaded.database?.postgres?.port, defaultConfig.database.postgres.port)
      }
    },
    storage_pools: Array.isArray(loaded.storage_pools) && loaded.storage_pools.length > 0
      ? loaded.storage_pools
      : defaultConfig.storage_pools,
    smtp: {
      ...defaultConfig.smtp,
      ...loaded.smtp,
      port: toNumber(loaded.smtp?.port, defaultConfig.smtp.port)
    },
    plugins: { ...defaultConfig.plugins, ...loaded.plugins }
  }
}

function markInternalConfigWrite() {
  try {
    fs.writeFileSync(configWriteMarkerPath, String(Date.now()), 'utf8')
  } catch {
    // ignore marker write failures
  }
}

loadEnvFile()

let config: Config = defaultConfig

try {
  if (fs.existsSync(configPath)) {
    const fileContents = fs.readFileSync(configPath, 'utf8')
    const loaded = yaml.load(fileContents) as any
    config = mergeConfig(loaded || {})
    console.log('Loaded config.yml')
  } else {
    config = mergeConfig({})
    console.log('config.yml not found, using default config')
  }
} catch (err: any) {
  console.error('Failed to load config file:', err.message, 'using default config')
  config = mergeConfig({})
}

function syncYamlNode(document: any, node: any, value: unknown): boolean {
  if (isMap(node) && isPlainObject(value)) {
    syncYamlMap(document, node, value)
    return true
  }

  if (isSeq(node) && Array.isArray(value)) {
    node.items = value.map((entry) => document.createNode(entry))
    return true
  }

  return false
}

function syncYamlMap(document: any, mapNode: any, value: Record<string, any>) {
  const nextKeys = new Set(Object.keys(value))

  for (const item of [...mapNode.items]) {
    const key = String(item.key?.value ?? item.key ?? '')
    if (!nextKeys.has(key)) {
      mapNode.delete(key)
    }
  }

  for (const [key, childValue] of Object.entries(value)) {
    const existingNode = mapNode.get(key, true)
    if (!existingNode) {
      mapNode.set(key, childValue)
      continue
    }

    if (!syncYamlNode(document, existingNode, childValue)) {
      mapNode.set(key, childValue)
    }
  }
}

export function updateConfigFile(mutator: (rawConfig: any) => void): Config {
  const configText = fs.existsSync(configPath)
    ? fs.readFileSync(configPath, 'utf8')
    : ''
  const existing = configText
    ? ((yaml.load(configText) as any) || {})
    : {}

  mutator(existing)
  delete existing.language
  delete existing.default_language

  markInternalConfigWrite()

  if (configText.trim()) {
    const document = parseDocument(configText)
    if (document.contents && isMap(document.contents) && isPlainObject(existing)) {
      syncYamlMap(document, document.contents, existing)
      fs.writeFileSync(configPath, String(document), 'utf8')
    } else {
      fs.writeFileSync(configPath, yaml.dump(existing, { lineWidth: -1 }), 'utf8')
    }
  } else {
    fs.writeFileSync(configPath, yaml.dump(existing, { lineWidth: -1 }), 'utf8')
  }

  config = mergeConfig(existing)
  return config
}

export default config
export { configPath, envPath, configWriteMarkerPath }
export type {
  Config,
  StoragePoolConfig,
  SmtpConfig,
  PluginsConfig,
  DatabaseConfig,
  SqliteDatabaseConfig,
  MysqlDatabaseConfig,
  PostgresDatabaseConfig
}
