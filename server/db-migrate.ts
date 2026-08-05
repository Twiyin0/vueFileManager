import config, { type DatabaseConfig } from './config'
import { createDatabaseAdapter, type DatabaseAdapter } from './db-adapter'
import { initializeDatabase } from './db-bootstrap'
import { fileURLToPath } from 'node:url'

const MIGRATION_TABLES = [
  'users',
  'user_settings',
  'storage_pools',
  'api_keys',
  'shares',
  'trash',
  'favourites',
  'guest_shares',
  'ip_blacklist',
  'ip_whitelist',
  'ip_list_config',
  'verification_codes',
  'offline_download_tasks',
] as const

type MigrationTable = typeof MIGRATION_TABLES[number]

interface CliOptions {
  sourceSqlitePath: string
  targetType: DatabaseConfig['type']
  truncate: boolean
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    sourceSqlitePath: config.database.sqlite.path || './data/filemanager.db',
    targetType: config.database.type,
    truncate: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--source-sqlite') {
      options.sourceSqlitePath = argv[i + 1] || options.sourceSqlitePath
      i += 1
      continue
    }

    if (arg === '--target') {
      const value = argv[i + 1] as DatabaseConfig['type'] | undefined
      if (value === 'sqlite' || value === 'mysql' || value === 'postgres') {
        options.targetType = value
      }
      i += 1
      continue
    }

    if (arg === '--truncate') {
      options.truncate = true
    }
  }

  return options
}

function buildTargetConfig(targetType: DatabaseConfig['type']): DatabaseConfig {
  return {
    type: targetType,
    sqlite: { ...config.database.sqlite },
    mysql: { ...config.database.mysql },
    postgres: { ...config.database.postgres },
  }
}

function buildSourceSqliteConfig(sourceSqlitePath: string): DatabaseConfig {
  return {
    type: 'sqlite',
    sqlite: {
      path: sourceSqlitePath,
    },
    mysql: { ...config.database.mysql },
    postgres: { ...config.database.postgres },
  }
}

function toSerializableRow(row: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value === undefined ? null : value])
  )
}

function formatIdentifier(identifier: string) {
  return /^[a-zA-Z_][\w]*$/.test(identifier) ? identifier : `"${identifier.replace(/"/g, '""')}"`
}

function buildInsertSql(tableName: string, columns: string[]) {
  const placeholders = columns.map(() => '?').join(', ')
  const formattedColumns = columns.map(formatIdentifier).join(', ')
  return `INSERT INTO ${formatIdentifier(tableName)} (${formattedColumns}) VALUES (${placeholders})`
}

async function resetTargetTable(targetDb: DatabaseAdapter, tableName: MigrationTable) {
  if (targetDb.dialect === 'mysql') {
    await targetDb.exec(`DELETE FROM ${tableName}`)
    if (await targetDb.columnExists(tableName, 'id')) {
      await targetDb.exec(`ALTER TABLE ${tableName} AUTO_INCREMENT = 1`)
    }
    return
  }

  if (targetDb.dialect === 'postgres') {
    await targetDb.exec(`TRUNCATE TABLE ${tableName} RESTART IDENTITY CASCADE`)
    return
  }

  await targetDb.exec(`DELETE FROM ${tableName}`)
}

async function resetTargetTables(targetDb: DatabaseAdapter) {
  for (const tableName of [...MIGRATION_TABLES].reverse()) {
    const exists = await targetDb.tableExists(tableName)
    if (!exists) continue
    await resetTargetTable(targetDb, tableName)
  }
}

async function syncSequenceIfNeeded(targetDb: DatabaseAdapter, tableName: MigrationTable) {
  const hasId = await targetDb.columnExists(tableName, 'id')
  if (!hasId) return

  if (targetDb.dialect === 'mysql') {
    const row = await targetDb.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${tableName}`).get<{ next_id: number }>()
    await targetDb.exec(`ALTER TABLE ${tableName} AUTO_INCREMENT = ${Number(row?.next_id || 1)}`)
    return
  }

  if (targetDb.dialect === 'postgres') {
    const row = await targetDb.prepare(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tableName}`).get<{ max_id: number }>()
    const maxId = Number(row?.max_id || 0)
    await targetDb.exec(`
      SELECT setval(
        pg_get_serial_sequence('${tableName}', 'id'),
        ${maxId > 0 ? maxId : 1},
        ${maxId > 0 ? 'true' : 'false'}
      )
    `)
  }
}

async function migrateTable(sourceDb: DatabaseAdapter, targetDb: DatabaseAdapter, tableName: MigrationTable) {
  const sourceExists = await sourceDb.tableExists(tableName)
  if (!sourceExists) {
    console.log(`[skip] ${tableName}: source table not found`)
    return
  }

  const targetExists = await targetDb.tableExists(tableName)
  if (!targetExists) {
    console.log(`[skip] ${tableName}: target table not found`)
    return
  }

  const sourceColumns = await sourceDb.listColumns(tableName)
  const targetColumns = new Set(await targetDb.listColumns(tableName))
  const commonColumns = sourceColumns.filter((column) => targetColumns.has(column))

  if (commonColumns.length === 0) {
    console.log(`[skip] ${tableName}: no common columns`)
    return
  }

  const selectedColumns = commonColumns.map(formatIdentifier).join(', ')
  const rows = await sourceDb.prepare(`SELECT ${selectedColumns} FROM ${formatIdentifier(tableName)} ORDER BY ROWID ASC`).all<Record<string, any>>()
  if (rows.length === 0) {
    console.log(`[ok] ${tableName}: 0 rows`)
    return
  }

  const insert = targetDb.prepare(buildInsertSql(tableName, commonColumns))
  for (const rawRow of rows) {
    const row = toSerializableRow(rawRow)
    await insert.run(...commonColumns.map((column) => row[column]))
  }

  await syncSequenceIfNeeded(targetDb, tableName)
  console.log(`[ok] ${tableName}: ${rows.length} rows`)
}

export async function migrateDatabase(rawArgs: string[] = process.argv.slice(2)) {
  const options = parseArgs(rawArgs)
  if (options.targetType === 'sqlite') {
    throw new Error('Target database cannot be sqlite for cross-database migration')
  }

  const sourceDb = await createDatabaseAdapter(buildSourceSqliteConfig(options.sourceSqlitePath))
  const targetDb = await createDatabaseAdapter(buildTargetConfig(options.targetType))

  try {
    await initializeDatabase(targetDb, { ensureAdmin: false })

    if (options.truncate) {
      await resetTargetTables(targetDb)
    }

    for (const tableName of MIGRATION_TABLES) {
      await migrateTable(sourceDb, targetDb, tableName)
    }

    console.log(`Migration completed: sqlite -> ${options.targetType}`)
  } finally {
    await sourceDb.close()
    await targetDb.close()
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  migrateDatabase().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
