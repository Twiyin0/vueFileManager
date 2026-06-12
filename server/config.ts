import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { resolveFromRoot } from './runtime-paths'

const configPath = resolveFromRoot('config.yml')

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
  storage_root: string
  upload_limit: number
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
  storage_root: './uploads',
  upload_limit: 100,
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
      name: '本地存储',
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

function mergeConfig(loaded: any): Config {
  return {
    admin: { ...defaultConfig.admin, ...loaded.admin },
    server: { ...defaultConfig.server, ...loaded.server },
    storage_root: loaded.storage_root || defaultConfig.storage_root,
    upload_limit: loaded.upload_limit || defaultConfig.upload_limit,
    resumable_upload_cache_minutes: loaded.resumable_upload_cache_minutes ?? defaultConfig.resumable_upload_cache_minutes,
    ip_list_mode: loaded.ip_list_mode || defaultConfig.ip_list_mode,
    site: { ...defaultConfig.site, ...loaded.site },
    database: {
      type: loaded.database?.type || defaultConfig.database.type,
      sqlite: { ...defaultConfig.database.sqlite, ...loaded.database?.sqlite },
      mysql: { ...defaultConfig.database.mysql, ...loaded.database?.mysql },
      postgres: { ...defaultConfig.database.postgres, ...loaded.database?.postgres }
    },
    storage_pools: loaded.storage_pools || defaultConfig.storage_pools,
    smtp: { ...defaultConfig.smtp, ...loaded.smtp },
    plugins: { ...defaultConfig.plugins, ...loaded.plugins }
  }
}

let config: Config = defaultConfig

try {
  if (fs.existsSync(configPath)) {
    const fileContents = fs.readFileSync(configPath, 'utf8')
    const loaded = yaml.load(fileContents) as any
    config = mergeConfig(loaded || {})
    console.log('Loaded config.yml')
  } else {
    console.log('config.yml not found, using default config')
  }
} catch (err: any) {
  console.error('Failed to load config file:', err.message, 'using default config')
}

export function updateConfigFile(mutator: (rawConfig: any) => void): Config {
  const existing = fs.existsSync(configPath)
    ? ((yaml.load(fs.readFileSync(configPath, 'utf8')) as any) || {})
    : {}

  mutator(existing)
  fs.writeFileSync(configPath, yaml.dump(existing, { lineWidth: -1 }), 'utf8')
  config = mergeConfig(existing)
  return config
}

export default config
export { configPath }
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
