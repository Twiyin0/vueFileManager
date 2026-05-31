import { LocalStorage } from './local.js'
import { UpyunStorage } from './upyun.js'
import { StorageProvider } from './storage.js'
import db from '../db.js'

// 缓存存储实例
const storageCache = new Map<number, StorageProvider>()

export function getStorage(userId: number): StorageProvider {
  if (storageCache.has(userId)) {
    return storageCache.get(userId)!
  }

  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any

  if (!settings) {
    // 创建默认设置
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(userId)
    const defaultStorage = new LocalStorage('./uploads')
    storageCache.set(userId, defaultStorage)
    return defaultStorage
  }

  let storage: StorageProvider

  if (settings.storage_type === 'upyun' && settings.upyun_bucket && settings.upyun_operator) {
    storage = new UpyunStorage(
      settings.upyun_operator,
      settings.upyun_password,
      settings.upyun_bucket,
      settings.upyun_endpoint || 'v0.api.upyun.com'
    )
  } else {
    storage = new LocalStorage(settings.local_path || './uploads')
  }

  storageCache.set(userId, storage)
  return storage
}

// 清除用户的存储缓存（配置变更时调用）
export function clearStorageCache(userId: number) {
  storageCache.delete(userId)
}

// 获取访客可访问的存储（根据用户配置）
export function getGuestStorage(ownerId: number): { storage: StorageProvider; basePath: string } | null {
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(ownerId) as any

  if (!settings || !settings.guest_enabled) {
    return null
  }

  const storage = getStorage(ownerId)
  return {
    storage,
    basePath: settings.guest_path || ''
  }
}
