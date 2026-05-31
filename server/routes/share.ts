import { Router, Response, Request } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getStorage } from '../services/factory.js'

const router = Router()

// 生成分享链接
router.post('/create', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { filePath, fileType, password, expiresIn, maxDownloads } = req.body
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const shareCode = crypto.randomBytes(8).toString('hex')
    let expiresAt = null
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000).toISOString()
    }

    db.prepare(`
      INSERT INTO shares (user_id, file_path, file_type, share_code, password, expires_at, max_downloads)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId!, filePath, fileType || 'file', shareCode, password || null, expiresAt, maxDownloads || null)

    res.json({
      message: '分享链接创建成功',
      shareCode,
      url: `/s/${shareCode}`
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取用户的分享列表
router.get('/list', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const shares = db.prepare(`
      SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.userId!)
    res.json({ shares })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除分享
router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: '分享不存在' })
    }
    res.json({ message: '分享已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访问分享链接（公开）
router.get('/s/:code', (req: Request, res: Response) => {
  try {
    const share = db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: '分享链接不存在' })
    }

    // 检查是否过期
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: '分享链接已过期' })
    }

    // 检查下载次数
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: '下载次数已达上限' })
    }

    // 如果有密码，返回需要密码的提示
    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || providedPassword !== share.password) {
        return res.json({
          needPassword: true,
          fileType: share.file_type,
          fileName: share.file_path.split('/').pop(),
          owner: share.username
        })
      }
    }

    // 返回文件信息
    res.json({
      needPassword: false,
      fileType: share.file_type,
      filePath: share.file_path,
      fileName: share.file_path.split('/').pop(),
      owner: share.username,
      shareCode: share.share_code
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 下载分享的文件
router.get('/download/:code', async (req: Request, res: Response) => {
  try {
    const share = db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: '分享链接不存在' })
    }

    // 检查是否过期
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: '分享链接已过期' })
    }

    // 检查下载次数
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: '下载次数已达上限' })
    }

    // 检查密码
    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || providedPassword !== share.password) {
        return res.status(403).json({ error: '密码错误' })
      }
    }

    // 下载文件
    const storage = getStorage(share.user_id)
    const data = await storage.download(share.file_path)
    const fileName = share.file_path.split('/').pop() || 'download'

    // 增加下载计数
    db.prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(share.id)

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 预览分享的文件
router.get('/preview/:code', async (req: Request, res: Response) => {
  try {
    const share = db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: '分享链接不存在' })
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: '分享链接已过期' })
    }

    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || providedPassword !== share.password) {
        return res.status(403).json({ error: '密码错误' })
      }
    }

    const storage = getStorage(share.user_id)
    const data = await storage.download(share.file_path)
    const ext = share.file_path.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
      'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
      'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'video/ogg',
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
      'pdf': 'application/pdf',
      'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
    }
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
