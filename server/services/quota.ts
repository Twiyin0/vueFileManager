import fs from 'fs'
import path from 'path'
import db from '../db'
import config from '../config'

export async function calculateUserStorageUsage(userId: number): Promise<number> {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  if (!user) return 0

  const userDir = path.resolve(config.storage_root || './uploads', user.username)
  if (!fs.existsSync(userDir)) return 0

  return getDirSize(userDir)
}

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
          size += fs.statSync(fullPath).size
        } catch {
          // ignore transient files
        }
      }
    }
  } catch {
    // ignore inaccessible directories
  }
  return size
}

export async function getUserQuota(userId: number): Promise<{ quota: number; used: number; remaining: number }> {
  const user = await db.prepare('SELECT storage_quota FROM users WHERE id = ?').get(userId) as any
  const quota = user?.storage_quota ?? 10737418240
  const used = await calculateUserStorageUsage(userId)
  return { quota, used, remaining: Math.max(0, quota - used) }
}

export async function checkQuota(
  userId: number,
  uploadSize: number
): Promise<{ allowed: boolean; message?: string; params?: Record<string, string | number> }> {
  const { quota, used, remaining } = await getUserQuota(userId)
  if (uploadSize > remaining) {
    const quotaMB = Math.round(quota / 1024 / 1024)
    const usedMB = Math.round(used / 1024 / 1024)
    return {
      allowed: false,
      message: 'common.insufficientStorage',
      params: {
        usedMB,
        quotaMB,
        remainingMB: Math.round(remaining / 1024 / 1024)
      }
    }
  }
  return { allowed: true }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}
