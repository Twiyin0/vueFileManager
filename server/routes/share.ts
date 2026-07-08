import { Router, type Response, type Request } from 'express'
import crypto from 'crypto'
import fsSync from 'fs'
import db from '../db'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { getStorage, getStorageByPoolId } from '../services/factory'
import { Logger } from '../services/logger'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import { safeEqual } from '../services/password'
import {
  isJunkFile,
  isTemporaryUploadFile,
  joinStoragePath,
  normalizeStoragePath,
} from './files/shared'
import { sendServerError } from './admin/shared'

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

// Signature binds the share to its secret sign_key via HMAC-SHA256. The timestamp is
// kept in the URL for display/compatibility only and is intentionally not part of the
// signature (the previous scheme let a client-supplied timestamp cancel itself out and
// left only a 32-bit secret).
function computeSign(username: string, signKey: string): string {
  return crypto.createHmac('sha256', signKey).update(username).digest('hex')
}

function generateSignToken(username: string, signKey: string): { sign: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000)
  return { sign: computeSign(username, signKey), timestamp }
}

function verifySignToken(username: string, signKey: string, sign: string, _timestamp: number): boolean {
  if (!signKey || !sign) return false
  return safeEqual(sign, computeSign(username, signKey))
}

async function getUsernameById(userId: number) {
  const row = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return row?.username || `#${userId}`
}

function getShareFileName(filePath: string): string {
  return filePath.split('/').filter(Boolean).pop() || ''
}

router.post('/create', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { filePath, fileType, password, expiresIn, maxDownloads, storagePoolId } = req.body
    const normalizedFileType = fileType === 'folder' ? 'folder' : 'file'
    if ((filePath === undefined || filePath === null || filePath === '') && normalizedFileType !== 'folder') {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    let normalizedFilePath = ''
    try {
      normalizedFilePath = normalizeStoragePath(String(filePath || ''))
    } catch {
      return res.status(400).json({ error: 'common.invalidPath' })
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
    `).run(req.userId!, normalizedFilePath, normalizedFileType, shareCode, password || null, expiresAt, maxDownloads || null, signKey, storagePoolId || null)

    const username = await getUsernameById(req.userId!)
    const { sign } = generateSignToken(username, signKey)
    const signUrl = `/s/${shareCode}?sign=${sign}&t=${Math.floor(Date.now() / 1000)}`

    await Logger.info('api', 'share.ts', `User ${username} shared a ${normalizedFileType} in poolID:#${storagePoolId || 'default'} ${normalizedFilePath || '/'}`)

    res.json({
      message: 'share.linkCreated',
      shareCode,
      signKey,
      url: `/s/${shareCode}`,
      signUrl
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to create share link',
      context: { userId: req.userId, filePath: req.body?.filePath, storagePoolId: req.body?.storagePoolId }
    })
  }
})

router.get('/list', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const shares = await db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.userId!)

    const sharesWithSign = shares.map((share: any) => {
      const { sign } = generateSignToken(share.username, share.sign_key)
      return {
        ...share,
        signUrl: `/s/${share.share_code}?sign=${sign}&t=${Math.floor(Date.now() / 1000)}`
      }
    })

    res.json({ shares: sharesWithSign })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to load share list',
      context: { userId: req.userId }
    })
  }
})

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const share = await db.prepare('SELECT file_path, storage_pool_id FROM shares WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    const result = await db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'share.shareNotFound' })
    }
    const username = await getUsernameById(req.userId!)
    await Logger.info('api', 'share.ts', `User ${username} deleted share in poolID:#${share?.storage_pool_id || 'default'} ${share?.file_path || ''}`.trim())
    res.json({ message: 'share.shareDeletedShort' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to delete share',
      context: { userId: req.userId, shareId: req.params.id }
    })
  }
})

router.get('/s/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: 'share.shareLinkNotFound' })
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'share.shareLinkExpired' })
    }

    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: 'share.downloadLimitReached' })
    }

    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || !safeEqual(providedPassword, share.password)) {
        return res.json({
          needPassword: true,
          fileType: share.file_type,
          fileName: getShareFileName(share.file_path),
          owner: share.username
        })
      }
    }

    res.json({
      needPassword: false,
      fileType: share.file_type,
      filePath: share.file_path,
      fileName: getShareFileName(share.file_path),
      owner: share.username,
      shareCode: share.share_code
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to access share info',
      context: { shareCode: req.params.code }
    })
  }
})

