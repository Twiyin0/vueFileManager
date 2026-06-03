import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '..', 'data', 'filemanager.db')

// 确保 data 目录存在
import fs from 'fs'
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

const db = new Database(dbPath)

// 启用 WAL 模式提高并发性能
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    banned INTEGER DEFAULT 0,
    register_ip TEXT,
    last_login_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    guest_enabled INTEGER DEFAULT 0,
    guest_path TEXT DEFAULT '',
    theme TEXT DEFAULT 'system' CHECK(theme IN ('light', 'dark', 'system')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS storage_pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    storage_type TEXT NOT NULL CHECK(storage_type IN ('local', 'upyun')),
    is_default INTEGER DEFAULT 0,
    config TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    key TEXT UNIQUE NOT NULL,
    permissions TEXT DEFAULT 'read',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    share_code TEXT UNIQUE NOT NULL,
    password TEXT,
    expires_at DATETIME,
    download_count INTEGER DEFAULT 0,
    max_downloads INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    original_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('file', 'folder')),
    storage_pool_id INTEGER NOT NULL,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS favourites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK(file_type IN ('file', 'folder')),
    storage_pool_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE,
    UNIQUE(user_id, file_path, storage_pool_id)
  );
`)

// 迁移：给 users 表加 banned 列
function migrateBannedField() {
  try {
    const cols = db.prepare("PRAGMA table_info(users)").all() as any[]
    const hasBanned = cols.some((c: any) => c.name === 'banned')
    if (!hasBanned) {
      db.exec('ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0')
      console.log('✅ 已添加 users.banned 字段')
    }
  } catch (err) {
    console.error('⚠️ banned 字段迁移失败:', err)
  }
}
migrateBannedField()

// 迁移：给 users 表加 last_login_at 列
function migrateLastLoginAt() {
  try {
    const cols = db.prepare("PRAGMA table_info(users)").all() as any[]
    const hasCol = cols.some((c: any) => c.name === 'last_login_at')
    if (!hasCol) {
      db.exec('ALTER TABLE users ADD COLUMN last_login_at DATETIME')
      console.log('✅ 已添加 users.last_login_at 字段')
    }
  } catch (err) {
    console.error('⚠️ last_login_at 字段迁移失败:', err)
  }
}
migrateLastLoginAt()

// 迁移：给 shares 表加 sign_key 列
function migrateShareSignKey() {
  try {
    const cols = db.prepare("PRAGMA table_info(shares)").all() as any[]
    const hasSignKey = cols.some((c: any) => c.name === 'sign_key')
    if (!hasSignKey) {
      db.exec('ALTER TABLE shares ADD COLUMN sign_key TEXT')
      console.log('✅ 已添加 shares.sign_key 字段')
    }
  } catch (err) {
    console.error('⚠️ sign_key 字段迁移失败:', err)
  }
}
migrateShareSignKey()

// 迁移现有用户设置到存储池表
function migrateStorageSettings() {
  try {
    // 检查旧表是否有存储相关字段
    const tableInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[]
    const hasStorageFields = tableInfo.some((col: any) => col.name === 'storage_type')

    if (hasStorageFields) {
      console.log('🔄 迁移现有存储设置到存储池表...')

      // 获取所有有存储设置的用户
      const usersWithSettings = db.prepare(`
        SELECT user_id, storage_type, local_path, upyun_operator, upyun_password, upyun_bucket, upyun_endpoint
        FROM user_settings
        WHERE storage_type IS NOT NULL
      `).all() as any[]

      for (const setting of usersWithSettings) {
        let config: any = {}

        if (setting.storage_type === 'local') {
          config = { localPath: setting.local_path || './uploads' }
        } else if (setting.storage_type === 'upyun') {
          config = {
            upyunOperator: setting.upyun_operator || '',
            upyunPassword: setting.upyun_password || '',
            upyunBucket: setting.upyun_bucket || '',
            upyunEndpoint: setting.upyun_endpoint || 'v0.api.upyun.com'
          }
        }

        // 检查是否已有存储池
        const existingPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ?').get(setting.user_id) as any

        if (!existingPool) {
          // 创建默认存储池
          db.prepare(`
            INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
            VALUES (?, ?, ?, 1, ?)
          `).run(
            setting.user_id,
            '默认存储',
            setting.storage_type,
            JSON.stringify(config)
          )
        }
      }

      // 重建 user_settings 表（移除存储字段）
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings_new (
          user_id INTEGER PRIMARY KEY,
          guest_enabled INTEGER DEFAULT 0,
          guest_path TEXT DEFAULT '',
          theme TEXT DEFAULT 'system' CHECK(theme IN ('light', 'dark', 'system')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        INSERT INTO user_settings_new (user_id, guest_enabled, guest_path, theme)
        SELECT user_id, guest_enabled, guest_path, theme FROM user_settings;

        DROP TABLE user_settings;

        ALTER TABLE user_settings_new RENAME TO user_settings;
      `)

      console.log('✅ 存储设置迁移完成')
    }
  } catch (err) {
    console.error('⚠️ 存储设置迁移失败:', err)
  }
}

// 执行迁移
migrateStorageSettings()

// 如果没有管理员用户，创建默认管理员
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin')
if (!adminExists) {
  // 使用 config.yml 中的 MD5 密码
  const result = db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  ).run(config.admin.username, config.admin.password, 'admin')
  const userId = result.lastInsertRowid as number

  db.prepare(
    'INSERT INTO user_settings (user_id) VALUES (?)'
  ).run(userId)

  // 从 config.yml 读取存储池配置
  const pools = config.storage_pools || [{ name: '本地存储', type: 'local', default: true, config: { localPath: './uploads' } }]
  for (const pool of pools) {
    db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config))
  }

  console.log(`✅ 默认管理员账户已创建: ${config.admin.username}`)
}

// 从配置文件同步存储池（更新已有用户的默认存储池）
export function syncStoragePoolsFromConfig(userId: number) {
  const pools = config.storage_pools
  if (!pools || pools.length === 0) return

  // 检查用户是否已有存储池
  const existing = db.prepare('SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?').get(userId) as any
  if (existing.count > 0) return

  // 为新用户创建配置文件中的存储池
  for (const pool of pools) {
    db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config))
  }
}

export default db
