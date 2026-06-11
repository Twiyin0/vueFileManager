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

function buildHref(baseUrl: string, filePath: string) {
  return `${baseUrl.replace(/\/$/, '')}/${filePath.split('/').map(encodeURIComponent).join('/')}`
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createPropResponse(baseUrl: string, item: { path: string; name: string; type: 'file' | 'folder'; size: number; modified: string }) {
  const href = escapeXml(buildHref(baseUrl, item.path) + (item.type === 'folder' ? '/' : ''))
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

router.use(flexibleAuth)

router.options('/*', (_req, res) => {
  res.setHeader('Allow', 'OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL, MOVE')
  res.setHeader('DAV', '1')
  res.status(200).end()
})

router.all('/*', async (req: ApiKeyRequest, res: Response) => {
  try {
    const poolId = getPoolId(req.userId!, req.query.poolId as string | undefined)
    if (!poolId) {
      return res.status(400).json({ error: '存储池不存在' })
    }

    const storage = getStorageByPoolId(req.userId!, poolId)
    const pathFromRoute = normalizeDavPath((req.params as any)[0] || '')
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}`

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
        responses.push(createPropResponse(baseUrl, info))
      } else if (!pathFromRoute) {
        responses.push(createPropResponse(baseUrl, {
          path: '',
          name: '',
          type: 'folder',
          size: 0,
          modified: new Date().toISOString()
        }))
      }

      if (depth !== 0) {
        for (const item of items) {
          responses.push(createPropResponse(baseUrl, item))
        }
      }

      const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join('\n')}
</D:multistatus>`

      res.status(207).setHeader('Content-Type', 'application/xml; charset=utf-8').send(xml)
      return
    }

    if (req.method === 'GET') {
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
      const targetPath = normalizeDavPath(targetUrl.pathname.replace(req.baseUrl, ''))
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
