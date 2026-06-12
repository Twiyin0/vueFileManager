// server/config.ts
import fs from "fs";
import yaml from "js-yaml";

// server/runtime-paths.ts
import path from "path";
var appRoot = process.cwd();
function resolveFromRoot(...segments) {
  return path.resolve(appRoot, ...segments);
}

// server/config.ts
var configPath = resolveFromRoot("config.yml");
var defaultConfig = {
  admin: {
    username: "admin",
    password: "21232f297a57a5a743894a0e4a801fc3"
  },
  server: {
    port: 3e3,
    host: "",
    jwt_secret: "vue-file-manager-secret-key-2024"
  },
  storage_root: "./uploads",
  upload_limit: 100,
  resumable_upload_cache_minutes: 120,
  ip_list_mode: "blacklist",
  site: {
    icp_beian: "",
    police_beian: ""
  },
  database: {
    type: "sqlite",
    sqlite: {
      path: "./data/filemanager.db"
    },
    mysql: {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "",
      database: "vue_file_manager",
      ssl: false
    },
    postgres: {
      host: "127.0.0.1",
      port: 5432,
      user: "postgres",
      password: "",
      database: "vue_file_manager",
      ssl: false
    }
  },
  storage_pools: [
    {
      name: "\u672C\u5730\u5B58\u50A8",
      type: "local",
      default: true,
      config: {}
    }
  ],
  smtp: {
    enabled: false,
    host: "",
    port: 465,
    secure: true,
    user: "",
    pass: "",
    from: ""
  },
  plugins: {
    enabled: true,
    dir: "./plugins"
  }
};
function mergeConfig(loaded) {
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
  };
}
var config = defaultConfig;
try {
  if (fs.existsSync(configPath)) {
    const fileContents = fs.readFileSync(configPath, "utf8");
    const loaded = yaml.load(fileContents);
    config = mergeConfig(loaded || {});
    console.log("Loaded config.yml");
  } else {
    console.log("config.yml not found, using default config");
  }
} catch (err) {
  console.error("Failed to load config file:", err.message, "using default config");
}
var config_default = config;

// server/db-adapter.ts
import fs3 from "fs";
import path3 from "path";
import mysql from "mysql2/promise";
import { Pool as PostgresPool } from "pg";

