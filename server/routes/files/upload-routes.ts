import type { Router, Response } from 'express'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { flexibleAuth, type ApiKeyRequest, requirePermission } from '../../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../../services/factory'
import { Logger } from '../../services/logger'
import {
  UPLOAD_TEMP_DIR,
  RESUMABLE_UPLOAD_TTL_MS,
  buildDirectUrl,
  buildTemporaryUploadPath,
  cleanupExpiredUploads,
  createUploadPassThrough,
  finalizeAtomicUpload,
  getStorageForRequest,
  isJunkFile,
  readUploadMeta,
  removeUploadTask,
  resolvePoolId,
  shouldUseAtomicTempUpload,
  uploadSingle,
  writeUploadMeta,
} from './shared'
import db from '../../db'
import { sendServerError } from '../admin/shared'

async function checkLocalQuota(userId: number, resolvedPoolId: number | undefined, size: number) {
  const pool = await db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
  if (pool?.storage_type !== 'local') {
    return { allowed: true, pool }
  }

  const { checkQuota } = await import('../../services/quota')
  const quotaCheck = await checkQuota(userId, size)
  return { ...quotaCheck, pool }
}

async function getUsername(userId: number) {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return user?.username || `#${userId}`
}

export function registerUploadRoutes(router: Router) {
  router.post('/upload', flexibleAuth, requirePermission('write'), uploadSingle('file'), async (req: ApiKeyRequest, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: '没有文件' })

      const poolId = req.query.poolId as string || req.body.poolId as string
      const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
      const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, req.file.size)
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message })
      }

      const storage = getStorageForRequest(req)
      const dirPath = (req.query.path as string) || ''
      let normalizedName = req.file.originalname
      try { normalizedName = decodeURIComponent(normalizedName) } catch {}
      normalizedName = normalizedName.normalize('NFC')
      const filePath = dirPath ? `${dirPath}/${normalizedName}` : normalizedName
      await storage.upload(filePath, req.file.buffer)

      const username = await getUsername(req.userId!)
      await Logger.info('web', 'upload-routes.ts', `User ${username} uploaded a file in poolID:#${resolvedPoolId || 'default'} ${filePath}`)

      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
      res.json({ message: '上传成功', path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to upload file',
        context: { userId: req.userId, poolId: req.query.poolId || req.body?.poolId, path: req.query.path, fileName: req.file?.originalname }
      })
    }
  })

  router.post('/write', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      const { path: filePath, content } = req.body
      if (!filePath || content === undefined) {
        return res.status(400).json({ error: '缺少 filePath 或 content' })
      }
      if (typeof content !== 'string') {
        return res.status(400).json({ error: 'content 必须是字符串' })
      }
      if (content.length > 10 * 1024 * 1024) {
        return res.status(413).json({ error: '文件过大，请使用上传功能' })
      }

      const storage = getStorageForRequest(req)
      const buffer = Buffer.from(content, 'utf-8')
      await Promise.race([
        storage.upload(filePath, buffer),
        new Promise((_, reject) => setTimeout(() => reject(new Error('保存超时')), 30000)),
      ])

      const username = await getUsername(req.userId!)
      const poolId = await resolvePoolId(req.userId!, req.body?.poolId || req.query.poolId)
      await Logger.info('api', 'upload-routes.ts', `User ${username} updated file content in poolID:#${poolId || 'default'} ${filePath}`)

      res.json({ success: true, path: filePath })
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'api',
        fileName: 'upload-routes.ts',
        message: 'Failed to write file content',
        context: { userId: req.userId, path: req.body?.path, poolId: req.body?.poolId || req.query.poolId }
      })
    }
  })

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
      if (!fileName) {
        return res.status(400).json({ error: '缺少 X-File-Name 头' })
      }
      if (isJunkFile(fileName)) {
        return res.status(400).json({ error: `已拦截系统文件: ${fileName}` })
      }

      const resolvedPoolId = await resolvePoolId(req.userId!, poolIdStr)
      const pool = await db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
      const storage = poolIdStr ? getStorageByPoolId(req.userId!, parseInt(poolIdStr)) : getStorageForRequest(req)
      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
      const contentLengthHeader = req.headers['content-length']
      const contentLength = typeof contentLengthHeader === 'string' ? parseInt(contentLengthHeader, 10) : NaN

      if (Number.isFinite(contentLength)) {
        const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, contentLength)
        if (!quotaCheck.allowed) {
          return res.status(400).json({ error: quotaCheck.message })
        }
      }

      const uploadPath = shouldUseAtomicTempUpload(pool?.storage_type) ? buildTemporaryUploadPath(filePath) : filePath

      if (storage.uploadStream) {
        let requestAborted = false
        const uploadStream = createUploadPassThrough()

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

        const username = await getUsername(req.userId!)
        await Logger.info('web', 'upload-routes.ts', `User ${username} uploaded a file in poolID:#${resolvedPoolId || 'default'} ${filePath}`)

        const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
        return res.json({ message: '流式上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
      }

      const tempId = crypto.randomBytes(16).toString('hex')
      tempPath = path.join(UPLOAD_TEMP_DIR, tempId)
      await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })

      fileHandle = await fs.open(tempPath, 'w')
      let requestAborted = false

      await new Promise<void>((resolve, reject) => {
        req.on('data', async (chunk: Buffer) => {
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

      const buffer = await fs.readFile(tempPath)
      const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, buffer.length)
      if (!quotaCheck.allowed) {
        await fs.unlink(tempPath).catch(() => {})
        return res.status(400).json({ error: quotaCheck.message })
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

      await fs.unlink(tempPath).catch(() => {})

      const username = await getUsername(req.userId!)
      await Logger.info('web', 'upload-routes.ts', `User ${username} uploaded a file in poolID:#${resolvedPoolId || 'default'} ${filePath}`)

      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
      res.json({ message: '流式上传成功', path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
    } catch (err: any) {
      if (err.message === '上传已取消') {
        return res.status(499).json({ error: err.message })
      }
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to stream upload file',
        context: { userId: req.userId, fileName: req.headers['x-file-name'], poolId: req.headers['x-pool-id'], dirPath: req.headers['x-dir-path'] }
      })
    } finally {
      if (fileHandle) await fileHandle.close().catch(() => {})
      if (tempPath) await fs.unlink(tempPath).catch(() => {})
    }
  })

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

      await fs.writeFile(path.join(uploadDir, 'meta.json'), JSON.stringify({
        fileName,
        fileSize,
        dirPath: dirPath || '',
        poolId: poolId || null,
        userId: req.userId!,
        uploadedParts: [],
        nextPartIndex: 0,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }))

      res.json({ uploadId, message: '分片上传已初始化' })
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to initialize chunk upload',
        context: { userId: req.userId, fileName: req.body?.fileName, poolId: req.body?.poolId }
      })
    }
  })

  router.patch('/upload/:uploadId/chunk', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await cleanupExpiredUploads()
      const uploadId = req.params.uploadId as string
      const contentRange = req.headers['content-range'] as string
      if (!contentRange) {
        return res.status(400).json({ error: '缺少 Content-Range 头' })
      }

      const match = contentRange.match(/bytes (\d+)-(\d+)\/(\d+)/)
      if (!match) {
        return res.status(400).json({ error: 'Content-Range 格式错误' })
      }

      let task
      try {
        task = await readUploadMeta(uploadId)
      } catch {
        return res.status(404).json({ error: '上传任务不存在' })
      }

      const { uploadDir, metaPath, meta } = task
      if (meta.userId !== req.userId) {
        return res.status(403).json({ error: '无权操作此上传任务' })
      }
      if ((meta.updatedAt || meta.createdAt) + RESUMABLE_UPLOAD_TTL_MS < Date.now()) {
        await removeUploadTask(uploadId)
        return res.status(410).json({ error: '上传任务已过期' })
      }

      const partIndex = meta.nextPartIndex ?? meta.uploadedParts.length
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

      if (!meta.uploadedParts.includes(partIndex)) {
        meta.uploadedParts.push(partIndex)
      }
      meta.nextPartIndex = partIndex + 1
      await writeUploadMeta(metaPath, meta)

      res.json({ message: '分片上传成功', partIndex, uploadedParts: meta.uploadedParts })
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to upload chunk',
        context: { userId: req.userId, uploadId: req.params.uploadId }
      })
    }
  })

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
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to load upload status',
        context: { userId: req.userId, uploadId: req.params.uploadId }
      })
    }
  })

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

      const parts = (await fs.readdir(uploadDir)).filter((file) => file.startsWith('part-')).sort()
      const buffers: Buffer[] = []
      for (const part of parts) {
        buffers.push(await fs.readFile(path.join(uploadDir, part)))
      }
      const finalBuffer = Buffer.concat(buffers)

      const resolvedPoolId = await resolvePoolId(req.userId!, meta.poolId)
      const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, finalBuffer.length)
      if (!quotaCheck.allowed) {
        await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})
        return res.status(400).json({ error: quotaCheck.message })
      }

      const storage = meta.poolId ? getStorageByPoolId(req.userId!, meta.poolId) : getStorage(req.userId!)
      const filePath = meta.dirPath ? `${meta.dirPath}/${meta.fileName}` : meta.fileName
      await storage.upload(filePath, finalBuffer)

      await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})

      const username = await getUsername(req.userId!)
      await Logger.info('web', 'upload-routes.ts', `User ${username} uploaded a file in poolID:#${resolvedPoolId || 'default'} ${filePath}`)

      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
      res.json({ message: '分片上传完成', path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to complete chunk upload',
        context: { userId: req.userId, uploadId: req.params.uploadId }
      })
    }
  })

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
    } catch (err) {
      await sendServerError(req, res, err, {
        source: 'web',
        fileName: 'upload-routes.ts',
        message: 'Failed to clear upload cache',
        context: { userId: req.userId, uploadId: req.params.uploadId }
      })
    }
  })
}
