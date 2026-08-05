import config from './config'
import { createDatabaseAdapter } from './db-adapter'
import { initializeDatabase, syncStoragePoolsFromConfig as syncStoragePoolsFromConfigBase } from './db-bootstrap'

const db = await createDatabaseAdapter(config.database)

await initializeDatabase(db)

export async function syncStoragePoolsFromConfig(userId: number) {
  await syncStoragePoolsFromConfigBase(db, userId)
}

export default db
