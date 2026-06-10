import { Router, Response } from 'express'
import multer from 'multer'
import Busboy from 'busboy'
import crypto from 'crypto'
import os from 'os'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PassThrough } from 'stream'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../services/factory'
import { LocalStorage } from '../services/local'
import { PrefixStorage } from '../services/prefix'
import config from '../config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'vue-file-manager', 'uploads')
const RESUMABLE_UPLOAD_TTL_MS = Math.max(1, config.resumable_upload_cache_minutes || 120) * 60 * 1000

const router = Router()
const TEMP_UPLOAD_PREFIX = '.temp_'

// macOS 资源叉文件 / 系统垃圾文件
const JUNK_PATTERNS = [/^\._/, /^\.DS_Store$/, /^Thumbs\.db$/, /^__MACOSX\//]
function isJunkFile(filename: string): boolean {
  const name = filename.split('/').pop() || filename
  return JUNK_PATTERNS.some(p => p.test(name))
}

function isTemporaryUploadFile(filename: string): boolean {
  const name = filename.split('/').pop() || filename
  return name.startsWith(TEMP_UPLOAD_PREFIX)
}

function shouldUseAtomicTempUpload(storageType?: string): boolean {
  return storageType === 'local' || storageType === 'ftp' || storageType === 'upyun'
}

function buildTemporaryUploadPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlashIndex = normalized.lastIndexOf('/')
  if (lastSlashIndex === -1) {
    return `${TEMP_UPLOAD_PREFIX}${normalized}`
  }
  const dir = normalized.slice(0, lastSlashIndex)
  const name = normalized.slice(lastSlashIndex + 1)
  return `${dir}/${TEMP_UPLOAD_PREFIX}${name}`
}

