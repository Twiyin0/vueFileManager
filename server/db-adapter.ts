import fs from 'fs'
import path from 'path'
import mysql, { type Pool as MysqlPool, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { Pool as PostgresPool, type QueryResult } from 'pg'
import type { DatabaseConfig } from './config'
import { createSqlJsCompatDatabase, type SqlJsCompatDatabase } from './db-sqljs'
import { resolveFromRoot } from './runtime-paths'

export type DatabaseDialect = 'sqlite' | 'mysql' | 'postgres'

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export interface PreparedStatement {
  get<T = any>(...params: any[]): Promise<T | undefined>
  all<T = any>(...params: any[]): Promise<T[]>
  run(...params: any[]): Promise<RunResult>
}

export interface DatabaseAdapter {
  readonly dialect: DatabaseDialect
  prepare(sql: string): PreparedStatement
  exec(sql: string): Promise<any>
  pragma(statement: string): Promise<any>
  tableExists(tableName: string): Promise<boolean>
  columnExists(tableName: string, columnName: string): Promise<boolean>
  listColumns(tableName: string): Promise<string[]>
  close(): Promise<void>
}

const INSERT_ID_TABLES = new Set([
  'users',
  'storage_pools',
  'api_keys',
  'shares',
  'trash',
  'favourites',
  'guest_shares',
  'share_mount_dirs',
  'share_mounts',
  'ip_blacklist',
  'ip_whitelist',
  'verification_codes',
  'offline_download_tasks',
])

function normalizeParams(params: any[]) {
  return params.map((value) => value === undefined ? null : value)
}

function splitStatements(sql: string) {
  const statements: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const prev = i > 0 ? sql[i - 1] : ''

    if (char === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle
    } else if (char === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble
    }

    if (char === ';' && !inSingle && !inDouble) {
      const trimmed = current.trim()
      if (trimmed) statements.push(trimmed)
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}

function getInsertTableName(sql: string) {
  const match = sql.match(/^\s*INSERT(?:\s+OR\s+IGNORE|\s+IGNORE)?\s+INTO\s+("?)([a-zA-Z_][\w]*)\1/i)
  return match?.[2]?.toLowerCase()
}

function transformCommonSql(sql: string, dialect: Exclude<DatabaseDialect, 'sqlite'>) {
  let nextSql = sql.trim()

  nextSql = nextSql.replace(
    /datetime\('now',\s*'-1 minute'\)/gi,
    dialect === 'mysql' ? 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)' : "CURRENT_TIMESTAMP - INTERVAL '1 minute'"
  )

  nextSql = nextSql.replace(
    /datetime\('now'\)/gi,
    dialect === 'mysql' ? 'UTC_TIMESTAMP()' : 'CURRENT_TIMESTAMP'
  )

  if (dialect === 'mysql') {
    nextSql = nextSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO')
    return nextSql
  }

  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(nextSql)) {
    nextSql = nextSql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO')
    if (!/ON\s+CONFLICT/i.test(nextSql)) {
      nextSql = `${nextSql} ON CONFLICT DO NOTHING`
    }
  }

  let index = 0
  nextSql = nextSql.replace(/\?/g, () => `$${++index}`)
  return nextSql
}

class SqlitePreparedStatement implements PreparedStatement {
  constructor(
    private readonly database: SqlJsCompatDatabase,
    private readonly sql: string
  ) {}

  async get<T = any>(...params: any[]) {
    return this.database.prepare(this.sql).get(...normalizeParams(params)) as T | undefined
  }

  async all<T = any>(...params: any[]) {
    return this.database.prepare(this.sql).all(...normalizeParams(params)) as T[]
  }

  async run(...params: any[]) {
    return this.database.prepare(this.sql).run(...normalizeParams(params))
  }
}

class SqliteAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const

  constructor(private readonly database: SqlJsCompatDatabase) {}

  prepare(sql: string) {
    return new SqlitePreparedStatement(this.database, sql)
  }

  async exec(sql: string) {
    let lastResult: any
    for (const statement of splitStatements(sql)) {
      lastResult = this.database.exec(statement)
    }
    return lastResult
  }

  async pragma(statement: string) {
    return this.database.pragma(statement)
  }

  async tableExists(tableName: string) {
    const row = await this.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(tableName)
    return !!row
  }

  async columnExists(tableName: string, columnName: string) {
    const columns = await this.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>()
    return columns.some((column) => column.name === columnName)
  }

  async listColumns(tableName: string) {
    const columns = await this.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>()
    return columns.map((column) => column.name)
  }

  async close() {}
}

class MysqlPreparedStatement implements PreparedStatement {
  constructor(
    private readonly pool: MysqlPool,
    private readonly sql: string
  ) {}

  private transformedSql() {
    return transformCommonSql(this.sql, 'mysql')
  }

  async get<T = any>(...params: any[]) {
    const [rows] = await this.pool.query<RowDataPacket[]>(this.transformedSql(), normalizeParams(params))
    return rows[0] as T | undefined
  }

  async all<T = any>(...params: any[]) {
    const [rows] = await this.pool.query<RowDataPacket[]>(this.transformedSql(), normalizeParams(params))
    return rows as T[]
  }

  async run(...params: any[]) {
    const [result] = await this.pool.query<ResultSetHeader>(this.transformedSql(), normalizeParams(params))
    return {
      changes: Number(result.affectedRows || 0),
      lastInsertRowid: Number(result.insertId || 0)
    }
  }
}

class MysqlAdapter implements DatabaseAdapter {
  readonly dialect = 'mysql' as const

  constructor(private readonly pool: MysqlPool) {}

  prepare(sql: string) {
    return new MysqlPreparedStatement(this.pool, sql)
  }

  async exec(sql: string) {
    let lastResult: any
    for (const statement of splitStatements(sql)) {
      const [result] = await this.pool.query(statement)
      lastResult = result
    }
    return lastResult
  }

  async pragma(_statement: string) {
    return []
  }

  async tableExists(tableName: string) {
    const row = await this.prepare(
      'SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?'
    ).get(tableName)
    return !!row
  }

  async columnExists(tableName: string, columnName: string) {
    const row = await this.prepare(
      'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?'
    ).get(tableName, columnName)
    return !!row
  }

  async listColumns(tableName: string) {
    const rows = await this.prepare(
      'SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION ASC'
    ).all<{ COLUMN_NAME: string }>(tableName)
    return rows.map((row) => row.COLUMN_NAME)
  }

  async close() {
    await this.pool.end()
  }
}

class PostgresPreparedStatement implements PreparedStatement {
  constructor(
    private readonly pool: PostgresPool,
    private readonly sql: string
  ) {}

  private transformedSql(forRun = false) {
    let nextSql = transformCommonSql(this.sql, 'postgres')
    if (forRun) {
      const tableName = getInsertTableName(this.sql)
      if (tableName && INSERT_ID_TABLES.has(tableName) && !/RETURNING\s+/i.test(nextSql)) {
        nextSql = `${nextSql} RETURNING id`
      }
    }
    return nextSql
  }

  async get<T = any>(...params: any[]) {
    const result = await this.pool.query(this.transformedSql(), normalizeParams(params))
    return result.rows[0] as T | undefined
  }

  async all<T = any>(...params: any[]) {
    const result = await this.pool.query(this.transformedSql(), normalizeParams(params))
    return result.rows as T[]
  }

  async run(...params: any[]) {
    const result = await this.pool.query(this.transformedSql(true), normalizeParams(params))
    const firstRow = result.rows[0] as { id?: number | string } | undefined
    return {
      changes: Number(result.rowCount || 0),
      lastInsertRowid: firstRow?.id ? Number(firstRow.id) : 0
    }
  }
}

class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = 'postgres' as const

  constructor(private readonly pool: PostgresPool) {}

  prepare(sql: string) {
    return new PostgresPreparedStatement(this.pool, sql)
  }

  async exec(sql: string) {
    let lastResult: QueryResult | undefined
    for (const statement of splitStatements(sql)) {
      lastResult = await this.pool.query(statement)
    }
    return lastResult
  }

  async pragma(_statement: string) {
    return []
  }

  async tableExists(tableName: string) {
    const row = await this.prepare(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?'
    ).get(tableName)
    return !!row
  }

  async columnExists(tableName: string, columnName: string) {
    const row = await this.prepare(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?'
    ).get(tableName, columnName)
    return !!row
  }

  async listColumns(tableName: string) {
    const rows = await this.prepare(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position ASC'
    ).all<{ column_name: string }>(tableName)
    return rows.map((row) => row.column_name)
  }

  async close() {
    await this.pool.end()
  }
}

export async function createDatabaseAdapter(database: DatabaseConfig): Promise<DatabaseAdapter> {
  if (database.type === 'sqlite') {
    const dbPath = resolveFromRoot(database.sqlite.path || './data/filemanager.db')
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const sqliteDb = await createSqlJsCompatDatabase(dbPath)
    return new SqliteAdapter(sqliteDb)
  }

  if (database.type === 'mysql') {
    const pool = mysql.createPool({
      host: database.mysql.host,
      port: database.mysql.port,
      user: database.mysql.user,
      password: database.mysql.password,
      database: database.mysql.database,
      ssl: database.mysql.ssl ? {} : undefined,
      connectionLimit: 10,
    })
    return new MysqlAdapter(pool)
  }

  const pool = new PostgresPool({
    host: database.postgres.host,
    port: database.postgres.port,
    user: database.postgres.user,
    password: database.postgres.password,
    database: database.postgres.database,
    ssl: database.postgres.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10,
  })

  return new PostgresAdapter(pool)
}
