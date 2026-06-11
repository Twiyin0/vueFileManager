import { Router, Response } from 'express'
import { flexibleAuth, ApiKeyRequest } from '../middleware/apikey'
import { getStorageByPoolId } from '../services/factory'
import db from '../db'

const router = Router()

function getPoolId(userId: number, poolId?: string) {
  if (poolId) return Number(poolId)
  const pool = db.prepare('SELECT id FROM storage_pools WHERE user_id = ? AND is_default = 1').get(userId) as any
  return pool?.id
}

function normalizeDavPath(inputPath: string) {
  return decodeURIComponent((inputPath || '').replace(/^\/+/, '').replace(/\\/g, '/'))
}

function extractPoolScope(userId: number, rawRoutePath: string, queryPoolId?: string) {
  const normalized = normalizeDavPath(rawRoutePath)
  const match = normalized.match(/^(?:pool|p)\/(\d+)(?:\/(.*))?$/)
  if (match) {
    return {
      poolId: Number(match[1]),
      storagePath: normalizeDavPath(match[2] || ''),
      basePath: `/dav/pool/${match[1]}`,
      usingPathPool: true
    }
  }

  const poolId = getPoolId(userId, queryPoolId)
  return {
    poolId,
    storagePath: normalized,
    basePath: '/dav',
    usingPathPool: false
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

function buildHref(baseUrl: string, filePath: string, searchParams?: URLSearchParams) {
  const url = new URL(baseUrl)
  url.pathname = appendEncodedPath(url.pathname, filePath)
  url.search = searchParams?.toString() || ''
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

function createPropResponse(
  baseUrl: string,
  item: { path: string; name: string; type: 'file' | 'folder'; size: number; modified: string },
  searchParams?: URLSearchParams
) {
  const hrefValue = buildHref(baseUrl, item.path, searchParams)
  const href = escapeXml(item.type === 'folder' && !hrefValue.endsWith('/') ? `${hrefValue}/` : hrefValue)
  const displayName = escapeXml(item.name || '/')
  const contentLength = String(item.size || 0)
  const modified = escapeXml(new Date(item.modified).toUTCString())
  const resourceType = item.type === 'folder' ? '<D:collection />' : ''

  return `
    <D:response>
      <D:href>${href}</D:href>
      <D:propstat>
        <D:prop>
          <D:displayname>${displayName}</D:displayname>
          <D:getcontentlength>${contentLength}</D:getcontentlength>
          <D:getlastmodified>${modified}</D:getlastmodified>
          <D:resourcetype>${resourceType}</D:resourcetype>
        </D:prop>
        <D:status>HTTP/1.1 200 OK</D:status>
      </D:propstat>
    </D:response>
  `.trim()
}

router.options('/*', (_req, res) => {
  res.setHeader('Allow', 'OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE')
  res.setHeader('DAV', '1, 2')
  res.setHeader('MS-Author-Via', 'DAV')
  res.status(200).end()
})

router.use(flexibleAuth)

router.all('/*', async (req: ApiKeyRequest, res: Response) => {
  try {
    const rawRoutePath = (req.params as any)[0] || ''
    const scope = extractPoolScope(req.userId!, rawRoutePath, req.query.poolId as string | undefined)
    const poolId = scope.poolId
    if (!poolId) {
      return res.status(400).json({ error: '存储池不存在' })
    }

    const storage = getStorageByPoolId(req.userId!, poolId)
    const pathFromRoute = scope.storagePath
    const baseUrl = `${req.protocol}://${req.get('host')}${scope.basePath}`
    const sharedSearchParams = new URLSearchParams()
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
      const depth = req.headers.depth === '0' ? 0 : 1
      const info = pathFromRoute ? await storage.info(pathFromRoute).catch(() => null) : null
      const items = pathFromRoute
        ? info?.type === 'folder'
          ? await storage.list(pathFromRoute)
          : info ? [info] : []
        : await storage.list('')

      const responses = []
      if (pathFromRoute && info) {
        responses.push(createPropResponse(baseUrl, info, sharedSearchParams))
      } else if (!pathFromRoute) {
        responses.push(createPropResponse(baseUrl, {
          path: '',
          name: '',
          type: 'folder',
          size: 0,
          modified: new Date().toISOString()
        }, sharedSearchParams))
      }

      if (depth !== 0) {
        for (const item of items) {
          responses.push(createPropResponse(baseUrl, item, sharedSearchParams))
        }
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join('\n')}
</D:multistatus>`

      res.status(207).setHeader('Content-Type', 'application/xml; charset=utf-8').send(xml)
      return
    }

    if (req.method === 'HEAD') {
      if (!pathFromRoute) {
        res
          .status(200)
          .setHeader('DAV', '1, 2')
          .setHeader('MS-Author-Via', 'DAV')
          .setHeader('Allow', 'OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE')
          .end()
        return
      }

      const info = await storage.info(pathFromRoute)
      if (info.type === 'folder') {
        res
          .status(200)
          .setHeader('DAV', '1, 2')
          .setHeader('MS-Author-Via', 'DAV')
          .setHeader('Allow', 'OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE')
          .end()
        return
      }

      res
        .status(200)
        .setHeader('Content-Length', info.size || 0)
        .setHeader('Allow', 'OPTIONS, HEAD, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE')
        .end()
      return
    }

    if (req.method === 'GET') {
      if (!pathFromRoute) {
        res
          .status(200)
          .type('text/plain; charset=utf-8')
          .send(`WebDAV endpoint is reachable.\nPool ID: ${poolId}\nFinder/Cyberduck should prefer ${scope.basePath}\nUse a WebDAV client or PROPFIND to browse directories.`)
        return
      }
      const data = await storage.download(pathFromRoute)
      res.send(data)
      return
    }

    if (req.method === 'PUT') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
      }
      await storage.upload(pathFromRoute, Buffer.concat(chunks))
      res.status(201).end()
      return
    }

    if (req.method === 'DELETE') {
      await storage.remove(pathFromRoute)
      res.status(204).end()
      return
    }

    if (req.method === 'MKCOL') {
      await storage.mkdir(pathFromRoute)
      res.status(201).end()
      return
    }

    if (req.method === 'MOVE') {
      const destination = Array.isArray(req.headers.destination)
        ? req.headers.destination[0]
        : req.headers.destination
      if (!destination) {
        return res.status(400).json({ error: '缺少 Destination' })
      }
      const targetUrl = new URL(destination)
      const targetRawPath = normalizeDavPath(targetUrl.pathname.replace(/^\/dav\/?/, ''))
      const targetScope = extractPoolScope(req.userId!, targetRawPath)
      if (targetScope.poolId !== poolId) {
        return res.status(400).json({ error: '暂不支持跨存储池移动' })
      }
      const targetPath = targetScope.storagePath
      await storage.move(pathFromRoute, targetPath)
      res.status(201).end()
      return
    }

    res.status(405).end()
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
