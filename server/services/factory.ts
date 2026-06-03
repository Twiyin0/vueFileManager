import { LocalStorage } from './local'
import { UpyunStorage } from './upyun'
import { StorageProvider } from './storage'
import db from '../db'

// 缓存存储实例 (key: userId-poolId)
const storageCache = new Map<string, StorageProvider>()

// 创建存储实例
function createStorageInstance(pool: any): StorageProvider {
  const config = JSON.parse(pool.config)

  if (pool.storage_type === 'upyun') {
    return new UpyunStorage(
      config.upyunOperator,
      config.upyunPassword,
      config.upyunBucket,
      config.upyunEndpoint || 'v0.api.upyun.com'
    )
  } else {
    return new LocalStorage(config.localPath || './uploads')
  }
}

// 根据存储池ID获取存储实例
export function getStorageByPoolId(userId: number, poolId: number): StorageProvider {
  const cacheKey = `${userId}-${poolId}`

  if (storageCache.has(cacheKey)) {
    return storageCache.get(cacheKey)!
  }

  const pool = db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(poolId, userId) as any

  if (!pool) {
    throw new Error('存储池不存在')
  }

  const storage = createStorageInstance(pool)
  storageCache.set(cacheKey, storage)
  return storage
}

// 获取用户的默认存储
export function getStorage(userId: number): StorageProvider {
  // 查找默认存储池
  const defaultPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any

  if (defaultPool) {
    return getStorageByPoolId(userId, defaultPool.id)
  }

  // 如果没有默认存储池，尝试获取第一个
  const firstPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(userId) as any

  if (firstPool) {
    // 设置为默认
    db.prepare('UPDATE storage_pools SET is_default = 1 WHERE id = ?').run(firstPool.id)
    return getStorageByPoolId(userId, firstPool.id)
  }

  // 如果没有任何存储池，创建一个默认的本地存储池
  const result = db.prepare(`
    INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
    VALUES (?, ?, ?, 1, ?)
  `).run(userId, '默认存储', 'local', JSON.stringify({ localPath: './uploads' }))

  return getStorageByPoolId(userId, result.lastInsertRowid as number)
}

// 清除用户的存储缓存（配置变更时调用）
export function clearStorageCache(userId: number) {
  // 清除该用户的所有存储缓存
  for (const key of storageCache.keys()) {
    if (key.startsWith(`${userId}-`)) {
      storageCache.delete(key)
    }
  }
}

// 获取用户所有存储池
export function getUserStoragePools(userId: number): any[] {
  return db.prepare(`
    SELECT id, name, storage_type, is_default, config, created_at
    FROM storage_pools
    WHERE user_id = ?
    ORDER BY is_default DESC, created_at ASC
  `).all(userId)
}

// 获取访客可访问的存储（根据用户配置）
export function getGuestStorage(ownerId: number): { storage: StorageProvider; basePath: string } | null {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(ownerId) as any

  if (!settings || !settings.guest_enabled) {
    return null
  }

  // 获取默认存储池
  const defaultPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(ownerId) as any

  if (!defaultPool) {
    return null
  }

  const storage = getStorageByPoolId(ownerId, defaultPool.id)
  return {
    storage,
    basePath: settings.guest_path || ''
  }
}