// server/db-sqljs.ts
import fs2 from "fs";
import path2 from "path";
import initSqlJs from "sql.js";
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
function assertNoPendingWal(filePath) {
  const walPath = `${filePath}-wal`;
  if (!fs2.existsSync(walPath)) return;
  const walStat = fs2.statSync(walPath);
  if (walStat.size <= 0) return;
  throw new Error(
    [
      `Detected pending SQLite WAL data at ${walPath}.`,
      "sql.js can only open the main .db file and cannot replay the existing .db-wal log.",
      "Before switching to sql.js, checkpoint the database with the old SQLite runtime or sqlite3 CLI.",
      `Example: sqlite3 "${filePath}" "PRAGMA wal_checkpoint(FULL);"`
    ].join(" ")
  );
}
var SqlJsStatement = class {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }
  database;
  sql;
  normalizeParams(params) {
    return params.map((value) => value === void 0 ? null : value);
  }
  get(...params) {
    const stmt = this.database.raw.prepare(this.sql);
    try {
      if (params.length > 0) stmt.bind(this.normalizeParams(params));
      if (!stmt.step()) return void 0;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }
  all(...params) {
    const stmt = this.database.raw.prepare(this.sql);
    try {
      if (params.length > 0) stmt.bind(this.normalizeParams(params));
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
  run(...params) {
    const stmt = this.database.raw.prepare(this.sql);
    try {
      if (params.length > 0) stmt.run(this.normalizeParams(params));
      else stmt.run();
    } finally {
      stmt.free();
    }
    const changes = this.database.raw.getRowsModified();
    const rowIdRow = this.database.raw.exec("SELECT last_insert_rowid() AS id");
    const lastInsertRowid = rowIdRow[0]?.values?.[0]?.[0];
    this.database.flush();
    return {
      changes,
      lastInsertRowid: Number(lastInsertRowid || 0)
    };
  }
};
var SqlJsCompatDatabase = class {
  constructor(raw, filePath) {
    this.raw = raw;
    this.filePath = filePath;
  }
  raw;
  filePath;
  prepare(sql) {
    return new SqlJsStatement(this, sql);
  }
  exec(sql) {
    const result = this.raw.exec(sql);
    this.flush();
    return result;
  }
  pragma(statement) {
    const normalized = statement.trim().toUpperCase();
    if (normalized === "JOURNAL_MODE = WAL") return [{ journal_mode: "memory" }];
    return this.raw.exec(`PRAGMA ${statement}`);
  }
  flush() {
    fs2.writeFileSync(this.filePath, Buffer.from(this.raw.export()));
  }
};
async function createSqlJsCompatDatabase(filePath) {
  fs2.mkdirSync(path2.dirname(filePath), { recursive: true });
  assertNoPendingWal(filePath);
  const sqlJsDistDir = path2.dirname(require2.resolve("sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({
    locateFile: (file) => path2.join(sqlJsDistDir, file)
  });
  const dbBuffer = fs2.existsSync(filePath) ? fs2.readFileSync(filePath) : void 0;
  const rawDb = new SQL.Database(dbBuffer ? new Uint8Array(dbBuffer) : void 0);
  return new SqlJsCompatDatabase(rawDb, filePath);
}

// server/db-adapter.ts
var INSERT_ID_TABLES = /* @__PURE__ */ new Set([
  "users",
  "storage_pools",
  "api_keys",
  "shares",
  "trash",
  "favourites",
  "guest_shares",
  "ip_blacklist",
  "ip_whitelist",
  "verification_codes",
  "offline_download_tasks"
]);
function normalizeParams(params) {
  return params.map((value) => value === void 0 ? null : value);
}
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";
    if (char === "'" && !inDouble && prev !== "\\") {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle && prev !== "\\") {
      inDouble = !inDouble;
    }
    if (char === ";" && !inSingle && !inDouble) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}
function getInsertTableName(sql) {
  const match = sql.match(/^\s*INSERT(?:\s+OR\s+IGNORE|\s+IGNORE)?\s+INTO\s+("?)([a-zA-Z_][\w]*)\1/i);
  return match?.[2]?.toLowerCase();
}
function transformCommonSql(sql, dialect) {
  let nextSql = sql.trim();
  nextSql = nextSql.replace(
    /datetime\('now',\s*'-1 minute'\)/gi,
    dialect === "mysql" ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)" : "CURRENT_TIMESTAMP - INTERVAL '1 minute'"
  );
  nextSql = nextSql.replace(
    /datetime\('now'\)/gi,
    dialect === "mysql" ? "UTC_TIMESTAMP()" : "CURRENT_TIMESTAMP"
  );
  if (dialect === "mysql") {
    nextSql = nextSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO");
    return nextSql;
  }
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(nextSql)) {
    nextSql = nextSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO");
    if (!/ON\s+CONFLICT/i.test(nextSql)) {
      nextSql = `${nextSql} ON CONFLICT DO NOTHING`;
    }
  }
  let index = 0;
  nextSql = nextSql.replace(/\?/g, () => `$${++index}`);
  return nextSql;
}
var SqlitePreparedStatement = class {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }
  database;
  sql;
  async get(...params) {
    return this.database.prepare(this.sql).get(...normalizeParams(params));
  }
  async all(...params) {
    return this.database.prepare(this.sql).all(...normalizeParams(params));
  }
  async run(...params) {
    return this.database.prepare(this.sql).run(...normalizeParams(params));
  }
};
var SqliteAdapter = class {
  constructor(database) {
    this.database = database;
  }
  database;
  dialect = "sqlite";
  prepare(sql) {
    return new SqlitePreparedStatement(this.database, sql);
  }
  async exec(sql) {
    let lastResult;
    for (const statement of splitStatements(sql)) {
      lastResult = this.database.exec(statement);
    }
    return lastResult;
  }
  async pragma(statement) {
    return this.database.pragma(statement);
  }
  async tableExists(tableName) {
    const row = await this.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(tableName);
    return !!row;
  }
  async columnExists(tableName, columnName) {
    const columns = await this.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.some((column) => column.name === columnName);
  }
  async listColumns(tableName) {
    const columns = await this.prepare(`PRAGMA table_info(${tableName})`).all();
    return columns.map((column) => column.name);
  }
  async close() {
  }
};
var MysqlPreparedStatement = class {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
  }
  pool;
  sql;
  transformedSql() {
    return transformCommonSql(this.sql, "mysql");
  }
  async get(...params) {
    const [rows] = await this.pool.query(this.transformedSql(), normalizeParams(params));
    return rows[0];
  }
  async all(...params) {
    const [rows] = await this.pool.query(this.transformedSql(), normalizeParams(params));
    return rows;
  }
  async run(...params) {
    const [result] = await this.pool.query(this.transformedSql(), normalizeParams(params));
    return {
      changes: Number(result.affectedRows || 0),
      lastInsertRowid: Number(result.insertId || 0)
    };
  }
};
var MysqlAdapter = class {
  constructor(pool) {
    this.pool = pool;
  }
  pool;
  dialect = "mysql";
  prepare(sql) {
    return new MysqlPreparedStatement(this.pool, sql);
  }
  async exec(sql) {
    let lastResult;
    for (const statement of splitStatements(sql)) {
      const [result] = await this.pool.query(statement);
      lastResult = result;
    }
    return lastResult;
  }
  async pragma(_statement) {
    return [];
  }
  async tableExists(tableName) {
    const row = await this.prepare(
      "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?"
    ).get(tableName);
    return !!row;
  }
  async columnExists(tableName, columnName) {
    const row = await this.prepare(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?"
    ).get(tableName, columnName);
    return !!row;
  }
  async listColumns(tableName) {
    const rows = await this.prepare(
      "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION ASC"
    ).all(tableName);
    return rows.map((row) => row.COLUMN_NAME);
  }
  async close() {
    await this.pool.end();
  }
};
var PostgresPreparedStatement = class {
  constructor(pool, sql) {
    this.pool = pool;
    this.sql = sql;
  }
  pool;
  sql;
  transformedSql(forRun = false) {
    let nextSql = transformCommonSql(this.sql, "postgres");
    if (forRun) {
      const tableName = getInsertTableName(this.sql);
      if (tableName && INSERT_ID_TABLES.has(tableName) && !/RETURNING\s+/i.test(nextSql)) {
        nextSql = `${nextSql} RETURNING id`;
      }
    }
    return nextSql;
  }
  async get(...params) {
    const result = await this.pool.query(this.transformedSql(), normalizeParams(params));
    return result.rows[0];
  }
  async all(...params) {
    const result = await this.pool.query(this.transformedSql(), normalizeParams(params));
    return result.rows;
  }
  async run(...params) {
    const result = await this.pool.query(this.transformedSql(true), normalizeParams(params));
    const firstRow = result.rows[0];
    return {
      changes: Number(result.rowCount || 0),
      lastInsertRowid: firstRow?.id ? Number(firstRow.id) : 0
    };
  }
};
var PostgresAdapter = class {
  constructor(pool) {
    this.pool = pool;
  }
  pool;
  dialect = "postgres";
  prepare(sql) {
    return new PostgresPreparedStatement(this.pool, sql);
  }
  async exec(sql) {
    let lastResult;
    for (const statement of splitStatements(sql)) {
      lastResult = await this.pool.query(statement);
    }
    return lastResult;
  }
  async pragma(_statement) {
    return [];
  }
  async tableExists(tableName) {
    const row = await this.prepare(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?"
    ).get(tableName);
    return !!row;
  }
  async columnExists(tableName, columnName) {
    const row = await this.prepare(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?"
    ).get(tableName, columnName);
    return !!row;
  }
  async listColumns(tableName) {
    const rows = await this.prepare(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position ASC"
    ).all(tableName);
    return rows.map((row) => row.column_name);
  }
  async close() {
    await this.pool.end();
  }
};
async function createDatabaseAdapter(database) {
  if (database.type === "sqlite") {
    const dbPath = resolveFromRoot(database.sqlite.path || "./data/filemanager.db");
    fs3.mkdirSync(path3.dirname(dbPath), { recursive: true });
    const sqliteDb = await createSqlJsCompatDatabase(dbPath);
    return new SqliteAdapter(sqliteDb);
  }
  if (database.type === "mysql") {
    const pool2 = mysql.createPool({
      host: database.mysql.host,
      port: database.mysql.port,
      user: database.mysql.user,
      password: database.mysql.password,
      database: database.mysql.database,
      ssl: database.mysql.ssl ? {} : void 0,
      connectionLimit: 10
    });
    return new MysqlAdapter(pool2);
  }
  const pool = new PostgresPool({
    host: database.postgres.host,
    port: database.postgres.port,
    user: database.postgres.user,
    password: database.postgres.password,
    database: database.postgres.database,
    ssl: database.postgres.ssl ? { rejectUnauthorized: false } : void 0,
    max: 10
  });
  return new PostgresAdapter(pool);
}

