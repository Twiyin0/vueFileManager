import { Router, type Request, type Response } from 'express'
import fsSync from 'fs'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { flexibleAuth, type ApiKeyRequest, requirePermission } from '../middleware/apikey'
import { Logger } from '../services/logger'
import { resolvePreviewCacheFile } from '../services/preview-cache'
import { getUsernameByIdSafe } from './share-mounts-utils'
import {
  addShareMounts,
  createShareMountDirectory,
  getShareMountFileInfo,
  listAllShareMountFiles,
  listShareMountDirectories,
  listShareMountPath,
  normalizeShareMountPath,
  removeShareMountDirectory,
  removeShareMount,
  resolveShareMountPath
} from '../services/share-mounts'
import { sendServerError } from './admin/shared'

const router = Router()
const publicRouter = Router()

const previewMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  bmp: 'image/bmp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  ogg: 'audio/ogg', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
  aac: 'audio/aac', m4a: 'audio/mp4',
  pdf: 'application/pdf',
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

function getMimeType(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return previewMimeTypes[ext] || 'application/octet-stream'
}

function getShareMountCacheScope(userId: number, poolId: number, sourcePath: string) {
  return `share-mount:user:${userId}:pool:${poolId}:source:${sourcePath}`
}

function buildDirectUrl(req: ApiKeyRequest, virtualPath: string) {
  const encoded = normalizeShareMountPath(virtualPath)
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const base = encoded ? `/share/${encoded}` : '/share'
  const params = new URLSearchParams()
  const apiKey = req.headers['x-api-key'] as string || req.query.apiKey as string
  const authHeader = req.headers.authorization
  const token = authHeader?.replace('Bearer ', '') || req.cookies?.token || req.query.token as string
  if (apiKey) params.set('apiKey', apiKey)
  else if (token) params.set('token', token)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

router.get('/list', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  try {
    const path = normalizeShareMountPath(req.query.path as string)
    const showAll = String(req.query.showAll || '') === 'true'

    if (showAll) {
      const file = await listAllShareMountFiles(req.userId!, path, (virtualPath) => buildDirectUrl(req, virtualPath))
      return res.json({ file })
    }

    const files = await listShareMountPath(req.userId!, path, (virtualPath) => buildDirectUrl(req, virtualPath))
    return res.json({ files })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to list share mounts',
      context: { userId: req.userId, path: req.query.path, showAll: req.query.showAll }
    })
  }
})

router.get('/directories', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const directories = await listShareMountDirectories(req.userId!)
    res.json({ directories })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to list mount directories',
      context: { userId: req.userId }
    })
  }
})

router.post('/directories', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const path = await createShareMountDirectory(req.userId!, req.body?.path as string)
    const username = await getUsernameByIdSafe(req.userId!)
    await Logger.info('api', 'share-mounts.ts', `User ${username} created share mount directory /share/${path}`)
    res.json({ message: 'Created', path })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to create mount directory',
      context: { userId: req.userId, path: req.body?.path }
    })
  }
})

router.post('/mount', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const targetPath = req.body?.targetPath as string
    const items = Array.isArray(req.body?.items) ? req.body.items : []
    await addShareMounts(req.userId!, targetPath, items)
    const username = await getUsernameByIdSafe(req.userId!)
    await Logger.info('api', 'share-mounts.ts', `User ${username} mounted ${items.length} folder(s) into /share/${normalizeShareMountPath(targetPath)}`)
    res.json({ message: 'Mounted' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to create share mount',
      context: { userId: req.userId, targetPath: req.body?.targetPath, count: Array.isArray(req.body?.items) ? req.body.items.length : 0 }
    })
  }
})

router.post('/unmount', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const mountId = Number(req.body?.mountId)
    const path = normalizeShareMountPath(req.body?.path as string)

    if (Number.isInteger(mountId) && mountId > 0) {
      const mount = await removeShareMount(req.userId!, mountId)
      const username = await getUsernameByIdSafe(req.userId!)
      await Logger.info(
        'api',
        'share-mounts.ts',
        `User ${username} unmounted share mount #${mountId} from /share/${mount.target_path || ''}`.trim()
      )
      return res.json({ message: 'Unmounted', mountId })
    }

    if (!path) {
      return res.status(400).json({ error: 'Invalid mountId or path' })
    }

    const directory = await removeShareMountDirectory(req.userId!, path)
    const username = await getUsernameByIdSafe(req.userId!)
    await Logger.info(
      'api',
      'share-mounts.ts',
      `User ${username} removed share mount directory /share/${directory.path}`
    )
    res.json({ message: 'Unmounted', path: directory.path })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to unmount share mount',
      context: { userId: req.userId, mountId: req.body?.mountId, path: req.body?.path }
    })
  }
})

