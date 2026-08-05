import { Router, type Response } from 'express'
import fsSync from 'fs'
import db from '../db'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { flexibleAuth, type ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../services/factory'
import { Logger } from '../services/logger'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import { copyStorageEntry, moveStorageEntry, renameStorageEntry } from '../services/storage-ops'
import { getThumbnail, streamThumbnail } from '../services/thumbnail'
import { buildTrashPath, moveToTrash } from '../services/trash'
import { sendServerError } from './admin/shared'
import {
  cleanupExpiredUploads,
  getStorageForRequest,
  isJunkFile,
  isTrashPath,
  isTemporaryUploadFile,
  normalizeStoragePath,
  processConcurrently,
  resolvePoolId,
  sanitizeUploadFileName,
  withDirectUrl,
} from './files/shared'
import { registerOfflineTaskRoutes } from './files/offline-routes'
import { registerUploadRoutes } from './files/upload-routes'
import type { FileInfo, StorageProvider } from '../services/storage'

const router = Router()
const SEARCH_RESULT_LIMIT = 100

registerUploadRoutes(router)
registerOfflineTaskRoutes(router)

async function getUsername(userId: number) {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return user?.username || `#${userId}`
}

function getPoolLabel(poolId: unknown) {
  if (poolId === undefined || poolId === null || poolId === '') {
    return 'default'
  }
  return String(poolId)
}

async function listFilesRecursively(storage: StorageProvider, prefix: string, limit = SEARCH_RESULT_LIMIT): Promise<FileInfo[]> {
  const results: FileInfo[] = []
  const visited = new Set<string>()

  const walk = async (currentPath: string) => {
    if (results.length >= limit) return

    let entries: FileInfo[] = []
    try {
      entries = await storage.list(currentPath)
    } catch {
      return
    }

    for (const entry of entries) {
      if (visited.has(entry.path)) continue
      visited.add(entry.path)
      if (isTrashPath(entry.path)) continue
      results.push(entry)

      if (results.length >= limit) return
      if (entry.type === 'folder') {
        await walk(entry.path)
        if (results.length >= limit) return
      }
    }
  }

  await walk(prefix)
  return results
}

router.get('/list', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const poolId = req.query.poolId as string
    const prefix = (req.query.path as string) || ''

    if (!poolId && !prefix) {
      const pools = await db.prepare(`
        SELECT id, name, storage_type, is_default, created_at
        FROM storage_pools WHERE user_id = ?
        ORDER BY is_default DESC, created_at ASC
      `).all(req.userId!) as any[]

      const virtualFiles = pools.map((pool) => ({
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
    const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
    const filesWithPool = files
      .filter((file: any) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
      .map((file: any) => withDirectUrl(req, { ...file, poolId: resolvedPoolId }, resolvedPoolId))

    let readme: { name: string; path: string; directUrl: string; fileUrl: string } | null = null
    if (resolvedPoolId && prefix) {
      const readmeFile = filesWithPool.find((file: any) =>
        file.type === 'file' && ['readme.md', 'readme.markdown'].includes(file.name.toLowerCase())
      ) as any
      if (readmeFile) {
        readme = {
          name: readmeFile.name,
          path: readmeFile.path,
          directUrl: readmeFile.directUrl,
          fileUrl: readmeFile.fileUrl
        }
      }
    }

    res.json({ files: filesWithPool, readme })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to list files',
      context: { userId: req.userId, poolId: req.query.poolId, path: req.query.path }
    })
  }
})

router.get('/info', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    const info = await storage.info(filePath)
    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    res.json({ info: withDirectUrl(req, { ...info, poolId: resolvedPoolId }, resolvedPoolId) })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to load file info',
      context: { userId: req.userId, path: req.query.path, poolId: req.query.poolId }
    })
  }
})

router.get('/download', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }
    const data = await storage.download(filePath)
    const fileName = filePath.split('/').pop() || 'download'
    const username = await getUsername(req.userId!)
    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    await Logger.info('api', 'files.ts', `User ${username} downloaded a file in poolID:#${resolvedPoolId || getPoolLabel(req.query.poolId)} ${filePath}`)
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to download file',
      context: { userId: req.userId, path: req.query.path, poolId: req.query.poolId }
    })
  }
})

