import { Readable } from 'stream'
import db from '../db'
import { getStorageByPoolId } from './factory'

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

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_download_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pool_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      dir_path TEXT DEFAULT '',
      file_name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER,
      downloaded_bytes INTEGER NOT NULL DEFAULT 0,
      error_message TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (pool_id) REFERENCES storage_pools(id) ON DELETE CASCADE
    )
  `)
}

function updateTask(id: number, fields: Record<string, any>) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return
  const assignments = keys.map((key) => `${key} = ?`).join(', ')
  const values = keys.map((key) => fields[key])
  db.prepare(`
    UPDATE offline_download_tasks
    SET ${assignments}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(...values, id)
}

async function processTask(task: DownloadTaskRow) {
  runningTaskId = task.id
  updateTask(task.id, { status: 'running', error_message: '', progress: 0, downloaded_bytes: 0 })

  try {
    const response = await fetch(task.url)
    if (!response.ok || !response.body) {
      throw new Error(`下载失败: ${response.status} ${response.statusText}`)
    }

    const totalBytes = Number(response.headers.get('content-length') || 0) || null
    updateTask(task.id, { total_bytes: totalBytes })

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

          const current = db.prepare('SELECT status FROM offline_download_tasks WHERE id = ?').get(task.id) as { status: TaskStatus } | undefined
          if (!current || current.status === 'cancelled') {
            trackedStream.destroy(new Error('任务已取消'))
            return
          }

          trackedStream.push(buffer)
          updateTask(task.id, {
            downloaded_bytes: downloadedBytes,
            progress: totalBytes ? Math.min(99, Math.round(downloadedBytes / totalBytes * 100)) : 0
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

    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      downloaded_bytes: downloadedBytes,
      total_bytes: totalBytes ?? downloadedBytes
    })
  } catch (err: any) {
    const current = db.prepare('SELECT status FROM offline_download_tasks WHERE id = ?').get(task.id) as { status: TaskStatus } | undefined
    if (current?.status === 'cancelled') {
      updateTask(task.id, { progress: 0, error_message: '' })
    } else {
      updateTask(task.id, { status: 'failed', error_message: err.message || '任务失败' })
    }
  } finally {
    runningTaskId = null
    setTimeout(() => {
      processQueue().catch(() => {})
    }, 50)
  }
}

export async function processQueue() {
  ensureTable()
  if (runningTaskId !== null) return
  const task = db.prepare(`
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
  ensureTable()
  if (started) return
  started = true
  processQueue().catch(() => {})
}

export function createOfflineDownloadTask(userId: number, poolId: number, url: string, dirPath: string) {
  ensureTable()
  let fileName = ''
  try {
    fileName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '')
  } catch {}

  const result = db.prepare(`
    INSERT INTO offline_download_tasks (user_id, pool_id, url, dir_path, file_name, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(userId, poolId, url, dirPath || '', fileName)

  processQueue().catch(() => {})
  return result.lastInsertRowid as number
}

export function listOfflineDownloadTasks(userId: number) {
  ensureTable()
  return db.prepare(`
    SELECT t.*, sp.name as pool_name
    FROM offline_download_tasks t
    JOIN storage_pools sp ON sp.id = t.pool_id
    WHERE t.user_id = ?
    ORDER BY t.created_at DESC, t.id DESC
  `).all(userId)
}

export function cancelOfflineDownloadTask(userId: number, taskId: number) {
  ensureTable()
  const task = db.prepare('SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as DownloadTaskRow | undefined
  if (!task) throw new Error('任务不存在')
  if (task.status === 'completed') throw new Error('已完成任务不能取消')
  updateTask(taskId, { status: 'cancelled', error_message: '' })
}

export function retryOfflineDownloadTask(userId: number, taskId: number) {
  ensureTable()
  const task = db.prepare('SELECT * FROM offline_download_tasks WHERE id = ? AND user_id = ?').get(taskId, userId) as DownloadTaskRow | undefined
  if (!task) throw new Error('任务不存在')
  updateTask(taskId, {
    status: 'pending',
    progress: 0,
    total_bytes: null,
    downloaded_bytes: 0,
    error_message: ''
  })
  processQueue().catch(() => {})
}
