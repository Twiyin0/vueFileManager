import { Router, Response, Request } from 'express'
import crypto from 'crypto'
import fs from 'fs/promises'
import fsSync from 'fs'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getStorage, getStorageByPoolId } from '../services/factory'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import {
  isJunkFile,
  isTemporaryUploadFile,
} from './files/shared'

const router = Router()

const previewMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  markdown: 'text/markdown; charset=utf-8',
  json: 'application/json; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  ts: 'text/typescript; charset=utf-8',
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  xml: 'text/xml; charset=utf-8',
  yaml: 'text/yaml; charset=utf-8',
  yml: 'text/yaml; charset=utf-8',
  py: 'text/x-python; charset=utf-8',
  java: 'text/x-java; charset=utf-8',
  go: 'text/x-go; charset=utf-8',
  rs: 'text/x-rust; charset=utf-8',
  vue: 'text/x-vue; charset=utf-8',
  sh: 'text/x-shellscript; charset=utf-8',
}

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
async function getShareUsername(shareId: number): Promise<string | null> {
  const row = await db.prepare(`
    SELECT u.username FROM shares s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(shareId) as any
  return row?.username || null
}

// 生成分享链接
router.post('/create', authMiddleware, async (req: AuthRequest, res: Response) => {
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

    await db.prepare(`
      INSERT INTO shares (user_id, file_path, file_type, share_code, password, expires_at, max_downloads, sign_key, storage_pool_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId!, filePath, fileType || 'file', shareCode, password || null, expiresAt, maxDownloads || null, signKey, storagePoolId || null)

    // 获取用户名用于生成签名
    const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
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
router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const shares = await db.prepare(`
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
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: '分享不存在' })
    }
    res.json({ message: '分享已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 访问分享链接（公开，仅查看信息）
router.get('/s/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
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
    const share = await db.prepare(`
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
    const filteredFiles = files.filter((file: any) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
    res.json({ files: filteredFiles, sharePath: share.file_path, subPath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 下载分享的文件（需要 signToken 验证）
router.get('/download/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
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
    await db.prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(share.id)

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
    const share = await db.prepare(`
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
    const subPath = req.query.path as string
    const previewPath = subPath ? `${share.file_path}/${subPath}` : share.file_path
    const fileInfo = await storage.info(previewPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: '不支持预览文件夹' })
    }

    const fileName = previewPath.split('/').pop() || share.file_path.split('/').pop() || 'file'
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    const contentType = previewMimeTypes[ext] || 'application/octet-stream'
    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/')
    const cachedMedia = isMedia
      ? await resolvePreviewCacheFile(`share:${share.share_code}`, storage, previewPath)
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
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
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

    const data = await storage.download(previewPath)
    const etag = `"${data.length}"`
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end()
      return
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
