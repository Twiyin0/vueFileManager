import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, '..', 'config.yml')

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
  upload_limit: number  // MB
  ip_list_mode: 'blacklist' | 'whitelist'
  site: {
    icp_beian: string
    police_beian: string
  }
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
  ip_list_mode: 'blacklist',
  site: {
    icp_beian: '',
    police_beian: ''
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

let config: Config = defaultConfig

try {
  if (fs.existsSync(configPath)) {
    const fileContents = fs.readFileSync(configPath, 'utf8')
    const loaded = yaml.load(fileContents) as any

    config = {
      admin: { ...defaultConfig.admin, ...loaded.admin },
      server: { ...defaultConfig.server, ...loaded.server },
      storage_root: loaded.storage_root || defaultConfig.storage_root,
      upload_limit: loaded.upload_limit || defaultConfig.upload_limit,
      ip_list_mode: loaded.ip_list_mode || defaultConfig.ip_list_mode,
      site: { ...defaultConfig.site, ...loaded.site },
      storage_pools: loaded.storage_pools || defaultConfig.storage_pools,
      smtp: { ...defaultConfig.smtp, ...loaded.smtp },
      plugins: { ...defaultConfig.plugins, ...loaded.plugins }
    }
    console.log('✅ 已加载配置文件 config.yml')
  } else {
    console.log('⚠️  未找到 config.yml，使用默认配置')
  }
} catch (err: any) {
  console.error('⚠️  加载配置文件失败:', err.message, '使用默认配置')
}

export default config
export type { Config, StoragePoolConfig, SmtpConfig, PluginsConfig }
