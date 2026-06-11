import Busboy from 'busboy'
import os from 'os'
import fs from 'fs/promises'
import path from 'path'
import { PassThrough } from 'stream'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import db from '../../db'
import { ApiKeyRequest } from '../../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../../services/factory'
import { LocalStorage } from '../../services/local'
import { PrefixStorage } from '../../services/prefix'
import config from '../../config'

export const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'vue-file-manager', 'uploads')
export const RESUMABLE_UPLOAD_TTL_MS = Math.max(1, config.resumable_upload_cache_minutes || 120) * 60 * 1000
export const TEMP_UPLOAD_PREFIX = '.temp_'

const JUNK_PATTERNS = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//, /^\.trash$/i]

export interface UploadMeta {
  fileName: string
  fileSize: number
  dirPath: string
  poolId: number | null
  userId: number
  uploadedParts: number[]
  nextPartIndex: number
  createdAt: number
  updatedAt: number
}

export function isJunkFile(filename: string): boolean {
  const name = filename.split('/').pop() || filename
  return JUNK_PATTERNS.some((pattern) => pattern.test(name))
}

export function isTemporaryUploadFile(filename: string): boolean {
  const name = filename.split('/').pop() || filename
  return name.startsWith(TEMP_UPLOAD_PREFIX)
}

export function shouldUseAtomicTempUpload(storageType?: string) {
  return storageType === 'local' || storageType === 'ftp'
}

export function buildTemporaryUploadPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return `${TEMP_UPLOAD_PREFIX}${normalized}`
  }
  const dir = normalized.slice(0, lastSlashIndex)
  const name = normalized.slice(lastSlashIndex + 1)
  return `${dir}/${TEMP_UPLOAD_PREFIX}${name}`
}

export async function finalizeAtomicUpload(storage: Awaited<ReturnType<typeof getStorageForRequest>>, tempPath: string, finalPath: string) {
  if (tempPath === finalPath) return
  try {
    await storage.move(tempPath, finalPath)
  } catch (err) {
    if (await storage.exists(finalPath)) {
      await storage.remove(finalPath)
      await storage.move(tempPath, finalPath)
      return
    }
    throw err
  }
}

export function resolvePoolId(userId: number, poolId?: string | number | null): number | undefined {
  if (poolId !== undefined && poolId !== null && poolId !== '') {
    return Number(poolId)
  }
  return (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any)?.id
}

export function buildDirectUrl(req: ApiKeyRequest, filePath: string, poolId?: number): string {
  const params = new URLSearchParams({ path: filePath })
  if (poolId) params.set('poolId', String(poolId))

  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.token || req.query.token as string

  if (apiKey) params.set('apiKey', apiKey)
  else if (token) params.set('token', token)

  return `/api/files/preview?${params.toString()}`
}

export function withDirectUrl(req: ApiKeyRequest, file: Record<string, any>, poolId?: number) {
  const directUrl = file.type === 'file'
    ? buildDirectUrl(req, file.path as string, poolId)
    : ''
  return { ...file, directUrl, fileUrl: directUrl }
}

export async function removeUploadTask(uploadId: string) {
  const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
  await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
}

export async function cleanupExpiredUploads() {
  await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })
  const entries = await fs.readdir(UPLOAD_TEMP_DIR, { withFileTypes: true }).catch(() => [])
  const now = Date.now()

  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const uploadDir = path.join(UPLOAD_TEMP_DIR, entry.name)
      const metaPath = path.join(uploadDir, 'meta.json')
      try {
        const raw = await fs.readFile(metaPath, 'utf-8')
        const meta = JSON.parse(raw) as UploadMeta
        const updatedAt = meta.updatedAt || meta.createdAt || 0
        if (!updatedAt || now - updatedAt > RESUMABLE_UPLOAD_TTL_MS) {
          await fs.rm(uploadDir, { recursive: true, force: true })
        }
      } catch {
        await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
      }
    }))
}

export async function readUploadMeta(uploadId: string): Promise<{ uploadDir: string; metaPath: string; meta: UploadMeta }> {
  const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
  const metaPath = path.join(uploadDir, 'meta.json')
  const raw = await fs.readFile(metaPath, 'utf-8')
  return {
    uploadDir,
    metaPath,
    meta: JSON.parse(raw) as UploadMeta
  }
}

