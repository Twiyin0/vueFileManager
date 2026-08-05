import config from './config'
import type { AppLanguage } from './config'
import type { DatabaseAdapter } from './db-adapter'

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'en-US' ? 'en-US' : 'zh-CN'
}

function getDefaultLanguage(): AppLanguage {
  return normalizeLanguage(config.default_language)
}

export async function createBaseTables(database: DatabaseAdapter) {
  if (database.dialect === 'sqlite') {
    await database.pragma('journal_mode = WAL')
    await database.pragma('foreign_keys = ON')
    await database.exec(`
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
        theme TEXT DEFAULT 'system',
        language TEXT DEFAULT 'zh-CN',
        upload_concurrency INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS storage_pools (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        storage_type TEXT NOT NULL,
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
        file_type TEXT NOT NULL,
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
        file_type TEXT NOT NULL,
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
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS share_mount_dirs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, path)
      );

      CREATE TABLE IF NOT EXISTS share_mounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        target_path TEXT NOT NULL,
        source_pool_id INTEGER NOT NULL,
        source_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (source_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE,
        UNIQUE(user_id, target_path, source_pool_id, source_path)
      );

      CREATE TABLE IF NOT EXISTS offline_download_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        pool_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        dir_path TEXT DEFAULT '',
        file_name TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        progress INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER,
        downloaded_bytes INTEGER NOT NULL DEFAULT 0,
        error_message TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS thumbnail_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        storage_pool_id INTEGER,
        file_path TEXT NOT NULL,
        file_modified TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        output_path TEXT DEFAULT '',
        mime_type TEXT DEFAULT '',
        duration INTEGER,
        error TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );
    `)
    return
  }

  if (database.dialect === 'mysql') {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(32) DEFAULT 'user',
        banned TINYINT(1) DEFAULT 0,
        register_ip VARCHAR(255),
        last_login_ip VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        user_id BIGINT PRIMARY KEY,
        guest_enabled TINYINT(1) DEFAULT 0,
        guest_path TEXT,
        theme VARCHAR(32) DEFAULT 'system',
        language VARCHAR(16) DEFAULT 'zh-CN',
        upload_concurrency INT DEFAULT 0,
        CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS storage_pools (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        storage_type VARCHAR(64) NOT NULL,
        is_default TINYINT(1) DEFAULT 0,
        config LONGTEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_storage_pools_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        name VARCHAR(255) NOT NULL,
        \`key\` VARCHAR(255) UNIQUE NOT NULL,
        permissions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS shares (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        file_path TEXT NOT NULL,
        file_type VARCHAR(32) NOT NULL,
        share_code VARCHAR(255) UNIQUE NOT NULL,
        password TEXT,
        expires_at DATETIME NULL,
        download_count INT DEFAULT 0,
        max_downloads INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS trash (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        original_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type VARCHAR(32) NOT NULL,
        storage_pool_id BIGINT NOT NULL,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_trash_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_trash_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS favourites (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_type VARCHAR(32) NOT NULL,
        storage_pool_id BIGINT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_favourites_user_path_pool (user_id, file_path(255), storage_pool_id),
        CONSTRAINT fk_favourites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_favourites_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS guest_shares (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        folder_path TEXT NOT NULL,
        storage_pool_id BIGINT NOT NULL,
        label TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_guest_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_guest_shares_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS share_mount_dirs (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_share_mount_dirs_user_path (user_id, path(255)),
        CONSTRAINT fk_share_mount_dirs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS share_mounts (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        target_path TEXT NOT NULL,
        source_pool_id BIGINT NOT NULL,
        source_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_share_mounts_user_target_source (user_id, target_path(255), source_pool_id, source_path(255)),
        CONSTRAINT fk_share_mounts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_share_mounts_pool FOREIGN KEY (source_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS offline_download_tasks (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        user_id BIGINT NOT NULL,
        pool_id BIGINT NOT NULL,
        url TEXT NOT NULL,
        dir_path TEXT DEFAULT '',
        file_name TEXT DEFAULT '',
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        progress INT NOT NULL DEFAULT 0,
        total_bytes BIGINT NULL,
        downloaded_bytes BIGINT NOT NULL DEFAULT 0,
        error_message TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_offline_tasks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_offline_tasks_pool FOREIGN KEY (pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS thumbnail_cache (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        cache_key VARCHAR(64) UNIQUE NOT NULL,
        user_id BIGINT NOT NULL,
        storage_pool_id BIGINT NULL,
        file_path TEXT NOT NULL,
        file_modified TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        provider VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        output_path TEXT,
        mime_type VARCHAR(128),
        duration BIGINT NULL,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_thumbnail_cache_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_thumbnail_cache_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      );
    `)
    return
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      banned INTEGER DEFAULT 0,
      register_ip TEXT,
      last_login_ip TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      guest_enabled INTEGER DEFAULT 0,
      guest_path TEXT DEFAULT '',
      theme TEXT DEFAULT 'system',
      language TEXT DEFAULT 'zh-CN',
      upload_concurrency INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS storage_pools (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      storage_type TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      config TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT UNIQUE NOT NULL,
      permissions TEXT DEFAULT 'read',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shares (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      share_code TEXT UNIQUE NOT NULL,
      password TEXT,
      expires_at TIMESTAMP NULL,
      download_count INTEGER DEFAULT 0,
      max_downloads INTEGER NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trash (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      storage_pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS favourites (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      storage_pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, file_path, storage_pool_id)
    );

    CREATE TABLE IF NOT EXISTS guest_shares (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      storage_pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      label TEXT DEFAULT '',
      password TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS share_mount_dirs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, path)
    );

    CREATE TABLE IF NOT EXISTS share_mounts (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_path TEXT NOT NULL,
      source_pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      source_path TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, target_path, source_pool_id, source_path)
    );

    CREATE TABLE IF NOT EXISTS offline_download_tasks (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      dir_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      total_bytes BIGINT,
      downloaded_bytes BIGINT NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS thumbnail_cache (
      id BIGSERIAL PRIMARY KEY,
      cache_key VARCHAR(64) UNIQUE NOT NULL,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      storage_pool_id BIGINT REFERENCES storage_pools(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_modified TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      provider VARCHAR(64) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      output_path TEXT DEFAULT '',
      mime_type VARCHAR(128) DEFAULT '',
      duration BIGINT,
      error TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

async function addColumnIfMissing(db: DatabaseAdapter, tableName: string, columnName: string, definition: string) {
  const exists = await db.columnExists(tableName, columnName)
  if (exists) return
  await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

async function migrateBannedField(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'users', 'banned', db.dialect === 'mysql' ? 'TINYINT(1) DEFAULT 0' : 'INTEGER DEFAULT 0')
}

async function migrateLastLoginAt(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'users', 'last_login_at', db.dialect === 'postgres' ? 'TIMESTAMP NULL' : 'DATETIME NULL')
}

async function migrateShareSignKey(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'shares', 'sign_key', 'TEXT')
}

async function migrateSharePoolId(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'shares', 'storage_pool_id', db.dialect === 'mysql' || db.dialect === 'postgres' ? 'BIGINT NULL' : 'INTEGER NULL')

  const pools = await db.prepare(`
    SELECT sp.user_id, sp.id
    FROM storage_pools sp
    WHERE sp.is_default = 1
  `).all<{ user_id: number; id: number }>()

  for (const pool of pools) {
    await db.prepare(`
      UPDATE shares
      SET storage_pool_id = ?
      WHERE user_id = ? AND storage_pool_id IS NULL
    `).run(pool.id, pool.user_id)
  }

  await db.exec(`
    UPDATE shares
    SET storage_pool_id = (
      SELECT id FROM storage_pools
      WHERE storage_pools.user_id = shares.user_id AND storage_pools.is_default = 1
      ORDER BY storage_pools.id ASC
      LIMIT 1
    )
    WHERE storage_pool_id IS NULL
  `)
}

async function migrateGuestShares(db: DatabaseAdapter) {
  const hasTable = await db.tableExists('guest_shares')
  if (!hasTable) return

  const existing = await db.prepare('SELECT COUNT(*) as count FROM guest_shares').get<{ count: number }>()
  if ((existing?.count || 0) > 0) return

  const rows = await db.prepare(`
    SELECT us.user_id, us.guest_path, sp.id as pool_id
    FROM user_settings us
    JOIN storage_pools sp ON sp.user_id = us.user_id AND sp.is_default = 1
    WHERE us.guest_enabled = 1 AND us.guest_path != ''
  `).all<{ user_id: number; guest_path: string; pool_id: number }>()

  const insert = db.prepare('INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label) VALUES (?, ?, ?, ?)')
  for (const row of rows) {
    await insert.run(row.user_id, row.guest_path, row.pool_id, row.guest_path.split('/').pop() || 'root')
  }
}

async function migrateStorageSettings(db: DatabaseAdapter) {
  const hasStorageType = await db.columnExists('user_settings', 'storage_type')
  if (!hasStorageType) return

  const usersWithSettings = await db.prepare(`
    SELECT user_id, storage_type, local_path, upyun_operator, upyun_password, upyun_bucket, upyun_endpoint
    FROM user_settings
    WHERE storage_type IS NOT NULL
  `).all<any>()

  for (const setting of usersWithSettings) {
    let poolConfig: Record<string, any> = {}
    if (setting.storage_type === 'local') {
      poolConfig = { localPath: setting.local_path || './uploads' }
    } else if (setting.storage_type === 'upyun') {
      poolConfig = {
        upyunOperator: setting.upyun_operator || '',
        upyunPassword: setting.upyun_password || '',
        upyunBucket: setting.upyun_bucket || '',
        upyunEndpoint: setting.upyun_endpoint || 'v0.api.upyun.com'
      }
    }

    const existingPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ?').get(setting.user_id)
    if (!existingPool) {
      await db.prepare(`
        INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
        VALUES (?, ?, ?, 1, ?)
      `).run(setting.user_id, 'Default Storage', setting.storage_type, JSON.stringify(poolConfig))
    }
  }
}

async function migrateIpTables(db: DatabaseAdapter) {
  const hasBlacklist = await db.tableExists('ip_blacklist')
  if (!hasBlacklist) {
    await db.exec(`
      CREATE TABLE ip_blacklist (
        id ${db.dialect === 'postgres' ? 'BIGSERIAL' : db.dialect === 'mysql' ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db.dialect === 'mysql' || db.dialect === 'postgres' ? 'BIGINT' : 'INTEGER'},
        created_at ${db.dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  const hasWhitelist = await db.tableExists('ip_whitelist')
  if (!hasWhitelist) {
    await db.exec(`
      CREATE TABLE ip_whitelist (
        id ${db.dialect === 'postgres' ? 'BIGSERIAL' : db.dialect === 'mysql' ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db.dialect === 'mysql' || db.dialect === 'postgres' ? 'BIGINT' : 'INTEGER'},
        created_at ${db.dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  const hasConfig = await db.tableExists('ip_list_config')
  if (!hasConfig) {
    await db.exec(`
      CREATE TABLE ip_list_config (
        id ${db.dialect === 'postgres' ? 'INTEGER PRIMARY KEY' : db.dialect === 'mysql' ? 'INT PRIMARY KEY' : 'INTEGER PRIMARY KEY'},
        mode TEXT NOT NULL DEFAULT 'blacklist'
      )
    `)
  }

  const row = await db.prepare('SELECT id FROM ip_list_config WHERE id = 1').get()
  if (!row) {
    await db.prepare('INSERT INTO ip_list_config (id, mode) VALUES (1, ?)').run(config.ip_list_mode || 'blacklist')
  }
}

async function migrateGuestSharePermissions(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'guest_shares', 'permissions', "TEXT DEFAULT 'preview,download'")
}

async function migrateGuestSharePassword(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'guest_shares', 'password', 'TEXT')
}

async function migrateTrashDeletedBy(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'trash', 'deleted_by', "TEXT DEFAULT ''")
}

async function migrateGuestPermissionsV2(db: DatabaseAdapter) {
  const shares = await db.prepare('SELECT id, permissions FROM guest_shares').all<{ id: number; permissions: string }>()
  for (const share of shares) {
    if (!share.permissions) continue
    const perms = share.permissions.split(',').map((item) => item.trim())
    const newPerms: string[] = []
    if (perms.includes('preview') || perms.includes('download') || perms.includes('read')) newPerms.push('read')
    if (perms.includes('upload') || perms.includes('write')) newPerms.push('write')
    if (perms.includes('edit') || perms.includes('rename')) newPerms.push('edit')
    if (perms.includes('delete')) newPerms.push('delete')
    const deduped = [...new Set(newPerms)]
    const nextValue = deduped.join(',')
    if (nextValue && nextValue !== share.permissions) {
      await db.prepare('UPDATE guest_shares SET permissions = ? WHERE id = ?').run(nextValue, share.id)
    }
  }
}

async function migrateVerificationCodes(db: DatabaseAdapter) {
  const hasTable = await db.tableExists('verification_codes')
  if (hasTable) return

  await db.exec(`
    CREATE TABLE verification_codes (
      id ${db.dialect === 'postgres' ? 'BIGSERIAL PRIMARY KEY' : db.dialect === 'mysql' ? 'BIGINT PRIMARY KEY AUTO_INCREMENT' : 'INTEGER PRIMARY KEY AUTOINCREMENT'},
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'register',
      expires_at TEXT NOT NULL,
      used ${db.dialect === 'mysql' ? 'TINYINT(1)' : 'INTEGER'} DEFAULT 0,
      created_at ${db.dialect === 'postgres' ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function migrateUserEmail(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'users', 'email', 'TEXT')
}

async function migrateUserVerified(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'users', 'verified', db.dialect === 'mysql' ? 'TINYINT(1) DEFAULT 1' : 'INTEGER DEFAULT 1')
}

async function migrateStorageQuota(db: DatabaseAdapter) {
  await addColumnIfMissing(
    db,
    'users',
    'storage_quota',
    db.dialect === 'mysql' || db.dialect === 'postgres' ? 'BIGINT DEFAULT 10737418240' : 'INTEGER DEFAULT 10737418240'
  )
}

async function migrateUploadConcurrency(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'user_settings', 'upload_concurrency', db.dialect === 'mysql' ? 'INT DEFAULT 0' : 'INTEGER DEFAULT 0')
}

async function migrateUserLanguage(db: DatabaseAdapter) {
  await addColumnIfMissing(db, 'user_settings', 'language', db.dialect === 'mysql' ? "VARCHAR(16) DEFAULT 'zh-CN'" : "TEXT DEFAULT 'zh-CN'")

  const defaultLanguage = getDefaultLanguage()
  await db.prepare(`
    UPDATE user_settings
    SET language = ?
    WHERE language IS NULL OR language = ''
  `).run(defaultLanguage)
}

async function migrateCleanLocalPath(db: DatabaseAdapter) {
  const pools = await db.prepare("SELECT id, config FROM storage_pools WHERE storage_type = 'local'").all<{ id: number; config: string }>()
  for (const pool of pools) {
    try {
      const parsed = JSON.parse(pool.config || '{}')
      if (!parsed.localPath) continue
      if (!parsed.path) {
        parsed.path = parsed.localPath
      }
      delete parsed.localPath
      await db.prepare('UPDATE storage_pools SET config = ? WHERE id = ?').run(JSON.stringify(parsed), pool.id)
    } catch {
      // ignore invalid config rows
    }
  }
}

async function migrateThumbnailCache(db: DatabaseAdapter) {
  const hasTable = await db.tableExists('thumbnail_cache')
  if (hasTable) return

  if (db.dialect === 'mysql') {
    await db.exec(`
      CREATE TABLE thumbnail_cache (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        cache_key VARCHAR(64) UNIQUE NOT NULL,
        user_id BIGINT NOT NULL,
        storage_pool_id BIGINT NULL,
        file_path TEXT NOT NULL,
        file_modified TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        provider VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        output_path TEXT,
        mime_type VARCHAR(128),
        duration BIGINT NULL,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_thumbnail_cache_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_thumbnail_cache_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
      )
    `)
    return
  }

  if (db.dialect === 'postgres') {
    await db.exec(`
      CREATE TABLE thumbnail_cache (
        id BIGSERIAL PRIMARY KEY,
        cache_key VARCHAR(64) UNIQUE NOT NULL,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        storage_pool_id BIGINT REFERENCES storage_pools(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        file_modified TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        provider VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        output_path TEXT DEFAULT '',
        mime_type VARCHAR(128) DEFAULT '',
        duration BIGINT,
        error TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    return
  }

  await db.exec(`
    CREATE TABLE thumbnail_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      storage_pool_id INTEGER,
      file_path TEXT NOT NULL,
      file_modified TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output_path TEXT DEFAULT '',
      mime_type TEXT DEFAULT '',
      duration INTEGER,
      error TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
    )
  `)
}

async function ensureAdminUser(db: DatabaseAdapter) {
  const adminExists = await db.prepare('SELECT id FROM users WHERE role = ?').get('admin')
  if (adminExists) return

  const result = await db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  ).run(config.admin.username, config.admin.password, 'admin')
  const userId = result.lastInsertRowid as number

  await db.prepare('INSERT INTO user_settings (user_id, language) VALUES (?, ?)').run(userId, getDefaultLanguage())

  const pools = config.storage_pools || [{ name: 'Local Storage', type: 'local', default: true, config: {} }]
  for (const pool of pools) {
    await db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config))
  }
}

export async function syncStoragePoolsFromConfig(db: DatabaseAdapter, userId: number) {
  const pools = config.storage_pools
  if (!pools || pools.length === 0) return

  const existing = await db.prepare('SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?').get<{ count: number }>(userId)
  if ((existing?.count || 0) > 0) return

  for (const pool of pools) {
    await db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config))
  }
}

export interface InitializeDatabaseOptions {
  ensureAdmin?: boolean
}

export async function initializeDatabase(db: DatabaseAdapter, options: InitializeDatabaseOptions = {}) {
  await createBaseTables(db)
  await migrateBannedField(db)
  await migrateLastLoginAt(db)
  await migrateShareSignKey(db)
  await migrateSharePoolId(db)
  await migrateGuestShares(db)
  await migrateStorageSettings(db)
  await migrateIpTables(db)
  await migrateGuestSharePermissions(db)
  await migrateGuestSharePassword(db)
  await migrateTrashDeletedBy(db)
  await migrateGuestPermissionsV2(db)
  await migrateVerificationCodes(db)
  await migrateUserEmail(db)
  await migrateUserVerified(db)
  await migrateStorageQuota(db)
  await migrateUploadConcurrency(db)
  await migrateUserLanguage(db)
  await migrateCleanLocalPath(db)
  await migrateThumbnailCache(db)
  if (options.ensureAdmin !== false) {
    await ensureAdminUser(db)
  }
}
