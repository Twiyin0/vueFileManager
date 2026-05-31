import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './config.js'

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
    register_ip TEXT,
    last_login_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    storage_type TEXT DEFAULT 'local' CHECK(storage_type IN ('local', 'upyun')),
    local_path TEXT DEFAULT './uploads',
    upyun_operator TEXT DEFAULT '',
    upyun_password TEXT DEFAULT '',
    upyun_bucket TEXT DEFAULT '',
    upyun_endpoint TEXT DEFAULT 'v0.api.upyun.com',
    guest_enabled INTEGER DEFAULT 0,
    guest_path TEXT DEFAULT '',
    theme TEXT DEFAULT 'system' CHECK(theme IN ('light', 'dark', 'system')),
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
`)

// 如果没有管理员用户，创建默认管理员
const adminExists = db.prepare('SELECT id FROM users WHERE role = ?').get('admin')
if (!adminExists) {
  // 使用 config.yml 中的 MD5 密码
  const result = db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  ).run(config.admin.username, config.admin.password, 'admin')
  db.prepare(
    'INSERT INTO user_settings (user_id) VALUES (?)'
  ).run(result.lastInsertRowid)
  console.log(`✅ 默认管理员账户已创建: ${config.admin.username}`)
}

export default db
