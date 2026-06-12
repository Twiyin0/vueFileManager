import { Router, Response } from 'express'
import fs from 'fs/promises'
import fsSync from 'fs'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../services/factory'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import { buildTrashPath, moveToTrash } from '../services/trash'
import {
  buildDirectUrl,
  cleanupExpiredUploads,
  getStorageForRequest,
  isJunkFile,
  isTemporaryUploadFile,
  processConcurrently,
  resolvePoolId,
  withDirectUrl,
} from './files/shared'
import { registerOfflineTaskRoutes } from './files/offline-routes'
import { registerUploadRoutes } from './files/upload-routes'

const router = Router()

registerUploadRoutes(router)
registerOfflineTaskRoutes(router)

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
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/info', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const info = await storage.info(filePath)
    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    res.json({ info: withDirectUrl(req, { ...info, poolId: resolvedPoolId }, resolvedPoolId) })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

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

const handleDelete = async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = (req.body?.path as string) || (req.query.path as string)
    const permanent = req.query.permanent === 'true' || req.body?.permanent === true
    if (!filePath) {
      return res.status(400).json({ error: '缺少路径' })
    }

    if (permanent) {
      await storage.remove(filePath)
    } else {
      const fileName = filePath.split('/').pop() || ''
      const poolId = (req.body?.poolId as string) || (req.query.poolId as string)
      let storagePoolId: number
      if (poolId) {
        storagePoolId = parseInt(poolId)
      } else {
        const defaultPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any
        storagePoolId = defaultPool?.id || 1
      }

      const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
      const result = await db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.userId!, filePath, fileName, stat.type, storagePoolId)

      const trashPath = buildTrashPath(result.lastInsertRowid, fileName)
      await moveToTrash(storage, filePath, trashPath, stat.type)
      return res.json({ message: '删除成功' })
      try {
        const data = await storage.download(filePath)
        await storage.upload(trashPath, data)
      } catch {
        // 文件夹不做实体备份
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
      const defaultPool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any
      storagePoolId = defaultPool?.id || 1
    }

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
          continue

          try {
            const data = await storage.download(filePath)
            await storage.upload(trashPath, data)
          } catch {
            // 文件夹不做实体备份
          }

          await storage.remove(filePath)
        }
      } catch (err: any) {
        errors.push(`${filePath}: ${err.message}`)
      }
    }

    res.json({ message: '批量删除完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

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

router.post('/cross-copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
    }

    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)

    const errors = await processConcurrently<string>(srcPaths, async (srcPath, index) => {
      const fileName = (names && names[index]) || srcPath.split('/').filter(Boolean).pop() || ''
      const targetPath = destPath ? `${destPath}/${fileName}` : fileName
      const data = await srcStorage.download(srcPath)
      await destStorage.upload(targetPath, data)
    })

    res.json({ message: '跨池复制完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/cross-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
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

    res.json({ message: '跨池移动完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/search', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    await cleanupExpiredUploads()
    const storage = getStorageForRequest(req)
    const keyword = req.query.q as string
    const prefix = (req.query.path as string) || ''
    if (!keyword) {
      return res.status(400).json({ error: '缺少搜索关键词' })
    }

    const files = await storage.search(prefix, keyword)
    const resolvedPoolId = await resolvePoolId(req.userId!, req.query.poolId as string)
    const normalized = files
      .filter((file: any) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
      .map((file: any) => withDirectUrl(req, { ...file, poolId: resolvedPoolId }, resolvedPoolId))
    res.json({ files: normalized })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/preview', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
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
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