export async function writeUploadMeta(metaPath: string, meta: UploadMeta) {
  meta.updatedAt = Date.now()
  await fs.writeFile(metaPath, JSON.stringify(meta))
}

export function uploadSingle(field: string) {
  return (req: ApiKeyRequest, res: any, next: any) => {
    if (!req.is('multipart')) return res.status(400).json({ error: '需要 multipart 请求' })

    const limits = { fileSize: config.upload_limit * 1024 * 1024 }
    const bb = Busboy({ headers: req.headers, limits, defCharset: 'latin1' })
    let fileReceived = false

    bb.on('file', (fieldname, stream, info) => {
      if (fieldname !== field) { stream.resume(); return }

      let rawFilename = info.filename
      try {
        const fnameBuf = Buffer.from(info.filename, 'latin1')
        if (fnameBuf.some((byte) => byte > 0x7f)) {
          const charset = chardet.detect(fnameBuf)
          if (charset && iconv.encodingExists(charset)) {
            rawFilename = iconv.decode(fnameBuf, charset)
          } else {
            const tryUtf8 = fnameBuf.toString('utf8')
            if (!tryUtf8.includes('\ufffd')) {
              rawFilename = tryUtf8
            } else if (iconv.encodingExists('gbk')) {
              rawFilename = iconv.decode(fnameBuf, 'gbk')
            }
          }
        }
      } catch (error) {
        console.error('[upload] 编码检测异常:', error)
      }

      rawFilename = rawFilename.normalize('NFC')

      if (isJunkFile(rawFilename)) {
        stream.resume()
        return res.status(400).json({ error: `已拦截系统文件: ${rawFilename}` })
      }

      const chunks: Buffer[] = []
      let totalSize = 0
      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (totalSize > limits.fileSize) {
          stream.resume()
          return
        }
        chunks.push(chunk)
      })
      stream.on('end', () => {
        if (totalSize > limits.fileSize) {
          return res.status(413).json({ error: `文件大小超过限制 (${config.upload_limit}MB)` })
        }
        ;(req as any).file = {
          fieldname,
          originalname: rawFilename,
          encoding: info.encoding,
          mimetype: info.mimeType,
          buffer: Buffer.concat(chunks),
          size: totalSize,
        }
        fileReceived = true
      })
      stream.on('error', () => {
        return res.status(500).json({ error: '文件上传流错误' })
      })
    })

    bb.on('field', (name: string, value: string) => {
      ;(req as any).body = (req as any).body || {}
      ;(req as any).body[name] = value
    })

    bb.on('close', () => {
      if (!fileReceived && !res.headersSent) {
        return res.status(400).json({ error: '没有文件' })
      }
      if (!res.headersSent) next()
    })

    bb.on('error', (err: Error) => {
      return res.status(400).json({ error: err.message })
    })

    req.pipe(bb)
  }
}

export function getStorageForRequest(req: ApiKeyRequest) {
  const poolId =
    req.query.poolId as string ||
    req.body?.poolId as string ||
    req.headers['x-pool-id'] as string
  if (poolId) {
    return getStorageByPoolId(req.userId!, parseInt(poolId))
  }
  return getStorage(req.userId!)
}

export async function processConcurrently<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency = 3
): Promise<string[]> {
  const errors: string[] = []
  let index = 0

  async function next() {
    while (index < items.length) {
      const currentIndex = index++
      try {
        await fn(items[currentIndex], currentIndex)
      } catch (err: any) {
        errors.push(err.message)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
  return errors
}

export function createUploadPassThrough() {
  return new PassThrough()
}

export function unwrapLocalStorage(storage: ReturnType<typeof getStorageForRequest>) {
  return storage instanceof PrefixStorage ? (storage as any).inner : storage
}

export function resolveLocalMediaPath(storage: ReturnType<typeof getStorageForRequest>, filePath: string) {
  if (storage instanceof PrefixStorage) {
    const inner = (storage as any).inner
    const prefix = ((storage as any).prefix as string | undefined)?.replace(/\/+$/, '') || ''
    if (inner instanceof LocalStorage) {
      const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
      return inner.resolvePath(prefix ? `${prefix}${normalizedPath}` : normalizedPath)
    }
  }

  if (storage instanceof LocalStorage) {
    return storage.resolvePath(filePath)
  }

  return null
}
