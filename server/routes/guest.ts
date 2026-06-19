import { Router, type Request, type Response } from 'express'
import Busboy from 'busboy'
import chardet from 'chardet'
import iconv from 'iconv-lite'
import db from '../db'
import { getStorageByPoolId } from '../services/factory'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import { buildTrashPath, moveToTrash } from '../services/trash'
import config from '../config'
import fs from 'fs/promises'
import fsSync from 'fs'
import { buildTemporaryUploadPath, normalizeStoragePath, sanitizeUploadFileName, isJunkFile } from './files/shared'

const router = Router()

const mimeTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/typescript',
  html: 'text/html',
  css: 'text/css',
  xml: 'text/xml',
  yaml: 'text/yaml',
  yml: 'text/yml',
  py: 'text/x-python',
  java: 'text/x-java',
  go: 'text/x-go',
  rs: 'text/x-rust',
  vue: 'text/x-vue',
  sh: 'text/x-shellscript',
}

function guestUploadSingle(field: string) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    const limits = { fileSize: config.upload_limit * 1024 * 1024 }
    const bb = Busboy({ headers: req.headers, limits, defCharset: 'latin1' })
    let fileReceived = false

    bb.on('file', (fieldname: string, stream: NodeJS.ReadableStream, info: any) => {
      if (fieldname !== field) {
        stream.resume()
        return
      }

      let rawFilename: string = info.filename
      try {
        const filenameBuffer = Buffer.from(info.filename, 'latin1')
        if (filenameBuffer.some((byte) => byte > 0x7f)) {
          const charset = chardet.detect(filenameBuffer)
          if (charset && iconv.encodingExists(charset)) {
            rawFilename = iconv.decode(filenameBuffer, charset)
          } else {
            const asUtf8 = filenameBuffer.toString('utf8')
            if (!asUtf8.includes('\ufffd')) {
              rawFilename = asUtf8
            } else if (iconv.encodingExists('gbk')) {
              rawFilename = iconv.decode(filenameBuffer, 'gbk')
            }
          }
        }
      } catch {}

      rawFilename = rawFilename.normalize('NFC')

      const chunks: Buffer[] = []
      let totalSize = 0

      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (totalSize > limits.fileSize) {
          stream.resume()
          return
        }
        chunks.push(chunk)
      })

      stream.on('end', () => {
        if (totalSize > limits.fileSize && !res.headersSent) {
          res.status(413).json({ error: 'file.fileSizeExceeded', params: { limit: config.upload_limit } })
          return
        }

        ;(req as any).file = {
          fieldname,
          originalname: rawFilename,
          encoding: info.encoding,
          mimetype: info.mimeType,
          buffer: Buffer.concat(chunks),
          size: totalSize,
        }
        fileReceived = true
      })
    })

    bb.on('field', (name: string, value: string) => {
      ;(req as any).body = (req as any).body || {}
      ;(req as any).body[name] = value
    })

    bb.on('close', () => {
      if (!fileReceived && !res.headersSent) {
        res.status(400).json({ error: 'common.missingFile' })
        return
      }
      if (!res.headersSent) next()
    })

    bb.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(400).json({ error: err.message })
      }
    })

    req.pipe(bb)
  }
}

const permissionAliases: Record<string, string[]> = {
  read: ['preview', 'download'],
  write: ['upload'],
  edit: ['rename'],
}

function hasPermission(permissions: string, action: string): boolean {
  if (!permissions) return false

  const items = permissions.split(',').map((item) => item.trim())
  if (items.includes(action)) return true

  for (const [parent, aliases] of Object.entries(permissionAliases)) {
    if (aliases.includes(action) && items.includes(parent)) {
      return true
    }
  }

  return false
}

function isPathSafe(targetPath: string): boolean {
  try {
    normalizeStoragePath(targetPath || '')
    return true
  } catch {
    return false
  }
}

function isTemporaryUploadFile(filename: string): boolean {
  const name = filename.split('/').pop() || filename
  return name.startsWith('.temp_')
}

function shouldUseAtomicTempUpload(storageType?: string): boolean {
  return storageType === 'local' || storageType === 'ftp'
}

async function getUserByUsername(username: string) {
  return await db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as any
}

async function getGuestSettings(userId: number) {
  return await db.prepare('SELECT guest_enabled FROM user_settings WHERE user_id = ?').get(userId) as any
}

async function getGuestShare(userId: number, shareId: string | number) {
  return await db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?').get(shareId, userId) as any
}

