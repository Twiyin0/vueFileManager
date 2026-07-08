import { Readable } from 'stream'
import db from '../db'
import { getStorageByPoolId } from './factory'
import { resolveRemoteUrlThroughPlugins } from '../plugins/loader'

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

interface DownloadTaskRow {
  id: number
  user_id: number
  pool_id: number
  url: string
  dir_path: string
  file_name: string
  status: TaskStatus
  progress: number
  total_bytes: number | null
  downloaded_bytes: number
  error_message: string
}

let started = false
let runningTaskId: number | null = null

async function ensureTable() {
  return
}

async function updateTask(id: number, fields: Record<string, any>) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return
  const assignments = keys.map((key) => `${key} = ?`).join(', ')
  const values = keys.map((key) => fields[key])
  await db.prepare(`
    UPDATE offline_download_tasks
    SET ${assignments}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...values, id)
}

async function processTask(task: DownloadTaskRow) {
  runningTaskId = task.id
  await updateTask(task.id, { status: 'running', error_message: '', progress: 0, downloaded_bytes: 0 })

  try {
    const remoteUrl = await resolveRemoteUrlThroughPlugins({
      url: task.url,
      operation: 'offline-download',
      userId: task.user_id,
      poolId: task.pool_id,
      dirPath: task.dir_path || ''
    })
    const response = await fetch(remoteUrl)
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }

    const totalBytes = Number(response.headers.get('content-length') || 0) || null
    await updateTask(task.id, { total_bytes: totalBytes })

    const storage = getStorageByPoolId(task.user_id, task.pool_id)
    const fileName = task.file_name || decodeURIComponent(new URL(task.url).pathname.split('/').pop() || 'remote-file')
    const filePath = task.dir_path ? `${task.dir_path}/${fileName}` : fileName

    let downloadedBytes = 0
    const trackedStream = new Readable({ read() {} })

    ;(async () => {
      try {
        for await (const chunk of response.body as any) {
          const buffer = Buffer.from(chunk)
          downloadedBytes += buffer.length
          const effectiveTotalBytes = totalBytes ? Math.max(totalBytes, downloadedBytes) : null

          const current = await db.prepare('SELECT status FROM offline_download_tasks WHERE id = ?').get(task.id) as { status: TaskStatus } | undefined
          if (!current || current.status === 'cancelled') {
            trackedStream.destroy(new Error('file.taskCancelled'))
            return
          }

          trackedStream.push(buffer)
          await updateTask(task.id, {
            downloaded_bytes: downloadedBytes,
            total_bytes: effectiveTotalBytes,
            progress: effectiveTotalBytes ? Math.min(99, Math.round(downloadedBytes / effectiveTotalBytes * 100)) : 0
          })
        }
        trackedStream.push(null)
      } catch (err: any) {
        trackedStream.destroy(err)
      }
    })().catch(() => {})

    if (storage.uploadStream) {
      await storage.uploadStream(filePath, trackedStream, totalBytes || undefined)
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of trackedStream) {
        chunks.push(Buffer.from(chunk))
      }
      await storage.upload(filePath, Buffer.concat(chunks))
    }

    await updateTask(task.id, {
      status: 'completed',
      progress: 100,
      downloaded_bytes: downloadedBytes,
      total_bytes: Math.max(totalBytes ?? 0, downloadedBytes) || downloadedBytes
    })
  } catch (err: any) {
    const current = await db.prepare('SELECT status FROM offline_download_tasks WHERE id = ?').get(task.id) as { status: TaskStatus } | undefined
    if (current?.status === 'cancelled') {
      await updateTask(task.id, { progress: 0, error_message: '' })
    } else {
      await updateTask(task.id, { status: 'failed', error_message: err.message || 'Task failed' })
    }
  } finally {
    runningTaskId = null
    setTimeout(() => {
      processQueue().catch(() => {})
    }, 50)
  }
}

export async function processQueue() {
  await ensureTable()
  if (runningTaskId !== null) return
  const task = await db.prepare(`
    SELECT *
    FROM offline_download_tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `).get() as DownloadTaskRow | undefined

  if (!task) return
  await processTask(task)
}

export function startOfflineDownloadWorker() {
  if (started) return
  started = true
  processQueue().catch(() => {})
}

export async function createOfflineDownloadTask(userId: number, poolId: number, url: string, dirPath: string) {
  await ensureTable()
  let fileName = ''
  try {
    fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
  } catch {}

  const result = await db.prepare(`
    INSERT INTO offline_download_tasks (user_id, pool_id, url, dir_path, file_name, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(userId, poolId, url, dirPath || '', fileName)

  processQueue().catch(() => {})
  return result.lastInsertRowid as number
}

export async function listOfflineDownloadTasks(userId: number) {
  await ensureTable()
  return db.prepare(`
    SELECT t.*, sp.name as pool_name
    FROM offline_download_tasks t
    JOIN storage_pools sp ON sp.id = t.pool_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC, t.id DESC
  `).all(userId)
}

export async function cancelOfflineDownloadTask(userId: number, taskId: number) {
  await ensureTable()
  const task = await db.prepare('SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as DownloadTaskRow | undefined
  if (!task) throw new Error('Task not found')
  if (task.status === 'completed') throw new Error('Completed tasks cannot be cancelled')
  await updateTask(taskId, { status: 'cancelled', error_message: '' })
}

export async function retryOfflineDownloadTask(userId: number, taskId: number) {
  await ensureTable()
  const task = await db.prepare('SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as DownloadTaskRow | undefined
  if (!task) throw new Error('Task not found')
  await updateTask(taskId, {
    status: 'pending',
    progress: 0,
    total_bytes: null,
    downloaded_bytes: 0,
    error_message: ''
  })
  processQueue().catch(() => {})
}

export async function clearFinishedOfflineDownloadTasks(userId: number) {
  await ensureTable()
  await db.prepare(`
    DELETE FROM offline_download_tasks
    WHERE user_id = ?
      AND status IN ('completed', 'failed', 'cancelled')
  `).run(userId)
}