const handleDelete = async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = (req.body?.path as string) || (req.query.path as string)
    const permanent = req.query.permanent === 'true' || req.body?.permanent === true
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingPath' })
    }

    const username = await getUsername(req.userId!)
    const poolId = (req.body?.poolId as string) || (req.query.poolId as string)
    const resolvedPoolId = await resolvePoolId(req.userId!, poolId)

    if (permanent) {
      await storage.remove(filePath)
      await Logger.info('api', 'files.ts', `User ${username} permanently deleted a file from poolID:#${resolvedPoolId || getPoolLabel(poolId)} ${filePath}`)
    } else {
      const fileName = filePath.split('/').pop() || ''
      const storagePoolId = resolvedPoolId || 1
      const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
      const result = await db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.userId!, filePath, fileName, stat.type, storagePoolId)

      const trashPath = buildTrashPath(result.lastInsertRowid, fileName)
      await moveToTrash(storage, filePath, trashPath, stat.type)
      await Logger.info('api', 'files.ts', `User ${username} delete a file from poolID:#${storagePoolId} ${filePath}`)
      return res.json({ message: 'file.deleted' })
    }

    res.json({ message: 'file.deleted' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to delete file',
      context: { userId: req.userId, path: req.body?.path || req.query.path, poolId: req.body?.poolId || req.query.poolId }
    })
  }
}

router.delete('/delete', flexibleAuth, requirePermission('delete'), handleDelete)
router.post('/delete', flexibleAuth, requirePermission('delete'), handleDelete)

router.post('/batch-delete', flexibleAuth, requirePermission('delete'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths, permanent } = req.body
    if (!paths || !Array.isArray(paths)) {
      return res.status(400).json({ error: 'common.missingPathList' })
    }

    const storage = getStorageForRequest(req)
    const poolId = req.body.poolId as number
    const storagePoolId = (await resolvePoolId(req.userId!, poolId)) || 1
    const username = await getUsername(req.userId!)
    const errors: string[] = []

    for (const filePath of paths) {
      try {
        if (permanent) {
          await storage.remove(filePath)
        } else {
          const fileName = filePath.split('/').pop() || ''
          const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
          const result = await db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
            .run(req.userId!, filePath, fileName, stat.type, storagePoolId)
          const trashPath = buildTrashPath(result.lastInsertRowid, fileName)
          await moveToTrash(storage, filePath, trashPath, stat.type)
        }
      } catch (err: any) {
        errors.push(`${filePath}: ${err.message}`)
      }
    }

    await Logger.info('api', 'files.ts', `User ${username} batch deleted ${paths.length} item(s) from poolID:#${storagePoolId}`)
    res.json({ message: 'file.batchDeleteCompleted', errors })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to batch delete files',
      context: { userId: req.userId, poolId: req.body?.poolId, count: Array.isArray(req.body?.paths) ? req.body.paths.length : 0 }
    })
  }
})

router.post('/batch-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths, dest } = req.body
    if (!paths || !Array.isArray(paths) || !dest) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }

    const storage = getStorageForRequest(req)
    const errors: string[] = []
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)

    for (const srcPath of paths) {
      try {
        const fileName = srcPath.split('/').pop() || ''
        const destPath = dest ? `${dest}/${fileName}` : fileName
        await moveStorageEntry(storage, srcPath, destPath)
      } catch (err: any) {
        errors.push(`${srcPath}: ${err.message}`)
      }
    }

    await Logger.info('api', 'files.ts', `User ${username} batch moved ${paths.length} item(s) in poolID:#${poolId || getPoolLabel(req.body?.poolId)} to ${dest}`)
    res.json({ message: 'file.batchMoveCompleted', errors })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to batch move files',
      context: { userId: req.userId, dest: req.body?.dest, count: Array.isArray(req.body?.paths) ? req.body.paths.length : 0 }
    })
  }
})

router.post('/mkdir', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const dirPath = req.body.path as string
    if (!dirPath) {
      return res.status(400).json({ error: 'common.missingFolderPath' })
    }
    await storage.mkdir(dirPath)
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)
    await Logger.info('api', 'files.ts', `User ${username} created a directory in poolID:#${poolId || getPoolLabel(req.body?.poolId)} ${dirPath}`)
    res.json({ message: 'file.folderCreated' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to create directory',
      context: { userId: req.userId, path: req.body?.path, poolId: req.body?.poolId }
    })
  }
})

router.post('/rename', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { path: filePath, newName: rawNewName } = req.body
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }

    const newName = sanitizeUploadFileName(rawNewName)
    if (!newName || newName === '.' || newName === '..') {
      return res.status(400).json({ error: 'file.invalidFileName' })
    }
    await renameStorageEntry(storage, filePath, newName)
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)
    await Logger.info('api', 'files.ts', `User ${username} renamed a file in poolID:#${poolId || getPoolLabel(req.body?.poolId)} ${filePath} -> ${newName}`)
    res.json({ message: 'file.renamed' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to rename file',
      context: { userId: req.userId, path: req.body?.path, newName: req.body?.newName, poolId: req.body?.poolId }
    })
  }
})

