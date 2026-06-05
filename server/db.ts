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

  CREATE TABLE IF NOT EXISTS guest_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_path TEXT NOT NULL,
    storage_pool_id INTEGER NOT NULL,
    label TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
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

// 迁移：给 shares 表加 storage_pool_id 列
function migrateSharePoolId() {
  try {
    const cols = db.prepare("PRAGMA table_info(shares)").all() as any[]
    const hasPoolId = cols.some((c: any) => c.name === 'storage_pool_id')
    if (!hasPoolId) {
      db.exec('ALTER TABLE shares ADD COLUMN storage_pool_id INTEGER')
      db.exec(`
        UPDATE shares SET storage_pool_id = (
          SELECT id FROM storage_pools WHERE user_id = shares.user_id AND is_default = 1 LIMIT 1
        ) WHERE storage_pool_id IS NULL
      `)
      console.log('✅ 已添加 shares.storage_pool_id 字段')
    }
  } catch (err) {
    console.error('⚠️ storage_pool_id 字段迁移失败:', err)
  }
}
migrateSharePoolId()

// 迁移：将现有 guest_path 迁移到 guest_shares 表
function migrateGuestShares() {
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='guest_shares'").get() as any
    if (!hasTable) return

    const existing = db.prepare('SELECT COUNT(*) as count FROM guest_shares').get() as any
    if (existing.count > 0) return

    // 将 user_settings 中有 guest_enabled 且有 guest_path 的记录迁移
    const rows = db.prepare(`
      SELECT us.user_id, us.guest_path, sp.id as pool_id
      FROM user_settings us
      JOIN storage_pools sp ON sp.user_id = us.user_id AND sp.is_default = 1
      WHERE us.guest_enabled = 1 AND us.guest_path != ''
    `).all() as any[]

    const insert = db.prepare('INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label) VALUES (?, ?, ?, ?)')
    for (const row of rows) {
      insert.run(row.user_id, row.guest_path, row.pool_id, row.guest_path.split('/').pop() || '根目录')
    }

    if (rows.length > 0) {
      console.log(`✅ 已迁移 ${rows.length} 条访客分享记录`)
    }
  } catch (err) {
    console.error('⚠️ guest_shares 迁移失败:', err)
  }
}
migrateGuestShares()

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

// 迁移：创建 IP 黑名单表
function migrateIpBlacklist() {
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ip_blacklist'").get() as any
    if (!hasTable) {
      db.exec(`
        CREATE TABLE ip_blacklist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_pattern TEXT NOT NULL,
          reason TEXT DEFAULT '',
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `)
      console.log('✅ 已创建 ip_blacklist 表')

      // 创建 IP 白名单表
      db.exec(`
        CREATE TABLE ip_whitelist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_pattern TEXT NOT NULL,
          reason TEXT DEFAULT '',
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `)
      console.log('✅ 已创建 ip_whitelist 表')

      // 创建 IP 列表配置表（单行，存储模式）
      db.exec(`
        CREATE TABLE ip_list_config (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          mode TEXT NOT NULL DEFAULT 'blacklist' CHECK(mode IN ('blacklist', 'whitelist'))
        )
      `)
      db.prepare('INSERT OR IGNORE INTO ip_list_config (id, mode) VALUES (1, ?)').run(config.ip_list_mode || 'blacklist')
      console.log('✅ 已创建 ip_list_config 表')
    }
  } catch (err) {
    console.error('⚠️ ip_blacklist 表迁移失败:', err)
  }
}
migrateIpBlacklist()

// 迁移：创建 IP 白名单表（已有安装）
function migrateIpWhitelist() {
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ip_whitelist'").get() as any
    if (!hasTable) {
      db.exec(`
        CREATE TABLE ip_whitelist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ip_pattern TEXT NOT NULL,
          reason TEXT DEFAULT '',
          created_by INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `)
      console.log('✅ 已创建 ip_whitelist 表')

      // 清理旧数据：将黑名单中残留的本地回环条目迁移到白名单
      const stale = db.prepare("SELECT * FROM ip_blacklist WHERE ip_pattern IN ('127.0.0.1', '::1', 'localhost')").all() as any[]
      if (stale.length > 0) {
        const insert = db.prepare('INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)')
        const del = db.prepare("DELETE FROM ip_blacklist WHERE ip_pattern IN ('127.0.0.1', '::1', 'localhost')")
        for (const row of stale) {
          insert.run(row.ip_pattern, row.reason, row.created_by)
        }
        del.run()
        console.log(`✅ 已将 ${stale.length} 条本地回环记录从黑名单迁移到白名单`)
      }
    }
  } catch (err) {
    console.error('⚠️ ip_whitelist 表迁移失败:', err)
  }
}
migrateIpWhitelist()

// 迁移：创建 IP 列表配置表
function migrateIpListConfig() {
  try {
    const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ip_list_config'").get() as any
    if (!hasTable) {
      db.exec(`
        CREATE TABLE ip_list_config (
          id INTEGER PRIMARY KEY CHECK(id = 1),
          mode TEXT NOT NULL DEFAULT 'blacklist' CHECK(mode IN ('blacklist', 'whitelist'))
        )
      `)
      db.prepare('INSERT INTO ip_list_config (id, mode) VALUES (1, ?)').run(config.ip_list_mode || 'blacklist')
      console.log('✅ 已创建 ip_list_config 表')
    }
  } catch (err) {
    console.error('⚠️ ip_list_config 表迁移失败:', err)
  }
}
migrateIpListConfig()

// 迁移：给 guest_shares 表加 permissions 列
function migrateGuestSharePermissions() {
  try {
    const cols = db.prepare("PRAGMA table_info(guest_shares)").all() as any[]
    if (!cols.some((c: any) => c.name === 'permissions')) {
      db.exec("ALTER TABLE guest_shares ADD COLUMN permissions TEXT DEFAULT 'preview,download'")
      console.log('✅ 已添加 guest_shares.permissions 字段')
    }
  } catch (err) {
    console.error('⚠️ guest_shares.permissions 迁移失败:', err)
  }
}
migrateGuestSharePermissions()

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
