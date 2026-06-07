import fs from 'fs'
import path from 'path'
import db from '../db'
import config from '../config'

/** 计算用户本地存储目录的实际使用量（字节） */
export function calculateUserStorageUsage(userId: number): number {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  if (!user) return 0

  const userDir = path.resolve(config.storage_root || './uploads', user.username)
  if (!fs.existsSync(userDir)) return 0

  return getDirSize(userDir)
}

/** 递归计算目录大小 */
function getDirSize(dirPath: string): number {
  let size = 0
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        size += getDirSize(fullPath)
      } else {
        try {
          const stat = fs.statSync(fullPath)
          size += stat.size
        } catch {}
      }
    }
  } catch {}
  return size
}

/** 获取用户配额信息 */
export function getUserQuota(userId: number): { quota: number; used: number; remaining: number } {
  const user = db.prepare('SELECT storage_quota FROM users WHERE id = ?').get(userId) as any
  const quota = user?.storage_quota ?? 10737418240 // 默认 10GB
  const used = calculateUserStorageUsage(userId)
  return { quota, used, remaining: Math.max(0, quota - used) }
}

/** 检查上传是否超出配额 */
export function checkQuota(userId: number, uploadSize: number): { allowed: boolean; message?: string } {
  const { quota, used, remaining } = getUserQuota(userId)
  if (uploadSize > remaining) {
    const quotaMB = Math.round(quota / 1024 / 1024)
    const usedMB = Math.round(used / 1024 / 1024)
    return {
      allowed: false,
      message: `存储空间不足。已用 ${usedMB}MB / ${quotaMB}MB，剩余 ${Math.round(remaining / 1024 / 1024)}MB`,
    }
  }
  return { allowed: true }
}

/** 格式化字节为可读字符串 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}
