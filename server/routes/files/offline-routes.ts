import type { Response, Router } from 'express'
import db from '../../db'
import { ApiKeyRequest, flexibleAuth, requirePermission } from '../../middleware/apikey'
import { getStorageByPoolId } from '../../services/factory'
import {
  cancelOfflineDownloadTask,
  clearFinishedOfflineDownloadTasks,
  createOfflineDownloadTask,
  listOfflineDownloadTasks,
  retryOfflineDownloadTask
} from '../../services/offline-download'
import { buildDirectUrl, getStorageForRequest, resolvePoolId } from './shared'

interface NormalizedRemoteUploadRequest {
  urls: string[]
  dirPath: string
  poolId?: string | number | null
}

interface RemoteUploadResultItem {
  url: string
  path: string
  fileName: string
  poolId?: number
  storageType: string
  directUrl: string
  fileUrl: string
}

function extractUrls(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .flatMap((item) => String(item ?? '').split(','))
      .map((item) => item.trim())
      .filter(Boolean)
  }

  if (typeof input === 'string') {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeRemoteUploadRequest(body: any): NormalizedRemoteUploadRequest {
  return {
    urls: Array.from(new Set([
      ...extractUrls(body?.urls),
      ...extractUrls(body?.url)
    ])),
    dirPath: typeof body?.dirPath === 'string' ? body.dirPath.replace(/\\/g, '/') : '',
    poolId: body?.poolId
  }
}

async function checkLocalQuota(userId: number, resolvedPoolId: number | undefined, size: number) {
  const pool = await db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
  if (pool?.storage_type !== 'local') {
    return { allowed: true, pool, message: undefined as string | undefined }
  }

  const { checkQuota } = await import('../../services/quota')
  const quotaCheck = await checkQuota(userId, size)
  return { ...quotaCheck, pool }
}

function resolveRemoteFileName(url: string) {
  const urlObj = new URL(url)
  let fileName = urlObj.pathname.split('/').pop() || 'remote-file'
  try {
    fileName = decodeURIComponent(fileName)
  } catch {
    // keep raw file name
  }
  return fileName || 'remote-file'
}

async function uploadRemoteFile(
  req: ApiKeyRequest,
  url: string,
  dirPath: string,
  poolId?: string | number | null
): Promise<RemoteUploadResultItem> {
  const storage = poolId ? getStorageByPoolId(req.userId!, Number(poolId)) : getStorageForRequest(req)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
  const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, buffer.length)
  if (!quotaCheck.allowed) {
    throw new Error(quotaCheck.message || 'Quota exceeded')
  }

  const fileName = resolveRemoteFileName(url)
  const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
  await storage.upload(filePath, buffer)

  const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
  return {
    url,
    path: filePath,
    fileName,
    poolId: resolvedPoolId,
    storageType: quotaCheck.pool?.storage_type || 'local',
    directUrl,
    fileUrl: directUrl
  }
}

export function registerOfflineTaskRoutes(router: Router) {
  router.post('/remote-upload', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      const { urls, dirPath, poolId } = normalizeRemoteUploadRequest(req.body)
      if (urls.length === 0) {
        return res.status(400).json({ error: 'Missing remote URL' })
      }

      const files: RemoteUploadResultItem[] = []
      const errors: Array<{ url: string; error: string }> = []

      for (const url of urls) {
        try {
          files.push(await uploadRemoteFile(req, url, dirPath, poolId))
        } catch (err: any) {
          errors.push({ url, error: err.message || 'Remote upload failed' })
        }
      }

      if (files.length === 0) {
        return res.status(400).json({
          error: errors[0]?.error || 'Remote upload failed',
          urls,
          errors
        })
      }

      const firstFile = files[0]
      res.json({
        message: files.length > 1 ? 'Remote uploads completed' : 'Remote upload completed',
        count: files.length,
        files,
        errors,
        path: firstFile.path,
        poolId: firstFile.poolId,
        storageType: firstFile.storageType,
        directUrl: firstFile.directUrl,
        fileUrl: firstFile.fileUrl
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/offline-download', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      const { urls, dirPath, poolId } = normalizeRemoteUploadRequest(req.body)
      if (urls.length === 0) {
        return res.status(400).json({ error: 'Missing remote URL' })
      }

      const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
      if (!resolvedPoolId) {
        return res.status(400).json({ error: 'Storage pool not found' })
      }

      const tasks: Array<{ taskId: number; url: string }> = []
      for (const url of urls) {
        const taskId = await createOfflineDownloadTask(req.userId!, resolvedPoolId, url, dirPath || '')
        tasks.push({ taskId, url })
      }

      res.json({
        message: tasks.length > 1 ? 'Offline download tasks created' : 'Offline download task created',
        count: tasks.length,
        poolId: resolvedPoolId,
        tasks,
        taskId: tasks[0]?.taskId
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.get('/offline-download/tasks', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      res.json({ tasks: await listOfflineDownloadTasks(req.userId!) })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/offline-download/tasks/:id/cancel', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await cancelOfflineDownloadTask(req.userId!, Number(req.params.id))
      res.json({ message: 'Task cancelled' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/offline-download/tasks/:id/retry', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await retryOfflineDownloadTask(req.userId!, Number(req.params.id))
      res.json({ message: 'Task re-queued' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/offline-download/tasks/clear-finished', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await clearFinishedOfflineDownloadTasks(req.userId!)
      res.json({ message: 'Finished tasks cleared' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })
}