router.post('/move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { src, dest } = req.body
    if (!src || !dest) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }
    await moveStorageEntry(storage, src, dest)
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)
    await Logger.info('api', 'files.ts', `User ${username} moved a file in poolID:#${poolId || getPoolLabel(req.body?.poolId)} ${src} -> ${dest}`)
    res.json({ message: 'file.moved' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to move file',
      context: { userId: req.userId, src: req.body?.src, dest: req.body?.dest, poolId: req.body?.poolId }
    })
  }
})

router.post('/copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const { src, dest } = req.body
    if (!src || !dest) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }
    await copyStorageEntry(storage, src, dest)
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)
    await Logger.info('api', 'files.ts', `User ${username} copied a file in poolID:#${poolId || getPoolLabel(req.body?.poolId)} ${src} -> ${dest}`)
    res.json({ message: 'file.copied' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to copy file',
      context: { userId: req.userId, src: req.body?.src, dest: req.body?.dest, poolId: req.body?.poolId }
    })
  }
})

router.post('/cross-copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }

    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)

    const errors = await processConcurrently<string>(srcPaths, async (srcPath, index) => {
      const fileName = (names && names[index]) || srcPath.split('/').filter(Boolean).pop() || ''
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName
      const data = await srcStorage.download(srcPath)
      await destStorage.upload(targetPath, data)
    })

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'files.ts', `User ${username} cross-copied ${srcPaths.length} item(s) from poolID:#${srcPoolId} to poolID:#${destPoolId}`)
    res.json({ message: 'file.crossPoolCopyCompleted', errors })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to cross-copy files',
      context: { userId: req.userId, srcPoolId: req.body?.srcPoolId, destPoolId: req.body?.destPoolId, count: Array.isArray(req.body?.srcPaths) ? req.body.srcPaths.length : 0 }
    })
  }
})

router.post('/cross-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
    }

    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)

    const errors = await processConcurrently<string>(srcPaths, async (srcPath, index) => {
      const fileName = (names && names[index]) || srcPath.split('/').filter(Boolean).pop() || ''
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName
      const data = await srcStorage.download(srcPath)
      await destStorage.upload(targetPath, data)
      await srcStorage.remove(srcPath)
    })

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'files.ts', `User ${username} cross-moved ${srcPaths.length} item(s) from poolID:#${srcPoolId} to poolID:#${destPoolId}`)
    res.json({ message: 'file.crossPoolMoveCompleted', errors })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to cross-move files',
      context: { userId: req.userId, srcPoolId: req.body?.srcPoolId, destPoolId: req.body?.destPoolId, count: Array.isArray(req.body?.srcPaths) ? req.body.srcPaths.length : 0 }
    })
  }
})

router.get('/search', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const storage = getStorageForRequest(req)
    const keyword = (req.query.q as string) || ''
    const prefix = normalizeStoragePath((req.query.path as string) || '')
    if (!keyword) {
      return res.status(400).json({ error: 'common.missingSearchKeyword' })
    }

    const isRegexMode = keyword.startsWith('//')
    let files: FileInfo[]
    if (isRegexMode) {
      const source = keyword.slice(2).trim()
      if (!source) {
        return res.status(400).json({ error: 'common.invalidRegexPattern' })
      }
      let matcher: RegExp
      try {
        matcher = new RegExp(source, 'i')
      } catch {
        return res.status(400).json({ error: 'common.invalidRegexPattern' })
      }
      files = (await listFilesRecursively(storage, prefix)).filter((file) => matcher.test(file.name))
    } else {
      files = await storage.search(prefix, keyword)
    }
    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    const normalized = files
      .filter((file: any) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name) && !isTrashPath(file.path || file.name))
      .map((file: any) => withDirectUrl(req, { ...file, poolId: resolvedPoolId }, resolvedPoolId))
    res.json({ files: normalized })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to search files',
      context: { userId: req.userId, poolId: req.query.poolId, path: req.query.path, keyword: req.query.q }
    })
  }
})

