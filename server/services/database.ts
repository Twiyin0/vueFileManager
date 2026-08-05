import mysql from 'mysql2/promise'
import { Client as PgClient } from 'pg'
import config, { DatabaseConfig } from '../config'
import { resolveFromRoot } from '../runtime-paths'

export interface DatabaseStatus {
  type: DatabaseConfig['type']
  runtime: 'sqlite' | 'external'
  configured: boolean
  supported: boolean
  message: string
  note?: string
}

function getSqliteResolvedPath() {
  return resolveFromRoot(config.database.sqlite.path || './data/filemanager.db')
}

export function getDatabaseStatus(): DatabaseStatus {
  const type = config.database.type

  if (type === 'sqlite') {
    return {
      type,
      runtime: 'sqlite',
      configured: true,
      supported: true,
      message: `SQLite active: ${getSqliteResolvedPath()}`
    }
  }

  return {
    type,
    runtime: 'external',
    configured: true,
    supported: true,
    message: `${type} active: business data is using the configured external database`
  }
}

export async function testDatabaseConnection(database: DatabaseConfig) {
  if (database.type === 'sqlite') {
    return {
      success: true,
      message: `SQLite database file: ${resolveFromRoot(database.sqlite.path || './data/filemanager.db')}`
    }
  }

  if (database.type === 'mysql') {
    const connection = await mysql.createConnection({
      host: database.mysql.host,
      port: database.mysql.port,
      user: database.mysql.user,
      password: database.mysql.password,
      database: database.mysql.database,
      ssl: database.mysql.ssl ? {} : undefined
    })

    try {
      await connection.query('SELECT 1')
      return {
        success: true,
        message: `MySQL connection ok: ${database.mysql.host}:${database.mysql.port}/${database.mysql.database}`
      }
    } finally {
      await connection.end()
    }
  }

  const client = new PgClient({
    host: database.postgres.host,
    port: database.postgres.port,
    user: database.postgres.user,
    password: database.postgres.password,
    database: database.postgres.database,
    ssl: database.postgres.ssl ? { rejectUnauthorized: false } : undefined
  })

  await client.connect()
  try {
    await client.query('SELECT 1')
    return {
      success: true,
      message: `PostgreSQL connection ok: ${database.postgres.host}:${database.postgres.port}/${database.postgres.database}`
    }
  } finally {
    await client.end()
  }
}
