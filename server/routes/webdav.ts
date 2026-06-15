import { Router, type Request, type Response } from 'express'
import { flexibleAuth, type ApiKeyRequest } from '../middleware/apikey'
import { getStorageByPoolId } from '../services/factory'
import { Logger } from '../services/logger'
import db from '../db'
import { sendServerError } from './admin/shared'

const router = Router()

const DAV_ALLOW = 'OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE, PROPPATCH, COPY, LOCK, UNLOCK'
type DavClientProfile = 'generic' | 'finder' | 'windows'

function applyDavHeaders(res: Response) {
  res.setHeader('Allow', DAV_ALLOW)
  res.setHeader('Public', DAV_ALLOW)
  res.setHeader('DAV', '1')
  res.setHeader('MS-Author-Via', 'DAV')
  res.setHeader('Accept-Ranges', 'bytes')
}

function detectDavClient(req: Request): DavClientProfile {
  const ua = (req.get('user-agent') || '').toLowerCase()
  if (ua.includes('microsoft-webdav-miniredir')) return 'windows'
  if (ua.includes('webdavfs') || ua.includes('finder')) return 'finder'
  return 'generic'
}

async function getPoolId(userId: number, poolId?: string) {
  if (poolId) return Number(poolId)
  const pool = await db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any
  return pool?.id
}

function normalizeDavPath(inputPath: string) {
  return decodeURIComponent((inputPath || '').replace(/^\/+/, '').replace(/\\/g, '/'))
}

async function extractPoolScope(userId: number, rawRoutePath: string, queryPoolId?: string) {
  const normalized = normalizeDavPath(rawRoutePath)
  const match = normalized.match(/^(?:pool|p)\/(\d+)(?:\/(.*))?$/)
  if (match) {
    return {
      poolId: Number(match[1]),
      storagePath: normalizeDavPath(match[2] || ''),
      basePath: `/dav/pool/${match[1]}`,
      usingPathPool: true,
    }
  }

  const poolId = await getPoolId(userId, queryPoolId)
  return {
    poolId,
    storagePath: normalized,
    basePath: '/dav',
    usingPathPool: false,
  }
}

function appendEncodedPath(basePath: string, filePath: string) {
  const trimmedBasePath = basePath.replace(/\/$/, '')
  const encodedPath = filePath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return encodedPath ? `${trimmedBasePath}/${encodedPath}` : `${trimmedBasePath}/`
}