router.get('/list/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) return res.status(404).json({ error: 'share.shareLinkNotFound' })
    if (share.file_type !== 'folder') return res.status(400).json({ error: 'share.folderShareRequired' })
    if (share.expires_at && new Date(share.expires_at) < new Date()) return res.status(410).json({ error: 'share.shareLinkExpired' })

    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)
    if (!sign || !timestamp) return res.status(403).json({ error: 'share.missingSignatureParameters' })
    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) return res.status(403).json({ error: 'share.signatureVerificationFailed' })

    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || !safeEqual(providedPassword, share.password)) return res.status(403).json({ error: 'share.incorrectPassword' })
    }

    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    let subPath = ''
    try {
      subPath = normalizeStoragePath((req.query.path as string) || '')
    } catch {
      return res.status(400).json({ error: 'common.invalidPath' })
    }
    const fullPath = joinStoragePath(share.file_path, subPath)

    const files = await storage.list(fullPath)
    const filteredFiles = files.filter((file: any) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
    res.json({ files: filteredFiles, sharePath: share.file_path, subPath })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to list share folder',
      context: { shareCode: req.params.code, path: req.query.path }
    })
  }
})

router.get('/download/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: 'share.shareLinkNotFound' })
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'share.shareLinkExpired' })
    }

    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return res.status(410).json({ error: 'share.downloadLimitReached' })
    }

    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || !safeEqual(providedPassword, share.password)) {
        return res.status(403).json({ error: 'share.incorrectPassword' })
      }
    }

    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)

    if (!sign || !timestamp) {
      return res.status(403).json({ error: 'share.missingSignatureParameters' })
    }

    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: 'share.signatureVerificationFailed' })
    }

    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    let subPath = ''
    try {
      subPath = normalizeStoragePath((req.query.path as string) || '')
    } catch {
      return res.status(400).json({ error: 'common.invalidPath' })
    }
    const downloadPath = joinStoragePath(share.file_path, subPath)
    if (!downloadPath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }
    const data = await storage.download(downloadPath)
    const fileName = downloadPath.split('/').pop() || 'download'

    await db.prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(share.id)
    await Logger.info('api', 'share.ts', `Shared download for user ${share.username} in poolID:#${share.storage_pool_id || 'default'} ${downloadPath}`)

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to download shared file',
      context: { shareCode: req.params.code, path: req.query.path }
    })
  }
})

router.get('/preview/:code', async (req: Request, res: Response) => {
  try {
    const share = await db.prepare(`
      SELECT s.*, u.username FROM shares s
      JOIN users u ON s.user_id = u.id
      WHERE s.share_code = ?
    `).get(req.params.code) as any

    if (!share) {
      return res.status(404).json({ error: 'share.shareLinkNotFound' })
    }

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return res.status(410).json({ error: 'share.shareLinkExpired' })
    }

    if (share.password) {
      const providedPassword = req.query.password as string
      if (!providedPassword || !safeEqual(providedPassword, share.password)) {
        return res.status(403).json({ error: 'share.incorrectPassword' })
      }
    }

    const sign = req.query.sign as string
    const timestamp = parseInt(req.query.t as string)

    if (!sign || !timestamp) {
      return res.status(403).json({ error: 'share.missingSignatureParameters' })
    }

    if (!verifySignToken(share.username, share.sign_key, sign, timestamp)) {
      return res.status(403).json({ error: 'share.signatureVerificationFailed' })
    }

    const storage = share.storage_pool_id ? getStorageByPoolId(share.user_id, share.storage_pool_id) : getStorage(share.user_id)
    let subPath = ''
    try {
      subPath = normalizeStoragePath((req.query.path as string) || '')
    } catch {
      return res.status(400).json({ error: 'common.invalidPath' })
    }
    const previewPath = joinStoragePath(share.file_path, subPath)
    if (!previewPath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }
    const fileInfo = await storage.info(previewPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: 'share.folderPreviewUnsupported' })
    }

    const fileName = getShareFileName(previewPath) || getShareFileName(share.file_path) || 'file'
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
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share.ts',
      message: 'Failed to preview shared file',
      context: { shareCode: req.params.code, path: req.query.path }
    })
  }
})

export default router
