import { Router, Response } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../services/factory'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'data', 'uploads')

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// 获取存储实例（支持指定存储池ID）
function getStorageForRequest(req: ApiKeyRequest) {
  const poolId = req.query.poolId as string || req.body.poolId as string
  if (poolId) {
    return getStorageByPoolId(req.userId!, parseInt(poolId))
  }
  return getStorage(req.userId!)
}

// 文件列表
router.get('/list', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
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
        isPool: true
      }))
      return res.json({ files: virtualFiles })
    }

    const storage = getStorageForRequest(req)
    const files = await storage.list(prefix)

    // 解析 poolId 并注入到每个文件
    const resolvedPoolId = poolId ? parseInt(poolId) : (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id
    const filesWithPool = files.map(f => ({ ...f, poolId: resolvedPoolId }))

    res.json({ files: filesWithPool })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 文件信息
router.get('/info', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }
    const info = await storage.info(filePath)

    // 解析 poolId
    const poolId = req.query.poolId as string
    const resolvedPoolId = poolId ? parseInt(poolId) : (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id

    res.json({ info: { ...info, poolId: resolvedPoolId } })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 上传文件（传统方式）
router.post('/upload', flexibleAuth, requirePermission('write'), upload.single('file'), async (req: ApiKeyRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件' })
    }
    const storage = getStorageForRequest(req)
    const dirPath = (req.query.path as string) || ''
    const filePath = dirPath ? `${dirPath}/${req.file.originalname}` : req.file.originalname
    await storage.upload(filePath, req.file.buffer)

    // 获取存储池信息
    const poolId = req.query.poolId as string || req.body.poolId as string
    const resolvedPoolId = poolId ? parseInt(poolId) : (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any

    res.json({ message: '上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 流式上传（支持 chunked transfer encoding）
router.post('/upload-stream', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const fileName = req.headers['x-file-name'] as string
    const dirPath = (req.headers['x-dir-path'] as string) || ''
    const poolIdStr = req.headers['x-pool-id'] as string

    if (!fileName) {
      return res.status(400).json({ error: '缺少 X-File-Name 头' })
    }

    // 写入临时文件
    const tempId = crypto.randomBytes(16).toString('hex')
    const tempPath = path.join(UPLOAD_TEMP_DIR, tempId)
    await fs.mkdir(UPLOAD_TEMP_DIR, { recursive: true })

    const writeStream = await fs.open(tempPath, 'w')
    let totalBytes = 0

    await new Promise<void>((resolve, reject) => {
      req.on('data', async (chunk: Buffer) => {
        totalBytes += chunk.length
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

    // 读取临时文件并上传到存储池
    const buffer = await fs.readFile(tempPath)
    const storage = poolIdStr ? getStorageByPoolId(req.userId!, parseInt(poolIdStr)) : getStorageForRequest(req)
    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
    await storage.upload(filePath, buffer)

    // 清理临时文件
    await fs.unlink(tempPath).catch(() => {})

    // 获取存储池信息
    const resolvedPoolId = poolIdStr ? parseInt(poolIdStr) : (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any

    res.json({ message: '流式上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：初始化分片上传
router.post('/upload/init', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { fileName, fileSize, dirPath, poolId } = req.body
    if (!fileName || !fileSize) {
      return res.status(400).json({ error: '缺少文件名或文件大小' })
    }

    const uploadId = crypto.randomBytes(16).toString('hex')
    const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
    await fs.mkdir(uploadDir, { recursive: true })

    // 保存上传元数据
    const meta = {
      fileName,
      fileSize,
      dirPath: dirPath || '',
      poolId: poolId || null,
      userId: req.userId,
      uploadedParts: [] as number[],
      nextPartIndex: 0,
      createdAt: Date.now()
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
    const { uploadId } = req.params
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

    const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
    const metaPath = path.join(uploadDir, 'meta.json')

    // 检查上传任务是否存在
    try {
      await fs.access(metaPath)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    // 读取元数据
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权操作此上传任务' })
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
    await fs.writeFile(metaPath, JSON.stringify(meta))

    res.json({ message: '分片上传成功', partIndex, uploadedParts: meta.uploadedParts })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：查询上传状态
router.get('/upload/:uploadId/status', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { uploadId } = req.params
    const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
    const metaPath = path.join(uploadDir, 'meta.json')

    try {
      await fs.access(metaPath)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权查看此上传任务' })
    }

    res.json({
      fileName: meta.fileName,
      fileSize: meta.fileSize,
      uploadedParts: meta.uploadedParts,
      createdAt: meta.createdAt
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 断点续传：合并分片完成上传
router.post('/upload/:uploadId/complete', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { uploadId } = req.params
    const uploadDir = path.join(UPLOAD_TEMP_DIR, uploadId)
    const metaPath = path.join(uploadDir, 'meta.json')

    try {
      await fs.access(metaPath)
    } catch {
      return res.status(404).json({ error: '上传任务不存在' })
    }

    const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
    if (meta.userId !== req.userId) {
      return res.status(403).json({ error: '无权操作此上传任务' })
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

    // 上传到存储池
    const storage = meta.poolId ? getStorageByPoolId(req.userId!, meta.poolId) : getStorage(req.userId!)
    const filePath = meta.dirPath ? `${meta.dirPath}/${meta.fileName}` : meta.fileName
    await storage.upload(filePath, finalBuffer)

    // 清理临时文件
    await fs.rm(uploadDir, { recursive: true, force: true }).catch(() => {})

    // 获取存储池信息
    const resolvedPoolId = meta.poolId || (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any

    res.json({ message: '分片上传完成', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local' })
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
router.delete('/delete', flexibleAuth, requirePermission('delete'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorageForRequest(req)
    const filePath = req.query.path as string
    const permanent = req.query.permanent === 'true'
    if (!filePath) {
      return res.status(400).json({ error: '缺少路径' })
    }

    if (permanent) {
      await storage.remove(filePath)
    } else {
      // 移到回收站：复制到 .trash 目录，然后删除原文件
      const fileName = filePath.split('/').pop() || ''
      const trashPath = `/.trash/${fileName}`
      try {
        const data = await storage.download(filePath)
        await storage.upload(trashPath, data)
      } catch {
        // 如果是文件夹，直接记录
      }

      // 获取当前存储池ID
      const poolId = req.query.poolId as string
      let storagePoolId: number
      if (poolId) {
        storagePoolId = parseInt(poolId)
      } else {
        const defaultPool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any
        storagePoolId = defaultPool?.id || 1
      }

      const stat = await storage.info(filePath).catch(() => ({ type: 'file' as const }))
      db.prepare('INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id) VALUES (?, ?, ?, ?, ?)')
        .run(req.userId!, filePath, fileName, stat.type, storagePoolId)

      await storage.remove(filePath)
    }
    res.json({ message: '删除成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

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
    const { path: filePath, newName } = req.body
    if (!filePath || !newName) {
      return res.status(400).json({ error: '缺少参数' })
    }
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

// 跨存储池复制
router.post('/cross-copy', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)
    const errors: string[] = []

    for (let i = 0; i < srcPaths.length; i++) {
      const srcPath = srcPaths[i]
      try {
        const fileName = (names && names[i]) || srcPath.split('/').filter(Boolean).pop() || ''
        const targetPath = destPath ? `${destPath}/${fileName}` : fileName
        const data = await srcStorage.download(srcPath)
        await destStorage.upload(targetPath, data)
      } catch (err: any) {
        errors.push(`${srcPath}: ${err.message}`)
      }
    }

    res.json({ message: '跨池复制完成', errors })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 跨存储池移动
router.post('/cross-move', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { srcPaths, names, srcPoolId, destPoolId, destPath } = req.body
    if (!srcPaths || !Array.isArray(srcPaths) || !srcPoolId || !destPoolId) {
      return res.status(400).json({ error: '缺少参数' })
    }
    const srcStorage = getStorageByPoolId(req.userId!, srcPoolId)
    const destStorage = getStorageByPoolId(req.userId!, destPoolId)
    const errors: string[] = []

    for (let i = 0; i < srcPaths.length; i++) {
      const srcPath = srcPaths[i]
      try {
        const fileName = (names && names[i]) || srcPath.split('/').filter(Boolean).pop() || ''
        const targetPath = destPath ? `${destPath}/${fileName}` : fileName
        const data = await srcStorage.download(srcPath)
        await destStorage.upload(targetPath, data)
        await srcStorage.remove(srcPath)
      } catch (err: any) {
        errors.push(`${srcPath}: ${err.message}`)
      }
    }

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
    res.json({ files })
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
    const data = await storage.download(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
      'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
      'pdf': 'application/pdf',
      'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
      'js': 'text/javascript', 'ts': 'text/typescript', 'html': 'text/html',
      'css': 'text/css', 'xml': 'text/xml', 'yaml': 'text/yaml', 'yml': 'text/yml',
      'py': 'text/x-python', 'java': 'text/x-java', 'go': 'text/x-go',
      'rs': 'text/x-rust', 'vue': 'text/x-vue', 'sh': 'text/x-shellscript',
    }
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
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

    // 动态导入archiver
    let archiver: any
    try {
      archiver = (await import('archiver')).default
    } catch {
      return res.status(500).json({ error: '服务器未安装archiver模块，请运行: npm install archiver' })
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', 'attachment; filename="download.zip"')

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.pipe(res)

    for (const filePath of paths) {
      try {
        const data = await storage.download(filePath)
        const fileName = filePath.split('/').pop() || 'file'
        archive.append(data, { name: fileName })
      } catch {
        // 跳过无法下载的文件
      }
    }

    await archive.finalize()
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

    // 从URL提取文件名
    const urlObj = new URL(url)
    let fileName = urlObj.pathname.split('/').pop() || 'remote-file'
    // 解码URL编码的文件名
    try { fileName = decodeURIComponent(fileName) } catch {}

    const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
    await storage.upload(filePath, buffer)

    // 获取存储池信息
    const resolvedPoolId = poolId || (db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(req.userId!) as any)?.id
    const pool = db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any

    res.json({ message: '远程上传成功', path: filePath, poolId: resolvedPoolId, storageType: pool?.storage_type || 'local' })
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