async function handleShareAccess(req: Request, res: Response, mode: 'download' | 'preview') {
  try {
    const apiReq = req as ApiKeyRequest
    const rawPath = decodeURIComponent((req.params[0] as string) || '')
    const normalized = normalizeShareMountPath(rawPath)
    const resolved = await resolveShareMountPath(apiReq.userId!, normalized)
    if (!resolved || resolved.kind !== 'mounted') {
      return res.status(404).json({ error: 'Share mount file not found' })
    }

    const { storage, info } = await getShareMountFileInfo(apiReq.userId!, normalized)
    if (info.type !== 'file') {
      return res.status(400).json({ error: 'Only files can be opened directly' })
    }

    const fileName = info.name || normalized.split('/').pop() || 'file'
    const contentType = getMimeType(fileName)
    const isMedia = contentType.startsWith('audio/') || contentType.startsWith('video/')
    const cachedMedia = isMedia
      ? await resolvePreviewCacheFile(
          getShareMountCacheScope(apiReq.userId!, resolved.mount.source_pool_id, resolved.mount.source_path),
          storage,
          resolved.sourceFullPath
        )
      : null

    if (cachedMedia) {
      const fileOnDisk = cachedMedia.path
      const stat = cachedMedia.stat
      const fileSize = stat.size
      const etag = `"${fileSize}-${stat.mtimeMs}"`
      const range = req.headers.range

      if (mode === 'download') {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Length', fileSize)
        return fsSync.createReadStream(fileOnDisk).pipe(res)
      }

      if (!range && req.headers['if-none-match'] === etag) {
        return res.status(304).end()
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

        return fsSync.createReadStream(fileOnDisk, { start, end }).pipe(res)
      }

      res.setHeader('Content-Length', fileSize)
      return fsSync.createReadStream(fileOnDisk).pipe(res)
    }

    const data = await storage.download(resolved.sourceFullPath)

    if (mode === 'download') {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
      res.setHeader('Content-Type', 'application/octet-stream')
      return res.send(data)
    }

    const etag = `"${data.length}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    return res.send(data)
  } catch (err) {
    await sendServerError(req as any, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to access share mount file',
      context: { path: req.params[0], mode }
    })
  }
}

async function handleSharePathRequest(req: ApiKeyRequest, res: Response, rawPath: string) {
  const normalized = normalizeShareMountPath(rawPath)
  const wantsDownload = String(req.query.download || '') === 'true'

  try {
    const resolved = await resolveShareMountPath(req.userId!, normalized)
    if (!resolved) {
      return res.status(404).json({ error: 'Share mount path not found' })
    }

    if (resolved.kind === 'virtual-dir') {
      const files = await listShareMountPath(req.userId!, normalized, (virtualPath) => buildDirectUrl(req, virtualPath))
      return res.json({ files, path: normalized })
    }

    const { info } = await getShareMountFileInfo(req.userId!, normalized)
    if (info.type === 'folder') {
      const files = await listShareMountPath(req.userId!, normalized, (virtualPath) => buildDirectUrl(req, virtualPath))
      return res.json({ files, path: normalized })
    }

    if (wantsDownload) {
      return handleShareAccess(req, res, 'download')
    }
    return handleShareAccess(req, res, 'preview')
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'share-mounts.ts',
      message: 'Failed to access share mount path',
      context: { userId: req.userId, path: rawPath, download: req.query.download }
    })
  }
}

publicRouter.get('/', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  await handleSharePathRequest(req, res, '')
})

publicRouter.get('/*', flexibleAuth, requirePermission('read'), async (req: ApiKeyRequest, res: Response) => {
  const rawPath = decodeURIComponent((req.params[0] as string) || '')
  await handleSharePathRequest(req, res, rawPath)
})

export default router
export { publicRouter as publicShareMountRouter }
