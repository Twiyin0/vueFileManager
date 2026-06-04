import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const configPath = path.join(__dirname, '..', 'config.yml')

interface StoragePoolConfig {
  name: string
  type: 'local' | 'upyun'
  default: boolean
  config: {
    localPath?: string
    upyunOperator?: string
    upyunPassword?: string
    upyunBucket?: string
    upyunEndpoint?: string
  }
}

interface Config {
  admin: {
    username: string
    password: string // MD5
  }
  server: {
    port: number
    host: string
    jwt_secret: string
  }
  storage_pools: StoragePoolConfig[]
}

const defaultConfig: Config = {
  admin: {
    username: 'admin',
    password: '21232f297a57a5a743894a0e4a801fc3' // MD5("admin")
  },
  server: {
    port: 3000,
    host: '',
    jwt_secret: 'vue-file-manager-secret-key-2024'
  },
  storage_pools: [
    {
      name: '本地存储',
      type: 'local',
      default: true,
      config: { localPath: './uploads' }
    }
  ]
}

let config: Config = defaultConfig

try {
  if (fs.existsSync(configPath)) {
    const fileContents = fs.readFileSync(configPath, 'utf8')
    const loaded = yaml.load(fileContents) as any

    config = {
      admin: { ...defaultConfig.admin, ...loaded.admin },
      server: { ...defaultConfig.server, ...loaded.server },
      storage_pools: loaded.storage_pools || defaultConfig.storage_pools
    }
    console.log('✅ 已加载配置文件 config.yml')
  } else {
    console.log('⚠️  未找到 config.yml，使用默认配置')
  }
} catch (err: any) {
  console.error('⚠️  加载配置文件失败:', err.message, '使用默认配置')
}

export default config
export type { Config, StoragePoolConfig }
