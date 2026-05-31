import { Router, Response } from 'express'
import multer from 'multer'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../middleware/apikey.js'
import { getStorage } from '../services/factory.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// 文件列表
router.get('/list', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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

// 删除文件/文件夹
router.delete('/delete', flexibleAuth, requirePermission('delete'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorage(req.userId!)
    const filePath = req.query.path as string
    if (!filePath) {
      return res.status(400).json({ error: '缺少路径' })
    }
    await storage.remove(filePath)
    res.json({ message: '删除成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 创建文件夹
router.post('/mkdir', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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
    const storage = getStorage(req.userId!)
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

export default router