function getShareIdParam(req: Request) {
  return String(req.params.shareId || '')
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await db.prepare(`
      SELECT u.username, COUNT(gs.id) as share_count
      FROM users u
      JOIN user_settings s ON u.id = s.user_id
      JOIN guest_shares gs ON u.id = gs.user_id
      WHERE s.guest_enabled = 1
      GROUP BY u.id
    `).all()

    res.json({ users })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:username/list', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const shares = await db.prepare(`
      SELECT gs.id, gs.folder_path, gs.label, gs.permissions, gs.created_at, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.user_id = ?
      ORDER BY gs.created_at DESC
    `).all(user.id)

    res.json({ shares, owner: user.username })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:username/:shareId/list', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await db.prepare(`
      SELECT gs.*, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.id = ? AND gs.user_id = ?
    `).get(req.params.shareId, user.id) as any

    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const relativePath = (req.query.path as string) || ''
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? (relativePath ? `${basePath}/${relativePath}` : basePath) : relativePath

    const files = await storage.list(fullPath)
    const prefix = basePath ? `${basePath}/` : ''
    const result = files
      .filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
      .map((file) => ({
        ...file,
        path: prefix ? (file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path) : file.path,
      }))

    let readme: { name: string; path: string; directUrl: string; fileUrl: string } | null = null
    const readmeFile = result.find((file) =>
      file.type === 'file' && ['readme.md', 'readme.markdown'].includes(file.name.toLowerCase()),
    )
    if (readmeFile) {
      const previewUrl = `/api/guest/${encodeURIComponent(user.username)}/${share.id}/preview?path=${encodeURIComponent(readmeFile.path)}`
      readme = {
        name: readmeFile.name,
        path: readmeFile.path,
        directUrl: previewUrl,
        fileUrl: previewUrl,
      }
    }

    res.json({
      files: result,
      owner: user.username,
      shareLabel: share.label,
      permissions: share.permissions,
      readme,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:username/:shareId/preview', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'preview')) {
      return res.status(403).json({ error: 'guest.previewPermissionRequired' })
    }

    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath

    const fileInfo = await storage.info(fullPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: 'guest.folderPreviewUnsupported' })
    }

    const ext = relativePath.split('.').pop()?.toLowerCase() || ''
    const fileName = relativePath.split('/').pop() || 'file'
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/')
    const cachedMedia = isMedia
      ? await resolvePreviewCacheFile(`guest:${user.username}:share:${share.id}`, storage, fullPath)
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

    const data = await storage.download(fullPath)

    if (contentType.startsWith('text/') || contentType === 'application/json') {
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Length', data.length)
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
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
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(data)
  } catch (err: any) {
    if (err.message === 'common.fileNotFound' || err.code === 'ENOENT') {
      return res.status(404).json({ error: 'common.fileNotFound' })
    }
    res.status(500).json({ error: err.message })
  }
})

router.get('/:username/:shareId/download', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'download')) {
      return res.status(403).json({ error: 'guest.downloadPermissionRequired' })
    }

    const relativePath = req.query.path as string
    if (!relativePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    if (!isPathSafe(relativePath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = (share.folder_path || '').replace(/\\/g, '/')
    const fullPath = basePath ? `${basePath}/${relativePath}` : relativePath
    const data = await storage.download(fullPath)
    const fileName = relativePath.split('/').pop() || 'download'

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.send(data)
  } catch (err: any) {
    if (err.message === 'common.fileNotFound' || err.code === 'ENOENT') {
      return res.status(404).json({ error: 'common.fileNotFound' })
    }
    res.status(500).json({ error: err.message })
  }
})

router.post('/:username/:shareId/upload', guestUploadSingle('file'), async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'upload')) {
      return res.status(403).json({ error: 'guest.uploadPermissionRequired' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'common.missingFile' })
    }

    if (/^\._/.test(req.file.originalname) || req.file.originalname === '.DS_Store') {
      return res.status(400).json({ error: 'common.unsupportedFileType' })
    }

    const queryFilename = (req.query.filename as string) || null
    const dirPathInput = (req.body.dirPath as string) || (req.query.dirPath as string) || ''
    if (dirPathInput && !isPathSafe(dirPathInput)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }
    const dirPath = normalizeStoragePath(dirPathInput)

    let fallbackName = req.file.originalname
    try {
      fallbackName = decodeURIComponent(fallbackName)
    } catch {}

    const normalizedName = sanitizeUploadFileName(queryFilename || fallbackName)
    if (!normalizedName || normalizedName === '.' || normalizedName === '..') {
      return res.status(400).json({ error: 'file.invalidFileName' })
    }
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = normalizeStoragePath((share.folder_path || '').replace(/\\/g, '/'))
    const filePath = basePath
      ? (dirPath ? `${basePath}/${dirPath}/${normalizedName}` : `${basePath}/${normalizedName}`)
      : (dirPath ? `${dirPath}/${normalizedName}` : normalizedName)

    const pool = await db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(share.storage_pool_id) as any
    const uploadPath = shouldUseAtomicTempUpload(pool?.storage_type)
      ? buildTemporaryUploadPath(filePath, Date.now().toString(36))
      : filePath

    try {
      await storage.upload(uploadPath, req.file.buffer)
      if (uploadPath !== filePath) {
        try {
          await storage.move(uploadPath, filePath)
        } catch (err) {
          if (await storage.exists(filePath)) {
            await storage.remove(filePath)
            await storage.move(uploadPath, filePath)
          } else {
            throw err
          }
        }
      }
    } catch (err) {
      if (uploadPath !== filePath) {
        await storage.remove(uploadPath).catch(() => {})
      }
      throw err
    }

    const relativePath = basePath ? filePath.replace(`${basePath}/`, '').replace(basePath, '') : filePath
    res.json({ message: 'guest.uploadSuccessful', path: relativePath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:username/:shareId/write', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'edit')) {
      return res.status(403).json({ error: 'guest.editPermissionRequired' })
    }

    const { path: filePath, content } = req.body
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'guest.missingContentOrPath' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    if (content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'guest.contentTooLarge' })
    }

    const normalizedFilePath = normalizeStoragePath(filePath)
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = normalizeStoragePath((share.folder_path || '').replace(/\\/g, '/'))
    const fullPath = basePath ? `${basePath}/${normalizedFilePath}` : normalizedFilePath

    const buffer = Buffer.from(content, 'utf-8')
    await storage.upload(fullPath, buffer)
    const savedBuffer = await storage.download(fullPath)
    if (savedBuffer.toString('utf-8') !== content) {
      throw new Error('Saved content verification failed')
    }
    res.json({ success: true, path: normalizedFilePath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:username/:shareId/delete', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'delete')) {
      return res.status(403).json({ error: 'guest.deletePermissionRequired' })
    }

    const { path: filePath } = req.body
    if (!filePath) {
      return res.status(400).json({ error: 'common.missingFilePath' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    const normalizedFilePath = normalizeStoragePath(filePath)
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = normalizeStoragePath((share.folder_path || '').replace(/\\/g, '/'))
    const fullPath = basePath ? `${basePath}/${normalizedFilePath}` : normalizedFilePath

    const stat = await storage.info(fullPath).catch(() => ({ type: 'file' as const }))
    const fileName = normalizedFilePath.split('/').pop() || normalizedFilePath
    const result = await db.prepare(
      'INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(user.id, fullPath, fileName, stat.type, share.storage_pool_id, `Guest: ${req.params.username}`)

    const trashPath = buildTrashPath(result.lastInsertRowid, fileName)
    await moveToTrash(storage, fullPath, trashPath, stat.type)
    return res.json({ message: 'guest.deleteSuccessful' })

    try {
      const data = await storage.download(fullPath)
      await storage.upload(trashPath, data)
    } catch {}

    await db.prepare(
      'INSERT INTO trash (user_id, original_path, file_name, file_type, storage_pool_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(user.id, fullPath, fileName, stat.type, share.storage_pool_id, `Guest: ${req.params.username}`)

    await storage.remove(fullPath)
    res.json({ message: 'guest.deleteSuccessful' })
  } catch (err: any) {
    if (err.message === 'common.fileNotFound' || err.code === 'ENOENT') {
      return res.status(404).json({ error: 'common.fileNotFound' })
    }
    res.status(500).json({ error: err.message })
  }
})

router.post('/:username/:shareId/mkdir', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'upload')) {
      return res.status(403).json({ error: 'guest.writePermissionRequired' })
    }

    const { path: dirPath } = req.body
    if (!dirPath) {
      return res.status(400).json({ error: 'guest.missingDirectoryPath' })
    }

    if (!isPathSafe(dirPath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    const normalizedDirPath = normalizeStoragePath(dirPath)
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = normalizeStoragePath((share.folder_path || '').replace(/\\/g, '/'))
    const fullPath = basePath ? `${basePath}/${normalizedDirPath}` : normalizedDirPath

    await storage.mkdir(fullPath)
    res.json({ message: 'guest.createSuccessful', path: normalizedDirPath })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:username/:shareId/rename', async (req: Request, res: Response) => {
  try {
    const user = await getUserByUsername(req.params.username as string)
    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
    }

    const settings = await getGuestSettings(user.id)
    if (!settings || !settings.guest_enabled) {
      return res.status(403).json({ error: 'guest.guestModeDisabled' })
    }

    const share = await getGuestShare(user.id, getShareIdParam(req))
    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    if (!hasPermission(share.permissions, 'rename')) {
      return res.status(403).json({ error: 'guest.editPermissionRequired' })
    }

    const { path: filePath, newName: rawNewName } = req.body
    if (!filePath || !rawNewName) {
      return res.status(400).json({ error: 'guest.missingContentOrPath' })
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'guest.pathAccessDenied' })
    }

    const newName = sanitizeUploadFileName(rawNewName)
    if (!newName || newName === '.' || newName === '..') {
      return res.status(400).json({ error: 'file.invalidFileName' })
    }
    const normalizedFilePath = normalizeStoragePath(filePath)
    const storage = getStorageByPoolId(user.id, share.storage_pool_id)
    const basePath = normalizeStoragePath((share.folder_path || '').replace(/\\/g, '/'))
    const fullPath = basePath ? `${basePath}/${normalizedFilePath}` : normalizedFilePath

    await storage.rename(fullPath, newName)
    res.json({ message: 'guest.renameSuccessful' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
