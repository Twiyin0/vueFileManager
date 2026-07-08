import { LocalStorage } from './local'
import { UpyunStorage } from './upyun'
import { FtpStorage } from './ftp'
import { S3Storage } from './s3'
import { SftpStorage } from './sftp'
import { PrefixStorage } from './prefix'
import { StorageProvider } from './storage'
import appConfig from '../config'
import db from '../db'

const storageCache = new Map<string, StorageProvider>()

function createStorageInstance(pool: any, username?: string): StorageProvider {
  const config = JSON.parse(pool.config)

  let storage: StorageProvider
  if (pool.storage_type === 'upyun') {
    storage = new UpyunStorage(
      config.upyunOperator,
      config.upyunPassword,
      config.upyunBucket,
      config.upyunEndpoint || 'v0.api.upyun.com'
    )
  } else if (pool.storage_type === 'ftp') {
    storage = new FtpStorage(config)
  } else if (pool.storage_type === 'sftp') {
    storage = new SftpStorage(config)
  } else if (pool.storage_type === 's3') {
    storage = new S3Storage(config)
  } else {
    const configuredPath = [config.path, config.localPath]
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim() || ''
    storage = new LocalStorage(configuredPath || appConfig.storage_root || './uploads', configuredPath ? undefined : username)
  }

  if (config.rootPath && config.rootPath !== '/' && config.rootPath !== '') {
    if (storage instanceof LocalStorage) {
      storage.ensureSubdir(config.rootPath)
    }
    storage = new PrefixStorage(storage, config.rootPath)
  }

  return storage
}

async function resolveStorageByPoolId(userId: number, poolId: number): Promise<StorageProvider> {
  const cacheKey = `${userId}-${poolId}`
  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey)!
  }

  const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(poolId, userId) as any
  if (!pool) {
    throw new Error('storagePool.notFound')
  }

  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  const username = user?.username || `user_${userId}`

  const storage = createStorageInstance(pool, username)
  storageCache.set(cacheKey, storage)
  return storage
}

function createDeferredStorage(getter: () => Promise<StorageProvider>): StorageProvider {
  return {
    list: (prefix) => getter().then((storage) => storage.list(prefix)),
    upload: (filePath, data) => getter().then((storage) => storage.upload(filePath, data)),
    uploadStream: (filePath, stream, size) => getter().then(async (storage) => {
      if (!storage.uploadStream) throw new Error('Streaming uploads are not supported by the current storage backend')
      return storage.uploadStream(filePath, stream, size)
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
    getCapabilities: () => getter().then((storage) => (
      storage.getCapabilities
        ? storage.getCapabilities()
        : {
            nativeDirectoryRename: true,
            nativeDirectoryMove: true,
            nativeDirectoryCopy: true,
            recommendedAsyncTreeThreshold: 200,
          }
    )),
    resolveLocalPath: (filePath) => getter().then((storage) => storage.resolveLocalPath ? storage.resolveLocalPath(filePath) : null),
  }
}

export function getStorageByPoolId(userId: number, poolId: number): StorageProvider {
  return createDeferredStorage(() => resolveStorageByPoolId(userId, poolId))
}

export function getStorage(userId: number): StorageProvider {
  return createDeferredStorage(async () => {
    const defaultPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any
    if (defaultPool) {
      return resolveStorageByPoolId(userId, defaultPool.id)
    }

    const firstPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId) as any
    if (firstPool) {
      await db.prepare('UPDATE storage_pools SET is_default = 1 WHERE id = ?').run(firstPool.id)
      return resolveStorageByPoolId(userId, firstPool.id)
    }

    const result = await db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, 1, ?)
    `).run(userId, 'Default Storage', 'local', JSON.stringify({}))

    return resolveStorageByPoolId(userId, result.lastInsertRowid as number)
  })
}

export function clearStorageCache(userId: number) {
  for (const key of storageCache.keys()) {
    if (key.startsWith(`${userId}-`)) {
      storageCache.delete(key)
    }
  }
}

export async function getUserStoragePools(userId: number): Promise<any[]> {
  return db.prepare(`
    SELECT id, name, storage_type, is_default, config, created_at
    FROM storage_pools
    WHERE user_id = ?
    ORDER BY is_default DESC, created_at ASC
  `).all(userId)
}

export async function getGuestStorage(ownerId: number): Promise<{ storage: StorageProvider; basePath: string } | null> {
  const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(ownerId) as any
  if (!settings || !settings.guest_enabled) {
    return null
  }

  const defaultPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(ownerId) as any
  if (!defaultPool) {
    return null
  }

  return {
    storage: getStorageByPoolId(ownerId, defaultPool.id),
    basePath: settings.guest_path || ''
  }
}
