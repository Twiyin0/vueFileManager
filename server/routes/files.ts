import { Router, Response } from 'express'
import multer from 'multer'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { getStorage, getStorageByPoolId } from '../services/factory'

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
    const storage = getStorageForRequest(req)
    const prefix = (req.query.path as string) || ''
    const files = await storage.list(prefix)
    res.json({ files })
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
    res.json({ info })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 上传文件
router.post('/upload', flexibleAuth, requirePermission('write'), upload.single('file'), async (req: ApiKeyRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件' })
    }
    const storage = getStorageForRequest(req)
    const dirPath = (req.query.path as string) || ''
    const filePath = dirPath ? `${dirPath}/${req.file.originalname}` : req.file.originalname
    await storage.upload(filePath, req.file.buffer)
    res.json({ message: '上传成功', path: filePath })
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
    const { url, dirPath } = req.body
    if (!url) {
      return res.status(400).json({ error: '缺少URL' })
    }

    const storage = getStorageForRequest(req)

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

    res.json({ message: '远程上传成功', path: filePath })
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
