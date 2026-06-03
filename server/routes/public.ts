import { Router, Response, Request } from 'express'
import path from 'path'
import db from '../db'
import { getGuestStorage, getStorageByPoolId } from '../services/factory'

const router = Router()

// 获取用户信息（根据用户名）
function getUserByUsername(username: string) {
  return db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as any
}

// MIME 类型映射
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

// 安全检查：防止路径越权（目录遍历攻击）
function isPathSafe(targetPath: string): boolean {
  // 规范化路径并检查是否包含 ..
  const normalized = targetPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '')
  const segments = normalized.split('/')
  let depth = 0
  for (const seg of segments) {
    if (seg === '..') {
      depth--
      if (depth < 0) return false
    } else if (seg !== '.' && seg !== '') {
      depth++
    }
  }
  return true
}

// 匿名公网访问文件
// 路径格式：/f/:username/*filePath
router.get('/:username/*', async (req: Request, res: Response) => {
  try {
    const { username } = req.params
    const filePath = (req.params as any)[0] // Express wildcard

    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    // 查找用户
    const user = getUserByUsername(username)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 获取访客存储配置
    const guestConfig = getGuestStorage(user.id)
    if (!guestConfig) {
      return res.status(403).json({ error: '该用户未开启访客模式' })
    }

    const { storage, basePath } = guestConfig

    // 构建完整路径
    const fullPath = basePath ? (filePath ? `${basePath}/${filePath}` : basePath) : filePath

    // 安全检查：防止目录遍历攻击
    if (!isPathSafe(filePath) || !isPathSafe(fullPath)) {
      return res.status(403).json({ error: '无权访问此路径' })
    }

    // 获取文件信息
    const fileInfo = await storage.info(fullPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: '不支持访问文件夹' })
    }

    // 下载文件
    const data = await storage.download(fullPath)
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const fileName = filePath.split('/').pop() || 'file'

    // 设置响应头（inline 显示而非下载）
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Cache-Control', 'public, max-age=86400') // 缓存 24 小时

    res.send(data)
  } catch (err: any) {
    if (err.message === '文件不存在' || err.code === 'ENOENT') {
      return res.status(404).json({ error: '文件不存在' })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
