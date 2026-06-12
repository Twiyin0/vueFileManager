import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { resolveFromRoot } from '../runtime-paths'
import type { StorageProvider } from './storage'

const PREVIEW_CACHE_DIR = resolveFromRoot('data', 'preview-cache')
const PREVIEW_CACHE_TTL_MS = 1000 * 60 * 60 * 6
const MAX_PREVIEW_CACHE_BYTES = 64 * 1024 * 1024

function createCacheKey(scope: string, filePath: string) {
  return crypto.createHash('sha1').update(`${scope}:${filePath}`).digest('hex')
}

function getCachePath(cacheKey: string) {
  return path.join(PREVIEW_CACHE_DIR, cacheKey)
}

async function ensurePreviewCacheDir() {
  await fs.mkdir(PREVIEW_CACHE_DIR, { recursive: true })
}

async function readCachedFile(cachePath: string) {
  try {
    const stat = await fs.stat(cachePath)
    if (Date.now() - stat.mtimeMs > PREVIEW_CACHE_TTL_MS) {
      await fs.unlink(cachePath).catch(() => {})
      return null
    }
    return {
      path: cachePath,
      stat,
    }
  } catch {
    return null
  }
}

export async function resolvePreviewCacheFile(
  scope: string,
  storage: StorageProvider,
  filePath: string,
): Promise<{ path: string; stat: { size: number; mtimeMs: number } } | null> {
  const localPath = storage.resolveLocalPath ? await storage.resolveLocalPath(filePath) : null
  if (localPath) {
    const stat = await fs.stat(localPath)
    return { path: localPath, stat }
  }

  const ext = path.extname(filePath)
  const cacheKey = createCacheKey(scope, filePath)
  const cachePath = `${getCachePath(cacheKey)}${ext}`

  await ensurePreviewCacheDir()

  const cached = await readCachedFile(cachePath)
  if (cached) {
    return cached
  }

  const data = await storage.download(filePath)
  if (data.length > MAX_PREVIEW_CACHE_BYTES) {
    return null
  }

  await fs.writeFile(cachePath, data)
  const stat = await fs.stat(cachePath)
  return { path: cachePath, stat }
}