router.get('/preview', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
      mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg',
      aac: 'audio/aac', m4a: 'audio/mp4',
      mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
      pdf: 'application/pdf',
      txt: 'text/plain', md: 'text/markdown', json: 'application/json',
      js: 'text/javascript', ts: 'text/typescript', html: 'text/html',
      css: 'text/css', xml: 'text/xml', yaml: 'text/yaml', yml: 'text/yml',
      py: 'text/x-python', java: 'text/x-java', go: 'text/x-go',
      rs: 'text/x-rust', vue: 'text/x-vue', sh: 'text/x-shellscript',
    }
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/')
    const cachedMedia = isMedia
      ? await resolvePreviewCacheFile(`user:${req.userId}:pool:${req.query.poolId || 'default'}`, storage, filePath)
      : null
    if (cachedMedia) {
      const fileOnDisk = cachedMedia.path
      const stat = cachedMedia.stat
      const fileSize = stat.size
      const etag = `"${fileSize}-${stat.mtimeMs}"`
      const range = req.headers.range

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

        const stream = fsSync.createReadStream(fileOnDisk, { start, end })
        stream.pipe(res)
      } else {
        res.setHeader('Content-Length', fileSize)
        const stream = fsSync.createReadStream(fileOnDisk)
        stream.pipe(res)
      }
      return
    }

    const data = await storage.download(filePath)

    if (contentType.startsWith('text/') || contentType === 'application/json') {
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Length', data.length)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.send(data)
      return
    }

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
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to preview file',
      context: { userId: req.userId, path: req.query.path, poolId: req.query.poolId }
    })
  }
})

router.get('/thumbnail', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    const result = await getThumbnail(
      `user:${req.userId}:pool:${resolvedPoolId || 'default'}`,
      req.userId!,
      resolvedPoolId,
      storage,
      filePath
    )

    if (result.status !== 'ready') {
      return res.status(result.status === 'unsupported' ? 415 : 202).json({
        status: result.status,
        duration: result.duration
      })
    }

    const stream = streamThumbnail(result)
    if (!stream || !result.path) {
      return res.status(202).json({ status: 'pending' })
    }

    const stat = fsSync.statSync(result.path)
    const etag = `"${stat.size}-${stat.mtimeMs}"`
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end()
      return
    }

    res.setHeader('Content-Type', result.mimeType || 'image/jpeg')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    if (result.duration != null) {
      res.setHeader('X-Video-Duration', String(result.duration))
    }
    stream.on('error', (streamError) => {
      void Logger.error('api', 'files.ts', 'Failed to stream thumbnail', streamError, {
        userId: req.userId,
        path: req.query.path,
        poolId: req.query.poolId
      })
      if (!res.headersSent) {
        res.status(500).json({ error: 'file.thumbnailLoadFailed' })
        return
      }
      res.destroy(streamError instanceof Error ? streamError : undefined)
    })
    stream.pipe(res)
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'file.thumbnailLoadFailed',
      context: { userId: req.userId, path: req.query.path, poolId: req.query.poolId }
    })
  }
})

router.post('/download-zip', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { paths } = req.body
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'common.missingFilePath' })
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
        // skip files that cannot be downloaded
      }
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
    const username = await getUsername(req.userId!)
    const poolId = await resolvePoolId(req.userId!, req.body?.poolId)
    await Logger.info('api', 'files.ts', `User ${username} downloaded ZIP archive with ${paths.length} item(s) from poolID:#${poolId || getPoolLabel(req.body?.poolId)}`)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="download.zip"')
    res.setHeader('Content-Length', buffer.length)
    res.send(buffer)
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to download ZIP archive',
      context: { userId: req.userId, count: Array.isArray(req.body?.paths) ? req.body.paths.length : 0, poolId: req.body?.poolId }
    })
  }
})

router.get('/storage-stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const poolId = req.query.poolId as string
    const storage = poolId ? getStorageByPoolId(req.userId!, parseInt(poolId)) : getStorage(req.userId!)

    async function calculateStats(prefix: string): Promise<{ totalSize: number; fileCount: number; folderCount: number }> {
      let totalSize = 0
      let fileCount = 0
      let folderCount = 0

      try {
        const files = await storage.list(prefix)
        for (const file of files) {
          if (file.type === 'file') {
            totalSize += file.size
            fileCount += 1
          } else {
            folderCount += 1
            const nested = await calculateStats(file.path)
            totalSize += nested.totalSize
            fileCount += nested.fileCount
            folderCount += nested.folderCount
          }
        }
      } catch {
        // ignore partial stats failures
      }

      return { totalSize, fileCount, folderCount }
    }

    const stats = await calculateStats('')
    res.json(stats)
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'files.ts',
      message: 'Failed to calculate storage stats',
      context: { userId: req.userId, poolId: req.query.poolId }
    })
  }
})

export default router
