var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/runtime-paths.ts
import path from "path";
function resolveFromRoot(...segments) {
  return path.resolve(appRoot, ...segments);
}
var appRoot;
var init_runtime_paths = __esm({
  "server/runtime-paths.ts"() {
    "use strict";
    appRoot = process.cwd();
  }
});

// server/config.ts
import fs from "fs";
import yaml from "js-yaml";
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
function updateConfigFile(mutator) {
  const existing = fs.existsSync(configPath) ? yaml.load(fs.readFileSync(configPath, "utf8")) || {} : {};
  mutator(existing);
  fs.writeFileSync(configPath, yaml.dump(existing, { lineWidth: -1 }), "utf8");
  config = mergeConfig(existing);
  return config;
}
var configPath, defaultConfig, config, config_default;
var init_config = __esm({
  "server/config.ts"() {
    "use strict";
    init_runtime_paths();
    configPath = resolveFromRoot("config.yml");
    defaultConfig = {
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
    config = defaultConfig;
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
    config_default = config;
  }
});

// server/db-sqljs.ts
import fs2 from "fs";
import path2 from "path";
import initSqlJs from "sql.js";
import { createRequire } from "module";
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
var require2, SqlJsStatement, SqlJsCompatDatabase;
var init_db_sqljs = __esm({
  "server/db-sqljs.ts"() {
    "use strict";
    require2 = createRequire(import.meta.url);
    SqlJsStatement = class {
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
    SqlJsCompatDatabase = class {
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
  }
});

// server/db-adapter.ts
import fs3 from "fs";
import path3 from "path";
import mysql from "mysql2/promise";
import { Pool as PostgresPool } from "pg";
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
var INSERT_ID_TABLES, SqlitePreparedStatement, SqliteAdapter, MysqlPreparedStatement, MysqlAdapter, PostgresPreparedStatement, PostgresAdapter;
var init_db_adapter = __esm({
  "server/db-adapter.ts"() {
    "use strict";
    init_db_sqljs();
    init_runtime_paths();
    INSERT_ID_TABLES = /* @__PURE__ */ new Set([
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
    SqlitePreparedStatement = class {
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
    SqliteAdapter = class {
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
    MysqlPreparedStatement = class {
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
    MysqlAdapter = class {
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
    PostgresPreparedStatement = class {
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
    PostgresAdapter = class {
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
  }
});

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
async function addColumnIfMissing(db2, tableName, columnName, definition) {
  const exists = await db2.columnExists(tableName, columnName);
  if (!exists) {
    await db2.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
async function migrateBannedField(db2) {
  await addColumnIfMissing(db2, "users", "banned", db2.dialect === "mysql" ? "TINYINT(1) DEFAULT 0" : "INTEGER DEFAULT 0");
}
async function migrateLastLoginAt(db2) {
  await addColumnIfMissing(db2, "users", "last_login_at", db2.dialect === "postgres" ? "TIMESTAMP NULL" : "DATETIME NULL");
}
async function migrateShareSignKey(db2) {
  await addColumnIfMissing(db2, "shares", "sign_key", "TEXT");
}
async function migrateSharePoolId(db2) {
  const exists = await db2.columnExists("shares", "storage_pool_id");
  if (exists) return;
  await db2.exec(`ALTER TABLE shares ADD COLUMN storage_pool_id ${db2.dialect === "mysql" || db2.dialect === "postgres" ? "BIGINT" : "INTEGER"}`);
  await db2.exec(`
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
async function migrateGuestShares(db2) {
  const hasTable = await db2.tableExists("guest_shares");
  if (!hasTable) return;
  const existing = await db2.prepare("SELECT COUNT(*) as count FROM guest_shares").get();
  if ((existing?.count || 0) > 0) return;
  const rows = await db2.prepare(`
    SELECT us.user_id, us.guest_path, sp.id as pool_id
    FROM user_settings us
    JOIN storage_pools sp ON sp.user_id = us.user_id AND sp.is_default = 1
    WHERE us.guest_enabled = 1 AND us.guest_path != ''
  `).all();
  const insert = db2.prepare("INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label) VALUES (?, ?, ?, ?)");
  for (const row of rows) {
    await insert.run(row.user_id, row.guest_path, row.pool_id, row.guest_path.split("/").pop() || "root");
  }
}
async function migrateStorageSettings(db2) {
  const hasStorageType = await db2.columnExists("user_settings", "storage_type");
  if (!hasStorageType) return;
  const usersWithSettings = await db2.prepare(`
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
    const existingPool = await db2.prepare("SELECT id FROM storage_pools WHERE user_id = ?").get(setting.user_id);
    if (!existingPool) {
      await db2.prepare(`
        INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
        VALUES (?, ?, ?, 1, ?)
      `).run(setting.user_id, "\u9ED8\u8BA4\u5B58\u50A8", setting.storage_type, JSON.stringify(poolConfig));
    }
  }
}
async function migrateIpTables(db2) {
  const hasBlacklist = await db2.tableExists("ip_blacklist");
  if (!hasBlacklist) {
    await db2.exec(`
      CREATE TABLE ip_blacklist (
        id ${db2.dialect === "postgres" ? "BIGSERIAL" : db2.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db2.dialect === "mysql" || db2.dialect === "postgres" ? "BIGINT" : "INTEGER"},
        created_at ${db2.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  const hasWhitelist = await db2.tableExists("ip_whitelist");
  if (!hasWhitelist) {
    await db2.exec(`
      CREATE TABLE ip_whitelist (
        id ${db2.dialect === "postgres" ? "BIGSERIAL" : db2.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
        ip_pattern TEXT NOT NULL,
        reason TEXT DEFAULT '',
        created_by ${db2.dialect === "mysql" || db2.dialect === "postgres" ? "BIGINT" : "INTEGER"},
        created_at ${db2.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  const hasConfig = await db2.tableExists("ip_list_config");
  if (!hasConfig) {
    await db2.exec(`
      CREATE TABLE ip_list_config (
        id ${db2.dialect === "postgres" ? "INTEGER PRIMARY KEY" : db2.dialect === "mysql" ? "INT PRIMARY KEY" : "INTEGER PRIMARY KEY"},
        mode TEXT NOT NULL DEFAULT 'blacklist'
      )
    `);
  }
  const row = await db2.prepare("SELECT id FROM ip_list_config WHERE id = 1").get();
  if (!row) {
    await db2.prepare("INSERT INTO ip_list_config (id, mode) VALUES (1, ?)").run(config_default.ip_list_mode || "blacklist");
  }
}
async function migrateGuestSharePermissions(db2) {
  await addColumnIfMissing(db2, "guest_shares", "permissions", "TEXT DEFAULT 'preview,download'");
}
async function migrateTrashDeletedBy(db2) {
  await addColumnIfMissing(db2, "trash", "deleted_by", "TEXT DEFAULT ''");
}
async function migrateGuestPermissionsV2(db2) {
  const shares = await db2.prepare("SELECT id, permissions FROM guest_shares").all();
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
      await db2.prepare("UPDATE guest_shares SET permissions = ? WHERE id = ?").run(nextValue, share.id);
    }
  }
}
async function migrateVerificationCodes(db2) {
  const hasTable = await db2.tableExists("verification_codes");
  if (hasTable) return;
  await db2.exec(`
    CREATE TABLE verification_codes (
      id ${db2.dialect === "postgres" ? "BIGSERIAL PRIMARY KEY" : db2.dialect === "mysql" ? "BIGINT PRIMARY KEY AUTO_INCREMENT" : "INTEGER PRIMARY KEY AUTOINCREMENT"},
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'register',
      expires_at TEXT NOT NULL,
      used ${db2.dialect === "mysql" ? "TINYINT(1)" : "INTEGER"} DEFAULT 0,
      created_at ${db2.dialect === "postgres" ? "TIMESTAMP" : "DATETIME"} DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
async function migrateUserEmail(db2) {
  await addColumnIfMissing(db2, "users", "email", "TEXT");
}
async function migrateUserVerified(db2) {
  await addColumnIfMissing(db2, "users", "verified", db2.dialect === "mysql" ? "TINYINT(1) DEFAULT 1" : "INTEGER DEFAULT 1");
}
async function migrateStorageQuota(db2) {
  await addColumnIfMissing(db2, "users", "storage_quota", db2.dialect === "mysql" || db2.dialect === "postgres" ? "BIGINT DEFAULT 10737418240" : "INTEGER DEFAULT 10737418240");
}
async function migrateCleanLocalPath(db2) {
  const pools = await db2.prepare("SELECT id, config FROM storage_pools WHERE storage_type = 'local'").all();
  for (const pool of pools) {
    try {
      const parsed = JSON.parse(pool.config || "{}");
      if (!parsed.localPath) continue;
      delete parsed.localPath;
      await db2.prepare("UPDATE storage_pools SET config = ? WHERE id = ?").run(JSON.stringify(parsed), pool.id);
    } catch {
    }
  }
}
async function ensureAdminUser(db2) {
  const adminExists = await db2.prepare("SELECT id FROM users WHERE role = ?").get("admin");
  if (adminExists) return;
  const result = await db2.prepare(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)"
  ).run(config_default.admin.username, config_default.admin.password, "admin");
  const userId = result.lastInsertRowid;
  await db2.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
  const pools = config_default.storage_pools || [{ name: "\u672C\u5730\u5B58\u50A8", type: "local", default: true, config: {} }];
  for (const pool of pools) {
    await db2.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config));
  }
}
async function syncStoragePoolsFromConfig(db2, userId) {
  const pools = config_default.storage_pools;
  if (!pools || pools.length === 0) return;
  const existing = await db2.prepare("SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?").get(userId);
  if ((existing?.count || 0) > 0) return;
  for (const pool of pools) {
    await db2.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, pool.name, pool.type, pool.default ? 1 : 0, JSON.stringify(pool.config));
  }
}
async function initializeDatabase(db2, options = {}) {
  await createBaseTables(db2);
  await migrateBannedField(db2);
  await migrateLastLoginAt(db2);
  await migrateShareSignKey(db2);
  await migrateSharePoolId(db2);
  await migrateGuestShares(db2);
  await migrateStorageSettings(db2);
  await migrateIpTables(db2);
  await migrateGuestSharePermissions(db2);
  await migrateTrashDeletedBy(db2);
  await migrateGuestPermissionsV2(db2);
  await migrateVerificationCodes(db2);
  await migrateUserEmail(db2);
  await migrateUserVerified(db2);
  await migrateStorageQuota(db2);
  await migrateCleanLocalPath(db2);
  if (options.ensureAdmin !== false) {
    await ensureAdminUser(db2);
  }
}
var init_db_bootstrap = __esm({
  "server/db-bootstrap.ts"() {
    "use strict";
    init_config();
  }
});

// server/db.ts
async function syncStoragePoolsFromConfig2(userId) {
  await syncStoragePoolsFromConfig(db, userId);
}
var db, db_default;
var init_db = __esm({
  async "server/db.ts"() {
    "use strict";
    init_config();
    init_db_adapter();
    init_db_bootstrap();
    db = await createDatabaseAdapter(config_default.database);
    await initializeDatabase(db);
    db_default = db;
  }
});

// server/services/upyun.ts
var upyun_exports = {};
__export(upyun_exports, {
  UpyunStorage: () => UpyunStorage
});
import upyun from "upyun";
import https from "https";
import { PassThrough } from "stream";
async function withRetry(fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED" || err.statusCode === 429 || err.statusCode === 503 || err.statusCode === 504;
      if (i < retries && isRetryable) {
        await new Promise((r) => setTimeout(r, Math.pow(2, i) * 500));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
var httpsAgent, UpyunStorage;
var init_upyun = __esm({
  "server/services/upyun.ts"() {
    "use strict";
    httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 3e4,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: 6e4
    });
    UpyunStorage = class {
      client;
      bucket;
      constructor(operator, password, bucket, endpoint = "v0.api.upyun.com") {
        const service = new upyun.Service(bucket, operator, password, endpoint);
        this.client = new upyun.Client(service);
        this.bucket = bucket;
        try {
          const req = this.client.req;
          if (req?.defaults) {
            req.defaults.httpsAgent = httpsAgent;
            req.defaults.timeout = 3e4;
          }
        } catch {
        }
      }
      normalizePath(filePath) {
        let p = filePath.startsWith("/") ? filePath : "/" + filePath;
        if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
        return p;
      }
      async list(prefix) {
        const dirPath = this.normalizePath(prefix || "/");
        try {
          const result = await withRetry(() => this.client.listDir(dirPath));
          if (!result || !result.files) return [];
          const files = result.files.map((file) => {
            const filePath = dirPath === "/" ? `/${file.name}` : `${dirPath}/${file.name}`;
            return {
              name: file.name,
              type: file.type === "F" ? "folder" : "file",
              size: file.size || 0,
              modified: file.time ? new Date(file.time * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
              path: filePath
            };
          });
          return files.sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        } catch (err) {
          if (err.statusCode === 404) return [];
          throw err;
        }
      }
      async upload(filePath, data) {
        const remotePath = this.normalizePath(filePath);
        await withRetry(() => this.client.putFile(remotePath, data));
      }
      async uploadStream(filePath, stream) {
        const remotePath = this.normalizePath(filePath);
        await withRetry(() => this.client.putFile(remotePath, stream));
      }
      async download(filePath) {
        const remotePath = this.normalizePath(filePath);
        const chunks = [];
        const passThrough = new PassThrough();
        passThrough.on("data", (chunk) => chunks.push(chunk));
        await withRetry(() => this.client.getFile(remotePath, passThrough));
        if (chunks.length === 0) throw new Error("\u6587\u4EF6\u4E0D\u5B58\u5728");
        return Buffer.concat(chunks);
      }
      async remove(filePath) {
        const remotePath = this.normalizePath(filePath);
        try {
          await withRetry(() => this.client.deleteFile(remotePath));
          return;
        } catch (err) {
          if (err.statusCode !== 404) {
          }
        }
        try {
          const files = await this.list(filePath);
          for (const file of files) {
            await this.remove(file.path);
            await new Promise((r) => setTimeout(r, 100));
          }
          await withRetry(() => this.client.deleteDir(remotePath));
        } catch (err) {
          if (err.statusCode === 404) return;
          throw err;
        }
      }
      async mkdir(dirPath) {
        const remotePath = this.normalizePath(dirPath);
        await withRetry(() => this.client.makeDir(remotePath));
      }
      async info(filePath) {
        const remotePath = this.normalizePath(filePath);
        const stat = await withRetry(() => this.client.headFile(remotePath));
        return {
          name: filePath.split("/").pop() || "",
          type: "file",
          size: stat?.size || 0,
          modified: stat?.lastModified || (/* @__PURE__ */ new Date()).toISOString(),
          path: filePath
        };
      }
      async exists(filePath) {
        try {
          await withRetry(() => this.client.headFile(this.normalizePath(filePath)));
          return true;
        } catch {
          return false;
        }
      }
      async rename(oldPath, newName) {
        const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
        const destPath = parentDir ? `${parentDir}/${newName}` : `/${newName}`;
        await this.move(oldPath, destPath);
      }
      async move(srcPath, destPath) {
        const sourcePath = this.normalizePath(srcPath);
        const targetPath = this.normalizePath(destPath);
        const moved = await withRetry(() => this.client.move(targetPath, sourcePath));
        if (!moved) {
          throw new Error("\u53C8\u62CD\u4E91\u79FB\u52A8\u6587\u4EF6\u5931\u8D25");
        }
      }
      async copy(srcPath, destPath) {
        const sourcePath = this.normalizePath(srcPath);
        const targetPath = this.normalizePath(destPath);
        const copied = await withRetry(() => this.client.copy(targetPath, sourcePath));
        if (!copied) {
          throw new Error("\u53C8\u62CD\u4E91\u590D\u5236\u6587\u4EF6\u5931\u8D25");
        }
      }
      async search(prefix, keyword) {
        const results = [];
        const lowerKeyword = keyword.toLowerCase();
        async function walk(dir) {
          try {
            const files = await this.list(dir);
            for (const file of files) {
              if (file.name.toLowerCase().includes(lowerKeyword)) results.push(file);
              if (file.type === "folder" && results.length < 100) await walk.call(this, file.path);
              if (results.length >= 100) break;
            }
          } catch {
          }
        }
        await walk.call(this, prefix || "/");
        return results;
      }
    };
  }
});

// server/services/ftp.ts
var ftp_exports = {};
__export(ftp_exports, {
  FtpStorage: () => FtpStorage
});
import * as ftp from "basic-ftp";
import path6 from "path";
import { PassThrough as PassThrough2, Readable } from "stream";
var FtpStorage;
var init_ftp = __esm({
  "server/services/ftp.ts"() {
    "use strict";
    FtpStorage = class {
      config;
      basePath;
      constructor(config2) {
        this.config = {
          host: config2.ftpHost || config2.host || "localhost",
          port: config2.ftpPort || config2.port || 21,
          user: config2.ftpUser || config2.user || "anonymous",
          password: config2.ftpPassword || config2.password || "",
          remotePath: config2.ftpRemotePath || config2.remotePath || "/"
        };
        this.basePath = this.config.remotePath;
      }
      async connect() {
        const client = new ftp.Client();
        client.ftp.verbose = false;
        await client.access({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password
        });
        return client;
      }
      fullPath(filePath) {
        const cleaned = filePath.replace(/^\/+/, "");
        return path6.posix.join(this.basePath, cleaned);
      }
      async list(prefix) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(prefix || "");
          const items = await client.list(remotePath);
          return items.filter((item) => item.name !== "." && item.name !== "..").map((item) => ({
            name: item.name,
            type: item.isDirectory ? "folder" : "file",
            size: item.size,
            modified: item.modifiedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
            path: prefix ? `${prefix}/${item.name}` : item.name
          }));
        } finally {
          client.close();
        }
      }
      async upload(filePath, data) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          const dir = path6.posix.dirname(remotePath);
          await client.ensureDir(dir);
          const readable = Readable.from(data);
          await client.uploadFrom(readable, remotePath);
        } finally {
          client.close();
        }
      }
      async uploadStream(filePath, stream) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          const dir = path6.posix.dirname(remotePath);
          await client.ensureDir(dir);
          await client.uploadFrom(stream, remotePath);
        } finally {
          client.close();
        }
      }
      async download(filePath) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          const chunks = [];
          const passThrough = new PassThrough2();
          passThrough.on("data", (chunk) => chunks.push(chunk));
          await client.downloadTo(passThrough, remotePath);
          return Buffer.concat(chunks);
        } finally {
          client.close();
        }
      }
      async remove(filePath) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          try {
            await client.remove(remotePath);
          } catch {
            await client.removeDir(remotePath);
          }
        } finally {
          client.close();
        }
      }
      async mkdir(dirPath) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(dirPath);
          await client.ensureDir(remotePath);
        } finally {
          client.close();
        }
      }
      async info(filePath) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          const parentDir = path6.posix.dirname(remotePath);
          const fileName = path6.posix.basename(remotePath);
          const items = await client.list(parentDir);
          const item = items.find((i) => i.name === fileName);
          if (!item) throw new Error("\u6587\u4EF6\u4E0D\u5B58\u5728");
          return {
            name: item.name,
            type: item.isDirectory ? "folder" : "file",
            size: item.size,
            modified: item.modifiedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
            path: filePath
          };
        } finally {
          client.close();
        }
      }
      async exists(filePath) {
        try {
          await this.info(filePath);
          return true;
        } catch {
          return false;
        }
      }
      async rename(oldPath, newName) {
        const client = await this.connect();
        try {
          const remoteOld = this.fullPath(oldPath);
          const dir = path6.posix.dirname(remoteOld);
          const remoteNew = path6.posix.join(dir, newName);
          await client.rename(remoteOld, remoteNew);
        } finally {
          client.close();
        }
      }
      async move(srcPath, destPath) {
        const client = await this.connect();
        try {
          const remoteSrc = this.fullPath(srcPath);
          const remoteDest = this.fullPath(destPath);
          const dir = path6.posix.dirname(remoteDest);
          await client.ensureDir(dir);
          await client.rename(remoteSrc, remoteDest);
        } finally {
          client.close();
        }
      }
      async copy(srcPath, destPath) {
        const data = await this.download(srcPath);
        await this.upload(destPath, data);
      }
      async search(prefix, keyword) {
        const results = [];
        const client = await this.connect();
        try {
          await this.searchRecursive(client, this.fullPath(prefix || ""), keyword, results, prefix || "");
        } finally {
          client.close();
        }
        return results;
      }
      async searchRecursive(client, remotePath, keyword, results, relativePath) {
        try {
          const items = await client.list(remotePath);
          for (const item of items) {
            if (item.name === "." || item.name === "..") continue;
            const itemRelPath = relativePath ? `${relativePath}/${item.name}` : item.name;
            if (item.name.toLowerCase().includes(keyword.toLowerCase())) {
              results.push({
                name: item.name,
                type: item.isDirectory ? "folder" : "file",
                size: item.size,
                modified: item.modifiedAt?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
                path: itemRelPath
              });
            }
            if (item.isDirectory) {
              await this.searchRecursive(
                client,
                path6.posix.join(remotePath, item.name),
                keyword,
                results,
                itemRelPath
              );
            }
          }
        } catch {
        }
      }
    };
  }
});

// server/services/s3.ts
var s3_exports = {};
__export(s3_exports, {
  S3Storage: () => S3Storage
});
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand
} from "@aws-sdk/client-s3";
import path7 from "path";
var S3Storage;
var init_s3 = __esm({
  "server/services/s3.ts"() {
    "use strict";
    S3Storage = class {
      client;
      bucket;
      prefix;
      constructor(config2) {
        this.bucket = config2.s3Bucket || config2.bucket || "";
        this.prefix = (config2.s3Prefix || config2.prefix || "").replace(/^\/+|\/+$/g, "");
        this.client = new S3Client({
          region: config2.s3Region || config2.region || "us-east-1",
          endpoint: config2.s3Endpoint || config2.endpoint || void 0,
          forcePathStyle: config2.s3ForcePathStyle ?? config2.forcePathStyle ?? true,
          credentials: {
            accessKeyId: config2.s3AccessKeyId || config2.accessKeyId || "",
            secretAccessKey: config2.s3SecretAccessKey || config2.secretAccessKey || ""
          }
        });
      }
      fullKey(filePath) {
        const cleaned = filePath.replace(/^\/+/, "");
        return this.prefix ? `${this.prefix}/${cleaned}` : cleaned;
      }
      relativePath(key) {
        if (this.prefix && key.startsWith(this.prefix + "/")) {
          return key.slice(this.prefix.length + 1);
        }
        return key;
      }
      async streamToBuffer(stream) {
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      }
      encodeCopySource(key) {
        const encodedKey = key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
        return `${this.bucket}/${encodedKey}`;
      }
      async list(prefix) {
        const fullPrefix = this.fullKey(prefix || "");
        const delimiter = "/";
        const files = [];
        let continuationToken;
        do {
          const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: fullPrefix ? fullPrefix + "/" : "",
            Delimiter: delimiter,
            ContinuationToken: continuationToken
          });
          const response = await this.client.send(command);
          for (const obj of response.Contents || []) {
            const key = obj.Key;
            if (key === fullPrefix + "/") continue;
            const relPath = this.relativePath(key);
            if (!relPath) continue;
            files.push({
              name: path7.basename(relPath),
              type: "file",
              size: obj.Size || 0,
              modified: obj.LastModified?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
              path: relPath
            });
          }
          for (const cp of response.CommonPrefixes || []) {
            const key = cp.Prefix;
            const relPath = this.relativePath(key.replace(/\/$/, ""));
            if (!relPath) continue;
            files.push({
              name: path7.basename(relPath),
              type: "folder",
              size: 0,
              modified: (/* @__PURE__ */ new Date()).toISOString(),
              path: relPath
            });
          }
          continuationToken = response.IsTruncated ? response.NextContinuationToken : void 0;
        } while (continuationToken);
        return files;
      }
      async upload(filePath, data) {
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(filePath),
          Body: data
        });
        await this.client.send(command);
      }
      async uploadStream(filePath, stream, size) {
        const command = new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(filePath),
          Body: stream,
          ...typeof size === "number" ? { ContentLength: size } : {}
        });
        await this.client.send(command);
      }
      async download(filePath) {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.fullKey(filePath)
        });
        const response = await this.client.send(command);
        return this.streamToBuffer(response.Body);
      }
      async remove(filePath) {
        const key = this.fullKey(filePath);
        try {
          await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
        } catch {
        }
        let continuationToken;
        do {
          const listCommand = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: key + "/",
            ContinuationToken: continuationToken
          });
          const response = await this.client.send(listCommand);
          for (const obj of response.Contents || []) {
            await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key }));
          }
          continuationToken = response.IsTruncated ? response.NextContinuationToken : void 0;
        } while (continuationToken);
      }
      async mkdir(_dirPath) {
        const key = this.fullKey(_dirPath) + "/";
        await this.client.send(new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: ""
        }));
      }
      async info(filePath) {
        const key = this.fullKey(filePath);
        try {
          const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key });
          const response = await this.client.send(command);
          return {
            name: path7.basename(filePath),
            type: "file",
            size: response.ContentLength || 0,
            modified: response.LastModified?.toISOString() || (/* @__PURE__ */ new Date()).toISOString(),
            path: filePath
          };
        } catch {
          const listCommand = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: key + "/",
            MaxKeys: 1
          });
          const response = await this.client.send(listCommand);
          if ((response.Contents || []).length > 0 || (response.CommonPrefixes || []).length > 0) {
            return {
              name: path7.basename(filePath),
              type: "folder",
              size: 0,
              modified: (/* @__PURE__ */ new Date()).toISOString(),
              path: filePath
            };
          }
          throw new Error("\u6587\u4EF6\u4E0D\u5B58\u5728");
        }
      }
      async exists(filePath) {
        try {
          await this.info(filePath);
          return true;
        } catch {
          return false;
        }
      }
      async rename(oldPath, newName) {
        const oldKey = this.fullKey(oldPath);
        const dir = path7.dirname(oldPath);
        const newPath = dir === "." ? newName : `${dir}/${newName}`;
        const newKey = this.fullKey(newPath);
        await this.client.send(new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: this.encodeCopySource(oldKey),
          Key: newKey
        }));
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: oldKey }));
      }
      async move(srcPath, destPath) {
        const srcKey = this.fullKey(srcPath);
        const destKey = this.fullKey(destPath);
        await this.client.send(new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: this.encodeCopySource(srcKey),
          Key: destKey
        }));
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: srcKey }));
      }
      async copy(srcPath, destPath) {
        const srcKey = this.fullKey(srcPath);
        const destKey = this.fullKey(destPath);
        await this.client.send(new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: this.encodeCopySource(srcKey),
          Key: destKey
        }));
      }
      async search(prefix, keyword) {
        const allFiles = await this.list(prefix || "");
        return allFiles.filter((f) => f.name.toLowerCase().includes(keyword.toLowerCase()));
      }
    };
  }
});

// server/services/sftp.ts
var sftp_exports = {};
__export(sftp_exports, {
  SftpStorage: () => SftpStorage
});
import path8 from "path";
import SftpClient from "ssh2-sftp-client";
var SftpStorage;
var init_sftp = __esm({
  "server/services/sftp.ts"() {
    "use strict";
    SftpStorage = class {
      config;
      constructor(config2) {
        this.config = {
          host: config2.sftpHost || config2.host || "127.0.0.1",
          port: Number(config2.sftpPort || config2.port || 22),
          username: config2.sftpUser || config2.username || "root",
          password: config2.sftpPassword || config2.password || void 0,
          privateKey: config2.sftpPrivateKey || config2.privateKey || void 0,
          rootPath: config2.sftpRootPath || config2.rootPath || "/"
        };
      }
      async connect() {
        const client = new SftpClient();
        await client.connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          password: this.config.password,
          privateKey: this.config.privateKey
        });
        return client;
      }
      fullPath(filePath) {
        const cleaned = (filePath || "").replace(/^\/+/, "");
        return path8.posix.join(this.config.rootPath, cleaned);
      }
      async list(prefix) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(prefix || "");
          const items = await client.list(remotePath);
          return items.filter((item) => item.name !== "." && item.name !== "..").map((item) => ({
            name: item.name,
            type: item.type === "d" ? "folder" : "file",
            size: item.size || 0,
            modified: item.modifyTime ? new Date(item.modifyTime).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
            path: prefix ? `${prefix}/${item.name}` : item.name
          }));
        } finally {
          await client.end();
        }
      }
      async upload(filePath, data) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          await client.mkdir(path8.posix.dirname(remotePath), true);
          await client.put(data, remotePath);
        } finally {
          await client.end();
        }
      }
      async uploadStream(filePath, stream) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          await client.mkdir(path8.posix.dirname(remotePath), true);
          await client.put(stream, remotePath);
        } finally {
          await client.end();
        }
      }
      async download(filePath) {
        const client = await this.connect();
        try {
          const data = await client.get(this.fullPath(filePath), void 0, {});
          if (Buffer.isBuffer(data)) {
            return data;
          }
          if (typeof data === "string") {
            return Buffer.from(data);
          }
          throw new Error("Unsupported SFTP download result");
        } finally {
          await client.end();
        }
      }
      async remove(filePath) {
        const client = await this.connect();
        try {
          const remotePath = this.fullPath(filePath);
          const exists = await client.exists(remotePath);
          if (exists === "d") {
            await client.rmdir(remotePath, true);
          } else if (exists) {
            await client.delete(remotePath);
          }
        } finally {
          await client.end();
        }
      }
      async mkdir(dirPath) {
        const client = await this.connect();
        try {
          await client.mkdir(this.fullPath(dirPath), true);
        } finally {
          await client.end();
        }
      }
      async info(filePath) {
        const client = await this.connect();
        try {
          const stat = await client.stat(this.fullPath(filePath));
          return {
            name: path8.posix.basename(filePath),
            type: stat.isDirectory ? "folder" : "file",
            size: stat.size || 0,
            modified: stat.modifyTime ? new Date(stat.modifyTime).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
            path: filePath
          };
        } finally {
          await client.end();
        }
      }
      async exists(filePath) {
        const client = await this.connect();
        try {
          return !!await client.exists(this.fullPath(filePath));
        } finally {
          await client.end();
        }
      }
      async rename(oldPath, newName) {
        const client = await this.connect();
        try {
          const oldRemote = this.fullPath(oldPath);
          const newRemote = path8.posix.join(path8.posix.dirname(oldRemote), newName);
          await client.rename(oldRemote, newRemote);
        } finally {
          await client.end();
        }
      }
      async move(srcPath, destPath) {
        const client = await this.connect();
        try {
          const srcRemote = this.fullPath(srcPath);
          const destRemote = this.fullPath(destPath);
          await client.mkdir(path8.posix.dirname(destRemote), true);
          await client.rename(srcRemote, destRemote);
        } finally {
          await client.end();
        }
      }
      async copy(srcPath, destPath) {
        const data = await this.download(srcPath);
        await this.upload(destPath, data);
      }
      async search(prefix, keyword) {
        const results = [];
        const lowerKeyword = keyword.toLowerCase();
        const client = await this.connect();
        const walk = async (relativePath) => {
          const items = await client.list(this.fullPath(relativePath));
          for (const item of items) {
            if (item.name === "." || item.name === "..") continue;
            const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name;
            if (item.name.toLowerCase().includes(lowerKeyword)) {
              results.push({
                name: item.name,
                type: item.type === "d" ? "folder" : "file",
                size: item.size || 0,
                modified: item.modifyTime ? new Date(item.modifyTime).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
                path: itemPath
              });
            }
            if (item.type === "d" && results.length < 100) {
              await walk(itemPath);
            }
          }
        };
        try {
          await walk(prefix || "");
          return results;
        } finally {
          await client.end();
        }
      }
    };
  }
});

// server/services/quota.ts
var quota_exports = {};
__export(quota_exports, {
  calculateUserStorageUsage: () => calculateUserStorageUsage,
  checkQuota: () => checkQuota,
  formatBytes: () => formatBytes,
  getUserQuota: () => getUserQuota
});
import fs9 from "fs";
import path12 from "path";
async function calculateUserStorageUsage(userId) {
  const user = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(userId);
  if (!user) return 0;
  const userDir = path12.resolve(config_default.storage_root || "./uploads", user.username);
  if (!fs9.existsSync(userDir)) return 0;
  return getDirSize(userDir);
}
function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = fs9.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path12.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        try {
          size += fs9.statSync(fullPath).size;
        } catch {
        }
      }
    }
  } catch {
  }
  return size;
}
async function getUserQuota(userId) {
  const user = await db_default.prepare("SELECT storage_quota FROM users WHERE id = ?").get(userId);
  const quota = user?.storage_quota ?? 10737418240;
  const used = await calculateUserStorageUsage(userId);
  return { quota, used, remaining: Math.max(0, quota - used) };
}
async function checkQuota(userId, uploadSize) {
  const { quota, used, remaining } = await getUserQuota(userId);
  if (uploadSize > remaining) {
    const quotaMB = Math.round(quota / 1024 / 1024);
    const usedMB = Math.round(used / 1024 / 1024);
    return {
      allowed: false,
      message: `\u5B58\u50A8\u7A7A\u95F4\u4E0D\u8DB3\u3002\u5DF2\u7528 ${usedMB}MB / ${quotaMB}MB\uFF0C\u5269\u4F59 ${Math.round(remaining / 1024 / 1024)}MB`
    };
  }
  return { allowed: true };
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
var init_quota = __esm({
  async "server/services/quota.ts"() {
    "use strict";
    await init_db();
    init_config();
  }
});

// server/app/server.ts
init_config();
import express2 from "express";

// server/app/db-init.ts
await init_db();

// server/plugins/registry.ts
init_config();
import fs4 from "fs";
import path4 from "path";
var pluginRegistry = /* @__PURE__ */ new Map();
function getPluginsDir() {
  return path4.resolve(config_default.plugins?.dir || "./plugins");
}
function isIgnoredEntry(name) {
  return name.startsWith("._") || name === ".DS_Store";
}
function normalizePluginKind(manifest) {
  if (manifest.kind === "feature") return "feature";
  return "theme";
}
function isSafeRelativeAssetPath(assetPath) {
  if (!assetPath || path4.isAbsolute(assetPath)) return false;
  const normalized = assetPath.replace(/\\/g, "/");
  return !normalized.split("/").some((segment) => segment === "..");
}
function ensurePluginAssetPath(dirPath, assetPath, fieldName) {
  if (!isSafeRelativeAssetPath(assetPath)) {
    throw new Error(`${fieldName} \u53EA\u80FD\u662F\u63D2\u4EF6\u76EE\u5F55\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84`);
  }
  const resolvedPath = path4.resolve(dirPath, assetPath);
  if (!resolvedPath.startsWith(path4.resolve(dirPath) + path4.sep) && resolvedPath !== path4.resolve(dirPath, ".")) {
    throw new Error(`${fieldName} \u8D85\u51FA\u63D2\u4EF6\u76EE\u5F55\u8303\u56F4`);
  }
  if (!fs4.existsSync(resolvedPath)) {
    throw new Error(`${fieldName} \u6307\u5411\u7684\u6587\u4EF6\u4E0D\u5B58\u5728: ${assetPath}`);
  }
  return resolvedPath;
}
function createPluginRecord(dirName, dirPath, manifestPath, manifest) {
  const kind = normalizePluginKind(manifest);
  const enabled = manifest.enabled !== false;
  if (!manifest.name || !manifest.version) {
    throw new Error("manifest \u7F3A\u5C11 name \u6216 version");
  }
  if (kind === "theme") {
    const themeManifest = manifest;
    if (!themeManifest.style) {
      throw new Error("theme \u63D2\u4EF6\u7F3A\u5C11 style \u5B57\u6BB5");
    }
    ensurePluginAssetPath(dirPath, themeManifest.style, "style");
  } else {
    const featureManifest = manifest;
    if (featureManifest.entry) {
      ensurePluginAssetPath(dirPath, featureManifest.entry, "entry");
    }
    if (featureManifest.docs) {
      ensurePluginAssetPath(dirPath, featureManifest.docs, "docs");
    }
  }
  return {
    id: manifest.name,
    dirName,
    dirPath,
    manifestPath,
    manifest,
    kind,
    enabled
  };
}
function loadPluginManifest(dirName, dirPath) {
  const manifestPath = path4.join(dirPath, "manifest.json");
  if (!fs4.existsSync(manifestPath)) return null;
  const raw = fs4.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(raw);
  return createPluginRecord(dirName, dirPath, manifestPath, manifest);
}
function loadPlugins() {
  pluginRegistry.clear();
  if (!config_default.plugins?.enabled) {
    console.log("\u{1F3A8} \u63D2\u4EF6\u7CFB\u7EDF\u5DF2\u7981\u7528");
    return;
  }
  const pluginsDir = getPluginsDir();
  console.log("\u{1F3A8} \u63D2\u4EF6\u76EE\u5F55:", pluginsDir);
  if (!fs4.existsSync(pluginsDir)) {
    fs4.mkdirSync(pluginsDir, { recursive: true });
    console.log("\u{1F3A8} \u5DF2\u521B\u5EFA\u63D2\u4EF6\u76EE\u5F55");
    return;
  }
  const entries = fs4.readdirSync(pluginsDir, { withFileTypes: true });
  let loaded = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || isIgnoredEntry(entry.name)) continue;
    const dirPath = path4.join(pluginsDir, entry.name);
    try {
      const record = loadPluginManifest(entry.name, dirPath);
      if (!record) continue;
      pluginRegistry.set(record.id, record);
      console.log(`  \u{1F3A8} \u53D1\u73B0\u63D2\u4EF6: ${record.id}, kind=${record.kind}, enabled=${record.enabled}`);
      if (record.enabled) loaded++;
    } catch (err) {
      console.error(`  \u26A0\uFE0F \u52A0\u8F7D\u63D2\u4EF6 ${entry.name} \u5931\u8D25:`, err.message);
    }
  }
  console.log(`\u{1F3A8} \u5DF2\u53D1\u73B0 ${pluginRegistry.size} \u4E2A\u63D2\u4EF6\uFF0C\u542F\u7528 ${loaded} \u4E2A`);
}
function getAllPlugins() {
  return Array.from(pluginRegistry.values());
}
function getEnabledPlugins() {
  return getAllPlugins().filter((plugin) => plugin.enabled);
}
function getEnabledThemes() {
  return getEnabledPlugins().filter((plugin) => plugin.kind === "theme");
}
function getThemeStyles() {
  return getEnabledThemes().map((plugin) => ({
    name: plugin.manifest.name,
    cssPath: `/plugins/${plugin.dirName}/${plugin.manifest.style}`
  }));
}
function getAllThemes() {
  return getAllPlugins().filter((plugin) => plugin.kind === "theme").map((plugin) => ({
    name: plugin.manifest.name,
    version: plugin.manifest.version || "0.0.0",
    description: plugin.manifest.description || "",
    enabled: plugin.enabled
  }));
}
function getPluginSummaries() {
  return getAllPlugins().map((plugin) => ({
    ...plugin.kind === "feature" ? (() => {
      const manifest = plugin.manifest;
      return {
        capabilities: manifest.capabilities || [],
        docs: manifest.docs ? `/plugins/${plugin.dirName}/${manifest.docs}` : void 0,
        entry: manifest.entry ? `/plugins/${plugin.dirName}/${manifest.entry}` : void 0
      };
    })() : {
      capabilities: ["theme-style"],
      docs: void 0,
      entry: void 0
    },
    id: plugin.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    description: plugin.manifest.description || "",
    author: plugin.manifest.author || "",
    enabled: plugin.enabled,
    kind: plugin.kind,
    assetBasePath: `/plugins/${plugin.dirName}`
  }));
}
function togglePlugin(name, enabled) {
  const plugin = pluginRegistry.get(name);
  if (!plugin) return false;
  try {
    const manifest = JSON.parse(fs4.readFileSync(plugin.manifestPath, "utf8"));
    manifest.enabled = enabled;
    fs4.writeFileSync(plugin.manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    pluginRegistry.set(name, {
      ...plugin,
      manifest,
      enabled
    });
    return true;
  } catch {
    return false;
  }
}

// server/services/offline-download.ts
await init_db();
import { Readable as Readable2 } from "stream";

// server/services/local.ts
import fs5 from "fs/promises";
import fsSync from "fs";
import path5 from "path";
import { pipeline } from "stream/promises";
var LocalStorage = class {
  basePath;
  constructor(basePath, userPrefix) {
    this.basePath = userPrefix ? path5.resolve(basePath, userPrefix) : path5.resolve(basePath);
    fsSync.mkdirSync(this.basePath, { recursive: true });
  }
  /** 确保子目录存在（供 PrefixStorage rootPath 使用） */
  ensureSubdir(subdir) {
    const clean = subdir.replace(/^\/+/, "");
    if (!clean) return;
    const full = path5.resolve(this.basePath, clean);
    if (full.startsWith(this.basePath)) {
      fsSync.mkdirSync(full, { recursive: true });
    }
  }
  fullPath(filePath) {
    const clean = filePath.replace(/^\/+/, "");
    const resolved = path5.resolve(this.basePath, clean);
    const baseWithSlash = this.basePath.endsWith(path5.sep) ? this.basePath : this.basePath + path5.sep;
    if (resolved !== this.basePath && !resolved.startsWith(baseWithSlash)) {
      throw new Error("\u8DEF\u5F84\u8D8A\u754C");
    }
    return resolved;
  }
  async list(prefix) {
    const dirPath = this.fullPath(prefix || "");
    try {
      const entries = await fs5.readdir(dirPath, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const fullPath = path5.join(dirPath, entry.name);
        const stat = await fs5.stat(fullPath);
        const normalizedName = entry.name.normalize("NFC");
        files.push({
          name: normalizedName,
          type: entry.isDirectory() ? "folder" : "file",
          size: stat.size,
          modified: stat.mtime.toISOString(),
          path: path5.join(prefix || "", normalizedName).replace(/\\/g, "/")
        });
      }
      return files.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }
  async upload(filePath, data) {
    const fullPath = this.fullPath(filePath);
    await fs5.mkdir(path5.dirname(fullPath), { recursive: true });
    await fs5.writeFile(fullPath, data);
  }
  async uploadStream(filePath, stream) {
    const fullPath = this.fullPath(filePath);
    await fs5.mkdir(path5.dirname(fullPath), { recursive: true });
    const writeStream = fsSync.createWriteStream(fullPath);
    await pipeline(stream, writeStream);
  }
  async download(filePath) {
    const fullPath = await this.resolvePath(filePath);
    return await fs5.readFile(fullPath);
  }
  /** Resolve a possibly-mangled path by matching against actual filesystem entries */
  async resolvePath(filePath) {
    const direct = this.fullPath(filePath);
    try {
      await fs5.access(direct);
      return direct;
    } catch {
    }
    const dir = path5.dirname(direct);
    const targetName = path5.basename(direct);
    try {
      const entries = await fs5.readdir(dir);
      let match = entries.find((e) => e === targetName);
      if (!match) match = entries.find((e) => e.toLowerCase() === targetName.toLowerCase());
      if (!match) match = entries.find((e) => e.normalize("NFC") === targetName.normalize("NFC"));
      if (!match) match = entries.find((e) => e.normalize("NFD") === targetName.normalize("NFD"));
      if (match) return path5.join(dir, match);
    } catch {
    }
    return direct;
  }
  async remove(filePath) {
    const fullPath = await this.resolvePath(filePath);
    const stat = await fs5.stat(fullPath);
    if (stat.isDirectory()) {
      await fs5.rm(fullPath, { recursive: true });
    } else {
      await fs5.unlink(fullPath);
    }
  }
  async mkdir(dirPath) {
    const fullPath = this.fullPath(dirPath);
    await fs5.mkdir(fullPath, { recursive: true });
  }
  async info(filePath) {
    const fullPath = await this.resolvePath(filePath);
    const stat = await fs5.stat(fullPath);
    return {
      name: path5.basename(filePath),
      type: stat.isDirectory() ? "folder" : "file",
      size: stat.size,
      modified: stat.mtime.toISOString(),
      path: filePath
    };
  }
  async exists(filePath) {
    try {
      const fullPath = await this.resolvePath(filePath);
      await fs5.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  async rename(oldPath, newName) {
    const fullOld = await this.resolvePath(oldPath);
    const parentDir = path5.dirname(fullOld);
    const fullNew = path5.join(parentDir, newName);
    if (!fullNew.startsWith(this.basePath)) throw new Error("\u8DEF\u5F84\u8D8A\u754C");
    await fs5.rename(fullOld, fullNew);
  }
  async move(srcPath, destPath) {
    const fullSrc = await this.resolvePath(srcPath);
    const fullDest = this.fullPath(destPath);
    await fs5.mkdir(path5.dirname(fullDest), { recursive: true });
    await fs5.rename(fullSrc, fullDest);
  }
  async copy(srcPath, destPath) {
    const fullSrc = this.fullPath(srcPath);
    const fullDest = this.fullPath(destPath);
    const stat = await fs5.stat(fullSrc);
    if (stat.isDirectory()) {
      await fs5.mkdir(fullDest, { recursive: true });
      const entries = await fs5.readdir(fullSrc, { withFileTypes: true });
      for (const entry of entries) {
        await this.copy(
          path5.join(srcPath, entry.name),
          path5.join(destPath, entry.name)
        );
      }
    } else {
      await fs5.mkdir(path5.dirname(fullDest), { recursive: true });
      await fs5.copyFile(fullSrc, fullDest);
    }
  }
  async search(prefix, keyword) {
    const results = [];
    const searchDir = this.fullPath(prefix || "");
    const lowerKeyword = keyword.toLowerCase();
    async function walk(dir, relBase) {
      try {
        const entries = await fs5.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path5.join(dir, entry.name);
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
          if (entry.name.toLowerCase().includes(lowerKeyword)) {
            const stat = await fs5.stat(fullPath);
            results.push({
              name: entry.name,
              type: entry.isDirectory() ? "folder" : "file",
              size: stat.size,
              modified: stat.mtime.toISOString(),
              path: relPath
            });
          }
          if (entry.isDirectory()) {
            await walk(fullPath, relPath);
          }
        }
      } catch {
      }
    }
    await walk(searchDir, prefix || "");
    return results.slice(0, 100);
  }
  async resolveLocalPath(filePath) {
    return this.resolvePath(filePath);
  }
};

// server/services/factory.ts
init_upyun();
init_ftp();
init_s3();
init_sftp();

// server/services/prefix.ts
var PrefixStorage = class {
  inner;
  prefix;
  constructor(inner, prefix) {
    this.inner = inner;
    this.prefix = prefix.replace(/\/+$/, "") || "";
  }
  withPrefix(filePath) {
    const p = filePath.startsWith("/") ? filePath : `/${filePath}`;
    return this.prefix + p;
  }
  stripPrefix(filePath) {
    if (this.prefix && filePath.startsWith(this.prefix)) {
      const rest = filePath.slice(this.prefix.length);
      return rest.startsWith("/") ? rest : `/${rest}`;
    }
    return filePath;
  }
  async list(prefix) {
    const files = await this.inner.list(this.withPrefix(prefix));
    return files.map((f) => ({
      ...f,
      path: this.stripPrefix(f.path)
    }));
  }
  async upload(filePath, data) {
    return this.inner.upload(this.withPrefix(filePath), data);
  }
  async uploadStream(filePath, stream, size) {
    if (!this.inner.uploadStream) {
      throw new Error("\u5F53\u524D\u5B58\u50A8\u4E0D\u652F\u6301\u6D41\u5F0F\u4E0A\u4F20");
    }
    return this.inner.uploadStream(this.withPrefix(filePath), stream, size);
  }
  async download(filePath) {
    return this.inner.download(this.withPrefix(filePath));
  }
  async remove(filePath) {
    return this.inner.remove(this.withPrefix(filePath));
  }
  async mkdir(dirPath) {
    return this.inner.mkdir(this.withPrefix(dirPath));
  }
  async info(filePath) {
    const info = await this.inner.info(this.withPrefix(filePath));
    return { ...info, path: this.stripPrefix(info.path) };
  }
  async exists(filePath) {
    return this.inner.exists(this.withPrefix(filePath));
  }
  async rename(oldPath, newName) {
    return this.inner.rename(this.withPrefix(oldPath), newName);
  }
  async move(srcPath, destPath) {
    return this.inner.move(this.withPrefix(srcPath), this.withPrefix(destPath));
  }
  async copy(srcPath, destPath) {
    return this.inner.copy(this.withPrefix(srcPath), this.withPrefix(destPath));
  }
  async search(prefix, keyword) {
    const results = await this.inner.search(this.withPrefix(prefix), keyword);
    return results.map((f) => ({
      ...f,
      path: this.stripPrefix(f.path)
    }));
  }
  async resolveLocalPath(filePath) {
    if (!this.inner.resolveLocalPath) {
      return null;
    }
    return this.inner.resolveLocalPath(this.withPrefix(filePath));
  }
};

// server/services/factory.ts
init_config();
await init_db();
var storageCache = /* @__PURE__ */ new Map();
function createStorageInstance(pool, username) {
  const config2 = JSON.parse(pool.config);
  let storage;
  if (pool.storage_type === "upyun") {
    storage = new UpyunStorage(
      config2.upyunOperator,
      config2.upyunPassword,
      config2.upyunBucket,
      config2.upyunEndpoint || "v0.api.upyun.com"
    );
  } else if (pool.storage_type === "ftp") {
    storage = new FtpStorage(config2);
  } else if (pool.storage_type === "sftp") {
    storage = new SftpStorage(config2);
  } else if (pool.storage_type === "s3") {
    storage = new S3Storage(config2);
  } else {
    storage = new LocalStorage(config_default.storage_root || "./uploads", username);
  }
  if (config2.rootPath && config2.rootPath !== "/" && config2.rootPath !== "") {
    if (storage instanceof LocalStorage) {
      storage.ensureSubdir(config2.rootPath);
    }
    storage = new PrefixStorage(storage, config2.rootPath);
  }
  return storage;
}
async function resolveStorageByPoolId(userId, poolId) {
  const cacheKey = `${userId}-${poolId}`;
  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey);
  }
  const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(poolId, userId);
  if (!pool) {
    throw new Error("\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728");
  }
  const user = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(userId);
  const username = user?.username || `user_${userId}`;
  const storage = createStorageInstance(pool, username);
  storageCache.set(cacheKey, storage);
  return storage;
}
function createDeferredStorage(getter) {
  return {
    list: (prefix) => getter().then((storage) => storage.list(prefix)),
    upload: (filePath, data) => getter().then((storage) => storage.upload(filePath, data)),
    uploadStream: (filePath, stream, size) => getter().then(async (storage) => {
      if (!storage.uploadStream) throw new Error("\u5F53\u524D\u5B58\u50A8\u4E0D\u652F\u6301\u6D41\u5F0F\u4E0A\u4F20");
      return storage.uploadStream(filePath, stream, size);
    }),
    download: (filePath) => getter().then((storage) => storage.download(filePath)),
    remove: (filePath) => getter().then((storage) => storage.remove(filePath)),
    mkdir: (dirPath) => getter().then((storage) => storage.mkdir(dirPath)),
    info: (filePath) => getter().then((storage) => storage.info(filePath)),
    exists: (filePath) => getter().then((storage) => storage.exists(filePath)),
    rename: (oldPath, newName) => getter().then((storage) => storage.rename(oldPath, newName)),
    move: (srcPath, destPath) => getter().then((storage) => storage.move(srcPath, destPath)),
    copy: (srcPath, destPath) => getter().then((storage) => storage.copy(srcPath, destPath)),
    search: (prefix, keyword) => getter().then((storage) => storage.search(prefix, keyword)),
    resolveLocalPath: (filePath) => getter().then((storage) => storage.resolveLocalPath ? storage.resolveLocalPath(filePath) : null)
  };
}
function getStorageByPoolId(userId, poolId) {
  return createDeferredStorage(() => resolveStorageByPoolId(userId, poolId));
}
function getStorage(userId) {
  return createDeferredStorage(async () => {
    const defaultPool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(userId);
    if (defaultPool) {
      return resolveStorageByPoolId(userId, defaultPool.id);
    }
    const firstPool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? ORDER BY created_at ASC LIMIT 1").get(userId);
    if (firstPool) {
      await db_default.prepare("UPDATE storage_pools SET is_default = 1 WHERE id = ?").run(firstPool.id);
      return resolveStorageByPoolId(userId, firstPool.id);
    }
    const result = await db_default.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, 1, ?)
    `).run(userId, "\u9ED8\u8BA4\u5B58\u50A8", "local", JSON.stringify({}));
    return resolveStorageByPoolId(userId, result.lastInsertRowid);
  });
}
function clearStorageCache(userId) {
  for (const key of storageCache.keys()) {
    if (key.startsWith(`${userId}-`)) {
      storageCache.delete(key);
    }
  }
}
async function getGuestStorage(ownerId) {
  const settings = await db_default.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(ownerId);
  if (!settings || !settings.guest_enabled) {
    return null;
  }
  const defaultPool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(ownerId);
  if (!defaultPool) {
    return null;
  }
  return {
    storage: getStorageByPoolId(ownerId, defaultPool.id),
    basePath: settings.guest_path || ""
  };
}

// server/services/offline-download.ts
var started = false;
var runningTaskId = null;
async function ensureTable() {
  return;
}
async function updateTask(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const assignments = keys.map((key) => `${key} = ?`).join(", ");
  const values = keys.map((key) => fields[key]);
  await db_default.prepare(`
    UPDATE offline_download_tasks
    SET ${assignments}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...values, id);
}
async function processTask(task) {
  runningTaskId = task.id;
  await updateTask(task.id, { status: "running", error_message: "", progress: 0, downloaded_bytes: 0 });
  try {
    const response = await fetch(task.url);
    if (!response.ok || !response.body) {
      throw new Error(`\u4E0B\u8F7D\u5931\u8D25: ${response.status} ${response.statusText}`);
    }
    const totalBytes = Number(response.headers.get("content-length") || 0) || null;
    await updateTask(task.id, { total_bytes: totalBytes });
    const storage = getStorageByPoolId(task.user_id, task.pool_id);
    const fileName = task.file_name || decodeURIComponent(new URL(task.url).pathname.split("/").pop() || "remote-file");
    const filePath = task.dir_path ? `${task.dir_path}/${fileName}` : fileName;
    let downloadedBytes = 0;
    const trackedStream = new Readable2({ read() {
    } });
    (async () => {
      try {
        for await (const chunk of response.body) {
          const buffer = Buffer.from(chunk);
          downloadedBytes += buffer.length;
          const effectiveTotalBytes = totalBytes ? Math.max(totalBytes, downloadedBytes) : null;
          const current = await db_default.prepare("SELECT status FROM offline_download_tasks WHERE id = ?").get(task.id);
          if (!current || current.status === "cancelled") {
            trackedStream.destroy(new Error("\u4EFB\u52A1\u5DF2\u53D6\u6D88"));
            return;
          }
          trackedStream.push(buffer);
          await updateTask(task.id, {
            downloaded_bytes: downloadedBytes,
            total_bytes: effectiveTotalBytes,
            progress: effectiveTotalBytes ? Math.min(99, Math.round(downloadedBytes / effectiveTotalBytes * 100)) : 0
          });
        }
        trackedStream.push(null);
      } catch (err) {
        trackedStream.destroy(err);
      }
    })().catch(() => {
    });
    if (storage.uploadStream) {
      await storage.uploadStream(filePath, trackedStream, totalBytes || void 0);
    } else {
      const chunks = [];
      for await (const chunk of trackedStream) {
        chunks.push(Buffer.from(chunk));
      }
      await storage.upload(filePath, Buffer.concat(chunks));
    }
    await updateTask(task.id, {
      status: "completed",
      progress: 100,
      downloaded_bytes: downloadedBytes,
      total_bytes: Math.max(totalBytes ?? 0, downloadedBytes) || downloadedBytes
    });
  } catch (err) {
    const current = await db_default.prepare("SELECT status FROM offline_download_tasks WHERE id = ?").get(task.id);
    if (current?.status === "cancelled") {
      await updateTask(task.id, { progress: 0, error_message: "" });
    } else {
      await updateTask(task.id, { status: "failed", error_message: err.message || "\u4EFB\u52A1\u5931\u8D25" });
    }
  } finally {
    runningTaskId = null;
    setTimeout(() => {
      processQueue().catch(() => {
      });
    }, 50);
  }
}
async function processQueue() {
  await ensureTable();
  if (runningTaskId !== null) return;
  const task = await db_default.prepare(`
    SELECT *
    FROM offline_download_tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get();
  if (!task) return;
  await processTask(task);
}
function startOfflineDownloadWorker() {
  if (started) return;
  started = true;
  processQueue().catch(() => {
  });
}
async function createOfflineDownloadTask(userId, poolId, url, dirPath) {
  await ensureTable();
  let fileName = "";
  try {
    fileName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  } catch {
  }
  const result = await db_default.prepare(`
    INSERT INTO offline_download_tasks (user_id, pool_id, url, dir_path, file_name, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(userId, poolId, url, dirPath || "", fileName);
  processQueue().catch(() => {
  });
  return result.lastInsertRowid;
}
async function listOfflineDownloadTasks(userId) {
  await ensureTable();
  return db_default.prepare(`
    SELECT t.*, sp.name as pool_name
    FROM offline_download_tasks t
    JOIN storage_pools sp ON sp.id = t.pool_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC, t.id DESC
  `).all(userId);
}
async function cancelOfflineDownloadTask(userId, taskId) {
  await ensureTable();
  const task = await db_default.prepare("SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?").get(taskId, userId);
  if (!task) throw new Error("\u4EFB\u52A1\u4E0D\u5B58\u5728");
  if (task.status === "completed") throw new Error("\u5DF2\u5B8C\u6210\u4EFB\u52A1\u4E0D\u80FD\u53D6\u6D88");
  await updateTask(taskId, { status: "cancelled", error_message: "" });
}
async function retryOfflineDownloadTask(userId, taskId) {
  await ensureTable();
  const task = await db_default.prepare("SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?").get(taskId, userId);
  if (!task) throw new Error("\u4EFB\u52A1\u4E0D\u5B58\u5728");
  await updateTask(taskId, {
    status: "pending",
    progress: 0,
    total_bytes: null,
    downloaded_bytes: 0,
    error_message: ""
  });
  processQueue().catch(() => {
  });
}
async function clearFinishedOfflineDownloadTasks(userId) {
  await ensureTable();
  await db_default.prepare(`
    DELETE FROM offline_download_tasks
    WHERE user_id = ?
      AND status IN ('completed', 'failed', 'cancelled')
  `).run(userId);
}

// server/app/bootstrap.ts
var bootstrapped = false;
function bootstrapApp() {
  if (bootstrapped) return;
  bootstrapped = true;
  loadPlugins();
  startOfflineDownloadWorker();
}

// server/app/features.ts
init_config();
import { Router } from "express";
import jwt from "jsonwebtoken";
function createPublicPlatformRouter() {
  const router15 = Router();
  router15.get("/site-config", (_req, res) => {
    res.json({
      icp_beian: config_default.site?.icp_beian || "",
      police_beian: config_default.site?.police_beian || "",
      smtp_enabled: config_default.smtp?.enabled || false,
      themes_enabled: config_default.plugins?.enabled || false,
      plugins_enabled: config_default.plugins?.enabled || false,
      webdav_enabled: true
    });
  });
  router15.get("/themes/styles", (_req, res) => {
    res.json({ styles: getThemeStyles() });
  });
  router15.get("/themes/list", (_req, res) => {
    res.json({ themes: getAllThemes() });
  });
  router15.get("/plugins/list", (_req, res) => {
    res.json({ plugins: getPluginSummaries() });
  });
  router15.put("/plugins/:name/toggle", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "\u672A\u767B\u5F55" });
    try {
      jwt.verify(token, config_default.server.jwt_secret);
    } catch {
      return res.status(401).json({ error: "Token \u65E0\u6548" });
    }
    const { name } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled \u5FC5\u987B\u4E3A\u5E03\u5C14\u503C" });
    }
    const success = togglePlugin(name, enabled);
    if (!success) return res.status(404).json({ error: "\u63D2\u4EF6\u4E0D\u5B58\u5728" });
    res.json({ message: enabled ? "\u63D2\u4EF6\u5DF2\u542F\u7528\uFF08\u91CD\u542F\u540E\u751F\u6548\uFF09" : "\u63D2\u4EF6\u5DF2\u7981\u7528\uFF08\u91CD\u542F\u540E\u751F\u6548\uFF09" });
  });
  router15.put("/themes/:name/toggle", (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "\u672A\u767B\u5F55" });
    try {
      jwt.verify(token, config_default.server.jwt_secret);
    } catch {
      return res.status(401).json({ error: "Token \u65E0\u6548" });
    }
    const { name } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled \u5FC5\u987B\u4E3A\u5E03\u5C14\u503C" });
    }
    const success = togglePlugin(name, enabled);
    if (!success) return res.status(404).json({ error: "\u4E3B\u9898\u4E0D\u5B58\u5728" });
    res.json({ message: enabled ? "\u4E3B\u9898\u5DF2\u542F\u7528\uFF08\u91CD\u542F\u540E\u751F\u6548\uFF09" : "\u4E3B\u9898\u5DF2\u7981\u7528\uFF08\u91CD\u542F\u540E\u751F\u6548\uFF09" });
  });
  return router15;
}

// server/app/middleware.ts
init_config();
import cors from "cors";
import express from "express";
import fs6 from "fs";
import path9 from "path";

// server/middleware/auth.ts
await init_db();
init_config();
import jwt2 from "jsonwebtoken";
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function ipToInt(ip) {
  const parts = ip.split(".").map(Number);
  return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
}
function matchIp(clientIp, pattern) {
  const cleanIp = clientIp.replace(/^::ffff:/, "");
  const cleanPattern = pattern.trim();
  if (cleanPattern.includes("/")) {
    const [network, maskStr] = cleanPattern.split("/");
    const mask = parseInt(maskStr, 10);
    if (mask < 0 || mask > 32) return false;
    const networkInt = ipToInt(network);
    const clientInt = ipToInt(cleanIp);
    const maskInt = mask === 0 ? 0 : ~0 << 32 - mask >>> 0;
    return (clientInt & maskInt) === (networkInt & maskInt);
  }
  return cleanIp === cleanPattern;
}
function ipBlacklistMiddleware(req, res, next) {
  ;
  (async () => {
    const clientIp = getClientIp(req);
    const cleanIp = clientIp.replace(/^::ffff:/, "");
    const configRow = await db_default.prepare("SELECT mode FROM ip_list_config WHERE id = 1").get();
    const mode = configRow?.mode || "blacklist";
    if (mode === "whitelist") {
      if (cleanIp === "127.0.0.1" || cleanIp === "::1" || cleanIp === "localhost") {
        return next();
      }
      const entries2 = await db_default.prepare("SELECT ip_pattern FROM ip_whitelist").all();
      for (const entry of entries2) {
        if (matchIp(clientIp, entry.ip_pattern)) {
          return next();
        }
      }
      return res.status(403).json({ error: "IP \u4E0D\u5728\u767D\u540D\u5355\u4E2D" });
    }
    const entries = await db_default.prepare("SELECT ip_pattern FROM ip_blacklist").all();
    for (const entry of entries) {
      if (matchIp(clientIp, entry.ip_pattern)) {
        return res.status(403).json({ error: "IP \u5DF2\u88AB\u5C01\u7981" });
      }
    }
    return next();
  })().catch((err) => {
    res.status(500).json({ error: err.message || "IP \u8BBF\u95EE\u63A7\u5236\u6821\u9A8C\u5931\u8D25" });
  });
}
var JWT_SECRET = config_default.server.jwt_secret;
function authMiddleware(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "\u672A\u767B\u5F55" });
  }
  ;
  (async () => {
    try {
      const decoded = jwt2.verify(token, JWT_SECRET);
      const user = await db_default.prepare("SELECT id, role, banned FROM users WHERE id = ?").get(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
      }
      if (user.banned) {
        return res.status(403).json({ error: "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981" });
      }
      req.userId = user.id;
      req.userRole = user.role;
      return next();
    } catch {
      return res.status(401).json({ error: "Token \u65E0\u6548\u6216\u5DF2\u8FC7\u671F" });
    }
  })().catch((err) => {
    res.status(500).json({ error: err.message || "\u8BA4\u8BC1\u5931\u8D25" });
  });
}
function adminMiddleware(req, res, next) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650" });
  }
  next();
}
function generateToken(userId) {
  return jwt2.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

// server/app/middleware.ts
var SENSITIVE_FILES = [".env", ".env.example", "config.yml", "package.json", "tsconfig.json", ".gitignore"];
function registerAppMiddleware(app2, context) {
  app2.use((req, res, next) => {
    if (req.path === "/dav" || req.path.startsWith("/dav/")) {
      return next();
    }
    return cors({
      origin: ["http://localhost:5173", "http://localhost:3000"],
      credentials: true
    })(req, res, next);
  });
  app2.use(express.json({ limit: `${config_default.upload_limit}mb` }));
  app2.use(express.urlencoded({ extended: true, limit: `${config_default.upload_limit}mb` }));
  app2.use("/api", ipBlacklistMiddleware);
  app2.use((req, res, next) => {
    const filename = req.path.split("/").pop() || "";
    if (SENSITIVE_FILES.includes(filename) || filename.startsWith(".env") || filename.startsWith("._")) {
      return res.status(403).json({ error: "\u7981\u6B62\u8BBF\u95EE" });
    }
    next();
  });
  app2.use(express.static(path9.join(context.rootDir, "dist")));
  const pluginsDir = path9.resolve(config_default.plugins?.dir || "./plugins");
  if (config_default.plugins?.enabled && fs6.existsSync(pluginsDir)) {
    app2.use("/plugins", express.static(pluginsDir));
  }
}

// server/routes/auth.ts
await init_db();
init_config();
import { Router as Router2 } from "express";
import crypto2 from "crypto";
import jwt3 from "jsonwebtoken";

// server/services/mail.ts
await init_db();
init_config();
import nodemailer from "nodemailer";
import crypto from "crypto";
var transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!config_default.smtp.enabled) return null;
  transporter = nodemailer.createTransport({
    host: config_default.smtp.host,
    port: config_default.smtp.port,
    secure: config_default.smtp.secure,
    auth: {
      user: config_default.smtp.user,
      pass: config_default.smtp.pass
    }
  });
  return transporter;
}
function generateCode() {
  return crypto.randomInt(1e5, 999999).toString();
}
async function sendVerificationCode(email) {
  const transport = getTransporter();
  if (!transport) throw new Error("SMTP \u672A\u542F\u7528");
  await db_default.prepare("DELETE FROM verification_codes WHERE email = ? AND (used = 1 OR expires_at < datetime('now'))").run(email);
  const recent = await db_default.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND created_at > datetime('now', '-1 minute')"
  ).get(email);
  if (recent) throw new Error("\u8BF7\u7B49\u5F85 1 \u5206\u949F\u540E\u518D\u8BD5");
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1e3).toISOString();
  await db_default.prepare(
    "INSERT INTO verification_codes (email, code, type, expires_at) VALUES (?, ?, ?, ?)"
  ).run(email, code, "register", expiresAt);
  await transport.sendMail({
    from: config_default.smtp.from,
    to: email,
    subject: "VueFileManager \u6CE8\u518C\u9A8C\u8BC1\u7801",
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f6ef7;">VueFileManager</h2>
        <p>\u60A8\u7684\u6CE8\u518C\u9A8C\u8BC1\u7801\u4E3A\uFF1A</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333; padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </div>
        <p style="color: #666; font-size: 14px;">\u9A8C\u8BC1\u7801 5 \u5206\u949F\u5185\u6709\u6548\uFF0C\u8BF7\u52FF\u6CC4\u9732\u7ED9\u4ED6\u4EBA\u3002</p>
      </div>
    `
  });
  return { code, expiresAt };
}
async function verifyCode(email, code) {
  const record = await db_default.prepare(
    "SELECT id FROM verification_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1"
  ).get(email, code);
  if (!record) return false;
  await db_default.prepare("UPDATE verification_codes SET used = 1 WHERE id = ?").run(record.id);
  return true;
}

// server/routes/auth.ts
var JWT_SECRET2 = config_default.server.jwt_secret;
var router = Router2();
router.post("/send-code", async (req, res) => {
  try {
    if (!config_default.smtp.enabled) {
      return res.status(400).json({ error: "\u90AE\u7BB1\u6CE8\u518C\u672A\u542F\u7528" });
    }
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "\u90AE\u7BB1\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E" });
    }
    const existing = await db_default.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "\u8BE5\u90AE\u7BB1\u5DF2\u88AB\u6CE8\u518C" });
    }
    await sendVerificationCode(email);
    res.json({ message: "\u9A8C\u8BC1\u7801\u5DF2\u53D1\u9001" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/register", async (req, res) => {
  try {
    const { username, password, email, code } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "\u7528\u6237\u540D\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: "\u7528\u6237\u540D\u957F\u5EA6\u9700\u5728 3-20 \u4E4B\u95F4" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "\u5BC6\u7801\u957F\u5EA6\u4E0D\u80FD\u5C11\u4E8E 6 \u4F4D" });
    }
    if (config_default.smtp.enabled) {
      if (!email || !code) {
        return res.status(400).json({ error: "\u8BF7\u8F93\u5165\u90AE\u7BB1\u548C\u9A8C\u8BC1\u7801" });
      }
      if (!await verifyCode(email, code)) {
        return res.status(400).json({ error: "\u9A8C\u8BC1\u7801\u65E0\u6548\u6216\u5DF2\u8FC7\u671F" });
      }
    }
    const existing = await db_default.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return res.status(409).json({ error: "\u7528\u6237\u540D\u5DF2\u5B58\u5728" });
    }
    if (email) {
      const emailExists = await db_default.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (emailExists) {
        return res.status(409).json({ error: "\u8BE5\u90AE\u7BB1\u5DF2\u88AB\u6CE8\u518C" });
      }
    }
    const hashedPassword = crypto2.createHash("md5").update(password).digest("hex");
    const ip = getClientIp(req);
    const verified = config_default.smtp.enabled && email && code ? 1 : config_default.smtp.enabled ? 0 : 1;
    const result = await db_default.prepare(
      "INSERT INTO users (username, password, email, verified, register_ip, last_login_ip) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(username, hashedPassword, email || null, verified, ip, ip);
    const userId = result.lastInsertRowid;
    await db_default.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
    await syncStoragePoolsFromConfig2(userId);
    const token = generateToken(userId);
    res.json({
      message: "\u6CE8\u518C\u6210\u529F",
      token,
      user: {
        id: userId,
        username,
        role: "user"
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "\u7528\u6237\u540D\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    const user = await db_default.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      return res.status(401).json({ error: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" });
    }
    const hashedPassword = crypto2.createHash("md5").update(password).digest("hex");
    if (hashedPassword !== user.password) {
      return res.status(401).json({ error: "\u7528\u6237\u540D\u6216\u5BC6\u7801\u9519\u8BEF" });
    }
    if (user.banned) {
      return res.status(403).json({ error: "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981" });
    }
    if (config_default.smtp.enabled && !user.verified) {
      return res.status(403).json({ error: "\u8D26\u53F7\u672A\u9A8C\u8BC1\uFF0C\u8BF7\u68C0\u67E5\u90AE\u7BB1\u9A8C\u8BC1\u7801\u6216\u7B49\u5F85\u7BA1\u7406\u5458\u5904\u7406" });
    }
    const ip = getClientIp(req);
    await db_default.prepare("UPDATE users SET last_login_ip = ?, last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(ip, user.id);
    const token = generateToken(user.id);
    res.json({
      message: "\u767B\u5F55\u6210\u529F",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ error: "\u672A\u767B\u5F55" });
    }
    const decoded = jwt3.verify(token, JWT_SECRET2);
    const banCheck = await db_default.prepare("SELECT banned FROM users WHERE id = ?").get(decoded.userId);
    if (banCheck?.banned) {
      return res.status(403).json({ error: "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981" });
    }
    const user = await db_default.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme
        }
      }
    });
  } catch (err) {
    res.status(401).json({ error: "Token \u65E0\u6548" });
  }
});
var auth_default = router;

// server/routes/files.ts
await init_db();
import { Router as Router3 } from "express";
import fsSync2 from "fs";

// server/middleware/apikey.ts
await init_db();
init_config();
import crypto3 from "crypto";
import jwt4 from "jsonwebtoken";
var JWT_SECRET3 = config_default.server.jwt_secret;
function isWebDavRequest(req) {
  return req.baseUrl === "/dav" || req.originalUrl.startsWith("/dav");
}
function sendUnauthorized(req, res, error) {
  if (isWebDavRequest(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="VueFileManager WebDAV"');
    res.setHeader("DAV", "1");
    res.setHeader("MS-Author-Via", "DAV");
    return res.status(401).type("text/plain; charset=utf-8").send(error);
  }
  return res.status(401).json({ error });
}
async function authenticateWithBasicAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) return null;
    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (!username || !password) return null;
    const user = await db_default.prepare("SELECT id, role, banned, password FROM users WHERE username = ?").get(username);
    if (!user || user.banned) return null;
    const hashedPassword = crypto3.createHash("md5").update(password).digest("hex");
    if (hashedPassword !== user.password) return null;
    return {
      userId: user.id,
      userRole: user.role,
      permissions: ["read", "write", "delete"]
    };
  } catch {
    return null;
  }
}
function apiKeyMiddleware(req, res, next) {
  ;
  (async () => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return sendUnauthorized(req, res, "\u7F3A\u5C11 API Key");
    }
    const keyRecord = await db_default.prepare(`
      SELECT ak.*, u.role, u.banned
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key = ?
    `).get(apiKey);
    if (!keyRecord) {
      return sendUnauthorized(req, res, "API Key \u65E0\u6548");
    }
    if (keyRecord.banned) {
      return res.status(403).json({ error: "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981" });
    }
    req.userId = keyRecord.user_id;
    req.userRole = keyRecord.role;
    req.apiKeyPermissions = keyRecord.permissions.split(",").map((p) => p.trim());
    return next();
  })().catch((err) => {
    res.status(500).json({ error: err.message || "API Key \u8BA4\u8BC1\u5931\u8D25" });
  });
}
function requirePermission(permission) {
  return (req, res, next) => {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes(permission)) {
      return res.status(403).json({ error: `API Key \u7F3A\u5C11 ${permission} \u6743\u9650` });
    }
    next();
  };
}
function flexibleAuth(req, res, next) {
  ;
  (async () => {
    const apiKey = req.headers["x-api-key"] || req.query.apiKey;
    const token = req.cookies?.token || req.headers.authorization?.replace("Bearer ", "") || req.query.token;
    if (apiKey) {
      return apiKeyMiddleware(req, res, next);
    }
    const basicAuthUser = await authenticateWithBasicAuth(req);
    if (basicAuthUser) {
      req.userId = basicAuthUser.userId;
      req.userRole = basicAuthUser.userRole;
      req.apiKeyPermissions = basicAuthUser.permissions;
      return next();
    }
    if (token) {
      try {
        const decoded = jwt4.verify(token, JWT_SECRET3);
        const user = await db_default.prepare("SELECT id, role, banned FROM users WHERE id = ?").get(decoded.userId);
        if (!user) {
          return sendUnauthorized(req, res, "\u7528\u6237\u4E0D\u5B58\u5728");
        }
        if (user.banned) {
          return res.status(403).json({ error: "\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981" });
        }
        req.userId = user.id;
        req.userRole = user.role;
        req.apiKeyPermissions = ["read", "write", "delete"];
        return next();
      } catch {
        return sendUnauthorized(req, res, "Token \u65E0\u6548");
      }
    }
    return sendUnauthorized(req, res, "\u672A\u8BA4\u8BC1");
  })().catch((err) => {
    res.status(500).json({ error: err.message || "\u8BA4\u8BC1\u5931\u8D25" });
  });
}

// server/services/preview-cache.ts
init_runtime_paths();
import crypto4 from "crypto";
import fs7 from "fs/promises";
import path10 from "path";
var PREVIEW_CACHE_DIR = resolveFromRoot("data", "preview-cache");
var PREVIEW_CACHE_TTL_MS = 1e3 * 60 * 60 * 6;
var MAX_PREVIEW_CACHE_BYTES = 64 * 1024 * 1024;
function createCacheKey(scope, filePath) {
  return crypto4.createHash("sha1").update(`${scope}:${filePath}`).digest("hex");
}
function getCachePath(cacheKey) {
  return path10.join(PREVIEW_CACHE_DIR, cacheKey);
}
async function ensurePreviewCacheDir() {
  await fs7.mkdir(PREVIEW_CACHE_DIR, { recursive: true });
}
async function readCachedFile(cachePath) {
  try {
    const stat = await fs7.stat(cachePath);
    if (Date.now() - stat.mtimeMs > PREVIEW_CACHE_TTL_MS) {
      await fs7.unlink(cachePath).catch(() => {
      });
      return null;
    }
    return {
      path: cachePath,
      stat
    };
  } catch {
    return null;
  }
}
async function resolvePreviewCacheFile(scope, storage, filePath) {
  const localPath = storage.resolveLocalPath ? await storage.resolveLocalPath(filePath) : null;
  if (localPath) {
    const stat2 = await fs7.stat(localPath);
    return { path: localPath, stat: stat2 };
  }
  const ext = path10.extname(filePath);
  const cacheKey = createCacheKey(scope, filePath);
  const cachePath = `${getCachePath(cacheKey)}${ext}`;
  await ensurePreviewCacheDir();
  const cached = await readCachedFile(cachePath);
  if (cached) {
    return cached;
  }
  const data = await storage.download(filePath);
  if (data.length > MAX_PREVIEW_CACHE_BYTES) {
    return null;
  }
  await fs7.writeFile(cachePath, data);
  const stat = await fs7.stat(cachePath);
  return { path: cachePath, stat };
}

// server/services/trash.ts
function ensureLeadingSlash(filePath) {
  return filePath.startsWith("/") ? filePath : `/${filePath}`;
}
function joinPath(base, name) {
  const normalizedBase = ensureLeadingSlash(base).replace(/\/+$/, "");
  const normalizedName = name.replace(/^\/+/, "");
  return `${normalizedBase}/${normalizedName}`.replace(/\/+/g, "/");
}
function buildTrashPath(id, fileName) {
  return `/.trash/${id}_${fileName}`;
}
function buildLegacyGuestTrashPath(fileName, id) {
  return `/.trash/${fileName}_${id}`;
}
function getTrashPathCandidates(item) {
  return [
    buildTrashPath(item.id, item.file_name),
    buildLegacyGuestTrashPath(item.file_name, item.id),
    `/.trash/${item.file_name}`
  ];
}
async function resolveTrashPathCandidates(storage, item) {
  const candidates = new Set(getTrashPathCandidates(item));
  try {
    const entries = await storage.list("/.trash");
    const fuzzyMatches = entries.filter((entry) => entry.name === item.file_name || entry.name.startsWith(`${item.file_name}_`)).sort((a, b) => {
      const aSuffix = a.name.slice(item.file_name.length + 1);
      const bSuffix = b.name.slice(item.file_name.length + 1);
      const aTime = /^\d+$/.test(aSuffix) ? Number(aSuffix) : Number.POSITIVE_INFINITY;
      const bTime = /^\d+$/.test(bSuffix) ? Number(bSuffix) : Number.POSITIVE_INFINITY;
      const deletedAt = item.deleted_at ? new Date(item.deleted_at).getTime() : 0;
      return Math.abs(aTime - deletedAt) - Math.abs(bTime - deletedAt);
    });
    for (const entry of fuzzyMatches) {
      candidates.add(`/.trash/${entry.name}`);
    }
  } catch {
  }
  return Array.from(candidates);
}
async function ensureParentDirectories(storage, fullPath) {
  const segments = ensureLeadingSlash(fullPath).split("/").filter(Boolean);
  if (segments.length <= 1) return;
  let current = "";
  for (const segment of segments.slice(0, -1)) {
    current = `${current}/${segment}`;
    await storage.mkdir(current).catch(() => {
    });
  }
}
async function copyEntry(storage, sourcePath, targetPath, type) {
  if (type === "folder") {
    await storage.mkdir(targetPath);
    const children = await storage.list(sourcePath);
    for (const child of children) {
      const childSourcePath = joinPath(sourcePath, child.name);
      const childTargetPath = joinPath(targetPath, child.name);
      await copyEntry(storage, childSourcePath, childTargetPath, child.type);
    }
    return;
  }
  const data = await storage.download(sourcePath);
  await ensureParentDirectories(storage, targetPath);
  await storage.upload(targetPath, data);
}
async function removeEntry(storage, targetPath, type) {
  if (type === "folder") {
    const children = await storage.list(targetPath).catch(() => []);
    for (const child of children) {
      await removeEntry(storage, joinPath(targetPath, child.name), child.type);
    }
  }
  await storage.remove(targetPath).catch(() => {
  });
}
async function moveToTrash(storage, filePath, trashPath, type) {
  try {
    await ensureParentDirectories(storage, trashPath);
    await storage.move(filePath, trashPath);
    return;
  } catch {
  }
  await copyEntry(storage, filePath, trashPath, type);
  await removeEntry(storage, filePath, type);
}
async function restoreFromTrash(storage, trashPath, originalPath, type) {
  try {
    await ensureParentDirectories(storage, originalPath);
    await storage.move(trashPath, originalPath);
    return true;
  } catch {
  }
  try {
    await copyEntry(storage, trashPath, originalPath, type);
    await removeEntry(storage, trashPath, type);
    return true;
  } catch {
    return false;
  }
}

// server/routes/files/shared.ts
await init_db();
import Busboy from "busboy";
import os from "os";
import fs8 from "fs/promises";
import path11 from "path";
import { PassThrough as PassThrough3 } from "stream";
import chardet from "chardet";
import iconv from "iconv-lite";
init_config();
var UPLOAD_TEMP_DIR = path11.join(os.tmpdir(), "vue-file-manager", "uploads");
var RESUMABLE_UPLOAD_TTL_MS = Math.max(1, config_default.resumable_upload_cache_minutes || 120) * 60 * 1e3;
var TEMP_UPLOAD_PREFIX = ".temp_";
var JUNK_PATTERNS = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//, /^\.trash$/i];
function isJunkFile(filename) {
  const name = filename.split("/").pop() || filename;
  return JUNK_PATTERNS.some((pattern) => pattern.test(name));
}
function isTemporaryUploadFile(filename) {
  const name = filename.split("/").pop() || filename;
  return name.startsWith(TEMP_UPLOAD_PREFIX);
}
function shouldUseAtomicTempUpload(storageType) {
  return storageType === "local" || storageType === "ftp";
}
function buildTemporaryUploadPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return `${TEMP_UPLOAD_PREFIX}${normalized}`;
  }
  const dir = normalized.slice(0, lastSlashIndex);
  const name = normalized.slice(lastSlashIndex + 1);
  return `${dir}/${TEMP_UPLOAD_PREFIX}${name}`;
}
async function finalizeAtomicUpload(storage, tempPath, finalPath) {
  if (tempPath === finalPath) return;
  try {
    await storage.move(tempPath, finalPath);
  } catch (err) {
    if (await storage.exists(finalPath)) {
      await storage.remove(finalPath);
      await storage.move(tempPath, finalPath);
      return;
    }
    throw err;
  }
}
async function resolvePoolId(userId, poolId) {
  if (poolId !== void 0 && poolId !== null && poolId !== "") {
    return Number(poolId);
  }
  return (await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(userId))?.id;
}
function buildDirectUrl(req, filePath, poolId) {
  const params = new URLSearchParams({ path: filePath });
  if (poolId) params.set("poolId", String(poolId));
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace("Bearer ", "") || req.cookies?.token || req.query.token;
  if (apiKey) params.set("apiKey", apiKey);
  else if (token) params.set("token", token);
  return `/api/files/preview?${params.toString()}`;
}
function withDirectUrl(req, file, poolId) {
  const directUrl = file.type === "file" ? buildDirectUrl(req, file.path, poolId) : "";
  return { ...file, directUrl, fileUrl: directUrl };
}
async function removeUploadTask(uploadId) {
  const uploadDir = path11.join(UPLOAD_TEMP_DIR, uploadId);
  await fs8.rm(uploadDir, { recursive: true, force: true }).catch(() => {
  });
}
async function cleanupExpiredUploads() {
  await fs8.mkdir(UPLOAD_TEMP_DIR, { recursive: true });
  const entries = await fs8.readdir(UPLOAD_TEMP_DIR, { withFileTypes: true }).catch(() => []);
  const now = Date.now();
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const uploadDir = path11.join(UPLOAD_TEMP_DIR, entry.name);
    const metaPath = path11.join(uploadDir, "meta.json");
    try {
      const raw = await fs8.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      const updatedAt = meta.updatedAt || meta.createdAt || 0;
      if (!updatedAt || now - updatedAt > RESUMABLE_UPLOAD_TTL_MS) {
        await fs8.rm(uploadDir, { recursive: true, force: true });
      }
    } catch {
      await fs8.rm(uploadDir, { recursive: true, force: true }).catch(() => {
      });
    }
  }));
}
async function readUploadMeta(uploadId) {
  const uploadDir = path11.join(UPLOAD_TEMP_DIR, uploadId);
  const metaPath = path11.join(uploadDir, "meta.json");
  const raw = await fs8.readFile(metaPath, "utf-8");
  return {
    uploadDir,
    metaPath,
    meta: JSON.parse(raw)
  };
}
async function writeUploadMeta(metaPath, meta) {
  meta.updatedAt = Date.now();
  await fs8.writeFile(metaPath, JSON.stringify(meta));
}
function uploadSingle(field) {
  return (req, res, next) => {
    if (!req.is("multipart")) return res.status(400).json({ error: "\u9700\u8981 multipart \u8BF7\u6C42" });
    const limits = { fileSize: config_default.upload_limit * 1024 * 1024 };
    const bb = Busboy({ headers: req.headers, limits, defCharset: "latin1" });
    let fileReceived = false;
    bb.on("file", (fieldname, stream, info) => {
      if (fieldname !== field) {
        stream.resume();
        return;
      }
      let rawFilename = info.filename;
      try {
        const fnameBuf = Buffer.from(info.filename, "latin1");
        if (fnameBuf.some((byte) => byte > 127)) {
          const charset = chardet.detect(fnameBuf);
          if (charset && iconv.encodingExists(charset)) {
            rawFilename = iconv.decode(fnameBuf, charset);
          } else {
            const tryUtf8 = fnameBuf.toString("utf8");
            if (!tryUtf8.includes("\uFFFD")) {
              rawFilename = tryUtf8;
            } else if (iconv.encodingExists("gbk")) {
              rawFilename = iconv.decode(fnameBuf, "gbk");
            }
          }
        }
      } catch (error) {
        console.error("[upload] \u7F16\u7801\u68C0\u6D4B\u5F02\u5E38:", error);
      }
      rawFilename = rawFilename.normalize("NFC");
      if (isJunkFile(rawFilename)) {
        stream.resume();
        return res.status(400).json({ error: `\u5DF2\u62E6\u622A\u7CFB\u7EDF\u6587\u4EF6: ${rawFilename}` });
      }
      const chunks = [];
      let totalSize = 0;
      stream.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > limits.fileSize) {
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        if (totalSize > limits.fileSize) {
          return res.status(413).json({ error: `\u6587\u4EF6\u5927\u5C0F\u8D85\u8FC7\u9650\u5236 (${config_default.upload_limit}MB)` });
        }
        ;
        req.file = {
          fieldname,
          originalname: rawFilename,
          encoding: info.encoding,
          mimetype: info.mimeType,
          buffer: Buffer.concat(chunks),
          size: totalSize
        };
        fileReceived = true;
      });
      stream.on("error", () => {
        return res.status(500).json({ error: "\u6587\u4EF6\u4E0A\u4F20\u6D41\u9519\u8BEF" });
      });
    });
    bb.on("field", (name, value) => {
      ;
      req.body = req.body || {};
      req.body[name] = value;
    });
    bb.on("close", () => {
      if (!fileReceived && !res.headersSent) {
        return res.status(400).json({ error: "\u6CA1\u6709\u6587\u4EF6" });
      }
      if (!res.headersSent) next();
    });
    bb.on("error", (err) => {
      return res.status(400).json({ error: err.message });
    });
    req.pipe(bb);
  };
}
function getStorageForRequest(req) {
  const poolId = req.query.poolId || req.body?.poolId || req.headers["x-pool-id"];
  if (poolId) {
    return getStorageByPoolId(req.userId, parseInt(poolId));
  }
  return getStorage(req.userId);
}
async function processConcurrently(items, fn, concurrency = 3) {
  const errors = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const currentIndex = index++;
      try {
        await fn(items[currentIndex], currentIndex);
      } catch (err) {
        errors.push(err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return errors;
}
function createUploadPassThrough() {
  return new PassThrough3();
}

// server/routes/files/offline-routes.ts
await init_db();
async function checkLocalQuota(userId, resolvedPoolId, size) {
  const pool = await db_default.prepare("SELECT storage_type FROM storage_pools WHERE id = ?").get(resolvedPoolId);
  if (pool?.storage_type !== "local") {
    return { allowed: true, pool, message: void 0 };
  }
  const { checkQuota: checkQuota2 } = await init_quota().then(() => quota_exports);
  const quotaCheck = await checkQuota2(userId, size);
  return { ...quotaCheck, pool };
}
function registerOfflineTaskRoutes(router15) {
  router15.post("/remote-upload", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      const { url, dirPath, poolId } = req.body;
      if (!url) {
        return res.status(400).json({ error: "\u7F3A\u5C11 URL" });
      }
      const storage = poolId ? getStorageByPoolId(req.userId, poolId) : getStorageForRequest(req);
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: `\u4E0B\u8F7D\u5931\u8D25: ${response.statusText}` });
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const resolvedPoolId = await resolvePoolId(req.userId, poolId);
      const quotaCheck = await checkLocalQuota(req.userId, resolvedPoolId, buffer.length);
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message });
      }
      const urlObj = new URL(url);
      let fileName = urlObj.pathname.split("/").pop() || "remote-file";
      try {
        fileName = decodeURIComponent(fileName);
      } catch {
      }
      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
      await storage.upload(filePath, buffer);
      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId);
      res.json({ message: "\u8FDC\u7A0B\u4E0A\u4F20\u6210\u529F", path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || "local", directUrl, fileUrl: directUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.post("/offline-download", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      const { url, dirPath, poolId } = req.body;
      if (!url) {
        return res.status(400).json({ error: "\u7F3A\u5C11 URL" });
      }
      const resolvedPoolId = await resolvePoolId(req.userId, poolId);
      if (!resolvedPoolId) {
        return res.status(400).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
      }
      const taskId = await createOfflineDownloadTask(req.userId, resolvedPoolId, url, dirPath || "");
      res.json({ message: "\u79BB\u7EBF\u4E0B\u8F7D\u4EFB\u52A1\u5DF2\u521B\u5EFA", taskId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.get("/offline-download/tasks", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      res.json({ tasks: await listOfflineDownloadTasks(req.userId) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.post("/offline-download/tasks/:id/cancel", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await cancelOfflineDownloadTask(req.userId, Number(req.params.id));
      res.json({ message: "\u4EFB\u52A1\u5DF2\u53D6\u6D88" });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  router15.post("/offline-download/tasks/:id/retry", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await retryOfflineDownloadTask(req.userId, Number(req.params.id));
      res.json({ message: "\u4EFB\u52A1\u5DF2\u91CD\u65B0\u52A0\u5165\u961F\u5217" });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  router15.post("/offline-download/tasks/clear-finished", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await clearFinishedOfflineDownloadTasks(req.userId);
      res.json({ message: "\u5DF2\u6E05\u7A7A\u5DF2\u7ED3\u675F\u4EFB\u52A1" });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

// server/routes/files/upload-routes.ts
import crypto5 from "crypto";
import fs10 from "fs/promises";
import path13 from "path";
await init_db();
async function checkLocalQuota2(userId, resolvedPoolId, size) {
  const pool = await db_default.prepare("SELECT storage_type FROM storage_pools WHERE id = ?").get(resolvedPoolId);
  if (pool?.storage_type !== "local") {
    return { allowed: true, pool };
  }
  const { checkQuota: checkQuota2 } = await init_quota().then(() => quota_exports);
  const quotaCheck = await checkQuota2(userId, size);
  return { ...quotaCheck, pool };
}
function registerUploadRoutes(router15) {
  router15.post("/upload", flexibleAuth, requirePermission("write"), uploadSingle("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "\u6CA1\u6709\u6587\u4EF6" });
      const poolId = req.query.poolId || req.body.poolId;
      const resolvedPoolId = await resolvePoolId(req.userId, poolId);
      const quotaCheck = await checkLocalQuota2(req.userId, resolvedPoolId, req.file.size);
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message });
      }
      const storage = getStorageForRequest(req);
      const dirPath = req.query.path || "";
      let normalizedName = req.file.originalname;
      try {
        normalizedName = decodeURIComponent(normalizedName);
      } catch {
      }
      normalizedName = normalizedName.normalize("NFC");
      const filePath = dirPath ? `${dirPath}/${normalizedName}` : normalizedName;
      await storage.upload(filePath, req.file.buffer);
      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId);
      res.json({ message: "\u4E0A\u4F20\u6210\u529F", path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || "local", directUrl, fileUrl: directUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.post("/write", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      if (!filePath || content === void 0) {
        return res.status(400).json({ error: "\u7F3A\u5C11 filePath \u6216 content" });
      }
      if (typeof content !== "string") {
        return res.status(400).json({ error: "content \u5FC5\u987B\u662F\u5B57\u7B26\u4E32" });
      }
      if (content.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: "\u6587\u4EF6\u8FC7\u5927\uFF0C\u8BF7\u4F7F\u7528\u4E0A\u4F20\u529F\u80FD" });
      }
      const storage = getStorageForRequest(req);
      const buffer = Buffer.from(content, "utf-8");
      await Promise.race([
        storage.upload(filePath, buffer),
        new Promise((_, reject) => setTimeout(() => reject(new Error("\u4FDD\u5B58\u8D85\u65F6")), 3e4))
      ]);
      res.json({ success: true, path: filePath });
    } catch (err) {
      console.error("Write error:", err.message);
      res.status(500).json({ error: err.message || "\u4FDD\u5B58\u5931\u8D25" });
    }
  });
  router15.post("/upload-stream", flexibleAuth, requirePermission("write"), async (req, res) => {
    let tempPath = null;
    let fileHandle = null;
    try {
      await cleanupExpiredUploads();
      const rawFileName = req.headers["x-file-name"];
      let fileName;
      try {
        fileName = decodeURIComponent(rawFileName);
      } catch {
        fileName = rawFileName;
      }
      fileName = fileName.normalize("NFC");
      const rawDirPath = req.headers["x-dir-path"] || "";
      let dirPath;
      try {
        dirPath = decodeURIComponent(rawDirPath);
      } catch {
        dirPath = rawDirPath;
      }
      dirPath = dirPath.normalize("NFC");
      const poolIdStr = req.headers["x-pool-id"];
      if (!fileName) {
        return res.status(400).json({ error: "\u7F3A\u5C11 X-File-Name \u5934" });
      }
      if (isJunkFile(fileName)) {
        return res.status(400).json({ error: `\u5DF2\u62E6\u622A\u7CFB\u7EDF\u6587\u4EF6: ${fileName}` });
      }
      const resolvedPoolId = await resolvePoolId(req.userId, poolIdStr);
      const pool = await db_default.prepare("SELECT storage_type FROM storage_pools WHERE id = ?").get(resolvedPoolId);
      const storage = poolIdStr ? getStorageByPoolId(req.userId, parseInt(poolIdStr)) : getStorageForRequest(req);
      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName;
      const contentLengthHeader = req.headers["content-length"];
      const contentLength = typeof contentLengthHeader === "string" ? parseInt(contentLengthHeader, 10) : NaN;
      if (Number.isFinite(contentLength)) {
        const quotaCheck2 = await checkLocalQuota2(req.userId, resolvedPoolId, contentLength);
        if (!quotaCheck2.allowed) {
          return res.status(400).json({ error: quotaCheck2.message });
        }
      }
      const uploadPath = shouldUseAtomicTempUpload(pool?.storage_type) ? buildTemporaryUploadPath(filePath) : filePath;
      if (storage.uploadStream) {
        let requestAborted2 = false;
        const uploadStream = createUploadPassThrough();
        req.on("aborted", () => {
          requestAborted2 = true;
          uploadStream.destroy(new Error("\u4E0A\u4F20\u5DF2\u53D6\u6D88"));
        });
        req.on("error", (err) => {
          uploadStream.destroy(err);
        });
        req.pipe(uploadStream);
        try {
          await storage.uploadStream(uploadPath, uploadStream, Number.isFinite(contentLength) ? contentLength : void 0);
          if (uploadPath !== filePath) {
            await finalizeAtomicUpload(storage, uploadPath, filePath);
          }
        } catch (err) {
          if (uploadPath !== filePath) {
            await storage.remove(uploadPath).catch(() => {
            });
          }
          throw err;
        }
        if (requestAborted2) {
          if (uploadPath !== filePath) {
            await storage.remove(uploadPath).catch(() => {
            });
          }
          throw new Error("\u4E0A\u4F20\u5DF2\u53D6\u6D88");
        }
        const directUrl2 = buildDirectUrl(req, filePath, resolvedPoolId);
        return res.json({ message: "\u6D41\u5F0F\u4E0A\u4F20\u6210\u529F", path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || "local", directUrl: directUrl2, fileUrl: directUrl2 });
      }
      const tempId = crypto5.randomBytes(16).toString("hex");
      tempPath = path13.join(UPLOAD_TEMP_DIR, tempId);
      await fs10.mkdir(UPLOAD_TEMP_DIR, { recursive: true });
      fileHandle = await fs10.open(tempPath, "w");
      let requestAborted = false;
      await new Promise((resolve, reject) => {
        req.on("data", async (chunk) => {
          try {
            await fileHandle.write(chunk);
          } catch (err) {
            reject(err);
          }
        });
        req.on("end", () => resolve());
        req.on("aborted", () => {
          requestAborted = true;
          reject(new Error("\u4E0A\u4F20\u5DF2\u53D6\u6D88"));
        });
        req.on("error", (err) => reject(err));
      });
      await fileHandle.close();
      fileHandle = null;
      if (requestAborted) {
        throw new Error("\u4E0A\u4F20\u5DF2\u53D6\u6D88");
      }
      const buffer = await fs10.readFile(tempPath);
      const quotaCheck = await checkLocalQuota2(req.userId, resolvedPoolId, buffer.length);
      if (!quotaCheck.allowed) {
        await fs10.unlink(tempPath).catch(() => {
        });
        return res.status(400).json({ error: quotaCheck.message });
      }
      try {
        await storage.upload(uploadPath, buffer);
        if (uploadPath !== filePath) {
          await finalizeAtomicUpload(storage, uploadPath, filePath);
        }
      } catch (err) {
        if (uploadPath !== filePath) {
          await storage.remove(uploadPath).catch(() => {
          });
        }
        throw err;
      }
      await fs10.unlink(tempPath).catch(() => {
      });
      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId);
      res.json({ message: "\u6D41\u5F0F\u4E0A\u4F20\u6210\u529F", path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || "local", directUrl, fileUrl: directUrl });
    } catch (err) {
      if (err.message === "\u4E0A\u4F20\u5DF2\u53D6\u6D88") {
        return res.status(499).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    } finally {
      if (fileHandle) await fileHandle.close().catch(() => {
      });
      if (tempPath) await fs10.unlink(tempPath).catch(() => {
      });
    }
  });
  router15.post("/upload/init", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await cleanupExpiredUploads();
      const { fileName: rawFileName, fileSize, dirPath, poolId } = req.body;
      const fileName = rawFileName ? rawFileName.normalize("NFC") : rawFileName;
      if (!fileName || !fileSize) {
        return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u540D\u6216\u6587\u4EF6\u5927\u5C0F" });
      }
      if (isJunkFile(fileName)) {
        return res.status(400).json({ error: `\u5DF2\u62E6\u622A\u7CFB\u7EDF\u6587\u4EF6: ${fileName}` });
      }
      const uploadId = crypto5.randomBytes(16).toString("hex");
      const uploadDir = path13.join(UPLOAD_TEMP_DIR, uploadId);
      await fs10.mkdir(uploadDir, { recursive: true });
      await fs10.writeFile(path13.join(uploadDir, "meta.json"), JSON.stringify({
        fileName,
        fileSize,
        dirPath: dirPath || "",
        poolId: poolId || null,
        userId: req.userId,
        uploadedParts: [],
        nextPartIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));
      res.json({ uploadId, message: "\u5206\u7247\u4E0A\u4F20\u5DF2\u521D\u59CB\u5316" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.patch("/upload/:uploadId/chunk", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await cleanupExpiredUploads();
      const uploadId = req.params.uploadId;
      const contentRange = req.headers["content-range"];
      if (!contentRange) {
        return res.status(400).json({ error: "\u7F3A\u5C11 Content-Range \u5934" });
      }
      const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/);
      if (!match) {
        return res.status(400).json({ error: "Content-Range \u683C\u5F0F\u9519\u8BEF" });
      }
      let task;
      try {
        task = await readUploadMeta(uploadId);
      } catch {
        return res.status(404).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u4E0D\u5B58\u5728" });
      }
      const { uploadDir, metaPath, meta } = task;
      if (meta.userId !== req.userId) {
        return res.status(403).json({ error: "\u65E0\u6743\u64CD\u4F5C\u6B64\u4E0A\u4F20\u4EFB\u52A1" });
      }
      if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
        await removeUploadTask(uploadId);
        return res.status(410).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u5DF2\u8FC7\u671F" });
      }
      const partIndex = meta.nextPartIndex ?? meta.uploadedParts.length;
      const partPath = path13.join(uploadDir, `part-${String(partIndex).padStart(6, "0")}`);
      const writeStream = await fs10.open(partPath, "w");
      await new Promise((resolve, reject) => {
        req.on("data", async (chunk) => {
          try {
            await writeStream.write(chunk);
          } catch (err) {
            reject(err);
          }
        });
        req.on("end", () => resolve());
        req.on("error", (err) => reject(err));
      });
      await writeStream.close();
      if (!meta.uploadedParts.includes(partIndex)) {
        meta.uploadedParts.push(partIndex);
      }
      meta.nextPartIndex = partIndex + 1;
      await writeUploadMeta(metaPath, meta);
      res.json({ message: "\u5206\u7247\u4E0A\u4F20\u6210\u529F", partIndex, uploadedParts: meta.uploadedParts });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.get("/upload/:uploadId/status", flexibleAuth, requirePermission("read"), async (req, res) => {
    try {
      await cleanupExpiredUploads();
      const uploadId = req.params.uploadId;
      let task;
      try {
        task = await readUploadMeta(uploadId);
      } catch {
        return res.status(404).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u4E0D\u5B58\u5728" });
      }
      const { meta } = task;
      if (meta.userId !== req.userId) {
        return res.status(403).json({ error: "\u65E0\u6743\u67E5\u770B\u6B64\u4E0A\u4F20\u4EFB\u52A1" });
      }
      if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
        await removeUploadTask(uploadId);
        return res.status(410).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u5DF2\u8FC7\u671F" });
      }
      res.json({
        fileName: meta.fileName,
        fileSize: meta.fileSize,
        uploadedParts: meta.uploadedParts,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        expiresAt: (meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.post("/upload/:uploadId/complete", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      await cleanupExpiredUploads();
      const uploadId = req.params.uploadId;
      let task;
      try {
        task = await readUploadMeta(uploadId);
      } catch {
        return res.status(404).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u4E0D\u5B58\u5728" });
      }
      const { uploadDir, meta } = task;
      if (meta.userId !== req.userId) {
        return res.status(403).json({ error: "\u65E0\u6743\u64CD\u4F5C\u6B64\u4E0A\u4F20\u4EFB\u52A1" });
      }
      if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
        await removeUploadTask(uploadId);
        return res.status(410).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u5DF2\u8FC7\u671F" });
      }
      const parts = (await fs10.readdir(uploadDir)).filter((file) => file.startsWith("part-")).sort();
      const buffers = [];
      for (const part of parts) {
        buffers.push(await fs10.readFile(path13.join(uploadDir, part)));
      }
      const finalBuffer = Buffer.concat(buffers);
      const resolvedPoolId = await resolvePoolId(req.userId, meta.poolId);
      const quotaCheck = await checkLocalQuota2(req.userId, resolvedPoolId, finalBuffer.length);
      if (!quotaCheck.allowed) {
        await fs10.rm(uploadDir, { recursive: true, force: true }).catch(() => {
        });
        return res.status(400).json({ error: quotaCheck.message });
      }
      const storage = meta.poolId ? getStorageByPoolId(req.userId, meta.poolId) : getStorage(req.userId);
      const filePath = meta.dirPath ? `${meta.dirPath}/${meta.fileName}` : meta.fileName;
      await storage.upload(filePath, finalBuffer);
      await fs10.rm(uploadDir, { recursive: true, force: true }).catch(() => {
      });
      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId);
      res.json({ message: "\u5206\u7247\u4E0A\u4F20\u5B8C\u6210", path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || "local", directUrl, fileUrl: directUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  router15.delete("/upload/:uploadId", flexibleAuth, requirePermission("write"), async (req, res) => {
    try {
      const uploadId = req.params.uploadId;
      let task;
      try {
        task = await readUploadMeta(uploadId);
      } catch {
        return res.status(404).json({ error: "\u4E0A\u4F20\u4EFB\u52A1\u4E0D\u5B58\u5728" });
      }
      if (task.meta.userId !== req.userId) {
        return res.status(403).json({ error: "\u65E0\u6743\u64CD\u4F5C\u6B64\u4E0A\u4F20\u4EFB\u52A1" });
      }
      await removeUploadTask(uploadId);
      res.json({ message: "\u4E0A\u4F20\u7F13\u5B58\u5DF2\u6E05\u7406" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// server/routes/files.ts
var router2 = Router3();
registerUploadRoutes(router2);
registerOfflineTaskRoutes(router2);
router2.get("/list", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    await cleanupExpiredUploads();
    const poolId = req.query.poolId;
    const prefix = req.query.path || "";
    if (!poolId && !prefix) {
      const pools = await db_default.prepare(`
        SELECT id, name, storage_type, is_default, created_at
        FROM storage_pools WHERE user_id = ?
        ORDER BY is_default DESC, created_at ASC
      `).all(req.userId);
      const virtualFiles = pools.map((pool) => ({
        name: pool.name,
        type: "folder",
        size: 0,
        modified: pool.created_at || (/* @__PURE__ */ new Date()).toISOString(),
        path: "",
        poolId: pool.id,
        isPool: true,
        directUrl: "",
        fileUrl: ""
      }));
      return res.json({ files: virtualFiles });
    }
    const storage = getStorageForRequest(req);
    const files = await storage.list(prefix);
    const resolvedPoolId = await resolvePoolId(req.userId, poolId);
    const filesWithPool = files.filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name)).map((file) => withDirectUrl(req, { ...file, poolId: resolvedPoolId }, resolvedPoolId));
    let readme = null;
    if (resolvedPoolId && prefix) {
      const readmeFile = filesWithPool.find(
        (file) => file.type === "file" && ["readme.md", "readme.markdown"].includes(file.name.toLowerCase())
      );
      if (readmeFile) {
        readme = {
          name: readmeFile.name,
          path: readmeFile.path,
          directUrl: readmeFile.directUrl,
          fileUrl: readmeFile.fileUrl
        };
      }
    }
    res.json({ files: filesWithPool, readme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/info", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    await cleanupExpiredUploads();
    const storage = getStorageForRequest(req);
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const info = await storage.info(filePath);
    const resolvedPoolId = await resolvePoolId(req.userId, req.query.poolId);
    res.json({ info: withDirectUrl(req, { ...info, poolId: resolvedPoolId }, resolvedPoolId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/download", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const data = await storage.download(filePath);
    const fileName = filePath.split("/").pop() || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var handleDelete = async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const filePath = req.body?.path || req.query.path;
    const permanent = req.query.permanent === "true" || req.body?.permanent === true;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u8DEF\u5F84" });
    }
    if (permanent) {
      await storage.remove(filePath);
    } else {
      const fileName = filePath.split("/").pop() || "";
      const poolId = req.body?.poolId || req.query.poolId;
      let storagePoolId;
      if (poolId) {
        storagePoolId = parseInt(poolId);
      } else {
        const defaultPool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(req.userId);
        storagePoolId = defaultPool?.id || 1;
      }
      const stat = await storage.info(filePath).catch(() => ({ type: "file" }));
      const result = await db_default.prepare("INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)").run(req.userId, filePath, fileName, stat.type, storagePoolId);
      const trashPath = buildTrashPath(result.lastInsertRowid, fileName);
      await moveToTrash(storage, filePath, trashPath, stat.type);
      return res.json({ message: "\u5220\u9664\u6210\u529F" });
      try {
        const data = await storage.download(filePath);
        await storage.upload(trashPath, data);
      } catch {
      }
      await storage.remove(filePath);
    }
    res.json({ message: "\u5220\u9664\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
router2.delete("/delete", flexibleAuth, requirePermission("delete"), handleDelete);
router2.post("/delete", flexibleAuth, requirePermission("delete"), handleDelete);
router2.post("/batch-delete", flexibleAuth, requirePermission("delete"), async (req, res) => {
  try {
    const { paths, permanent } = req.body;
    if (!paths || !Array.isArray(paths)) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u8DEF\u5F84\u5217\u8868" });
    }
    const storage = getStorageForRequest(req);
    const poolId = req.body.poolId;
    let storagePoolId = poolId;
    if (!storagePoolId) {
      const defaultPool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(req.userId);
      storagePoolId = defaultPool?.id || 1;
    }
    const errors = [];
    for (const filePath of paths) {
      try {
        if (permanent) {
          await storage.remove(filePath);
        } else {
          const fileName = filePath.split("/").pop() || "";
          const stat = await storage.info(filePath).catch(() => ({ type: "file" }));
          const result = await db_default.prepare("INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)").run(req.userId, filePath, fileName, stat.type, storagePoolId);
          const trashPath = buildTrashPath(result.lastInsertRowid, fileName);
          await moveToTrash(storage, filePath, trashPath, stat.type);
          continue;
          try {
            const data = await storage.download(filePath);
            await storage.upload(trashPath, data);
          } catch {
          }
          await storage.remove(filePath);
        }
      } catch (err) {
        errors.push(`${filePath}: ${err.message}`);
      }
    }
    res.json({ message: "\u6279\u91CF\u5220\u9664\u5B8C\u6210", errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/batch-move", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const { paths, dest } = req.body;
    if (!paths || !Array.isArray(paths) || !dest) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    const storage = getStorageForRequest(req);
    const errors = [];
    for (const srcPath of paths) {
      try {
        const fileName = srcPath.split("/").pop() || "";
        const destPath = dest ? `${dest}/${fileName}` : fileName;
        await storage.move(srcPath, destPath);
      } catch (err) {
        errors.push(`${srcPath}: ${err.message}`);
      }
    }
    res.json({ message: "\u6279\u91CF\u79FB\u52A8\u5B8C\u6210", errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/mkdir", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const dirPath = req.body.path;
    if (!dirPath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u5939\u8DEF\u5F84" });
    }
    await storage.mkdir(dirPath);
    res.json({ message: "\u6587\u4EF6\u5939\u521B\u5EFA\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/rename", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const { path: filePath, newName: rawNewName } = req.body;
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    const newName = rawNewName.normalize("NFC");
    await storage.rename(filePath, newName);
    res.json({ message: "\u91CD\u547D\u540D\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/move", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const { src, dest } = req.body;
    if (!src || !dest) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    await storage.move(src, dest);
    res.json({ message: "\u79FB\u52A8\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/copy", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const { src, dest } = req.body;
    if (!src || !dest) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    await storage.copy(src, dest);
    res.json({ message: "\u590D\u5236\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/cross-copy", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body;
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    const srcStorage = getStorageByPoolId(req.userId, srcPoolId);
    const destStorage = getStorageByPoolId(req.userId, destPoolId);
    const errors = await processConcurrently(srcPaths, async (srcPath, index) => {
      const fileName = names && names[index] || srcPath.split("/").filter(Boolean).pop() || "";
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName;
      const data = await srcStorage.download(srcPath);
      await destStorage.upload(targetPath, data);
    });
    res.json({ message: "\u8DE8\u6C60\u590D\u5236\u5B8C\u6210", errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/cross-move", flexibleAuth, requirePermission("write"), async (req, res) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body;
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u53C2\u6570" });
    }
    const srcStorage = getStorageByPoolId(req.userId, srcPoolId);
    const destStorage = getStorageByPoolId(req.userId, destPoolId);
    const errors = await processConcurrently(srcPaths, async (srcPath, index) => {
      const fileName = names && names[index] || srcPath.split("/").filter(Boolean).pop() || "";
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName;
      const data = await srcStorage.download(srcPath);
      await destStorage.upload(targetPath, data);
      await srcStorage.remove(srcPath);
    });
    res.json({ message: "\u8DE8\u6C60\u79FB\u52A8\u5B8C\u6210", errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/search", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    await cleanupExpiredUploads();
    const storage = getStorageForRequest(req);
    const keyword = req.query.q;
    const prefix = req.query.path || "";
    if (!keyword) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u641C\u7D22\u5173\u952E\u8BCD" });
    }
    const files = await storage.search(prefix, keyword);
    const resolvedPoolId = await resolvePoolId(req.userId, req.query.poolId);
    const normalized = files.filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name)).map((file) => withDirectUrl(req, { ...file, poolId: resolvedPoolId }, resolvedPoolId));
    res.json({ files: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/preview", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    const storage = getStorageForRequest(req);
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const mimeTypes3 = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      svg: "image/svg+xml",
      webp: "image/webp",
      mp4: "video/mp4",
      webm: "video/webm",
      ogg: "audio/ogg",
      aac: "audio/aac",
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      flac: "audio/flac",
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      json: "application/json",
      js: "text/javascript",
      ts: "text/typescript",
      html: "text/html",
      css: "text/css",
      xml: "text/xml",
      yaml: "text/yaml",
      yml: "text/yml",
      py: "text/x-python",
      java: "text/x-java",
      go: "text/x-go",
      rs: "text/x-rust",
      vue: "text/x-vue",
      sh: "text/x-shellscript"
    };
    const contentType = mimeTypes3[ext] || "application/octet-stream";
    const isMedia = contentType.startsWith("audio/") || contentType.startsWith("video/");
    const cachedMedia = isMedia ? await resolvePreviewCacheFile(`user:${req.userId}:pool:${req.query.poolId || "default"}`, storage, filePath) : null;
    if (cachedMedia) {
      const fileOnDisk = cachedMedia.path;
      const stat = cachedMedia.stat;
      const fileSize = stat.size;
      const etag2 = `"${fileSize}-${stat.mtimeMs}"`;
      const range = req.headers.range;
      if (!range && req.headers["if-none-match"] === etag2) {
        res.status(304).end();
        return;
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);
      res.setHeader("ETag", etag2);
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);
        const stream = fsSync2.createReadStream(fileOnDisk, { start, end });
        stream.pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        const stream = fsSync2.createReadStream(fileOnDisk);
        stream.pipe(res);
      }
      return;
    }
    const data = await storage.download(filePath);
    if (contentType.startsWith("text/") || contentType === "application/json") {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", data.length);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(data);
      return;
    }
    const etag = `"${data.length}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", data.length);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.post("/download-zip", flexibleAuth, requirePermission("read"), async (req, res) => {
  try {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const storage = getStorageForRequest(req);
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    for (const filePath of paths) {
      try {
        const data = await storage.download(filePath);
        const fileName = filePath.split("/").pop() || "file";
        zip.file(fileName, data);
      } catch {
      }
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="download.zip"');
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router2.get("/storage-stats", authMiddleware, async (req, res) => {
  try {
    const poolId = req.query.poolId;
    const storage = poolId ? getStorageByPoolId(req.userId, parseInt(poolId)) : getStorage(req.userId);
    async function calculateStats(prefix) {
      let totalSize = 0;
      let fileCount = 0;
      let folderCount = 0;
      try {
        const files = await storage.list(prefix);
        for (const file of files) {
          if (file.type === "file") {
            totalSize += file.size;
            fileCount += 1;
          } else {
            folderCount += 1;
            const nested = await calculateStats(file.path);
            totalSize += nested.totalSize;
            fileCount += nested.fileCount;
            folderCount += nested.folderCount;
          }
        }
      } catch {
      }
      return { totalSize, fileCount, folderCount };
    }
    const stats = await calculateStats("");
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var files_default = router2;

// server/routes/user.ts
await init_db();
import { Router as Router4 } from "express";
import crypto6 from "crypto";
await init_quota();
var router3 = Router4();
router3.get("/info", authMiddleware, async (req, res) => {
  try {
    const user = await db_default.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(req.userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const pools = await db_default.prepare(`
      SELECT id, name, storage_type, is_default, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId);
    const trashCount = (await db_default.prepare("SELECT COUNT(*) as c FROM trash WHERE user_id = ?").get(req.userId)).c;
    const favCount = (await db_default.prepare("SELECT COUNT(*) as c FROM favourites WHERE user_id = ?").get(req.userId)).c;
    const shareCount = (await db_default.prepare("SELECT COUNT(*) as c FROM shares WHERE user_id = ?").get(req.userId)).c;
    const apiKeyCount = (await db_default.prepare("SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?").get(req.userId)).c;
    const guestShareCount = (await db_default.prepare("SELECT COUNT(*) as c FROM guest_shares WHERE user_id = ?").get(req.userId)).c;
    const quota = await getUserQuota(req.userId);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme
        },
        pools: pools.map((pool) => ({
          id: pool.id,
          name: pool.name,
          storageType: pool.storage_type,
          isDefault: !!pool.is_default,
          createdAt: pool.created_at
        })),
        stats: {
          trashCount,
          favCount,
          shareCount,
          apiKeyCount,
          guestShareCount
        },
        storage: {
          quota: quota.quota,
          used: quota.used,
          remaining: quota.remaining,
          quotaFormatted: formatBytes(quota.quota),
          usedFormatted: formatBytes(quota.used)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.get("/settings", authMiddleware, async (req, res) => {
  try {
    const settings = await db_default.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(req.userId);
    if (!settings) {
      await db_default.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(req.userId);
      return res.json({
        settings: {
          guestEnabled: false,
          guestPath: "",
          theme: "system"
        }
      });
    }
    res.json({
      settings: {
        guestEnabled: !!settings.guest_enabled,
        guestPath: settings.guest_path,
        theme: settings.theme
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.put("/settings", authMiddleware, async (req, res) => {
  try {
    const { guestEnabled, guestPath, theme } = req.body;
    const updates = [];
    const values = [];
    if (guestEnabled !== void 0) {
      updates.push("guest_enabled = ?");
      values.push(guestEnabled ? 1 : 0);
    }
    if (guestPath !== void 0) {
      updates.push("guest_path = ?");
      values.push(guestPath);
    }
    if (theme !== void 0) {
      updates.push("theme = ?");
      values.push(theme);
    }
    if (updates.length > 0) {
      values.push(req.userId);
      await db_default.prepare(`UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = ?`).run(...values);
    }
    res.json({ message: "\u8BBE\u7F6E\u5DF2\u66F4\u65B0" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.get("/apikeys", authMiddleware, async (req, res) => {
  try {
    const keys = await db_default.prepare("SELECT id, name, key, permissions, created_at FROM api_keys WHERE user_id = ?").all(req.userId);
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.post("/apikeys", authMiddleware, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    if (!name) {
      return res.status(400).json({ error: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    const key = `vfm_${crypto6.randomBytes(32).toString("hex")}`;
    const perms = permissions || "read";
    await db_default.prepare("INSERT INTO api_keys (user_id, name, key, permissions) VALUES (?, ?, ?, ?)").run(
      req.userId,
      name,
      key,
      perms
    );
    res.json({ message: "API Key \u521B\u5EFA\u6210\u529F", key, name, permissions: perms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.delete("/apikeys/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db_default.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "API Key \u4E0D\u5B58\u5728" });
    }
    res.json({ message: "API Key \u5DF2\u5220\u9664" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.get("/guest-shares", authMiddleware, async (req, res) => {
  try {
    const shares = await db_default.prepare(`
      SELECT gs.*, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.user_id = ?
      ORDER BY gs.created_at DESC
    `).all(req.userId);
    res.json({ shares });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.post("/guest-shares", authMiddleware, async (req, res) => {
  try {
    const { folderPath, storagePoolId, label, permissions } = req.body;
    if (!folderPath || !storagePoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u5939\u8DEF\u5F84\u6216\u5B58\u50A8\u6C60 ID" });
    }
    const pool = await db_default.prepare("SELECT id, name FROM storage_pools WHERE id = ? AND user_id = ?").get(storagePoolId, req.userId);
    if (!pool) {
      return res.status(404).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    const existing = await db_default.prepare("SELECT id FROM guest_shares WHERE user_id = ? AND folder_path = ? AND storage_pool_id = ?").get(req.userId, folderPath, storagePoolId);
    if (existing) {
      return res.status(409).json({ error: "\u8BE5\u6587\u4EF6\u5939\u5DF2\u7ECF\u5206\u4EAB\u81F3\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const perms = permissions || "read";
    const nextLabel = label || folderPath.split("/").pop() || "\u6839\u76EE\u5F55";
    const result = await db_default.prepare("INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label, permissions) VALUES (?, ?, ?, ?, ?)").run(req.userId, folderPath, storagePoolId, nextLabel, perms);
    res.json({
      message: "\u5DF2\u5206\u4EAB\u81F3\u8BBF\u5BA2\u6A21\u5F0F",
      share: {
        id: result.lastInsertRowid,
        folder_path: folderPath,
        storage_pool_id: storagePoolId,
        label: nextLabel,
        permissions: perms,
        pool_name: pool.name
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.put("/guest-shares/:id", authMiddleware, async (req, res) => {
  try {
    const { permissions, label } = req.body;
    const id = parseInt(req.params.id, 10);
    const share = await db_default.prepare("SELECT id, label, permissions FROM guest_shares WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    const newPermissions = permissions || share.permissions;
    const newLabel = label !== void 0 ? label : share.label;
    await db_default.prepare("UPDATE guest_shares SET permissions = ?, label = ? WHERE id = ? AND user_id = ?").run(newPermissions, newLabel, id, req.userId);
    res.json({
      message: "\u5DF2\u66F4\u65B0",
      share: {
        id,
        permissions: newPermissions,
        label: newLabel
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router3.delete("/guest-shares/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db_default.prepare("DELETE FROM guest_shares WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    res.json({ message: "\u5DF2\u53D6\u6D88\u8BBF\u5BA2\u5206\u4EAB" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var user_default = router3;

// server/routes/admin.ts
import { Router as Router8 } from "express";

// server/routes/admin/users.ts
await init_db();
import { Router as Router5 } from "express";
import crypto7 from "crypto";
await init_quota();

// server/routes/admin/shared.ts
function sendServerError(res, err) {
  const message = err instanceof Error ? err.message : "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF";
  res.status(500).json({ error: message });
}

// server/routes/admin/users.ts
var router4 = Router5();
router4.get("/users", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const users = await db_default.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.storage_quota, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `).all();
    const usersWithUsage = await Promise.all(users.map(async (user) => {
      const quota = await getUserQuota(user.id);
      return { ...user, storage_used: quota.used };
    }));
    res.json({ users: usersWithUsage });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.get("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await db_default.prepare(`
      SELECT u.id, u.username, u.email, u.verified, u.role, u.banned, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const pools = (await db_default.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(userId)).map((pool) => {
      const cfg = JSON.parse(pool.config || "{}");
      delete cfg.upyunPassword;
      delete cfg.ftpPassword;
      delete cfg.s3SecretAccessKey;
      delete cfg.sftpPassword;
      delete cfg.sftpPrivateKey;
      return {
        id: pool.id,
        name: pool.name,
        storageType: pool.storage_type,
        isDefault: !!pool.is_default,
        config: cfg,
        createdAt: pool.created_at
      };
    });
    const trashCount = (await db_default.prepare("SELECT COUNT(*) as c FROM trash WHERE user_id = ?").get(userId)).c;
    const favCount = (await db_default.prepare("SELECT COUNT(*) as c FROM favourites WHERE user_id = ?").get(userId)).c;
    const shareCount = (await db_default.prepare("SELECT COUNT(*) as c FROM shares WHERE user_id = ?").get(userId)).c;
    const apiKeyCount = (await db_default.prepare("SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?").get(userId)).c;
    const quota = await getUserQuota(userId);
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        verified: !!user.verified,
        role: user.role,
        banned: !!user.banned,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme
        },
        pools,
        stats: { trashCount, favCount, shareCount, apiKeyCount },
        storage: { quota: quota.quota, used: quota.used, remaining: quota.remaining }
      }
    });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.post("/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "\u7528\u6237\u540D\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: "\u7528\u6237\u540D\u957F\u5EA6\u9700\u5728 3 \u5230 20 \u4E2A\u5B57\u7B26\u4E4B\u95F4" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "\u5BC6\u7801\u957F\u5EA6\u4E0D\u80FD\u5C11\u4E8E 6 \u4F4D" });
    }
    if (role && !["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "\u65E0\u6548\u7684\u89D2\u8272" });
    }
    const existing = await db_default.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return res.status(409).json({ error: "\u7528\u6237\u540D\u5DF2\u5B58\u5728" });
    }
    const hashedPassword = crypto7.createHash("md5").update(password).digest("hex");
    const result = await db_default.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)").run(
      username,
      hashedPassword,
      role || "user"
    );
    const userId = result.lastInsertRowid;
    await db_default.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
    await syncStoragePoolsFromConfig2(userId);
    res.json({
      message: "\u7528\u6237\u521B\u5EFA\u6210\u529F",
      user: { id: userId, username, role: role || "user" }
    });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.put("/users/:id/role", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = Number(req.params.id);
    if (!["admin", "user"].includes(role)) {
      return res.status(400).json({ error: "\u65E0\u6548\u7684\u89D2\u8272" });
    }
    if (userId === req.userId && role !== "admin") {
      return res.status(400).json({ error: "\u4E0D\u80FD\u964D\u4F4E\u81EA\u5DF1\u7684\u7BA1\u7406\u5458\u6743\u9650" });
    }
    await db_default.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, userId);
    res.json({ message: "\u89D2\u8272\u5DF2\u66F4\u65B0" });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.put("/users/:id/ban", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.userId) {
      return res.status(400).json({ error: "\u4E0D\u80FD\u5C01\u7981\u81EA\u5DF1" });
    }
    const user = await db_default.prepare("SELECT banned, role FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    if (user.role === "admin") {
      return res.status(400).json({ error: "\u4E0D\u80FD\u5C01\u7981\u7BA1\u7406\u5458\u8D26\u53F7" });
    }
    const newBanned = user.banned ? 0 : 1;
    await db_default.prepare("UPDATE users SET banned = ? WHERE id = ?").run(newBanned, userId);
    res.json({ message: newBanned ? "\u7528\u6237\u5DF2\u5C01\u7981" : "\u7528\u6237\u5DF2\u89E3\u5C01", banned: !!newBanned });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.put("/users/:id/password", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = Number(req.params.id);
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "\u5BC6\u7801\u957F\u5EA6\u4E0D\u80FD\u5C11\u4E8E 6 \u4F4D" });
    }
    const user = await db_default.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const hashedPassword = crypto7.createHash("md5").update(password).digest("hex");
    await db_default.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashedPassword, userId);
    res.json({ message: "\u5BC6\u7801\u5DF2\u91CD\u7F6E" });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.delete("/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.userId) {
      return res.status(400).json({ error: "\u4E0D\u80FD\u5220\u9664\u81EA\u5DF1" });
    }
    await db_default.prepare("DELETE FROM users WHERE id = ?").run(userId);
    clearStorageCache(userId);
    res.json({ message: "\u7528\u6237\u5DF2\u5220\u9664" });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.put("/users/:id/quota", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { quota } = req.body;
    if (typeof quota !== "number" || quota < 0) {
      return res.status(400).json({ error: "\u914D\u989D\u503C\u65E0\u6548" });
    }
    const user = await db_default.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    await db_default.prepare("UPDATE users SET storage_quota = ? WHERE id = ?").run(quota, userId);
    res.json({ message: "\u914D\u989D\u5DF2\u66F4\u65B0", quota });
  } catch (err) {
    sendServerError(res, err);
  }
});
router4.put("/users/:id/verify", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await db_default.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    await db_default.prepare("UPDATE users SET verified = 1 WHERE id = ?").run(userId);
    res.json({ message: "\u7528\u6237\u5DF2\u9A8C\u8BC1" });
  } catch (err) {
    sendServerError(res, err);
  }
});
var users_default = router4;

// server/routes/admin/ip-list.ts
await init_db();
import { Router as Router6 } from "express";
var router5 = Router6();
var IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
var CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
function isValidIpv4(ip) {
  if (!IPV4_RE.test(ip)) return false;
  return ip.split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}
function isValidIpPattern(pattern) {
  const value = pattern.trim();
  if (CIDR_RE.test(value)) {
    const [ip, mask] = value.split("/");
    const maskNum = Number(mask);
    return maskNum >= 0 && maskNum <= 32 && isValidIpv4(ip);
  }
  return isValidIpv4(value);
}
async function getIpTableName() {
  const row = await db_default.prepare("SELECT mode FROM ip_list_config WHERE id = 1").get();
  return row?.mode === "whitelist" ? "ip_whitelist" : "ip_blacklist";
}
router5.get("/ip-blacklist", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const table = await getIpTableName();
    const entries = await db_default.prepare(`
      SELECT t.*, u.username as created_by_name
      FROM ${table} t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `).all();
    res.json({ entries });
  } catch (err) {
    sendServerError(res, err);
  }
});
router5.post("/ip-blacklist", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await getIpTableName();
    const { ip_pattern, reason } = req.body;
    if (!ip_pattern || !isValidIpPattern(ip_pattern)) {
      return res.status(400).json({ error: "\u65E0\u6548\u7684 IP \u6216 CIDR \u683C\u5F0F" });
    }
    const existing = await db_default.prepare(`SELECT id FROM ${table} WHERE ip_pattern = ?`).get(ip_pattern.trim());
    if (existing) {
      return res.status(409).json({ error: "\u8BE5 IP \u6216\u7F51\u6BB5\u5DF2\u5B58\u5728" });
    }
    const result = await db_default.prepare(`INSERT INTO ${table} (ip_pattern, reason, created_by) VALUES (?, ?, ?)`).run(
      ip_pattern.trim(),
      reason || "",
      req.userId
    );
    res.json({
      message: "IP \u6761\u76EE\u6DFB\u52A0\u6210\u529F",
      entry: { id: result.lastInsertRowid, ip_pattern: ip_pattern.trim(), reason: reason || "" }
    });
  } catch (err) {
    sendServerError(res, err);
  }
});
router5.delete("/ip-blacklist/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const table = await getIpTableName();
    const id = Number(req.params.id);
    const entry = await db_default.prepare(`SELECT id, ip_pattern FROM ${table} WHERE id = ?`).get(id);
    if (!entry) {
      return res.status(404).json({ error: "\u6761\u76EE\u4E0D\u5B58\u5728" });
    }
    const configRow = await db_default.prepare("SELECT mode FROM ip_list_config WHERE id = 1").get();
    if (configRow?.mode === "whitelist" && entry.ip_pattern === "127.0.0.1") {
      return res.status(400).json({ error: "\u767D\u540D\u5355\u6A21\u5F0F\u4E0B\u4E0D\u80FD\u5220\u9664 127.0.0.1" });
    }
    await db_default.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    res.json({ message: "IP \u6761\u76EE\u5DF2\u5220\u9664" });
  } catch (err) {
    sendServerError(res, err);
  }
});
router5.get("/ip-list/mode", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const row = await db_default.prepare("SELECT mode FROM ip_list_config WHERE id = 1").get();
    res.json({ mode: row?.mode || "blacklist" });
  } catch (err) {
    sendServerError(res, err);
  }
});
router5.put("/ip-list/mode", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { mode } = req.body;
    if (!["blacklist", "whitelist"].includes(mode)) {
      return res.status(400).json({ error: "\u4EC5\u652F\u6301 blacklist \u6216 whitelist" });
    }
    const current = await db_default.prepare("SELECT mode FROM ip_list_config WHERE id = 1").get();
    if (current?.mode === mode) {
      return res.json({ message: "\u6A21\u5F0F\u672A\u53D8\u5316", mode });
    }
    await db_default.prepare("UPDATE ip_list_config SET mode = ? WHERE id = 1").run(mode);
    if (mode === "whitelist") {
      const defaults = [
        { ip: "127.0.0.1", reason: "\u672C\u5730\u56DE\u73AF\u5730\u5740" },
        { ip: "::1", reason: "IPv6 \u672C\u5730\u56DE\u73AF" },
        { ip: "localhost", reason: "\u672C\u5730\u4E3B\u673A\u540D" }
      ];
      const existing = new Set((await db_default.prepare("SELECT ip_pattern FROM ip_whitelist").all()).map((row) => row.ip_pattern));
      const insert = db_default.prepare("INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)");
      for (const item of defaults) {
        if (!existing.has(item.ip)) {
          await insert.run(item.ip, item.reason, req.userId);
        }
      }
    }
    res.json({ message: `\u5DF2\u5207\u6362\u4E3A ${mode} \u6A21\u5F0F`, mode });
  } catch (err) {
    sendServerError(res, err);
  }
});
var ip_list_default = router5;

// server/routes/admin/system.ts
init_config();
import { Router as Router7 } from "express";

// server/services/database.ts
init_config();
init_runtime_paths();
import mysql2 from "mysql2/promise";
import { Client as PgClient } from "pg";
function getSqliteResolvedPath() {
  return resolveFromRoot(config_default.database.sqlite.path || "./data/filemanager.db");
}
function getDatabaseStatus() {
  const type = config_default.database.type;
  if (type === "sqlite") {
    return {
      type,
      runtime: "sqlite",
      configured: true,
      supported: true,
      message: `SQLite active: ${getSqliteResolvedPath()}`
    };
  }
  return {
    type,
    runtime: "external",
    configured: true,
    supported: true,
    message: `${type} active: business data is using the configured external database`
  };
}
async function testDatabaseConnection(database) {
  if (database.type === "sqlite") {
    return {
      success: true,
      message: `SQLite database file: ${resolveFromRoot(database.sqlite.path || "./data/filemanager.db")}`
    };
  }
  if (database.type === "mysql") {
    const connection = await mysql2.createConnection({
      host: database.mysql.host,
      port: database.mysql.port,
      user: database.mysql.user,
      password: database.mysql.password,
      database: database.mysql.database,
      ssl: database.mysql.ssl ? {} : void 0
    });
    try {
      await connection.query("SELECT 1");
      return {
        success: true,
        message: `MySQL connection ok: ${database.mysql.host}:${database.mysql.port}/${database.mysql.database}`
      };
    } finally {
      await connection.end();
    }
  }
  const client = new PgClient({
    host: database.postgres.host,
    port: database.postgres.port,
    user: database.postgres.user,
    password: database.postgres.password,
    database: database.postgres.database,
    ssl: database.postgres.ssl ? { rejectUnauthorized: false } : void 0
  });
  await client.connect();
  try {
    await client.query("SELECT 1");
    return {
      success: true,
      message: `PostgreSQL connection ok: ${database.postgres.host}:${database.postgres.port}/${database.postgres.database}`
    };
  } finally {
    await client.end();
  }
}

// server/routes/admin/system.ts
var router6 = Router7();
router6.get("/upload-limit", authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ upload_limit: config_default.upload_limit });
});
router6.put("/upload-limit", authMiddleware, adminMiddleware, (req, res) => {
  const { upload_limit } = req.body;
  if (typeof upload_limit !== "number" || upload_limit < 1 || upload_limit > 10240) {
    return res.status(400).json({ error: "Upload limit must be between 1 and 10240 MB" });
  }
  config_default.upload_limit = upload_limit;
  updateConfigFile((rawConfig) => {
    rawConfig.upload_limit = upload_limit;
  });
  res.json({ upload_limit, message: "Upload limit saved. Restart the service to fully apply it." });
});
router6.get("/database", authMiddleware, adminMiddleware, (_req, res) => {
  res.json({
    database: {
      type: config_default.database.type,
      sqlite: { ...config_default.database.sqlite },
      mysql: { ...config_default.database.mysql, password: config_default.database.mysql.password ? "******" : "" },
      postgres: { ...config_default.database.postgres, password: config_default.database.postgres.password ? "******" : "" }
    },
    status: getDatabaseStatus()
  });
});
router6.put("/database", authMiddleware, adminMiddleware, (req, res) => {
  const payload = req.body?.database;
  if (!payload || !["sqlite", "mysql", "postgres"].includes(payload.type)) {
    return res.status(400).json({ error: "Invalid database configuration" });
  }
  const nextDatabase = {
    type: payload.type,
    sqlite: {
      path: payload.sqlite?.path || config_default.database.sqlite.path
    },
    mysql: {
      host: payload.mysql?.host || config_default.database.mysql.host,
      port: Number(payload.mysql?.port || config_default.database.mysql.port),
      user: payload.mysql?.user || config_default.database.mysql.user,
      password: payload.mysql?.password === "******" ? config_default.database.mysql.password : payload.mysql?.password ?? "",
      database: payload.mysql?.database || config_default.database.mysql.database,
      ssl: !!payload.mysql?.ssl
    },
    postgres: {
      host: payload.postgres?.host || config_default.database.postgres.host,
      port: Number(payload.postgres?.port || config_default.database.postgres.port),
      user: payload.postgres?.user || config_default.database.postgres.user,
      password: payload.postgres?.password === "******" ? config_default.database.postgres.password : payload.postgres?.password ?? "",
      database: payload.postgres?.database || config_default.database.postgres.database,
      ssl: !!payload.postgres?.ssl
    }
  };
  updateConfigFile((rawConfig) => {
    rawConfig.database = nextDatabase;
  });
  res.json({
    message: "Database configuration saved. Restart the service to switch runtime connections.",
    status: getDatabaseStatus()
  });
});
router6.post("/database/test", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const payload = req.body?.database || config_default.database;
    const database = {
      type: payload.type,
      sqlite: {
        path: payload.sqlite?.path || config_default.database.sqlite.path
      },
      mysql: {
        host: payload.mysql?.host || config_default.database.mysql.host,
        port: Number(payload.mysql?.port || config_default.database.mysql.port),
        user: payload.mysql?.user || config_default.database.mysql.user,
        password: payload.mysql?.password === "******" ? config_default.database.mysql.password : payload.mysql?.password ?? "",
        database: payload.mysql?.database || config_default.database.mysql.database,
        ssl: !!payload.mysql?.ssl
      },
      postgres: {
        host: payload.postgres?.host || config_default.database.postgres.host,
        port: Number(payload.postgres?.port || config_default.database.postgres.port),
        user: payload.postgres?.user || config_default.database.postgres.user,
        password: payload.postgres?.password === "******" ? config_default.database.postgres.password : payload.postgres?.password ?? "",
        database: payload.postgres?.database || config_default.database.postgres.database,
        ssl: !!payload.postgres?.ssl
      }
    };
    const result = await testDatabaseConnection(database);
    res.json({
      ...result,
      status: database.type === "sqlite" ? getDatabaseStatus() : {
        ...getDatabaseStatus(),
        type: database.type,
        runtime: "external",
        supported: true,
        message: result.message
      }
    });
  } catch (err) {
    sendServerError(res, err);
  }
});
var system_default = router6;

// server/routes/admin.ts
var router7 = Router8();
router7.use(users_default);
router7.use(ip_list_default);
router7.use(system_default);
var admin_default = router7;

// server/routes/guest.ts
await init_db();
import { Router as Router9 } from "express";
import Busboy2 from "busboy";
import chardet2 from "chardet";
import iconv2 from "iconv-lite";
init_config();
import fsSync3 from "fs";
var router8 = Router9();
var TEMP_UPLOAD_PREFIX2 = ".temp_";
var mimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  js: "text/javascript",
  ts: "text/typescript",
  html: "text/html",
  css: "text/css",
  xml: "text/xml",
  yaml: "text/yaml",
  yml: "text/yml",
  py: "text/x-python",
  java: "text/x-java",
  go: "text/x-go",
  rs: "text/x-rust",
  vue: "text/x-vue",
  sh: "text/x-shellscript"
};
function guestUploadSingle(field) {
  return (req, res, next) => {
    const limits = { fileSize: config_default.upload_limit * 1024 * 1024 };
    const bb = Busboy2({ headers: req.headers, limits, defCharset: "latin1" });
    let fileReceived = false;
    bb.on("file", (fieldname, stream, info) => {
      if (fieldname !== field) {
        stream.resume();
        return;
      }
      let rawFilename = info.filename;
      try {
        const filenameBuffer = Buffer.from(info.filename, "latin1");
        if (filenameBuffer.some((byte) => byte > 127)) {
          const charset = chardet2.detect(filenameBuffer);
          if (charset && iconv2.encodingExists(charset)) {
            rawFilename = iconv2.decode(filenameBuffer, charset);
          } else {
            const asUtf8 = filenameBuffer.toString("utf8");
            if (!asUtf8.includes("\uFFFD")) {
              rawFilename = asUtf8;
            } else if (iconv2.encodingExists("gbk")) {
              rawFilename = iconv2.decode(filenameBuffer, "gbk");
            }
          }
        }
      } catch {
      }
      rawFilename = rawFilename.normalize("NFC");
      const chunks = [];
      let totalSize = 0;
      stream.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > limits.fileSize) {
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => {
        if (totalSize > limits.fileSize && !res.headersSent) {
          res.status(413).json({ error: `\u6587\u4EF6\u5927\u5C0F\u8D85\u8FC7\u9650\u5236 (${config_default.upload_limit}MB)` });
          return;
        }
        ;
        req.file = {
          fieldname,
          originalname: rawFilename,
          encoding: info.encoding,
          mimetype: info.mimeType,
          buffer: Buffer.concat(chunks),
          size: totalSize
        };
        fileReceived = true;
      });
    });
    bb.on("field", (name, value) => {
      ;
      req.body = req.body || {};
      req.body[name] = value;
    });
    bb.on("close", () => {
      if (!fileReceived && !res.headersSent) {
        res.status(400).json({ error: "\u6CA1\u6709\u6587\u4EF6" });
        return;
      }
      if (!res.headersSent) next();
    });
    bb.on("error", (err) => {
      if (!res.headersSent) {
        res.status(400).json({ error: err.message });
      }
    });
    req.pipe(bb);
  };
}
var permissionAliases = {
  read: ["preview", "download"],
  write: ["upload"],
  edit: ["rename"]
};
function hasPermission(permissions, action) {
  if (!permissions) return false;
  const items = permissions.split(",").map((item) => item.trim());
  if (items.includes(action)) return true;
  for (const [parent, aliases] of Object.entries(permissionAliases)) {
    if (aliases.includes(action) && items.includes(parent)) {
      return true;
    }
  }
  return false;
}
function isPathSafe(targetPath) {
  if (!targetPath) return true;
  return !/\.\./.test(targetPath);
}
function isTemporaryUploadFile2(filename) {
  const name = filename.split("/").pop() || filename;
  return name.startsWith(TEMP_UPLOAD_PREFIX2);
}
function shouldUseAtomicTempUpload2(storageType) {
  return storageType === "local" || storageType === "ftp";
}
function buildTemporaryUploadPath2(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return `${TEMP_UPLOAD_PREFIX2}${normalized}`;
  }
  const dir = normalized.slice(0, lastSlashIndex);
  const name = normalized.slice(lastSlashIndex + 1);
  return `${dir}/${TEMP_UPLOAD_PREFIX2}${name}`;
}
async function getUserByUsername(username) {
  return await db_default.prepare("SELECT id, username FROM users WHERE username = ?").get(username);
}
async function getGuestSettings(userId) {
  return await db_default.prepare("SELECT guest_enabled FROM user_settings WHERE user_id = ?").get(userId);
}
async function getGuestShare(userId, shareId) {
  return await db_default.prepare("SELECT * FROM guest_shares WHERE id = ? AND user_id = ?").get(shareId, userId);
}
function getShareIdParam(req) {
  return String(req.params.shareId || "");
}
router8.get("/", async (_req, res) => {
  try {
    const users = await db_default.prepare(`
      SELECT u.username, COUNT(gs.id) as share_count
      FROM users u
      JOIN user_settings s ON u.id = s.user_id
      JOIN guest_shares gs ON u.id = gs.user_id
      WHERE s.guest_enabled = 1
      GROUP BY u.id
    `).all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.get("/:username/list", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const shares = await db_default.prepare(`
      SELECT gs.id, gs.folder_path, gs.label, gs.permissions, gs.created_at, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.user_id = ?
      ORDER BY gs.created_at DESC
    `).all(user.id);
    res.json({ shares, owner: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.get("/:username/:shareId/list", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await db_default.prepare(`
      SELECT gs.*, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.id = ? AND gs.user_id = ?
    `).get(req.params.shareId, user.id);
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const relativePath = req.query.path || "";
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? relativePath ? `${basePath}/${relativePath}` : basePath : relativePath;
    const files = await storage.list(fullPath);
    const prefix = basePath ? `${basePath}/` : "";
    const result = files.filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile2(file.name)).map((file) => ({
      ...file,
      path: prefix ? file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path : file.path
    }));
    let readme = null;
    const readmeFile = result.find(
      (file) => file.type === "file" && ["readme.md", "readme.markdown"].includes(file.name.toLowerCase())
    );
    if (readmeFile) {
      const previewUrl = `/api/guest/${encodeURIComponent(user.username)}/${share.id}/preview?path=${encodeURIComponent(readmeFile.path)}`;
      readme = {
        name: readmeFile.name,
        path: readmeFile.path,
        directUrl: previewUrl,
        fileUrl: previewUrl
      };
    }
    res.json({
      files: result,
      owner: user.username,
      shareLabel: share.label,
      permissions: share.permissions,
      readme
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.get("/:username/:shareId/preview", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "preview")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u9884\u89C8\u6743\u9650" });
    }
    const relativePath = req.query.path;
    if (!relativePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath;
    const fileInfo = await storage.info(fullPath);
    if (fileInfo.type !== "file") {
      return res.status(400).json({ error: "\u4E0D\u652F\u6301\u9884\u89C8\u6587\u4EF6\u5939" });
    }
    const ext = relativePath.split(".").pop()?.toLowerCase() || "";
    const fileName = relativePath.split("/").pop() || "file";
    const contentType = mimeTypes[ext] || "application/octet-stream";
    const isMedia = contentType.startsWith("audio/") || contentType.startsWith("video/");
    const cachedMedia = isMedia ? await resolvePreviewCacheFile(`guest:${user.username}:share:${share.id}`, storage, fullPath) : null;
    if (cachedMedia) {
      const fileOnDisk = cachedMedia.path;
      const stat = cachedMedia.stat;
      const fileSize = stat.size;
      const etag2 = `"${fileSize}-${stat.mtimeMs}"`;
      const range = req.headers.range;
      if (!range && req.headers["if-none-match"] === etag2) {
        res.status(304).end();
        return;
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("ETag", etag2);
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);
        const stream = fsSync3.createReadStream(fileOnDisk, { start, end });
        stream.pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        const stream = fsSync3.createReadStream(fileOnDisk);
        stream.pipe(res);
      }
      return;
    }
    const data = await storage.download(fullPath);
    if (contentType.startsWith("text/") || contentType === "application/json") {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", data.length);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.send(data);
      return;
    }
    const etag = `"${data.length}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", data.length);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(data);
  } catch (err) {
    if (err.message === "\u6587\u4EF6\u4E0D\u5B58\u5728" || err.code === "ENOENT") {
      return res.status(404).json({ error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
    }
    res.status(500).json({ error: err.message });
  }
});
router8.get("/:username/:shareId/download", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "download")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u4E0B\u8F7D\u6743\u9650" });
    }
    const relativePath = req.query.path;
    if (!relativePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath;
    const data = await storage.download(fullPath);
    const fileName = relativePath.split("/").pop() || "download";
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (err) {
    if (err.message === "\u6587\u4EF6\u4E0D\u5B58\u5728" || err.code === "ENOENT") {
      return res.status(404).json({ error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
    }
    res.status(500).json({ error: err.message });
  }
});
router8.post("/:username/:shareId/upload", guestUploadSingle("file"), async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "upload")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u4E0A\u4F20\u6743\u9650" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6" });
    }
    if (/^\._/.test(req.file.originalname) || req.file.originalname === ".DS_Store") {
      return res.status(400).json({ error: "\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B" });
    }
    const queryFilename = req.query.filename || null;
    const dirPath = req.body.dirPath || req.query.dirPath || "";
    if (dirPath && !isPathSafe(dirPath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    let fallbackName = req.file.originalname;
    try {
      fallbackName = decodeURIComponent(fallbackName);
    } catch {
    }
    const normalizedName = (queryFilename || fallbackName).normalize("NFC");
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const filePath = basePath ? dirPath ? `${basePath}/${dirPath}/${normalizedName}` : `${basePath}/${normalizedName}` : dirPath ? `${dirPath}/${normalizedName}` : normalizedName;
    const pool = await db_default.prepare("SELECT storage_type FROM storage_pools WHERE id = ?").get(share.storage_pool_id);
    const uploadPath = shouldUseAtomicTempUpload2(pool?.storage_type) ? buildTemporaryUploadPath2(filePath) : filePath;
    try {
      await storage.upload(uploadPath, req.file.buffer);
      if (uploadPath !== filePath) {
        try {
          await storage.move(uploadPath, filePath);
        } catch (err) {
          if (await storage.exists(filePath)) {
            await storage.remove(filePath);
            await storage.move(uploadPath, filePath);
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      if (uploadPath !== filePath) {
        await storage.remove(uploadPath).catch(() => {
        });
      }
      throw err;
    }
    const relativePath = basePath ? filePath.replace(`${basePath}/`, "").replace(basePath, "") : filePath;
    res.json({ message: "\u4E0A\u4F20\u6210\u529F", path: relativePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/:username/:shareId/write", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "edit")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u7F16\u8F91\u6743\u9650" });
    }
    const { path: filePath, content } = req.body;
    if (!filePath || content === void 0) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84\u6216\u5185\u5BB9" });
    }
    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    if (content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "\u6587\u4EF6\u5185\u5BB9\u4E0D\u80FD\u8D85\u8FC7 10MB" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath;
    await storage.upload(fullPath, Buffer.from(content, "utf-8"));
    res.json({ success: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/:username/:shareId/delete", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "delete")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u5220\u9664\u6743\u9650" });
    }
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath;
    const stat = await storage.info(fullPath).catch(() => ({ type: "file" }));
    const fileName = filePath.split("/").pop() || filePath;
    const result = await db_default.prepare(
      "INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.id, fullPath, fileName, stat.type, share.storage_pool_id, `\u8BBF\u5BA2: ${req.params.username}`);
    const trashPath = buildTrashPath(result.lastInsertRowid, fileName);
    await moveToTrash(storage, fullPath, trashPath, stat.type);
    return res.json({ message: "\u5220\u9664\u6210\u529F" });
    try {
      const data = await storage.download(fullPath);
      await storage.upload(trashPath, data);
    } catch {
    }
    await db_default.prepare(
      "INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(user.id, fullPath, fileName, stat.type, share.storage_pool_id, `\u8BBF\u5BA2: ${req.params.username}`);
    await storage.remove(fullPath);
    res.json({ message: "\u5220\u9664\u6210\u529F" });
  } catch (err) {
    if (err.message === "\u6587\u4EF6\u4E0D\u5B58\u5728" || err.code === "ENOENT") {
      return res.status(404).json({ error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
    }
    res.status(500).json({ error: err.message });
  }
});
router8.post("/:username/:shareId/mkdir", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "upload")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u5199\u5165\u6743\u9650" });
    }
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u5939\u8DEF\u5F84" });
    }
    if (!isPathSafe(dirPath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${dirPath}` : dirPath;
    await storage.mkdir(fullPath);
    res.json({ message: "\u521B\u5EFA\u6210\u529F", path: dirPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router8.post("/:username/:shareId/rename", async (req, res) => {
  try {
    const user = await getUserByUsername(req.params.username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const settings = await getGuestSettings(user.id);
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const share = await getGuestShare(user.id, getShareIdParam(req));
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    if (!hasPermission(share.permissions, "rename")) {
      return res.status(403).json({ error: "\u8BE5\u5206\u4EAB\u672A\u5F00\u542F\u91CD\u547D\u540D\u6743\u9650" });
    }
    const { path: filePath, newName: rawNewName } = req.body;
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84\u6216\u65B0\u540D\u79F0" });
    }
    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const newName = rawNewName.normalize("NFC");
    const storage = getStorageByPoolId(user.id, share.storage_pool_id);
    const basePath = (share.folder_path || "").replace(/\\/g, "/");
    const fullPath = basePath ? `${basePath}/${filePath}` : filePath;
    await storage.rename(fullPath, newName);
    res.json({ message: "\u91CD\u547D\u540D\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var guest_default = router8;

// server/routes/share.ts
await init_db();
import { Router as Router10 } from "express";
import crypto8 from "crypto";
import fsSync4 from "fs";
var router9 = Router10();
var previewMimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  ts: "text/typescript; charset=utf-8",
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  xml: "text/xml; charset=utf-8",
  yaml: "text/yaml; charset=utf-8",
  yml: "text/yaml; charset=utf-8",
  py: "text/x-python; charset=utf-8",
  java: "text/x-java; charset=utf-8",
  go: "text/x-go; charset=utf-8",
  rs: "text/x-rust; charset=utf-8",
  vue: "text/x-vue; charset=utf-8",
  sh: "text/x-shellscript; charset=utf-8"
};
function generateSignToken(username, signKey) {
  const timestamp = Math.floor(Date.now() / 1e3);
  const raw = username + signKey;
  const hash = crypto8.createHash("md5").update(raw).digest("hex");
  const sign = hash.slice(4, 12) + timestamp;
  return { sign, timestamp };
}
function verifySignToken(username, signKey, sign, timestamp) {
  const expectedHash = crypto8.createHash("md5").update(username + signKey).digest("hex");
  const expectedSign = expectedHash.slice(4, 12) + timestamp;
  return sign === expectedSign;
}
router9.post("/create", authMiddleware, async (req, res) => {
  try {
    const { filePath, fileType, password, expiresIn, maxDownloads, storagePoolId } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const shareCode = crypto8.randomBytes(8).toString("hex");
    const signKey = crypto8.randomBytes(8).toString("hex");
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1e3).toISOString();
    }
    await db_default.prepare(`
      INSERT INTO shares (user_id, file_path, file_type, share_code, password, expires_at, max_downloads, sign_key, storage_pool_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, filePath, fileType || "file", shareCode, password || null, expiresAt, maxDownloads || null, signKey, storagePoolId || null);
    const user = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(req.userId);
    const { sign } = generateSignToken(user.username, signKey);
    const signUrl = `/s/${shareCode}?sign=${sign}&t=${Math.floor(Date.now() / 1e3)}`;
    res.json({
      message: "\u5206\u4EAB\u94FE\u63A5\u521B\u5EFA\u6210\u529F",
      shareCode,
      signKey,
      // 返回给前端，前端可以自行生成签名
      url: `/s/${shareCode}`,
      signUrl
      // 带签名的完整 URL
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.get("/list", authMiddleware, async (req, res) => {
  try {
    const shares = await db_default.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.userId);
    const sharesWithSign = shares.map((share) => {
      const { sign } = generateSignToken(share.username, share.sign_key);
      return {
        ...share,
        signUrl: `/s/${share.share_code}?sign=${sign}&t=${Math.floor(Date.now() / 1e3)}`
      };
    });
    res.json({ shares: sharesWithSign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await db_default.prepare("DELETE FROM shares WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: "\u5206\u4EAB\u4E0D\u5B58\u5728" });
    }
    res.json({ message: "\u5206\u4EAB\u5DF2\u5220\u9664" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.get("/s/:code", async (req, res) => {
  try {
    const share = await db_default.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code);
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u94FE\u63A5\u4E0D\u5B58\u5728" });
    }
    if (share.expires_at && new Date(share.expires_at) < /* @__PURE__ */ new Date()) {
      return res.status(410).json({ error: "\u5206\u4EAB\u94FE\u63A5\u5DF2\u8FC7\u671F" });
    }
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: "\u4E0B\u8F7D\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650" });
    }
    if (share.password) {
      const providedPassword = req.query.password;
      if (!providedPassword || providedPassword !== share.password) {
        return res.json({
          needPassword: true,
          fileType: share.file_type,
          fileName: share.file_path.split("/").pop(),
          owner: share.username
        });
      }
    }
    res.json({
      needPassword: false,
      fileType: share.file_type,
      filePath: share.file_path,
      fileName: share.file_path.split("/").pop(),
      owner: share.username,
      shareCode: share.share_code
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.get("/list/:code", async (req, res) => {
  try {
    const share = await db_default.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code);
    if (!share) return res.status(404).json({ error: "\u5206\u4EAB\u94FE\u63A5\u4E0D\u5B58\u5728" });
    if (share.file_type !== "folder") return res.status(400).json({ error: "\u4E0D\u662F\u6587\u4EF6\u5939\u5206\u4EAB" });
    if (share.expires_at && new Date(share.expires_at) < /* @__PURE__ */ new Date()) return res.status(410).json({ error: "\u5206\u4EAB\u94FE\u63A5\u5DF2\u8FC7\u671F" });
    const sign = req.query.sign;
    const timestamp = parseInt(req.query.t);
    if (!sign || !timestamp) return res.status(403).json({ error: "\u7F3A\u5C11\u7B7E\u540D\u53C2\u6570" });
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) return res.status(403).json({ error: "\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25" });
    if (share.password) {
      const providedPassword = req.query.password;
      if (!providedPassword || providedPassword !== share.password) return res.status(403).json({ error: "\u5BC6\u7801\u9519\u8BEF" });
    }
    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id);
    const subPath = req.query.path || "";
    const fullPath = share.file_path ? subPath ? `${share.file_path}/${subPath}` : share.file_path : subPath;
    const files = await storage.list(fullPath);
    const filteredFiles = files.filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name));
    res.json({ files: filteredFiles, sharePath: share.file_path, subPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.get("/download/:code", async (req, res) => {
  try {
    const share = await db_default.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code);
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u94FE\u63A5\u4E0D\u5B58\u5728" });
    }
    if (share.expires_at && new Date(share.expires_at) < /* @__PURE__ */ new Date()) {
      return res.status(410).json({ error: "\u5206\u4EAB\u94FE\u63A5\u5DF2\u8FC7\u671F" });
    }
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: "\u4E0B\u8F7D\u6B21\u6570\u5DF2\u8FBE\u4E0A\u9650" });
    }
    if (share.password) {
      const providedPassword = req.query.password;
      if (!providedPassword || providedPassword !== share.password) {
        return res.status(403).json({ error: "\u5BC6\u7801\u9519\u8BEF" });
      }
    }
    const sign = req.query.sign;
    const timestamp = parseInt(req.query.t);
    if (!sign || !timestamp) {
      return res.status(403).json({ error: "\u7F3A\u5C11\u7B7E\u540D\u53C2\u6570" });
    }
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: "\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25" });
    }
    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id);
    const subPath = req.query.path;
    const downloadPath = subPath ? `${share.file_path}/${subPath}` : share.file_path;
    const data = await storage.download(downloadPath);
    const fileName = downloadPath.split("/").pop() || "download";
    await db_default.prepare("UPDATE shares SET download_count = download_count + 1 WHERE id = ?").run(share.id);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router9.get("/preview/:code", async (req, res) => {
  try {
    const share = await db_default.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code);
    if (!share) {
      return res.status(404).json({ error: "\u5206\u4EAB\u94FE\u63A5\u4E0D\u5B58\u5728" });
    }
    if (share.expires_at && new Date(share.expires_at) < /* @__PURE__ */ new Date()) {
      return res.status(410).json({ error: "\u5206\u4EAB\u94FE\u63A5\u5DF2\u8FC7\u671F" });
    }
    if (share.password) {
      const providedPassword = req.query.password;
      if (!providedPassword || providedPassword !== share.password) {
        return res.status(403).json({ error: "\u5BC6\u7801\u9519\u8BEF" });
      }
    }
    const sign = req.query.sign;
    const timestamp = parseInt(req.query.t);
    if (!sign || !timestamp) {
      return res.status(403).json({ error: "\u7F3A\u5C11\u7B7E\u540D\u53C2\u6570" });
    }
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: "\u7B7E\u540D\u9A8C\u8BC1\u5931\u8D25" });
    }
    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id);
    const subPath = req.query.path;
    const previewPath = subPath ? `${share.file_path}/${subPath}` : share.file_path;
    const fileInfo = await storage.info(previewPath);
    if (fileInfo.type !== "file") {
      return res.status(400).json({ error: "\u4E0D\u652F\u6301\u9884\u89C8\u6587\u4EF6\u5939" });
    }
    const fileName = previewPath.split("/").pop() || share.file_path.split("/").pop() || "file";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const contentType = previewMimeTypes[ext] || "application/octet-stream";
    const isMedia = contentType.startsWith("audio/") || contentType.startsWith("video/");
    const cachedMedia = isMedia ? await resolvePreviewCacheFile(`share:${share.share_code}`, storage, previewPath) : null;
    if (cachedMedia) {
      const fileOnDisk = cachedMedia.path;
      const stat = cachedMedia.stat;
      const fileSize = stat.size;
      const etag2 = `"${fileSize}-${stat.mtimeMs}"`;
      const range = req.headers.range;
      if (!range && req.headers["if-none-match"] === etag2) {
        res.status(304).end();
        return;
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("ETag", etag2);
      res.setHeader("Cache-Control", "public, max-age=3600");
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
        res.setHeader("Content-Length", chunkSize);
        const stream = fsSync4.createReadStream(fileOnDisk, { start, end });
        stream.pipe(res);
      } else {
        res.setHeader("Content-Length", fileSize);
        const stream = fsSync4.createReadStream(fileOnDisk);
        stream.pipe(res);
      }
      return;
    }
    const data = await storage.download(previewPath);
    const etag = `"${data.length}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", data.length);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var share_default = router9;

// server/routes/storage-pools.ts
await init_db();
init_config();
import { Router as Router11 } from "express";
import path14 from "path";
var router10 = Router11();
function maskSecrets(rawConfig) {
  const cfg = { ...rawConfig };
  if (cfg.upyunPassword) cfg.upyunPassword = "******";
  if (cfg.ftpPassword) cfg.ftpPassword = "******";
  if (cfg.s3SecretAccessKey) cfg.s3SecretAccessKey = "******";
  if (cfg.sftpPassword) cfg.sftpPassword = "******";
  if (cfg.sftpPrivateKey) cfg.sftpPrivateKey = "*** hidden ***";
  return cfg;
}
function validateStorageConfig(storageType, storageConfig) {
  if (!["local", "upyun", "ftp", "s3", "sftp"].includes(storageType)) {
    throw new Error("\u4E0D\u652F\u6301\u7684\u5B58\u50A8\u7C7B\u578B");
  }
  if (storageType === "upyun") {
    if (!storageConfig.upyunOperator || !storageConfig.upyunPassword || !storageConfig.upyunBucket) {
      throw new Error("\u53C8\u62CD\u4E91\u5B58\u50A8\u9700\u8981\u586B\u5199\u64CD\u4F5C\u5458\u3001\u5BC6\u7801\u548C\u670D\u52A1\u540D");
    }
  }
  if (storageType === "ftp") {
    if (!storageConfig.ftpHost) {
      throw new Error("FTP \u5B58\u50A8\u9700\u8981\u586B\u5199\u4E3B\u673A\u5730\u5740");
    }
  }
  if (storageType === "sftp") {
    if (!storageConfig.sftpHost || !storageConfig.sftpUser) {
      throw new Error("SFTP \u5B58\u50A8\u9700\u8981\u586B\u5199\u4E3B\u673A\u5730\u5740\u548C\u7528\u6237\u540D");
    }
    if (!storageConfig.sftpPassword && !storageConfig.sftpPrivateKey) {
      throw new Error("SFTP \u5B58\u50A8\u9700\u8981\u5BC6\u7801\u6216\u79C1\u94A5");
    }
  }
  if (storageType === "s3") {
    if (!storageConfig.s3Bucket) {
      throw new Error("S3 \u5B58\u50A8\u9700\u8981\u586B\u5199 Bucket \u540D\u79F0");
    }
    if (!storageConfig.s3AccessKeyId || !storageConfig.s3SecretAccessKey) {
      throw new Error("S3 \u5B58\u50A8\u9700\u8981\u586B\u5199 Access Key");
    }
  }
}
router10.get("/", authMiddleware, async (req, res) => {
  try {
    const pools = await db_default.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId);
    const user = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(req.userId);
    const username = user?.username || "";
    const safePools = pools.map((pool) => {
      const cfg = maskSecrets(JSON.parse(pool.config || "{}"));
      let resolvedPath = "";
      if (pool.storage_type === "local") {
        const base = path14.resolve(config_default.storage_root || "./uploads", username);
        resolvedPath = cfg.rootPath && cfg.rootPath !== "/" ? path14.join(base, cfg.rootPath) : base;
      }
      return {
        id: pool.id,
        name: pool.name,
        storageType: pool.storage_type,
        isDefault: !!pool.is_default,
        config: cfg,
        resolvedPath,
        createdAt: pool.created_at
      };
    });
    res.json({ pools: safePools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router10.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, storageType, config: storageConfig } = req.body;
    if (!name || !storageType || !storageConfig) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u8981\u53C2\u6570" });
    }
    validateStorageConfig(storageType, storageConfig);
    const existingPools = await db_default.prepare("SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?").get(req.userId);
    const isFirst = existingPools.count === 0;
    const result = await db_default.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.userId,
      name,
      storageType,
      isFirst ? 1 : 0,
      JSON.stringify(storageConfig)
    );
    clearStorageCache(req.userId);
    res.json({
      message: "\u5B58\u50A8\u6C60\u521B\u5EFA\u6210\u529F",
      pool: {
        id: result.lastInsertRowid,
        name,
        storageType,
        isDefault: isFirst,
        config: maskSecrets(storageConfig)
      }
    });
  } catch (err) {
    res.status(err.message === "\u4E0D\u652F\u6301\u7684\u5B58\u50A8\u7C7B\u578B" ? 400 : 500).json({ error: err.message });
  }
});
router10.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, storageType, config: nextConfig } = req.body;
    const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!pool) {
      return res.status(404).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    const mergedConfig = nextConfig ? { ...JSON.parse(pool.config || "{}"), ...nextConfig } : void 0;
    if (storageType && mergedConfig) {
      validateStorageConfig(storageType, mergedConfig);
    }
    if (mergedConfig) {
      if (nextConfig.upyunPassword === "******" || !nextConfig.upyunPassword) {
        mergedConfig.upyunPassword = JSON.parse(pool.config || "{}").upyunPassword;
      }
      if (nextConfig.ftpPassword === "******" || !nextConfig.ftpPassword) {
        mergedConfig.ftpPassword = JSON.parse(pool.config || "{}").ftpPassword;
      }
      if (nextConfig.s3SecretAccessKey === "******" || !nextConfig.s3SecretAccessKey) {
        mergedConfig.s3SecretAccessKey = JSON.parse(pool.config || "{}").s3SecretAccessKey;
      }
      if (nextConfig.sftpPassword === "******" || !nextConfig.sftpPassword) {
        mergedConfig.sftpPassword = JSON.parse(pool.config || "{}").sftpPassword;
      }
      if (nextConfig.sftpPrivateKey === "*** hidden ***" || !nextConfig.sftpPrivateKey) {
        mergedConfig.sftpPrivateKey = JSON.parse(pool.config || "{}").sftpPrivateKey;
      }
    }
    const updates = [];
    const values = [];
    if (name !== void 0) {
      updates.push("name = ?");
      values.push(name);
    }
    if (storageType !== void 0) {
      updates.push("storage_type = ?");
      values.push(storageType);
    }
    if (mergedConfig !== void 0) {
      updates.push("config = ?");
      values.push(JSON.stringify(mergedConfig));
    }
    if (updates.length > 0) {
      values.push(id, req.userId);
      await db_default.prepare(`UPDATE storage_pools SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`).run(...values);
      clearStorageCache(req.userId);
    }
    res.json({ message: "\u5B58\u50A8\u6C60\u66F4\u65B0\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router10.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!pool) {
      return res.status(404).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    if (pool.is_default) {
      return res.status(400).json({ error: "\u4E0D\u80FD\u5220\u9664\u9ED8\u8BA4\u5B58\u50A8\u6C60\uFF0C\u8BF7\u5148\u8BBE\u7F6E\u5176\u4ED6\u5B58\u50A8\u6C60\u4E3A\u9ED8\u8BA4" });
    }
    await db_default.prepare("DELETE FROM storage_pools WHERE id = ? AND user_id = ?").run(id, req.userId);
    clearStorageCache(req.userId);
    res.json({ message: "\u5B58\u50A8\u6C60\u5220\u9664\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router10.post("/batch-delete", authMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (ids.length === 0) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u5B58\u50A8\u6C60 ID \u5217\u8868" });
    }
    const deletedIds = [];
    const errors = [];
    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) {
        errors.push(`\u65E0\u6548\u7684\u5B58\u50A8\u6C60 ID: ${rawId}`);
        continue;
      }
      const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(id, req.userId);
      if (!pool) {
        errors.push(`\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728: #${id}`);
        continue;
      }
      if (pool.is_default) {
        errors.push(`\u4E0D\u80FD\u5220\u9664\u9ED8\u8BA4\u5B58\u50A8\u6C60 ${pool.name}`);
        continue;
      }
      await db_default.prepare("DELETE FROM storage_pools WHERE id = ? AND user_id = ?").run(id, req.userId);
      deletedIds.push(id);
    }
    if (deletedIds.length > 0) {
      clearStorageCache(req.userId);
    }
    res.json({
      message: deletedIds.length > 0 ? `\u5DF2\u5220\u9664 ${deletedIds.length} \u4E2A\u5B58\u50A8\u6C60` : "\u6CA1\u6709\u5B58\u50A8\u6C60\u88AB\u5220\u9664",
      deletedIds,
      errors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router10.post("/:id/set-default", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!pool) {
      return res.status(404).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    await db_default.prepare("UPDATE storage_pools SET is_default = 0 WHERE user_id = ?").run(req.userId);
    await db_default.prepare("UPDATE storage_pools SET is_default = 1 WHERE id = ? AND user_id = ?").run(id, req.userId);
    clearStorageCache(req.userId);
    res.json({ message: "\u9ED8\u8BA4\u5B58\u50A8\u6C60\u8BBE\u7F6E\u6210\u529F" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router10.post("/:id/test", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await db_default.prepare("SELECT * FROM storage_pools WHERE id = ? AND user_id = ?").get(id, req.userId);
    if (!pool) {
      return res.status(404).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    const poolConfig = JSON.parse(pool.config || "{}");
    if (pool.storage_type === "local") {
      const fs12 = await import("fs/promises");
      const user = await db_default.prepare("SELECT username FROM users WHERE id = ?").get(req.userId);
      const localPath = path14.resolve(config_default.storage_root || "./uploads", user?.username || "");
      try {
        await fs12.access(localPath);
        return res.json({ success: true, message: `\u672C\u5730\u8DEF\u5F84\u53EF\u8BBF\u95EE: ${localPath}` });
      } catch {
        return res.json({ success: false, message: `\u672C\u5730\u8DEF\u5F84\u4E0D\u53EF\u8BBF\u95EE: ${localPath}` });
      }
    }
    if (pool.storage_type === "upyun") {
      const { UpyunStorage: UpyunStorage2 } = await Promise.resolve().then(() => (init_upyun(), upyun_exports));
      try {
        const storage = new UpyunStorage2(
          poolConfig.upyunOperator,
          poolConfig.upyunPassword,
          poolConfig.upyunBucket,
          poolConfig.upyunEndpoint || "v0.api.upyun.com"
        );
        await storage.list("/");
        return res.json({ success: true, message: "\u53C8\u62CD\u4E91\u8FDE\u63A5\u6210\u529F" });
      } catch (err) {
        return res.json({ success: false, message: `\u53C8\u62CD\u4E91\u8FDE\u63A5\u5931\u8D25: ${err.message}` });
      }
    }
    if (pool.storage_type === "ftp") {
      const { FtpStorage: FtpStorage2 } = await Promise.resolve().then(() => (init_ftp(), ftp_exports));
      try {
        const storage = new FtpStorage2(poolConfig);
        await storage.list("");
        return res.json({ success: true, message: "FTP \u8FDE\u63A5\u6210\u529F" });
      } catch (err) {
        return res.json({ success: false, message: `FTP \u8FDE\u63A5\u5931\u8D25: ${err.message}` });
      }
    }
    if (pool.storage_type === "sftp") {
      const { SftpStorage: SftpStorage2 } = await Promise.resolve().then(() => (init_sftp(), sftp_exports));
      try {
        const storage = new SftpStorage2(poolConfig);
        await storage.list("");
        return res.json({ success: true, message: "SFTP \u8FDE\u63A5\u6210\u529F" });
      } catch (err) {
        return res.json({ success: false, message: `SFTP \u8FDE\u63A5\u5931\u8D25: ${err.message}` });
      }
    }
    if (pool.storage_type === "s3") {
      const { S3Storage: S3Storage2 } = await Promise.resolve().then(() => (init_s3(), s3_exports));
      try {
        const storage = new S3Storage2(poolConfig);
        await storage.list("");
        return res.json({ success: true, message: "S3/OSS \u8FDE\u63A5\u6210\u529F" });
      } catch (err) {
        return res.json({ success: false, message: `S3/OSS \u8FDE\u63A5\u5931\u8D25: ${err.message}` });
      }
    }
    res.json({ success: false, message: "\u4E0D\u652F\u6301\u7684\u5B58\u50A8\u7C7B\u578B" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var storage_pools_default = router10;

// server/routes/trash.ts
await init_db();
import { Router as Router12 } from "express";
var router11 = Router12();
router11.get("/", authMiddleware, async (req, res) => {
  try {
    const items = await db_default.prepare(`
      SELECT t.*, t.deleted_by, sp.name as pool_name, sp.storage_type
      FROM trash t
      JOIN storage_pools sp ON t.storage_pool_id = sp.id
      WHERE t.user_id = ?
      ORDER BY t.deleted_at DESC
    `).all(req.userId);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router11.post("/:id/restore", authMiddleware, async (req, res) => {
  try {
    const item = await db_default.prepare("SELECT * FROM trash WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!item) {
      return res.status(404).json({ error: "\u56DE\u6536\u7AD9\u9879\u76EE\u4E0D\u5B58\u5728" });
    }
    const storage = getStorageByPoolId(req.userId, item.storage_pool_id);
    const exists = await storage.exists(item.original_path).catch(() => false);
    if (exists) {
      return res.status(400).json({ error: "\u539F\u8DEF\u5F84\u5DF2\u5B58\u5728\u540C\u540D\u6587\u4EF6\u6216\u76EE\u5F55\uFF0C\u65E0\u6CD5\u6062\u590D" });
    }
    let restored = false;
    for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
      restored = await restoreFromTrash(storage, trashPath, item.original_path, item.file_type);
      if (restored) break;
    }
    if (!restored && item.file_type === "folder") {
      await storage.mkdir(item.original_path).catch(() => {
      });
      restored = await storage.exists(item.original_path).catch(() => false);
    }
    await db_default.prepare("DELETE FROM trash WHERE id = ?").run(item.id);
    res.json({ message: restored ? "\u5DF2\u6062\u590D" : "\u5DF2\u79FB\u9664\u56DE\u6536\u7AD9\u8BB0\u5F55" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router11.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const item = await db_default.prepare("SELECT * FROM trash WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
    if (!item) {
      return res.status(404).json({ error: "\u56DE\u6536\u7AD9\u9879\u76EE\u4E0D\u5B58\u5728" });
    }
    const storage = getStorageByPoolId(req.userId, item.storage_pool_id);
    for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
      await storage.remove(trashPath).catch(() => {
      });
    }
    await db_default.prepare("DELETE FROM trash WHERE id = ?").run(item.id);
    res.json({ message: "\u5DF2\u6C38\u4E45\u5220\u9664" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router11.delete("/", authMiddleware, async (req, res) => {
  try {
    const items = await db_default.prepare("SELECT * FROM trash WHERE user_id = ?").all(req.userId);
    for (const item of items) {
      const storage = getStorageByPoolId(req.userId, item.storage_pool_id);
      for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
        await storage.remove(trashPath).catch(() => {
        });
      }
    }
    await db_default.prepare("DELETE FROM trash WHERE user_id = ?").run(req.userId);
    res.json({ message: "\u56DE\u6536\u7AD9\u5DF2\u6E05\u7A7A" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var trash_default = router11;

// server/routes/favourites.ts
await init_db();
import { Router as Router13 } from "express";
var router12 = Router13();
router12.get("/", authMiddleware, async (req, res) => {
  try {
    const poolId = req.query.poolId;
    const items = poolId ? await db_default.prepare(`
          SELECT f.*, sp.name as pool_name, sp.storage_type
          FROM favourites f
          JOIN storage_pools sp ON f.storage_pool_id = sp.id
          WHERE f.user_id = ? AND f.storage_pool_id = ?
          ORDER BY f.created_at DESC
        `).all(req.userId, parseInt(poolId, 10)) : await db_default.prepare(`
          SELECT f.*, sp.name as pool_name, sp.storage_type
          FROM favourites f
          JOIN storage_pools sp ON f.storage_pool_id = sp.id
          WHERE f.user_id = ?
          ORDER BY f.created_at DESC
        `).all(req.userId);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router12.post("/", authMiddleware, async (req, res) => {
  try {
    const { filePath, fileName, fileType, storagePoolId } = req.body;
    if (!filePath || !fileName || !fileType || !storagePoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u8981\u53C2\u6570" });
    }
    await db_default.prepare(`
      INSERT OR IGNORE INTO favourites (user_id, file_path, file_name, file_type, storage_pool_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, filePath, fileName, fileType, storagePoolId);
    res.json({ message: "\u5DF2\u6DFB\u52A0\u5230\u6536\u85CF" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router12.delete("/", authMiddleware, async (req, res) => {
  try {
    const { filePath, storagePoolId } = req.query;
    if (!filePath || !storagePoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u8981\u53C2\u6570" });
    }
    await db_default.prepare("DELETE FROM favourites WHERE user_id = ? AND file_path = ? AND storage_pool_id = ?").run(req.userId, filePath, parseInt(storagePoolId, 10));
    res.json({ message: "\u5DF2\u53D6\u6D88\u6536\u85CF" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router12.get("/check", authMiddleware, async (req, res) => {
  try {
    const { filePath, storagePoolId } = req.query;
    if (!filePath || !storagePoolId) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u5FC5\u8981\u53C2\u6570" });
    }
    const item = await db_default.prepare("SELECT id FROM favourites WHERE user_id = ? AND file_path = ? AND storage_pool_id = ?").get(req.userId, filePath, parseInt(storagePoolId, 10));
    res.json({ isFavourited: !!item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var favourites_default = router12;

// server/routes/public.ts
await init_db();
import { Router as Router14 } from "express";
var router13 = Router14();
async function getUserByUsername2(username) {
  return await db_default.prepare("SELECT id, username FROM users WHERE username = ?").get(username);
}
var mimeTypes2 = {
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "png": "image/png",
  "gif": "image/gif",
  "svg": "image/svg+xml",
  "webp": "image/webp",
  "mp4": "video/mp4",
  "webm": "video/webm",
  "ogg": "audio/ogg",
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "flac": "audio/flac",
  "pdf": "application/pdf",
  "txt": "text/plain",
  "md": "text/markdown",
  "json": "application/json",
  "js": "text/javascript",
  "ts": "text/typescript",
  "html": "text/html",
  "css": "text/css",
  "xml": "text/xml",
  "yaml": "text/yaml",
  "yml": "text/yml",
  "py": "text/x-python",
  "java": "text/x-java",
  "go": "text/x-go",
  "rs": "text/x-rust",
  "vue": "text/x-vue",
  "sh": "text/x-shellscript"
};
function isPathSafe2(targetPath) {
  if (!targetPath) return true;
  if (/\.\./.test(targetPath)) return false;
  return true;
}
router13.get("/:username/*", async (req, res) => {
  try {
    const { username } = req.params;
    const filePath = req.params[0];
    if (!filePath) {
      return res.status(400).json({ error: "\u7F3A\u5C11\u6587\u4EF6\u8DEF\u5F84" });
    }
    const user = await getUserByUsername2(username);
    if (!user) {
      return res.status(404).json({ error: "\u7528\u6237\u4E0D\u5B58\u5728" });
    }
    const guestConfig = await getGuestStorage(user.id);
    if (!guestConfig) {
      return res.status(403).json({ error: "\u8BE5\u7528\u6237\u672A\u5F00\u542F\u8BBF\u5BA2\u6A21\u5F0F" });
    }
    const { storage, basePath } = guestConfig;
    const fullPath = basePath ? filePath ? `${basePath}/${filePath}` : basePath : filePath;
    if (!isPathSafe2(filePath) || !isPathSafe2(fullPath)) {
      return res.status(403).json({ error: "\u65E0\u6743\u8BBF\u95EE\u6B64\u8DEF\u5F84" });
    }
    const fileInfo = await storage.info(fullPath);
    if (fileInfo.type !== "file") {
      return res.status(400).json({ error: "\u4E0D\u652F\u6301\u8BBF\u95EE\u6587\u4EF6\u5939" });
    }
    const data = await storage.download(fullPath);
    const ext = filePath.split(".").pop()?.toLowerCase() || "";
    const fileName = filePath.split("/").pop() || "file";
    res.setHeader("Content-Type", mimeTypes2[ext] || "application/octet-stream");
    res.setHeader("Content-Length", data.length);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(data);
  } catch (err) {
    if (err.message === "\u6587\u4EF6\u4E0D\u5B58\u5728" || err.code === "ENOENT") {
      return res.status(404).json({ error: "\u6587\u4EF6\u4E0D\u5B58\u5728" });
    }
    res.status(500).json({ error: err.message });
  }
});
var public_default = router13;

// server/routes/webdav.ts
import { Router as Router15 } from "express";
await init_db();
var router14 = Router15();
var DAV_ALLOW = "OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE, PROPPATCH, COPY, LOCK, UNLOCK";
function applyDavHeaders(res) {
  res.setHeader("Allow", DAV_ALLOW);
  res.setHeader("Public", DAV_ALLOW);
  res.setHeader("DAV", "1");
  res.setHeader("MS-Author-Via", "DAV");
  res.setHeader("Accept-Ranges", "bytes");
}
function detectDavClient(req) {
  const ua = (req.get("user-agent") || "").toLowerCase();
  if (ua.includes("microsoft-webdav-miniredir")) return "windows";
  if (ua.includes("webdavfs") || ua.includes("finder")) return "finder";
  return "generic";
}
async function getPoolId(userId, poolId) {
  if (poolId) return Number(poolId);
  const pool = await db_default.prepare("SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1").get(userId);
  return pool?.id;
}
function normalizeDavPath(inputPath) {
  return decodeURIComponent((inputPath || "").replace(/^\/+/, "").replace(/\\/g, "/"));
}
async function extractPoolScope(userId, rawRoutePath, queryPoolId) {
  const normalized = normalizeDavPath(rawRoutePath);
  const match = normalized.match(/^(?:pool|p)\/(\d+)(?:\/(.*))?$/);
  if (match) {
    return {
      poolId: Number(match[1]),
      storagePath: normalizeDavPath(match[2] || ""),
      basePath: `/dav/pool/${match[1]}`,
      usingPathPool: true
    };
  }
  const poolId = await getPoolId(userId, queryPoolId);
  return {
    poolId,
    storagePath: normalized,
    basePath: "/dav",
    usingPathPool: false
  };
}
function appendEncodedPath(basePath, filePath) {
  const trimmedBasePath = basePath.replace(/\/$/, "");
  const encodedPath = filePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return encodedPath ? `${trimmedBasePath}/${encodedPath}` : `${trimmedBasePath}/`;
}
function buildHref(baseUrl, filePath, profile, searchParams) {
  const url = new URL(baseUrl);
  url.pathname = appendEncodedPath(url.pathname, filePath);
  url.search = searchParams?.toString() || "";
  if (profile === "windows") {
    return `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ""}`;
  }
  return url.toString();
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function createPropResponse(baseUrl, item, profile, searchParams, isSelf = false) {
  const hrefValue = buildHref(baseUrl, item.path, profile, searchParams);
  const normalizedHref = profile === "windows" ? hrefValue : item.type === "folder" && !hrefValue.endsWith("/") ? `${hrefValue}/` : hrefValue;
  const href = escapeXml(normalizedHref);
  const fallbackName = decodeURIComponent(new URL(baseUrl, "http://localhost").pathname.split("/").filter(Boolean).pop() || "/");
  const displayName = escapeXml(item.name || fallbackName);
  const contentLength = String(item.size || 0);
  const created = escapeXml(new Date(item.modified).toISOString());
  const modified = escapeXml(new Date(item.modified).toUTCString());
  const resourceType = item.type === "folder" ? "<D:collection />" : "";
  const contentType = escapeXml(item.type === "folder" ? "httpd/unix-directory" : "application/octet-stream");
  const etag = escapeXml(`"${item.size || 0}-${new Date(item.modified).getTime()}"`);
  const isCollection = item.type === "folder" ? "1" : "0";
  return `
    <D:response>
      <D:href>${href}</D:href>
      <D:propstat>
        <D:prop>
          <D:displayname>${displayName}</D:displayname>
          <D:creationdate>${created}</D:creationdate>
          <D:getcontenttype>${contentType}</D:getcontenttype>
          <D:getcontentlength>${contentLength}</D:getcontentlength>
          <D:getlastmodified>${modified}</D:getlastmodified>
          <D:getetag>${etag}</D:getetag>
          <D:iscollection>${isCollection}</D:iscollection>
          <D:resourcetype>${resourceType}</D:resourcetype>
          ${isSelf ? "<D:supportedlock />" : ""}
          ${isSelf ? "<D:lockdiscovery />" : ""}
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `.trim();
}
router14.options("/*", (_req, res) => {
  applyDavHeaders(res);
  res.status(200).end();
});
router14.use(flexibleAuth);
router14.all("/*", async (req, res) => {
  try {
    const clientProfile = detectDavClient(req);
    const rawRoutePath = req.params[0] || "";
    const scope = await extractPoolScope(req.userId, rawRoutePath, req.query.poolId);
    const poolId = scope.poolId;
    if (!poolId) {
      return res.status(400).json({ error: "\u5B58\u50A8\u6C60\u4E0D\u5B58\u5728" });
    }
    const storage = getStorageByPoolId(req.userId, poolId);
    const pathFromRoute = scope.storagePath;
    const baseUrl = `${req.protocol}://${req.get("host")}${scope.basePath}`;
    const sharedSearchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (scope.usingPathPool && key === "poolId") continue;
      if (value === void 0) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string") sharedSearchParams.append(key, item);
        }
        continue;
      }
      if (typeof value === "string") {
        sharedSearchParams.set(key, value);
      }
    }
    if (req.method === "PROPFIND") {
      applyDavHeaders(res);
      const depth = req.headers.depth === "0" ? 0 : 1;
      const info = pathFromRoute ? await storage.info(pathFromRoute).catch(() => null) : null;
      if (pathFromRoute && !info) {
        res.status(404).end();
        return;
      }
      const items = pathFromRoute ? info?.type === "folder" ? await storage.list(pathFromRoute) : info ? [info] : [] : await storage.list("");
      const responses = [];
      if (pathFromRoute && info) {
        responses.push(createPropResponse(baseUrl, info, clientProfile, sharedSearchParams, true));
      } else if (!pathFromRoute) {
        responses.push(createPropResponse(baseUrl, {
          path: "",
          name: "",
          type: "folder",
          size: 0,
          modified: (/* @__PURE__ */ new Date()).toISOString()
        }, clientProfile, sharedSearchParams, true));
      }
      if (depth !== 0) {
        for (const item of items) {
          responses.push(createPropResponse(baseUrl, item, clientProfile, sharedSearchParams));
        }
      }
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join("\n")}
</D:multistatus>`;
      res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(xml);
      return;
    }
    if (req.method === "HEAD") {
      applyDavHeaders(res);
      if (!pathFromRoute) {
        res.status(200).end();
        return;
      }
      const info = await storage.info(pathFromRoute);
      if (info.type === "folder") {
        res.status(200).end();
        return;
      }
      res.status(200).setHeader("Content-Length", info.size || 0).end();
      return;
    }
    if (req.method === "GET") {
      applyDavHeaders(res);
      if (!pathFromRoute) {
        const clientProfile2 = detectDavClient(req);
        if (clientProfile2 === "windows") {
          res.status(200).setHeader("Content-Type", "text/html; charset=utf-8").send("<html><body>WebDAV endpoint</body></html>");
          return;
        }
        res.status(200).type("text/plain; charset=utf-8").send(`WebDAV endpoint is reachable.
Pool ID: ${poolId}
Finder/Cyberduck should prefer ${scope.basePath}
Use a WebDAV client or PROPFIND to browse directories.`);
        return;
      }
      const data = await storage.download(pathFromRoute);
      res.setHeader("Content-Length", data.length);
      res.send(data);
      return;
    }
    if (req.method === "PUT") {
      applyDavHeaders(res);
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }
      await storage.upload(pathFromRoute, Buffer.concat(chunks));
      res.status(201).end();
      return;
    }
    if (req.method === "DELETE") {
      applyDavHeaders(res);
      await storage.remove(pathFromRoute);
      res.status(204).end();
      return;
    }
    if (req.method === "MKCOL") {
      applyDavHeaders(res);
      await storage.mkdir(pathFromRoute);
      res.status(201).end();
      return;
    }
    if (req.method === "MOVE") {
      applyDavHeaders(res);
      const destination = Array.isArray(req.headers.destination) ? req.headers.destination[0] : req.headers.destination;
      if (!destination) {
        return res.status(400).json({ error: "\u7F3A\u5C11 Destination" });
      }
      const targetUrl = new URL(destination);
      const targetRawPath = normalizeDavPath(targetUrl.pathname.replace(/^\/dav\/?/, ""));
      const targetScope = await extractPoolScope(req.userId, targetRawPath);
      if (targetScope.poolId !== poolId) {
        return res.status(400).json({ error: "\u6682\u4E0D\u652F\u6301\u8DE8\u5B58\u50A8\u6C60\u79FB\u52A8" });
      }
      await storage.move(pathFromRoute, targetScope.storagePath);
      res.status(201).end();
      return;
    }
    if (req.method === "COPY") {
      const destination = Array.isArray(req.headers.destination) ? req.headers.destination[0] : req.headers.destination;
      if (!destination) {
        return res.status(400).json({ error: "\u7F3A\u5C11 Destination" });
      }
      const targetUrl = new URL(destination);
      const targetRawPath = normalizeDavPath(targetUrl.pathname.replace(/^\/dav\/?/, ""));
      const targetScope = await extractPoolScope(req.userId, targetRawPath);
      if (targetScope.poolId !== poolId) {
        return res.status(400).json({ error: "\u6682\u4E0D\u652F\u6301\u8DE8\u5B58\u50A8\u6C60\u590D\u5236" });
      }
      await storage.copy(pathFromRoute, targetScope.storagePath);
      res.status(201).end();
      return;
    }
    if (req.method === "PROPPATCH") {
      res.status(207).setHeader("Content-Type", "application/xml; charset=utf-8").send(`<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${escapeXml(buildHref(baseUrl, pathFromRoute, clientProfile, sharedSearchParams))}</D:href>
    <D:propstat>
      <D:prop />
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`);
      return;
    }
    if (req.method === "LOCK") {
      res.status(200).setHeader("Lock-Token", "<opaquelocktoken:vuefilemanager>").setHeader("Content-Type", "application/xml; charset=utf-8").send(`<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>Infinity</D:depth>
      <D:owner><D:href>VueFileManager</D:href></D:owner>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>opaquelocktoken:vuefilemanager</D:href></D:locktoken>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`);
      return;
    }
    if (req.method === "UNLOCK") {
      res.status(204).end();
      return;
    }
    res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
var webdav_default = router14;

// server/app/routes.ts
var protectedRouteModules = [
  { path: "/api/auth", router: auth_default },
  { path: "/api/files", router: files_default },
  { path: "/api/user", router: user_default },
  { path: "/api/admin", router: admin_default },
  { path: "/api/guest", router: guest_default },
  { path: "/api/share", router: share_default },
  { path: "/api/storage-pools", router: storage_pools_default },
  { path: "/api/trash", router: trash_default },
  { path: "/api/favourites", router: favourites_default },
  { path: "/dav", router: webdav_default }
];
var publicRouteModules = [
  { path: "/f", router: public_default }
];

// server/app/spa.ts
import path15 from "path";
function isAppFallbackPath(pathname) {
  return !(pathname === "/api" || pathname.startsWith("/api/") || pathname === "/dav" || pathname.startsWith("/dav/") || pathname === "/f" || pathname.startsWith("/f/") || pathname === "/plugins" || pathname.startsWith("/plugins/"));
}
function registerSpaFallback(app2, rootDir) {
  app2.get("*", (req, res) => {
    if (isAppFallbackPath(req.path)) {
      res.sendFile(path15.join(rootDir, "dist", "index.html"));
    }
  });
}

// server/app/server.ts
init_runtime_paths();

// server/app/watch-config.ts
import fs11 from "fs";
import path16 from "path";
function watchConfigFile(rootDir, serverEntryPath) {
  const configFilePath = path16.join(rootDir, "config.yml");
  let configWatchDebounce = null;
  try {
    fs11.watch(configFilePath, () => {
      if (configWatchDebounce) return;
      configWatchDebounce = setTimeout(() => {
        configWatchDebounce = null;
        console.log("\n\u{1F504} \u68C0\u6D4B\u5230 config.yml \u53D8\u66F4\uFF0C\u6B63\u5728\u91CD\u542F...");
        const time = /* @__PURE__ */ new Date();
        fs11.utimesSync(serverEntryPath, time, time);
      }, 500);
    });
  } catch {
  }
}

// server/app/server.ts
function createServerApp() {
  bootstrapApp();
  const app2 = express2();
  const rootDir = appRoot;
  const serverEntryPath = resolveFromRoot("server", "index.ts");
  watchConfigFile(rootDir, serverEntryPath);
  registerAppMiddleware(app2, { rootDir });
  for (const routeModule of protectedRouteModules) {
    app2.use(routeModule.path, routeModule.router);
  }
  for (const routeModule of publicRouteModules) {
    app2.use(routeModule.path, routeModule.router);
  }
  app2.use("/api", createPublicPlatformRouter());
  registerSpaFallback(app2, rootDir);
  return app2;
}
function startServer(app2) {
  const port = Number(process.env.PORT) || config_default.server.port;
  const host = process.env.HOST || config_default.server.host || "localhost";
  function logServerReady(listenHost) {
    const displayHost = listenHost === "0.0.0.0" ? "0.0.0.0 (\u6240\u6709\u7F51\u7EDC\u63A5\u53E3)" : listenHost;
    console.log(`
\u{1F680} VueFileManager \u670D\u52A1\u5668\u5DF2\u542F\u52A8`);
    console.log(`\u{1F4E1} \u76D1\u542C\u5730\u5740: ${displayHost}:${port}`);
    console.log(`\u{1F4E1} API: http://${listenHost === "0.0.0.0" ? "localhost" : listenHost}:${port}/api`);
    console.log(`\u{1F310} \u5F00\u53D1\u73AF\u5883: http://localhost:5173
`);
  }
  function attachShutdown(server) {
    function shutdown() {
      console.log("\n\u{1F6D1} \u6B63\u5728\u5173\u95ED\u670D\u52A1\u5668...");
      server.close(() => {
        console.log("\u2705 \u670D\u52A1\u5668\u5DF2\u5173\u95ED");
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 3e3);
    }
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
  function listenWithHost(listenHost, allowFallback) {
    const server = app2.listen(port, listenHost, () => {
      logServerReady(listenHost);
    });
    server.once("error", (error) => {
      if (allowFallback && listenHost === "0.0.0.0" && (error.code === "EPERM" || error.code === "EACCES")) {
        console.warn(`\u26A0\uFE0F  \u65E0\u6CD5\u76D1\u542C ${listenHost}:${port}\uFF08${error.code}\uFF09\uFF0C\u6B63\u5728\u56DE\u9000\u5230 127.0.0.1:${port}`);
        listenWithHost("127.0.0.1", false);
        return;
      }
      console.error(`\u274C \u670D\u52A1\u5668\u542F\u52A8\u5931\u8D25: ${error.code || error.message}`);
      console.error(error);
      process.exit(1);
    });
    attachShutdown(server);
    return server;
  }
  return listenWithHost(host, host === "0.0.0.0");
}

// server/index.ts
var app = createServerApp();
startServer(app);
var server_default = app;
export {
  server_default as default
};