// server/db-bootstrap.ts
async function createBaseTables(database) {
  if (database.dialect === "sqlite") {
    await database.pragma("journal_mode = WAL");
    await database.pragma("foreign_keys = ON");
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
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
    `);
    return;
  }
  if (database.dialect === "mysql") {
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_guest_shares_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_guest_shares_pool FOREIGN KEY (storage_pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
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
    `);
    return;
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
      theme TEXT DEFAULT 'system'
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
      UNIQUE(user_id, file_path, storage_pool_id)
    );

    CREATE TABLE IF NOT EXISTS guest_shares (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_path TEXT NOT NULL,
      storage_pool_id BIGINT NOT NULL REFERENCES storage_pools(id) ON DELETE CASCADE,
      label TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      total_bytes BIGINT NULL,
      downloaded_bytes BIGINT NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
async function addColumnIfMissing(db, tableName, columnName, definition) {
  const exists = await db.columnExists(tableName, columnName);
  if (!exists) {
    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
async function migrateBannedField(db) {
  await addColumnIfMissing(db, "users", "banned", db.dialect === "mysql" ? "TINYINT(1) DEFAULT 0" : "INTEGER DEFAULT 0");
}
async function migrateLastLoginAt(db) {
  await addColumnIfMissing(db, "users", "last_login_at", db.dialect === "postgres" ? "TIMESTAMP NULL" : "DATETIME NULL");
}
async function migrateShareSignKey(db) {
  await addColumnIfMissing(db, "shares", "sign_key", "TEXT");
}
async function migrateSharePoolId(db) {
  const exists = await db.columnExists("shares", "storage_pool_id");
  if (exists) return;
  await db.exec(`ALTER TABLE shares ADD COLUMN storage_pool_id ${db.dialect === "mysql" || db.dialect === "postgres" ? "BIGINT" : "INTEGER"}`);
  await db.exec(`
    UPDATE shares
    SET storage_pool_id = (
      SELECT id FROM storage_pools
      WHERE storage_pools.user_id = shares.user_id AND storage_pools.is_default = 1
      ORDER BY storage_pools.id ASC
      LIMIT 1
    )
    WHERE storage_pool_id IS NULL
  `);
}
async function migrateGuestShares(db) {
  const hasTable = await db.tableExists("guest_shares");
  if (!hasTable) return;
  const existing = await db.prepare("SELECT COUNT(*) as count FROM guest_shares").get();
  if ((existing?.count || 0) > 0) return;
  const rows = await db.prepare(`
    SELECT us.user_id, us.guest_path, sp.id as pool_id
    FROM user_settings us
    JOIN storage_pools sp ON sp.user_id = us.user_id AND sp.is_default = 1
    WHERE us.guest_enabled = 1 AND us.guest_path != ''
  `).all();
  const insert = db.prepare("INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label) VALUES (?, ?, ?, ?)");
  for (const row of rows) {
    await insert.run(row.user_id, row.guest_path, row.pool_id, row.guest_path.split("/").pop() || "root");
  }
}
async function migrateStorageSettings(db) {
  const hasStorageType = await db.columnExists("user_settings", "storage_type");
  if (!hasStorageType) return;
  const usersWithSettings = await db.prepare(`
    SELECT user_id, storage_type, local_path, upyun_operator, upyun_password, upyun_bucket, upyun_endpoint
    FROM user_settings
    WHERE storage_type IS NOT NULL
  `).all();
  for (const setting of usersWithSettings) {
    let poolConfig = {};
    if (setting.storage_type === "local") {
      poolConfig = { localPath: setting.local_path || "./uploads" };
    } else if (setting.storage_type === "upyun") {
      poolConfig = {
        upyunOperator: setting.upyun_operator || "",
        upyunPassword: setting.upyun_password || "",
        upyunBucket: setting.upyun_bucket || "",
        upyunEndpoint: setting.upyun_endpoint || "v0.api.upyun.com"
      };
    }
    const existingPool = await db.prepare("SELECT id FROM storage_pools WHERE user_id = ?").get(setting.user_id);
    if (!existingPool) {
      await db.prepare(`
        INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
        VALUES (?, ?, ?, 1, ?)
      `).run(setting.user_id, "\u9ED8\u8BA4\u5B58\u50A8", setting.storage_type, JSON.stringify(poolConfig));
    }
  }
}
async function migrateIpTables(db) {
  const hasBlacklist = await db.tableExists("ip_blacklist");
  if (!hasBlacklist) {
    await db.exec(`
      CREATE TABLE ip_blacklist (
        id ${db.dialect === "postgres" ? "BIGSERIAL" : db.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db.dialect === "mysql" || db.dialect === "postgres" ? "BIGINT" : "INTEGER"},
        created_at ${db.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  const hasWhitelist = await db.tableExists("ip_whitelist");
  if (!hasWhitelist) {
    await db.exec(`
      CREATE TABLE ip_whitelist (
        id ${db.dialect === "postgres" ? "BIGSERIAL" : db.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db.dialect === "mysql" || db.dialect === "postgres" ? "BIGINT" : "INTEGER"},
        created_at ${db.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  const hasConfig = await db.tableExists("ip_list_config");
  if (!hasConfig) {
    await db.exec(`
      CREATE TABLE ip_list_config (
        id ${db.dialect === "postgres" ? "INTEGER PRIMARY KEY" : db.dialect === "mysql" ? "INT PRIMARY KEY" : "INTEGER PRIMARY KEY"},
        mode TEXT NOT NULL DEFAULT 'blacklist'
      )
    `);
  }
  const row = await db.prepare("SELECT id FROM ip_list_config WHERE id = 1").get();
  if (!row) {
    await db.prepare("INSERT INTO ip_list_config (id, mode) VALUES (1, ?)").run(config_default.ip_list_mode || "blacklist");
  }
}
async function migrateGuestSharePermissions(db) {
  await addColumnIfMissing(db, "guest_shares", "permissions", "TEXT DEFAULT 'preview,download'");
}
async function migrateTrashDeletedBy(db) {
  await addColumnIfMissing(db, "trash", "deleted_by", "TEXT DEFAULT ''");
}
async function migrateGuestPermissionsV2(db) {
  const shares = await db.prepare("SELECT id, permissions FROM guest_shares").all();
  for (const share of shares) {
    if (!share.permissions) continue;
    const perms = share.permissions.split(",").map((item) => item.trim());
    const newPerms = [];
    if (perms.includes("preview") || perms.includes("download") || perms.includes("read")) newPerms.push("read");
    if (perms.includes("upload") || perms.includes("write")) newPerms.push("write");
    if (perms.includes("edit") || perms.includes("rename")) newPerms.push("edit");
    if (perms.includes("delete")) newPerms.push("delete");
    const deduped = [...new Set(newPerms)];
    const nextValue = deduped.join(",");
    if (nextValue && nextValue !== share.permissions) {
      await db.prepare("UPDATE guest_shares SET permissions = ? WHERE id = ?").run(nextValue, share.id);
    }
  }
}
async function migrateVerificationCodes(db) {
  const hasTable = await db.tableExists("verification_codes");
  if (hasTable) return;
  await db.exec(`
    CREATE TABLE verification_codes (
      id ${db.dialect === "postgres" ? "BIGSERIAL PRIMARY KEY" : db.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'register',
      expires_at TEXT NOT NULL,
      used ${db.dialect === "mysql" ? "TINYINT(1)" : "INTEGER"} DEFAULT 0,
      created_at ${db.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
async function migrateUserEmail(db) {
  await addColumnIfMissing(db, "users", "email", "TEXT");
}
async function migrateUserVerified(db) {
  await addColumnIfMissing(db, "users", "verified", db.dialect === "mysql" ? "TINYINT(1) DEFAULT 1" : "INTEGER DEFAULT 1");
}
async function migrateStorageQuota(db) {
  await addColumnIfMissing(db, "users", "storage_quota", db.dialect === "mysql" || db.dialect === "postgres" ? "BIGINT DEFAULT 10737418240" : "INTEGER DEFAULT 10737418240");
}
async function migrateCleanLocalPath(db) {
  const pools = await db.prepare("SELECT id, config FROM storage_pools WHERE storage_type = 'local'").all();
  for (const pool of pools) {
    try {
      const parsed = JSON.parse(pool.config || "{}");
      if (!parsed.localPath) continue;
      delete parsed.localPath;
      await db.prepare("UPDATE storage_pools SET config = ? WHERE id = ?").run(JSON.stringify(parsed), pool.id);
    } catch {
    }
  }
}
async function ensureAdminUser(db) {
  const adminExists = await db.prepare("SELECT id FROM users WHERE role = ?").get("admin");
  if (adminExists) return;
  const result = await db.prepare(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
  ).run(config_default.admin.username, config_default.admin.password, "admin");
  const userId = result.lastInsertRowid;
  await db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
  const pools = config_default.storage_pools || [{ name: "\u672C\u5730\u5B58\u50A8", type: "local", default: true, config: {} }];
  for (const pool of pools) {
    await db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config));
  }
}
async function initializeDatabase(db, options = {}) {
  await createBaseTables(db);
  await migrateBannedField(db);
  await migrateLastLoginAt(db);
  await migrateShareSignKey(db);
  await migrateSharePoolId(db);
  await migrateGuestShares(db);
  await migrateStorageSettings(db);
  await migrateIpTables(db);
  await migrateGuestSharePermissions(db);
  await migrateTrashDeletedBy(db);
  await migrateGuestPermissionsV2(db);
  await migrateVerificationCodes(db);
  await migrateUserEmail(db);
  await migrateUserVerified(db);
  await migrateStorageQuota(db);
  await migrateCleanLocalPath(db);
  if (options.ensureAdmin !== false) {
    await ensureAdminUser(db);
  }
}

// server/db-migrate.ts
import { fileURLToPath } from "node:url";
var MIGRATION_TABLES = [
  "users",
  "user_settings",
  "storage_pools",
  "api_keys",
  "shares",
  "trash",
  "favourites",
  "guest_shares",
  "ip_blacklist",
  "ip_whitelist",
  "ip_list_config",
  "verification_codes",
  "offline_download_tasks"
];
function parseArgs(argv) {
  const options = {
    sourceSqlitePath: config_default.database.sqlite.path || "./data/filemanager.db",
    targetType: config_default.database.type,
    truncate: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source-sqlite") {
      options.sourceSqlitePath = argv[i + 1] || options.sourceSqlitePath;
      i += 1;
      continue;
    }
    if (arg === "--target") {
      const value = argv[i + 1];
      if (value === "sqlite" || value === "mysql" || value === "postgres") {
        options.targetType = value;
      }
      i += 1;
      continue;
    }
    if (arg === "--truncate") {
      options.truncate = true;
    }
  }
  return options;
}
function buildTargetConfig(targetType) {
  return {
    type: targetType,
    sqlite: { ...config_default.database.sqlite },
    mysql: { ...config_default.database.mysql },
    postgres: { ...config_default.database.postgres }
  };
}
function buildSourceSqliteConfig(sourceSqlitePath) {
  return {
    type: "sqlite",
    sqlite: {
      path: sourceSqlitePath
    },
    mysql: { ...config_default.database.mysql },
    postgres: { ...config_default.database.postgres }
  };
}
function toSerializableRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === void 0 ? null : value])
  );
}
function formatIdentifier(identifier) {
  return /^[a-zA-Z_][\w]*$/.test(identifier) ? identifier : `"${identifier.replace(/"/g, '""')}"`;
}
function buildInsertSql(tableName, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  const formattedColumns = columns.map(formatIdentifier).join(", ");
  return `INSERT INTO ${formatIdentifier(tableName)} (${formattedColumns}) VALUES (${placeholders})`;
}
async function resetTargetTable(targetDb, tableName) {
  if (targetDb.dialect === "mysql") {
    await targetDb.exec(`DELETE FROM ${tableName}`);
    if (await targetDb.columnExists(tableName, "id")) {
      await targetDb.exec(`ALTER TABLE ${tableName} AUTO_INCREMENT = 1`);
    }
    return;
  }
  if (targetDb.dialect === "postgres") {
    await targetDb.exec(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`);
    return;
  }
  await targetDb.exec(`DELETE FROM ${tableName}`);
}
async function resetTargetTables(targetDb) {
  for (const tableName of [...MIGRATION_TABLES].reverse()) {
    const exists = await targetDb.tableExists(tableName);
    if (!exists) continue;
    await resetTargetTable(targetDb, tableName);
  }
}
async function syncSequenceIfNeeded(targetDb, tableName) {
  const hasId = await targetDb.columnExists(tableName, "id");
  if (!hasId) return;
  if (targetDb.dialect === "mysql") {
    const row = await targetDb.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${tableName}`).get();
    await targetDb.exec(`ALTER TABLE ${tableName} AUTO_INCREMENT = ${Number(row?.next_id || 1)}`);
    return;
  }
  if (targetDb.dialect === "postgres") {
    const row = await targetDb.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tableName}`).get();
    const maxId = Number(row?.max_id || 0);
    await targetDb.exec(`
      SELECT setval(
        pg_get_serial_sequence('${tableName}', 'id'),
        ${maxId > 0 ? maxId : 1},
        ${maxId > 0 ? "true" : "false"}
      )
    `);
  }
}
async function migrateTable(sourceDb, targetDb, tableName) {
  const sourceExists = await sourceDb.tableExists(tableName);
  if (!sourceExists) {
    console.log(`[skip] ${tableName}: source table not found`);
    return;
  }
  const targetExists = await targetDb.tableExists(tableName);
  if (!targetExists) {
    console.log(`[skip] ${tableName}: target table not found`);
    return;
  }
  const sourceColumns = await sourceDb.listColumns(tableName);
  const targetColumns = new Set(await targetDb.listColumns(tableName));
  const commonColumns = sourceColumns.filter((column) => targetColumns.has(column));
  if (commonColumns.length === 0) {
    console.log(`[skip] ${tableName}: no common columns`);
    return;
  }
  const selectedColumns = commonColumns.map(formatIdentifier).join(", ");
  const rows = await sourceDb.prepare(`SELECT ${selectedColumns} FROM ${formatIdentifier(tableName)} ORDER BY ROWID ASC`).all();
  if (rows.length === 0) {
    console.log(`[ok] ${tableName}: 0 rows`);
    return;
  }
  const insert = targetDb.prepare(buildInsertSql(tableName, commonColumns));
  for (const rawRow of rows) {
    const row = toSerializableRow(rawRow);
    await insert.run(...commonColumns.map((column) => row[column]));
  }
  await syncSequenceIfNeeded(targetDb, tableName);
  console.log(`[ok] ${tableName}: ${rows.length} rows`);
}
async function migrateDatabase(rawArgs = process.argv.slice(2)) {
  const options = parseArgs(rawArgs);
  if (options.targetType === "sqlite") {
    throw new Error("Target database cannot be sqlite for cross-database migration");
  }
  const sourceDb = await createDatabaseAdapter(buildSourceSqliteConfig(options.sourceSqlitePath));
  const targetDb = await createDatabaseAdapter(buildTargetConfig(options.targetType));
  try {
    await initializeDatabase(targetDb, { ensureAdmin: false });
    if (options.truncate) {
      await resetTargetTables(targetDb);
    }
    for (const tableName of MIGRATION_TABLES) {
      await migrateTable(sourceDb, targetDb, tableName);
    }
    console.log(`Migration completed: sqlite -> ${options.targetType}`);
  } finally {
    await sourceDb.close();
    await targetDb.close();
  }
}
var isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  migrateDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
export {
  migrateDatabase
};