function buildHref(baseUrl: string, filePath: string, profile: DavClientProfile, searchParams?: URLSearchParams) {
  const url = new URL(baseUrl)
  url.pathname = appendEncodedPath(url.pathname, filePath)
  url.search = searchParams?.toString() || ''
  if (profile === 'windows') {
    return `${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}`
  }
  return url.toString()
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function getUsername(userId: number) {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return user?.username || `#${userId}`
}

function createPropResponse(
  baseUrl: string,
  item: { path: string; name: string; type: 'file' | 'folder'; size: number; modified: string },
  profile: DavClientProfile,
  searchParams?: URLSearchParams,
  isSelf = false,
) {
  const hrefValue = buildHref(baseUrl, item.path, profile, searchParams)
  const normalizedHref = profile === 'windows'
    ? hrefValue
    : item.type === 'folder' && !hrefValue.endsWith('/') ? `${hrefValue}/` : hrefValue
  const href = escapeXml(normalizedHref)
  const fallbackName = decodeURIComponent(new URL(baseUrl, 'http://localhost').pathname.split('/').filter(Boolean).pop() || '/')
  const displayName = escapeXml(item.name || fallbackName)
  const contentLength = String(item.size || 0)
  const created = escapeXml(new Date(item.modified).toISOString())
  const modified = escapeXml(new Date(item.modified).toUTCString())
  const resourceType = item.type === 'folder' ? '<D:collection />' : ''
  const contentType = escapeXml(item.type === 'folder' ? 'httpd/unix-directory' : 'application/octet-stream')
  const etag = escapeXml(`"${item.size || 0}-${new Date(item.modified).getTime()}"`)
  const isCollection = item.type === 'folder' ? '1' : '0'

  return `
    <D:response>
      <D:href>${href}</D:href>
      <D:propstat>
        <D:prop>
          <D:displayname>${displayName}</D:displayname>
          <D:creationdate>${created}</D:creationdate>
          <D:getcontenttype>${contentType}</D:getcontenttype>
          <D:getcontentlength>${contentLength}</D:getcontentlength>
          <D:getlastmodified>${modified}</D:getlastmodified>
          <D:getetag>${etag}</D:getetag>
          <D:iscollection>${isCollection}</D:iscollection>
          <D:resourcetype>${resourceType}</D:resourcetype>
          ${isSelf ? '<D:supportedlock />' : ''}
          ${isSelf ? '<D:lockdiscovery />' : ''}
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `.trim()
}

router.options('/*', (_req, res) => {
  applyDavHeaders(res)
  res.status(200).end()
})

router.use(flexibleAuth)

router.all('/*', async (req: ApiKeyRequest, res: Response) => {
  try {
    const clientProfile = detectDavClient(req)
    const rawRoutePath = (req.params as any)[0] || ''
    const scope = await extractPoolScope(req.userId!, rawRoutePath, req.query.poolId as string | undefined)
    const poolId = scope.poolId
    if (!poolId) {
      return res.status(400).json({ error: 'storagePool.notFound' })
    }

    const storage = getStorageByPoolId(req.userId!, poolId)
    const pathFromRoute = scope.storagePath
    const baseUrl = `${req.protocol}://${req.get('host')}${scope.basePath}`
    const sharedSearchParams = new URLSearchParams()
    const username = await getUsername(req.userId!)

    for (const [key, value] of Object.entries(req.query)) {
      if (scope.usingPathPool && key === 'poolId') continue
      if (value === undefined) continue
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') sharedSearchParams.append(key, item)
        }
        continue
      }
      if (typeof value === 'string') {
        sharedSearchParams.set(key, value)
      }
    }

    if (req.method === 'PROPFIND') {
      applyDavHeaders(res)
      const depth = req.headers.depth === '0' ? 0 : 1
      const info = pathFromRoute ? await storage.info(pathFromRoute).catch(() => null) : null
      if (pathFromRoute && !info) {
        res.status(404).end()
        return
      }
      const items = pathFromRoute
        ? info?.type === 'folder'
          ? await storage.list(pathFromRoute)
          : info ? [info] : []
        : await storage.list('')

      const responses = []
      if (pathFromRoute && info) {
        responses.push(createPropResponse(baseUrl, info, clientProfile, sharedSearchParams, true))
      } else if (!pathFromRoute) {
        responses.push(createPropResponse(baseUrl, {
          path: '',
          name: '',
          type: 'folder',
          size: 0,
          modified: new Date().toISOString(),
        }, clientProfile, sharedSearchParams, true))
      }

      if (depth !== 0) {
        for (const item of items) {
          responses.push(createPropResponse(baseUrl, item, clientProfile, sharedSearchParams))
        }
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join('\n')}
</D:multistatus>`

      await Logger.info('webdav', 'webdav.ts', `User ${username} PROPFIND success in poolID:#${poolId} ${pathFromRoute || '/'}`)
      res.status(207).setHeader('Content-Type', 'application/xml; charset=utf-8').send(xml)
      return
    }

    if (req.method === 'HEAD') {
      applyDavHeaders(res)
      if (!pathFromRoute) {
        res.status(200).end()
        return
      }

      const info = await storage.info(pathFromRoute)
      if (info.type === 'folder') {
        res.status(200).end()
        return
      }

      res.status(200)
        .setHeader('Content-Length', info.size || 0)
        .end()
      return
    }

    if (req.method === 'GET') {
      applyDavHeaders(res)
      if (!pathFromRoute) {
        await Logger.info('webdav', 'webdav.ts', `User ${username} webdav login success.`)
        if (clientProfile === 'windows') {
          res.status(200)
            .setHeader('Content-Type', 'text/html; charset=utf-8')
            .send('<html><body>WebDAV endpoint</body></html>')
          return
        }
        res.status(200)
          .type('text/plain; charset=utf-8')
          .send(`WebDAV endpoint is reachable.\nPool ID: ${poolId}\nFinder/Cyberduck should prefer ${scope.basePath}\nUse a WebDAV client or PROPFIND to browse directories.`)
        return
      }

      const data = await storage.download(pathFromRoute)
      await Logger.info('webdav', 'webdav.ts', `User ${username} downloaded a file in poolID:#${poolId} ${pathFromRoute}`)
      res.setHeader('Content-Length', data.length)
      res.send(data)
      return
    }

    if (req.method === 'PUT') {
      applyDavHeaders(res)
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
      }
      await storage.upload(pathFromRoute, Buffer.concat(chunks))
      await Logger.info('webdav', 'webdav.ts', `User ${username} uploaded a file in poolID:#${poolId} ${pathFromRoute}`)
      res.status(201).end()
      return
    }

    if (req.method === 'DELETE') {
      applyDavHeaders(res)
      await storage.remove(pathFromRoute)
      await Logger.info('webdav', 'webdav.ts', `User ${username} delete a file from poolID:#${poolId} ${pathFromRoute}`)
      res.status(204).end()
      return
    }

    if (req.method === 'MKCOL') {
      applyDavHeaders(res)
      await storage.mkdir(pathFromRoute)
      await Logger.info('webdav', 'webdav.ts', `User ${username} created a directory in poolID:#${poolId} ${pathFromRoute}`)
      res.status(201).end()
      return
    }

    if (req.method === 'MOVE') {
      applyDavHeaders(res)
      const destination = Array.isArray(req.headers.destination)
        ? req.headers.destination[0]
        : req.headers.destination
      if (!destination) {
        return res.status(400).json({ error: 'webdav.missingDestinationHeader' })
      }

      const targetUrl = new URL(destination)
      const targetRawPath = normalizeDavPath(targetUrl.pathname.replace(/^\/dav\/?/, ''))
      const targetScope = await extractPoolScope(req.userId!, targetRawPath)
      if (targetScope.poolId !== poolId) {
        return res.status(400).json({ error: 'webdav.crossPoolMoveUnsupported' })
      }

      await storage.move(pathFromRoute, targetScope.storagePath)
      await Logger.info('webdav', 'webdav.ts', `User ${username} moved a file in poolID:#${poolId} ${pathFromRoute} -> ${targetScope.storagePath}`)
      res.status(201).end()
      return
    }

    if (req.method === 'COPY') {
      const destination = Array.isArray(req.headers.destination)
        ? req.headers.destination[0]
        : req.headers.destination
      if (!destination) {
        return res.status(400).json({ error: 'webdav.missingDestinationHeader' })
      }

      const targetUrl = new URL(destination)
      const targetRawPath = normalizeDavPath(targetUrl.pathname.replace(/^\/dav\/?/, ''))
      const targetScope = await extractPoolScope(req.userId!, targetRawPath)
      if (targetScope.poolId !== poolId) {
        return res.status(400).json({ error: 'webdav.crossPoolCopyUnsupported' })
      }

      await storage.copy(pathFromRoute, targetScope.storagePath)
      await Logger.info('webdav', 'webdav.ts', `User ${username} copied a file in poolID:#${poolId} ${pathFromRoute} -> ${targetScope.storagePath}`)
      res.status(201).end()
      return
    }

    if (req.method === 'PROPPATCH') {
      res.status(207).setHeader('Content-Type', 'application/xml; charset=utf-8').send(`<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${escapeXml(buildHref(baseUrl, pathFromRoute, clientProfile, sharedSearchParams))}</D:href>
    <D:propstat>
      <D:prop />
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`)
      return
    }

    if (req.method === 'LOCK' || req.method === 'UNLOCK') {
      applyDavHeaders(res)
      res.status(200).end()
      return
    }

    res.status(405).end()
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'webdav',
      fileName: 'webdav.ts',
      message: 'WebDAV request failed',
      context: { userId: req.userId, method: req.method, path: (req.params as any)[0], queryPoolId: req.query.poolId }
    })
  }
})

export default router
