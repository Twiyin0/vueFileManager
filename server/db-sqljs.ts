import fs from 'fs'
import path from 'path'
import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

function assertNoPendingWal(filePath: string) {
  const walPath = `${filePath}-wal`
  if (!fs.existsSync(walPath)) return

  const walStat = fs.statSync(walPath)
  if (walStat.size <= 0) return

  // sqlite3 may leave behind a tiny placeholder WAL file after a successful
  // checkpoint/TRUNCATE. There is no pending frame data in that case, so we
  // treat it as safe and remove the stub to avoid blocking sql.js startup.
  if (walStat.size <= 32) {
    try {
      const header = fs.readFileSync(walPath)
      const hasNonZeroByte = header.some((byte) => byte !== 0)
      if (!hasNonZeroByte) {
        fs.rmSync(walPath, { force: true })
        return
      }
    } catch {
      // Fall through to the hard error below if the file cannot be inspected.
    }
  }

  throw new Error(
    [
      `Detected pending SQLite WAL data at ${walPath}.`,
      'sql.js can only open the main .db file and cannot replay the existing .db-wal log.',
      'Before switching to sql.js, checkpoint the database with the old SQLite runtime or sqlite3 CLI.',
      `Example: sqlite3 "${filePath}" "PRAGMA wal_checkpoint(FULL);"`
    ].join(' ')
  )
}

type RunResult = {
  changes: number
  lastInsertRowid: number
}

type Row = Record<string, any>

class SqlJsStatement {
  constructor(
    private readonly database: SqlJsCompatDatabase,
    private readonly sql: string
  ) {}

  private normalizeParams(params: any[]): SqlValue[] {
    return params.map((value) => value === undefined ? null : value)
  }

  get(...params: any[]) {
    const stmt = this.database.raw.prepare(this.sql)
    try {
      if (params.length > 0) stmt.bind(this.normalizeParams(params))
      if (!stmt.step()) return undefined
      return stmt.getAsObject()
    } finally {
      stmt.free()
    }
  }

  all(...params: any[]) {
    const stmt = this.database.raw.prepare(this.sql)
    try {
      if (params.length > 0) stmt.bind(this.normalizeParams(params))
      const rows: Row[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      return rows
    } finally {
      stmt.free()
    }
  }

  run(...params: any[]): RunResult {
    const stmt = this.database.raw.prepare(this.sql)
    try {
      if (params.length > 0) stmt.run(this.normalizeParams(params))
      else stmt.run()
    } finally {
      stmt.free()
    }

    const changes = this.database.raw.getRowsModified()
    const rowIdRow = this.database.raw.exec('SELECT last_insert_rowid() AS id')
    const lastInsertRowid = rowIdRow[0]?.values?.[0]?.[0]

    this.database.flush()

    return {
      changes,
      lastInsertRowid: Number(lastInsertRowid || 0)
    }
  }
}

export class SqlJsCompatDatabase {
  constructor(
    readonly raw: SqlJsDatabase,
    private readonly filePath: string
  ) {}

  prepare(sql: string) {
    return new SqlJsStatement(this, sql)
  }

  exec(sql: string) {
    const result = this.raw.exec(sql)
    this.flush()
    return result
  }

  pragma(statement: string) {
    const normalized = statement.trim().toUpperCase()
    if (normalized === 'JOURNAL_MODE = WAL') return [{ journal_mode: 'memory' }]
    return this.raw.exec(`PRAGMA ${statement}`)
  }

  flush() {
    fs.writeFileSync(this.filePath, Buffer.from(this.raw.export()))
  }
}

export async function createSqlJsCompatDatabase(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  assertNoPendingWal(filePath)

  const sqlJsDistDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'))
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlJsDistDir, file)
  })

  const dbBuffer = fs.existsSync(filePath) ? fs.readFileSync(filePath) : undefined
  const rawDb = new SQL.Database(dbBuffer ? new Uint8Array(dbBuffer) : undefined)
  return new SqlJsCompatDatabase(rawDb, filePath)
}
