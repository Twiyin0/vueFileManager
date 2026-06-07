import { Router, Response, Request } from 'express'
import crypto from 'crypto'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getStorage, getStorageByPoolId } from '../services/factory'

const router = Router()

// 生成 signToken
function generateSignToken(username: string, signKey: string): { sign: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000)
  const raw = username + signKey
  const hash = crypto.createHash('md5').update(raw).digest('hex')
  const sign = hash.slice(4, 12) + timestamp
  return { sign, timestamp }
}

// 验证 signToken
function verifySignToken(username: string, signKey: string, sign: string, timestamp: number): boolean {
  const expectedHash = crypto.createHash('md5').update(username + signKey).digest('hex')
  const expectedSign = expectedHash.slice(4, 12) + timestamp
  return sign === expectedSign
}

// 获取分享的用户名
function getShareUsername(shareId: number): string | null {
  const row = db.prepare(`
    SELECT u.username FROM shares s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(shareId) as any
  return row?.username || null
}

// 生成分享链接
router.post('/create', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { filePath, fileType, password, expiresIn, maxDownloads, storagePoolId } = req.body
    if (!filePath) {
      return res.status(400).json({ error: '缺少文件路径' })
    }

    const shareCode = crypto.randomBytes(8).toString('hex')
    const signKey = crypto.randomBytes(8).toString('hex')
    let expiresAt = null
    if (expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000).toISOString()
    }

    db.prepare(`
      INSERT INTO shares (user_id, file_path, file_type, share_code, password, expires_at, max_downloads, sign_key, storage_pool_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId!, filePath, fileType || 'file', shareCode, password || null, expiresAt, maxDownloads || null, signKey, storagePoolId || null)

    // 获取用户名用于生成签名
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
    const { sign } = generateSignToken(user.username, signKey)

    // 构建签名 URL
    const signUrl = `/s/${shareCode}?sign=${sign}&t=${Math.floor(Date.now() / 1000)}`

    res.json({
      message: '分享链接创建成功',
      shareCode,
      signKey, // 返回给前端，前端可以自行生成签名
      url: `/s/${shareCode}`,
      signUrl // 带签名的完整 URL
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 获取用户的分享列表
router.get('/list', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const shares = db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.userId!)

    // 为每个分享生成签名 URL
    const sharesWithSign = shares.map((share: any) => {
      const { sign } = generateSignToken(share.username, share.sign_key)
      return {
        ...share,
        signUrl: `/s/${share.share_code}?sign=${sign}&t=${Math.floor(Date.now() / 1000)}`
      }
    })

    res.json({ shares: sharesWithSign })
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

// 访问分享链接（公开，仅查看信息）
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

// 获取分享文件夹内容列表（公开，需签名验证）
router.get('/list/:code', async (req: Request, res: Response) => {
  try {
    const share = db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) return res.status(404).json({ error: '分享链接不存在' })
    if (share.file_type !== 'folder') return res.status(400).json({ error: '不是文件夹分享' })
    if (share.expires_at && new Date(share.expires_at) < new Date()) return res.status(410).json({ error: '分享链接已过期' })

    // 验证签名
    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)
    if (!sign || !timestamp) return res.status(403).json({ error: '缺少签名参数' })
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) return res.status(403).json({ error: '签名验证失败' })

    // 验证密码
    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || providedPassword !== share.password) return res.status(403).json({ error: '密码错误' })
    }

    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    const subPath = (req.query.path as string) || ''
    const fullPath = share.file_path ? (subPath ? `${share.file_path}/${subPath}` : share.file_path) : subPath

    const files = await storage.list(fullPath)
    res.json({ files, sharePath: share.file_path, subPath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 下载分享的文件（需要 signToken 验证）
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

    // 验证 signToken
    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)

    if (!sign || !timestamp) {
      return res.status(403).json({ error: '缺少签名参数' })
    }

    // 验证签名
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: '签名验证失败' })
    }

    // 下载文件（支持文件夹内文件：path 参数指定子路径）
    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    const subPath = req.query.path as string
    const downloadPath = subPath ? `${share.file_path}/${subPath}` : share.file_path
    const data = await storage.download(downloadPath)
    const fileName = downloadPath.split('/').pop() || 'download'

    // 增加下载计数
    db.prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(share.id)

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 预览分享的文件（需要 signToken 验证）
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

    // 验证 signToken
    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)

    if (!sign || !timestamp) {
      return res.status(403).json({ error: '缺少签名参数' })
    }

    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: '签名验证失败' })
    }

    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    // 支持文件夹内文件预览：path 参数指定子路径
    const subPath = req.query.path as string
    const previewPath = subPath ? `${share.file_path}/${subPath}` : share.file_path
    const data = await storage.download(previewPath)
    const ext = previewPath.split('.').pop()?.toLowerCase() || ''
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