async function finalizeAtomicUpload(storage: Awaited<ReturnType<typeof getStorageForRequest>>, tempPath: string, finalPath: string) {
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

interface UploadMeta {
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

function resolvePoolId(userId: number, poolId?: string | number | null): number | undefined {
  if (poolId !== undefined && poolId !== null && poolId !== '') {
    return Number(poolId)
  }
  return (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any)?.id
}

function buildDirectUrl(req: ApiKeyRequest, filePath: string, poolId?: number): string {
  const params = new URLSearchParams({ path: filePath })
  if (poolId) params.set('poolId', String(poolId))

  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.token || req.query.token as string

  if (apiKey) params.set('apiKey', apiKey)
  else if (token) params.set('token', token)

  return `/api/files/preview?${params.toString()}`
}

function withDirectUrl(req: ApiKeyRequest, file: Record<string, any>, poolId?: number) {
  const directUrl = file.type === 'file'
    ? buildDirectUrl(req, file.path as string, poolId)
    : ''
  return { ...file, directUrl, fileUrl: directUrl }
}

async function removeUploadTask(uploadId: string) {
  const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
  await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
}

async function cleanupExpiredUploads() {
  await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })
  const entries = await fs.readdir(UPLOAD_TEMP_DIR, { withFileTypes: true }).catch(() => [])
  const now = Date.now()

  await Promise.all(entries
    .filter(entry => entry.isDirectory())
    .map(async entry => {
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

async function readUploadMeta(uploadId: string): Promise<{ uploadDir: string; metaPath: string; meta: UploadMeta }> {
  const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
  const metaPath = path.join(uploadDir, 'meta.json')
  const raw = await fs.readFile(metaPath, 'utf-8')
  return {
    uploadDir,
    metaPath,
    meta: JSON.parse(raw) as UploadMeta
  }
}

async function writeUploadMeta(metaPath: string, meta: UploadMeta) {
  meta.updatedAt = Date.now()
  await fs.writeFile(metaPath, JSON.stringify(meta))
}

/**
 * 从 multipart Content-Disposition 头中提取原始文件名字节，
 * 用 chardet 检测编码后解码为 UTF-8 字符串。
 * macOS NFD → NFC 标准化。
 */
function decodeFilename(rawBytes: Buffer): string {
  // 检测编码
  const charset = chardet.detect(rawBytes) || 'UTF-8'
  let decoded: string
  if (/utf-?8/i.test(charset)) {
    decoded = rawBytes.toString('utf8')
  } else if (iconv.encodingExists(charset)) {
    decoded = iconv.decode(rawBytes, charset)
  } else {
    decoded = rawFnameToUtf8Fallback(rawBytes)
  }
  return decoded.normalize('NFC')
}

function rawFnameToUtf8Fallback(rawBytes: Buffer): string {
  // 尝试 UTF-8，失败则 GBK，最后 latin1
  const utf8 = rawBytes.toString('utf8')
  if (!utf8.includes('\ufffd')) return utf8
  if (iconv.encodingExists('gbk')) return iconv.decode(rawBytes, 'gbk')
  return rawBytes.toString('latin1')
}

/**
 * 自定义文件上传中间件：拦截原始 multipart 头获取文件名原始字节，
 * 通过 chardet 检测编码后正确解码，解决跨平台中文文件名乱码。
 */
function uploadSingle(field: string) {
  return (req: ApiKeyRequest, res: Response, next: any) => {
    if (!req.is('multipart')) return res.status(400).json({ error: '需要 multipart 请求' })

    const limits = { fileSize: config.upload_limit * 1024 * 1024 }
    const bb = Busboy({ headers: req.headers, limits, defCharset: 'latin1' })
    let fileReceived = false

    bb.on('file', (fieldname, stream, info) => {
      if (fieldname !== field) { stream.resume(); return }

      // 从原始 Content-Disposition 头中提取文件名字节
      // busboy 的 info 来自已解码的头，我们需要拦截原始头
      // 通过解析 parts 的原始头来获取
      let rawFilename = info.filename
      try {
        // defCharset:'latin1' 让 busboy 按 latin1 解码，保留原始字节
        const fnameBuf = Buffer.from(info.filename, 'latin1')
        // 只有多字节字符（含 0x80-0xFF）才需要编码检测
        if (fnameBuf.some(b => b > 0x7f)) {
          const charset = chardet.detect(fnameBuf)
          if (charset && iconv.encodingExists(charset)) {
            rawFilename = iconv.decode(fnameBuf, charset)
          } else {
            // chardet 检测失败，依次尝试 UTF-8、GBK
            const tryUtf8 = fnameBuf.toString('utf8')
            if (!tryUtf8.includes('\ufffd')) {
              rawFilename = tryUtf8
            } else if (iconv.encodingExists('gbk')) {
              rawFilename = iconv.decode(fnameBuf, 'gbk')
            }
          }
        }
      } catch (e) { console.error('[upload] 编码检测异常:', e) }

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
          stream.resume() // drain
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

// 获取存储实例（支持指定存储池ID）
function getStorageForRequest(req: ApiKeyRequest) {
  const poolId =
    req.query.poolId as string ||
    req.body?.poolId as string ||
    req.headers['x-pool-id'] as string
  if (poolId) {
    return getStorageByPoolId(req.userId!, parseInt(poolId))
  }
  return getStorage(req.userId!)
}

// 文件列表
router.get('/list', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const poolId = req.query.poolId as string
    const prefix = (req.query.path as string) || ''

    // 无 poolId 且无路径时，返回所有存储池作为虚拟文件夹
    if (!poolId && !prefix) {
      const pools = db.prepare(`
        SELECT id, name, storage_type, is_default, created_at
        FROM storage_pools WHERE user_id = ?
        ORDER BY is_default DESC, created_at ASC
      `).all(req.userId!) as any[]

      const virtualFiles = pools.map(pool => ({
        name: pool.name,
        type: 'folder' as const,
        size: 0,
        modified: pool.created_at || new Date().toISOString(),
        path: '',
        poolId: pool.id,
        isPool: true,
        directUrl: '',
        fileUrl: ''
      }))
      return res.json({ files: virtualFiles })
    }

    const storage = getStorageForRequest(req)
    const files = await storage.list(prefix)

    // 解析 poolId 并注入到每个文件
    const resolvedPoolId = resolvePoolId(req.userId!, poolId)
    const filesWithPool = files
      .filter(f => !isJunkFile(f.name) && !isTemporaryUploadFile(f.name))
      .map(f => withDirectUrl(req, { ...f, poolId: resolvedPoolId }, resolvedPoolId))

    res.json({ files: filesWithPool })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 文件信息
router.get('/info', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    const info = await storage.info(filePath)

    // 解析 poolId
    const poolId = req.query.poolId as string
    const resolvedPoolId = resolvePoolId(req.userId!, poolId)

    res.json({ info: withDirectUrl(req, { ...info, poolId: resolvedPoolId }, resolvedPoolId) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 上传文件（传统方式）
router.post('/upload', flexibleAuth, requirePermission('write'), uploadSingle('file'), async (req: ApiKeyRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: '没有文件' })

    // 配额检查（仅本地存储）
    const poolId = req.query.poolId as string || req.body.poolId as string
    const resolvedPoolId = resolvePoolId(req.userId!, poolId)
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
    if (pool?.storage_type === 'local') {
      const { checkQuota } = await import('../services/quota')
      const quotaCheck = checkQuota(req.userId!, req.file.size)
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message })
      }
    }

    const storage = getStorageForRequest(req)
    const dirPath = (req.query.path as string) || ''
    // 安全 decode 文件名（前端可能 encodeURIComponent 编码过）
    let normalizedName = req.file.originalname
    try { normalizedName = decodeURIComponent(normalizedName) } catch {}
    normalizedName = normalizedName.normalize('NFC')
    const filePath = dirPath ? `${dirPath}/${normalizedName}` : normalizedName
    await storage.upload(filePath, req.file.buffer)

    const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
    res.json({ message: '上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 保存文本文件内容（Monaco Editor 编辑后保存）
router.post('/write', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { path: filePath, content } = req.body
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: '缺少 filePath 或 content' })
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content 必须是字符串' })
    }
    // 10MB 上限（文本文件不应超过此值）
    if (content.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: '文件过大，请使用上传功能' })
    }
    const storage = getStorageForRequest(req)
    const buffer = Buffer.from(content, 'utf-8')
    // 30s 超时保护
    await Promise.race([
      storage.upload(filePath, buffer),
      new Promise((_, reject) => setTimeout(() => reject(new Error('保存超时')), 30000)),
    ])
    res.json({ success: true, path: filePath })
  } catch (err: any) {
    console.error('Write error:', err.message)
    res.status(500).json({ error: err.message || '保存失败' })
  }
})

// 流式上传（支持 chunked transfer encoding）
router.post('/upload-stream', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  let tempPath: string | null = null
  let fileHandle: fs.FileHandle | null = null
  try {
    await cleanupExpiredUploads()
    const rawFileName = req.headers['x-file-name'] as string
    let fileName: string
    try { fileName = decodeURIComponent(rawFileName) } catch { fileName = rawFileName }
    fileName = fileName.normalize('NFC')
    const rawDirPath = (req.headers['x-dir-path'] as string) || ''
    let dirPath: string
    try { dirPath = decodeURIComponent(rawDirPath) } catch { dirPath = rawDirPath }
    dirPath = dirPath.normalize('NFC')
    const poolIdStr = req.headers['x-pool-id'] as string
    // fileName = fileName.startsWith('%') ? decodeURIComponent(fileName) : fileName
    if (!fileName) {
      return res.status(400).json({ error: '缺少 X-File-Name 头' })
    }
    if (isJunkFile(fileName)) {
      return res.status(400).json({ error: `已拦截系统文件: ${fileName}` })
    }

    const resolvedPoolId = resolvePoolId(req.userId!, poolIdStr)
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
    const storage = poolIdStr ? getStorageByPoolId(req.userId!, parseInt(poolIdStr)) : getStorageForRequest(req)
    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
    const contentLengthHeader = req.headers['content-length']
    const contentLength = typeof contentLengthHeader === 'string' ? parseInt(contentLengthHeader, 10) : NaN

    if (pool?.storage_type === 'local' && Number.isFinite(contentLength)) {
      const { checkQuota } = await import('../services/quota')
      const quotaCheck = checkQuota(req.userId!, contentLength)
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message })
      }
    }

    const uploadPath = shouldUseAtomicTempUpload(pool?.storage_type) ? buildTemporaryUploadPath(filePath) : filePath

    if (storage.uploadStream) {
      let requestAborted = false
      const uploadStream = new PassThrough()

      req.on('aborted', () => {
        requestAborted = true
        uploadStream.destroy(new Error('上传已取消'))
      })
      req.on('error', (err) => {
        uploadStream.destroy(err)
      })
      req.pipe(uploadStream)

      try {
        await storage.uploadStream(uploadPath, uploadStream, Number.isFinite(contentLength) ? contentLength : undefined)
        if (uploadPath !== filePath) {
          await finalizeAtomicUpload(storage, uploadPath, filePath)
        }
      } catch (err) {
        if (uploadPath !== filePath) {
          await storage.remove(uploadPath).catch(() => {})
        }
        throw err
      }

      if (requestAborted) {
        if (uploadPath !== filePath) {
          await storage.remove(uploadPath).catch(() => {})
        }
        throw new Error('上传已取消')
      }

      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
      return res.json({ message: '流式上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
    }

    // 写入临时文件
    const tempId = crypto.randomBytes(16).toString('hex')
    tempPath = path.join(UPLOAD_TEMP_DIR, tempId)
    await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })

    fileHandle = await fs.open(tempPath, 'w')
    let totalBytes = 0
    let requestAborted = false

    await new Promise<void>((resolve, reject) => {
      req.on('data', async (chunk: Buffer) => {
        totalBytes += chunk.length
        try {
          await fileHandle!.write(chunk)
        } catch (err) {
          reject(err)
        }
      })
      req.on('end', () => resolve())
      req.on('aborted', () => {
        requestAborted = true
        reject(new Error('上传已取消'))
      })
      req.on('error', (err) => reject(err))
    })

    await fileHandle.close()
    fileHandle = null

    if (requestAborted) {
      throw new Error('上传已取消')
    }

    // 读取临时文件并上传到存储池
    const buffer = await fs.readFile(tempPath)

    // 配额检查（仅本地存储）
    if (pool?.storage_type === 'local') {
      const { checkQuota } = await import('../services/quota')
      const quotaCheck = checkQuota(req.userId!, buffer.length)
      if (!quotaCheck.allowed) {
        await fs.unlink(tempPath).catch(() => {})
        return res.status(400).json({ error: quotaCheck.message })
      }
    }

    try {
      await storage.upload(uploadPath, buffer)
      if (uploadPath !== filePath) {
        await finalizeAtomicUpload(storage, uploadPath, filePath)
      }
    } catch (err) {
      if (uploadPath !== filePath) {
        await storage.remove(uploadPath).catch(() => {})
      }
      throw err
    }

    // 清理临时文件
    await fs.unlink(tempPath).catch(() => {})

    const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
    res.json({ message: '流式上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
  } catch (err: any) {
    if (err.message === '上传已取消') {
      return res.status(499).json({ error: err.message })
    }
    res.status(500).json({ error: err.message })
  } finally {
    // 确保临时文件被清理
    if (fileHandle) await fileHandle.close().catch(() => {})
    if (tempPath) await fs.unlink(tempPath).catch(() => {})
  }
})

// 断点续传：初始化分片上传
router.post('/upload/init', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const { fileName: rawFileName, fileSize, dirPath, poolId } = req.body
    const fileName = rawFileName ? rawFileName.normalize('NFC') : rawFileName
    if (!fileName || !fileSize) {
      return res.status(400).json({ error: '缺少文件名或文件大小' })
    }
    if (isJunkFile(fileName)) {
      return res.status(400).json({ error: `已拦截系统文件: ${fileName}` })
    }

    const uploadId = crypto.randomBytes(16).toString('hex')
    const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
    await fs.mkdir(uploadDir, { recursive: true })

    // 保存上传元数据
    const meta: UploadMeta = {
      fileName,
      fileSize,
      dirPath: dirPath || '',
      poolId: poolId || null,
      userId: req.userId!,
      uploadedParts: [] as number[],
      nextPartIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await fs.writeFile(path.join(uploadDir, 'meta.json'), JSON.stringify(meta))

    res.json({ uploadId, message: '分片上传已初始化' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：上传分片
router.patch('/upload/:uploadId/chunk', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const uploadId = req.params.uploadId as string
    const contentRange = req.headers['content-range'] as string
    if (!contentRange) {
      return res.status(400).json({ error: '缺少 Content-Range 头' })
    }

    // 解析 Content-Range: bytes start-end/total
    const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/)
    if (!match) {
      return res.status(400).json({ error: 'Content-Range 格式错误' })
    }

    const start = parseInt(match[1])
    const end = parseInt(match[2])

    let task
    try {
      task = await readUploadMeta(uploadId)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    // 读取元数据
    const { uploadDir, metaPath, meta } = task
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权操作此上传任务' })
    }
    if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
      await removeUploadTask(uploadId)
      return res.status(410).json({ error: '上传任务已过期' })
    }

    // 使用顺序分片索引（支持任意分片大小）
    const partIndex = meta.nextPartIndex ?? meta.uploadedParts.length

    // 写入分片
    const partPath = path.join(uploadDir, `part-${String(partIndex).padStart(6, '0')}`)
    const writeStream = await fs.open(partPath, 'w')

    await new Promise<void>((resolve, reject) => {
      req.on('data', async (chunk: Buffer) => {
        try {
          await writeStream.write(chunk)
        } catch (err) {
          reject(err)
        }
      })
      req.on('end', () => resolve())
      req.on('error', (err) => reject(err))
    })

    await writeStream.close()

    // 更新已上传分片列表和索引
    if (!meta.uploadedParts.includes(partIndex)) {
      meta.uploadedParts.push(partIndex)
    }
    meta.nextPartIndex = partIndex + 1
    await writeUploadMeta(metaPath, meta)

    res.json({ message: '分片上传成功', partIndex, uploadedParts: meta.uploadedParts })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：查询上传状态
router.get('/upload/:uploadId/status', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const uploadId = req.params.uploadId as string
    let task
    try {
      task = await readUploadMeta(uploadId)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    const { meta } = task
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权查看此上传任务' })
    }
    if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
      await removeUploadTask(uploadId)
      return res.status(410).json({ error: '上传任务已过期' })
    }

    res.json({
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      uploadedParts: meta.uploadedParts,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      expiresAt: (meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：合并分片完成上传
router.post('/upload/:uploadId/complete', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const uploadId = req.params.uploadId as string
    let task
    try {
      task = await readUploadMeta(uploadId)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    const { uploadDir, meta } = task
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权操作此上传任务' })
    }
    if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
      await removeUploadTask(uploadId)
      return res.status(410).json({ error: '上传任务已过期' })
    }

    // 读取所有分片并合并
    const parts = (await fs.readdir(uploadDir))
      .filter(f => f.startsWith('part-'))
      .sort()

    const buffers: Buffer[] = []
    for (const part of parts) {
      buffers.push(await fs.readFile(path.join(uploadDir, part)))
    }
    const finalBuffer = Buffer.concat(buffers)

    // 配额检查（仅本地存储）
    const resolvedPoolId = resolvePoolId(req.userId!, meta.poolId)
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
    if (pool?.storage_type === 'local') {
      const { checkQuota } = await import('../services/quota')
      const quotaCheck = checkQuota(req.userId!, finalBuffer.length)
      if (!quotaCheck.allowed) {
        await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
        return res.status(400).json({ error: quotaCheck.message })
      }
    }

    // 上传到存储池
    const storage = meta.poolId ? getStorageByPoolId(req.userId!, meta.poolId) : getStorage(req.userId!)
    const filePath = meta.dirPath ? `${meta.dirPath}/${meta.fileName}` : meta.fileName
    await storage.upload(filePath, finalBuffer)

    // 清理临时文件
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})

    const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
    res.json({ message: '分片上传完成', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：取消并清理缓存
router.delete('/upload/:uploadId', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const uploadId = req.params.uploadId as string
    let task
    try {
      task = await readUploadMeta(uploadId)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    if (task.meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权操作此上传任务' })
    }

    await removeUploadTask(uploadId)
    res.json({ message: '上传缓存已清理' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 下载文件
router.get('/download', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    const data = await storage.download(filePath)
    const fileName = filePath.split('/').pop() || 'download'
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除文件/文件夹（移到回收站）
// POST body（unicode 文件名推荐）或 DELETE query param
const handleDelete = async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    // Support both query param (legacy) and body (unicode-safe)
    const filePath = (req.body?.path as string) || (req.query.path as string)
    const permanent = req.query.permanent === 'true' || req.body?.permanent === true
    if (!filePath) {
      return res.status(400).json({ error: '缺少路径' })
    }

    if (permanent) {
      await storage.remove(filePath)
    } else {
      // 移到回收站：用唯一 ID 避免同名文件覆盖
      const fileName = filePath.split('/').pop() || ''

      // 获取当前存储池ID（支持 body 和 query）
      const poolId = (req.body?.poolId as string) || (req.query.poolId as string)
      let storagePoolId: number
      if (poolId) {
        storagePoolId = parseInt(poolId)
      } else {
        const defaultPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any
        storagePoolId = defaultPool?.id || 1
      }

      const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
      const result = db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.userId!, filePath, fileName, stat.type, storagePoolId)

      // 用行 ID 作为回收站文件名，避免同名冲突
      const trashPath = `/.trash/${result.lastInsertRowid}_${fileName}`
      try {
        const data = await storage.download(filePath)
        await storage.upload(trashPath, data)
      } catch {
        // 如果是文件夹，直接记录
      }

      await storage.remove(filePath)
    }
    res.json({ message: '删除成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}
router.delete('/delete', flexibleAuth, requirePermission('delete'), handleDelete)
router.post('/delete', flexibleAuth, requirePermission('delete'), handleDelete)

// 批量删除
router.post('/batch-delete', flexibleAuth, requirePermission('delete'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths, permanent } = req.body
    if (!paths || !Array.isArray(paths)) {
      return res.status(400).json({ error: '缺少路径列表' })
    }
    const storage = getStorageForRequest(req)
    const poolId = req.body.poolId as number
    let storagePoolId = poolId
    if (!storagePoolId) {
      const defaultPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any
      storagePoolId = defaultPool?.id || 1
    }

    const errors: string[] = []
    for (const filePath of paths) {
      try {
        if (permanent) {
          await storage.remove(filePath)
        } else {
          const fileName = filePath.split('/').pop() || ''
          const trashPath = `/.trash/${fileName}`
          try {
            const data = await storage.download(filePath)
            await storage.upload(trashPath, data)
          } catch {}
          const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
          db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
            .run(req.userId!, filePath, fileName, stat.type, storagePoolId)
          await storage.remove(filePath)
        }
      } catch (err: any) {
        errors.push(`${filePath}: ${err.message}`)
      }
    }

    res.json({ message: `批量删除完成`, errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 批量移动
router.post('/batch-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths, dest } = req.body
    if (!paths || !Array.isArray(paths) || !dest) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const storage = getStorageForRequest(req)
    const errors: string[] = []

    for (const srcPath of paths) {
      try {
        const fileName = srcPath.split('/').pop() || ''
        const destPath = dest ? `${dest}/${fileName}` : fileName
        await storage.move(srcPath, destPath)
      } catch (err: any) {
        errors.push(`${srcPath}: ${err.message}`)
      }
    }

    res.json({ message: '批量移动完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 创建文件夹
router.post('/mkdir', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const dirPath = req.body.path as string
    if (!dirPath) {
      return res.status(400).json({ error: '缺少文件夹路径' })
    }
    await storage.mkdir(dirPath)
    res.json({ message: '文件夹创建成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 重命名
router.post('/rename', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { path: filePath, newName: rawNewName } = req.body
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const newName = rawNewName.normalize('NFC')
    await storage.rename(filePath, newName)
    res.json({ message: '重命名成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 移动
router.post('/move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { src, dest } = req.body
    if (!src || !dest) {
      return res.status(400).json({ error: '缺少参数' })
    }
    await storage.move(src, dest)
    res.json({ message: '移动成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 复制
router.post('/copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { src, dest } = req.body
    if (!src || !dest) {
      return res.status(400).json({ error: '缺少参数' })
    }
    await storage.copy(src, dest)
    res.json({ message: '复制成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 并发控制辅助函数
async function processConcurrently<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency = 3
): Promise<string[]> {
  const errors: string[] = []
  let i = 0
  async function next() {
    while (i < items.length) {
      const idx = i++
      try { await fn(items[idx], idx) }
      catch (err: any) { errors.push(err.message) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
  return errors
}

// 跨存储池复制（并发 3）
router.post('/cross-copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)

    const errors = await processConcurrently(srcPaths, async (srcPath, i) => {
      const fileName = (names && names[i]) || srcPath.split('/').filter(Boolean).pop() || ''
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName
      const data = await srcStorage.download(srcPath)
      await destStorage.upload(targetPath, data)
    })

    res.json({ message: '跨池复制完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 跨存储池移动（并发 3）
router.post('/cross-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)

    const errors = await processConcurrently(srcPaths, async (srcPath, i) => {
      const fileName = (names && names[i]) || srcPath.split('/').filter(Boolean).pop() || ''
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName
      const data = await srcStorage.download(srcPath)
      await destStorage.upload(targetPath, data)
      await srcStorage.remove(srcPath)
    })

    res.json({ message: '跨池移动完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 搜索
router.get('/search', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const keyword = req.query.q as string
    const prefix = (req.query.path as string) || ''
    if (!keyword) {
      return res.status(400).json({ error: '缺少搜索关键词' })
    }
    const files = await storage.search(prefix, keyword)
    const resolvedPoolId = resolvePoolId(req.userId!, req.query.poolId as string)
    res.json({ files: files.filter(f => !isJunkFile(f.name) && !isTemporaryUploadFile(f.name)).map(f => withDirectUrl(req, { ...f, poolId: resolvedPoolId }, resolvedPoolId)) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 文件预览（返回文件流，不需要下载头）
router.get('/preview', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
      'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
      'aac': 'audio/aac', 'm4a': 'audio/mp4',
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
      'pdf': 'application/pdf',
      'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
      'js': 'text/javascript', 'ts': 'text/typescript', 'html': 'text/html',
      'css': 'text/css', 'xml': 'text/xml', 'yaml': 'text/yaml', 'yml': 'text/yml',
      'py': 'text/x-python', 'java': 'text/x-java', 'go': 'text/x-go',
      'rs': 'text/x-rust', 'vue': 'text/x-vue', 'sh': 'text/x-shellscript',
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    // 音频/视频文件支持 Range 请求（移动端播放必须）
    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/')
    const innerStorage = storage instanceof PrefixStorage ? (storage as any).inner : storage
    if (isMedia && innerStorage instanceof LocalStorage) {
      const fullPath = await (innerStorage as any).resolvePath(filePath)
      const stat = await fs.stat(fullPath)
      const fileSize = stat.size
      const etag = `"${fileSize}-${stat.mtimeMs}"`
      const range = req.headers.range

      // 非 Range 请求的 ETag 缓存验证（Range 请求不能返回 304，否则浏览器拿不到数据）
      if (!range && req.headers['if-none-match'] === etag) {
        res.status(304).end()
        return
      }

      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Type', contentType)
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', 'public, max-age=3600')

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunkSize = end - start + 1

        res.status(206)
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        res.setHeader('Content-Length', chunkSize)

        const stream = fsSync.createReadStream(fullPath, { start, end })
        stream.pipe(res)
      } else {
        res.setHeader('Content-Length', fileSize)
        const stream = fsSync.createReadStream(fullPath)
        stream.pipe(res)
      }
      return
    }

    // 非本地存储或非媒体文件：读取整个文件
    const data = await storage.download(filePath)
    const etag = `"${data.length}"`

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end()
      return
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', data.length)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ZIP打包下载
router.post('/download-zip', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths } = req.body
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const storage = getStorageForRequest(req)

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (const filePath of paths) {
      try {
        const data = await storage.download(filePath)
        const fileName = filePath.split('/').pop() || 'file'
        zip.file(fileName, data)
      } catch {
        // 跳过无法下载的文件
      }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="download.zip"')
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 远程URL上传
router.post('/remote-upload', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { url, dirPath, poolId } = req.body
    if (!url) {
      return res.status(400).json({ error: '缺少URL' })
    }

    const storage = poolId ? getStorageByPoolId(req.userId!, poolId) : getStorageForRequest(req)

    // 下载远程文件
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(400).json({ error: `下载失败: ${response.statusText}` })
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 配额检查（仅本地存储）
    const resolvedPoolId = resolvePoolId(req.userId!, poolId)
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
    if (pool?.storage_type === 'local') {
      const { checkQuota } = await import('../services/quota')
      const quotaCheck = checkQuota(req.userId!, buffer.length)
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message })
      }
    }

    // 从URL提取文件名
    const urlObj = new URL(url)
    let fileName = urlObj.pathname.split('/').pop() || 'remote-file'
    // 解码URL编码的文件名
    try { fileName = decodeURIComponent(fileName) } catch {}

    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
    await storage.upload(filePath, buffer)

    const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
    res.json({ message: '远程上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取存储空间统计
router.get('/storage-stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const poolId = req.query.poolId as string
    const storage = poolId ? getStorageByPoolId(req.userId!, parseInt(poolId)) : getStorage(req.userId!)

    // 递归计算文件大小
    async function calculateSize(prefix: string): Promise<number> {
      let total = 0
      try {
        const files = await storage.list(prefix)
        for (const file of files) {
          if (file.type === 'file') {
            total += file.size
          } else {
            total += await calculateSize(file.path)
          }
        }
      } catch {}
      return total
    }

    const totalSize = await calculateSize('')
    const files = await storage.list('')
    const fileCount = files.filter(f => f.type === 'file').length
    const folderCount = files.filter(f => f.type === 'folder').length

    res.json({ totalSize, fileCount, folderCount })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
