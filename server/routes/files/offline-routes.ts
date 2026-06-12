import type { Router, Response } from 'express'
import { flexibleAuth, ApiKeyRequest, requirePermission } from '../../middleware/apikey'
import { getStorageByPoolId } from '../../services/factory'
import {
  cancelOfflineDownloadTask,
  clearFinishedOfflineDownloadTasks,
  createOfflineDownloadTask,
  listOfflineDownloadTasks,
  retryOfflineDownloadTask
} from '../../services/offline-download'
import { buildDirectUrl, getStorageForRequest, resolvePoolId } from './shared'
import db from '../../db'

async function checkLocalQuota(userId: number, resolvedPoolId: number | undefined, size: number) {
  const pool = await db.prepare('SELECT storage_type FROM storage_pools WHERE id = ?').get(resolvedPoolId) as any
  if (pool?.storage_type !== 'local') {
    return { allowed: true, pool, message: undefined as string | undefined }
  }

  const { checkQuota } = await import('../../services/quota')
  const quotaCheck = await checkQuota(userId, size)
  return { ...quotaCheck, pool }
}

export function registerOfflineTaskRoutes(router: Router) {
  router.post('/remote-upload', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      const { url, dirPath, poolId } = req.body
      if (!url) {
        return res.status(400).json({ error: '缺少 URL' })
      }

      const storage = poolId ? getStorageByPoolId(req.userId!, poolId) : getStorageForRequest(req)
      const response = await fetch(url)
      if (!response.ok) {
        return res.status(400).json({ error: `下载失败: ${response.statusText}` })
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
      const quotaCheck = await checkLocalQuota(req.userId!, resolvedPoolId, buffer.length)
      if (!quotaCheck.allowed) {
        return res.status(400).json({ error: quotaCheck.message })
      }

      const urlObj = new URL(url)
      let fileName = urlObj.pathname.split('/').pop() || 'remote-file'
      try { fileName = decodeURIComponent(fileName) } catch {}

      const filePath = dirPath ? `${dirPath}/${fileName}` : fileName
      await storage.upload(filePath, buffer)

      const directUrl = buildDirectUrl(req, filePath, resolvedPoolId)
      res.json({ message: '远程上传成功', path: filePath, poolId: resolvedPoolId, storageType: quotaCheck.pool?.storage_type || 'local', directUrl, fileUrl: directUrl })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  router.post('/offline-download', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      const { url, dirPath, poolId } = req.body
      if (!url) {
        return res.status(400).json({ error: '缺少 URL' })
      }

      const resolvedPoolId = await resolvePoolId(req.userId!, poolId)
      if (!resolvedPoolId) {
        return res.status(400).json({ error: '存储池不存在' })
      }

      const taskId = await createOfflineDownloadTask(req.userId!, resolvedPoolId, url, dirPath || '')
      res.json({ message: '离线下载任务已创建', taskId })
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
      res.json({ message: '任务已取消' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/offline-download/tasks/:id/retry', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await retryOfflineDownloadTask(req.userId!, Number(req.params.id))
      res.json({ message: '任务已重新加入队列' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })

  router.post('/offline-download/tasks/clear-finished', flexibleAuth, requirePermission('write'), async (req: ApiKeyRequest, res: Response) => {
    try {
      await clearFinishedOfflineDownloadTasks(req.userId!)
      res.json({ message: '已清空已结束任务' })
    } catch (err: any) {
      res.status(400).json({ error: err.message })
    }
  })
}
