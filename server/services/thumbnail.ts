import crypto from 'crypto'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import db from '../db'
import { resolveFromRoot } from '../runtime-paths'
import { Logger } from './logger'
import type { FileInfo, StorageProvider } from './storage'

export interface ThumbnailProvider {
  readonly name: string
  supports(file: FileInfo): boolean
  generate(context: ThumbnailContext): Promise<ThumbnailGenerateResult>
}

export interface ThumbnailContext {
  file: FileInfo
  storage: StorageProvider
  cacheKey: string
  outputBasePath: string
}

export interface ThumbnailGenerateResult {
  outputPath: string
  mimeType: string
  duration?: number
}

export type ThumbnailStatus = 'unsupported' | 'pending' | 'processing' | 'ready' | 'failed'

export interface ThumbnailResult {
  status: ThumbnailStatus
  cacheKey?: string
  path?: string
  mimeType?: string
  duration?: number
}

const THUMBNAIL_DIR = resolveFromRoot('data', 'thumbnails')
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'flv'])
const MAX_CONCURRENT_GENERATORS = 2
const THUMBNAIL_CACHE_VERSION = 'v2'
const VIDEO_THUMBNAIL_FILTER = 'scale=320:320:force_original_aspect_ratio=decrease'

function nowExpression() {
  if (db.dialect === 'mysql') return 'UTC_TIMESTAMP()'
  if (db.dialect === 'postgres') return 'CURRENT_TIMESTAMP'
  return "datetime('now')"
}

function fileExtension(filePath: string) {
  return path.extname(filePath).replace(/^\./, '').toLowerCase()
}

function runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.on('error', reject)
    child.on('close', (code) => {
      const output = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      }
      if (code === 0) {
        resolve(output)
        return
      }
      reject(new Error(`${command} exited with code ${code}: ${output.stderr || output.stdout}`))
    })
  })
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function resolveInputFile(storage: StorageProvider, filePath: string) {
  const localPath = storage.resolveLocalPath ? await storage.resolveLocalPath(filePath) : null
  if (localPath) {
    return { path: localPath, cleanup: async () => {} }
  }

  const data = await storage.download(filePath)
  const tempDir = await fs.mkdtemp(path.join(THUMBNAIL_DIR, 'source-'))
  const tempPath = path.join(tempDir, `input${path.extname(filePath) || '.bin'}`)
  await fs.writeFile(tempPath, data)
  return {
    path: tempPath,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

export class VideoThumbnailProvider implements ThumbnailProvider {
  readonly name = 'video'

  supports(file: FileInfo) {
    return file.type === 'file' && VIDEO_EXTENSIONS.has(fileExtension(file.name || file.path))
  }

  async generate(context: ThumbnailContext): Promise<ThumbnailGenerateResult> {
    await fs.mkdir(THUMBNAIL_DIR, { recursive: true })
    const input = await resolveInputFile(context.storage, context.file.path)

    try {
      const probe = await runCommand('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        input.path
      ])
      const durationSeconds = Math.max(0, Math.floor(Number.parseFloat(probe.stdout.trim()) || 0))
      const seekSeconds = durationSeconds > 30 ? Math.min(Math.floor(durationSeconds * 0.1), 60) : Math.min(3, Math.max(0, Math.floor(durationSeconds / 2)))
      const outputWebp = `${context.outputBasePath}.webp`
      const outputJpg = `${context.outputBasePath}.jpg`

      try {
        await runCommand('ffmpeg', [
          '-y',
          '-ss', String(seekSeconds),
          '-i', input.path,
          '-frames:v', '1',
          '-vf', VIDEO_THUMBNAIL_FILTER,
          '-an',
          '-f', 'webp',
          outputWebp
        ])
        return { outputPath: outputWebp, mimeType: 'image/webp', duration: durationSeconds }
      } catch (err) {
        await Logger.debug('system', 'thumbnail.ts', `WebP thumbnail generation failed, falling back to JPG: ${err instanceof Error ? err.message : String(err)}`)
      }

      await runCommand('ffmpeg', [
        '-y',
        '-ss', String(seekSeconds),
        '-i', input.path,
        '-frames:v', '1',
        '-vf', VIDEO_THUMBNAIL_FILTER,
        '-q:v', '3',
        outputJpg
      ])
      return { outputPath: outputJpg, mimeType: 'image/jpeg', duration: durationSeconds }
    } finally {
      await input.cleanup()
    }
  }
}

const providers: ThumbnailProvider[] = [
  new VideoThumbnailProvider()
]

const queuedKeys = new Set<string>()
const queue: Array<() => Promise<void>> = []
let activeGenerators = 0

export function createThumbnailCacheKey(scope: string, file: FileInfo) {
  return crypto
    .createHash('sha1')
    .update(`${THUMBNAIL_CACHE_VERSION}:${scope}:${file.path}:${file.modified}:${file.size}`)
    .digest('hex')
}

async function runNext() {
  if (activeGenerators >= MAX_CONCURRENT_GENERATORS) return
  const job = queue.shift()
  if (!job) return

  activeGenerators += 1
  try {
    await job()
  } finally {
    activeGenerators -= 1
    void runNext()
  }
}

function enqueue(cacheKey: string, job: () => Promise<void>) {
  if (queuedKeys.has(cacheKey)) return
  queuedKeys.add(cacheKey)
  queue.push(async () => {
    try {
      await job()
    } finally {
      queuedKeys.delete(cacheKey)
    }
  })
  void runNext()
}

function shouldEnqueue(cacheKey: string, status: string) {
  if (queuedKeys.has(cacheKey)) return false
  return status !== 'ready'
}

async function upsertPending(record: {
  cacheKey: string
  userId: number
  poolId?: number
  file: FileInfo
  provider: ThumbnailProvider
}) {
  const existing = await db.prepare('SELECT cache_key, status FROM thumbnail_cache WHERE cache_key = ?').get<{ cache_key: string; status: string }>(record.cacheKey)
  if (existing) return existing.status

  await db.prepare(`
    INSERT INTO thumbnail_cache (
      cache_key, user_id, storage_pool_id, file_path, file_modified, file_size,
      provider, status, output_path, mime_type, error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '')
  `).run(
    record.cacheKey,
    record.userId,
    record.poolId || null,
    record.file.path,
    record.file.modified,
    record.file.size,
    record.provider.name
  )
  return 'pending'
}

async function markProcessing(cacheKey: string) {
  await db.prepare(`UPDATE thumbnail_cache SET status = 'processing', updated_at = ${nowExpression()}, error = '' WHERE cache_key = ?`).run(cacheKey)
}

async function markReady(cacheKey: string, result: ThumbnailGenerateResult) {
  await db.prepare(`
    UPDATE thumbnail_cache
    SET status = 'ready', output_path = ?, mime_type = ?, duration = ?, error = '', updated_at = ${nowExpression()}
    WHERE cache_key = ?
  `).run(result.outputPath, result.mimeType, result.duration ?? null, cacheKey)
}

async function markFailed(cacheKey: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await db.prepare(`
    UPDATE thumbnail_cache
    SET status = 'failed', error = ?, updated_at = ${nowExpression()}
    WHERE cache_key = ?
  `).run(message.slice(0, 1000), cacheKey)
}

async function generateThumbnail(cacheKey: string, provider: ThumbnailProvider, storage: StorageProvider, file: FileInfo) {
  await markProcessing(cacheKey)
  try {
    const outputBasePath = path.join(THUMBNAIL_DIR, cacheKey)
    const result = await provider.generate({ file, storage, cacheKey, outputBasePath })
    await markReady(cacheKey, result)
  } catch (err) {
    await markFailed(cacheKey, err)
    await Logger.error('system', 'thumbnail.ts', 'Failed to generate thumbnail', err, { filePath: file.path, cacheKey })
  }
}

export async function getThumbnail(
  scope: string,
  userId: number,
  poolId: number | undefined,
  storage: StorageProvider,
  filePath: string
): Promise<ThumbnailResult> {
  const file = await storage.info(filePath)
  const provider = providers.find((item) => item.supports(file))
  if (!provider) {
    return { status: 'unsupported' }
  }

  const cacheKey = createThumbnailCacheKey(scope, file)
  let existing = await db.prepare('SELECT * FROM thumbnail_cache WHERE cache_key = ?').get<any>(cacheKey)
  if (existing?.status === 'ready' && existing.output_path && await fileExists(existing.output_path)) {
    return {
      status: 'ready',
      cacheKey,
      path: existing.output_path,
      mimeType: existing.mime_type || 'image/jpeg',
      duration: existing.duration == null ? undefined : Number(existing.duration)
    }
  }

  if (existing?.status === 'ready') {
    await db.prepare(`UPDATE thumbnail_cache SET status = 'pending', output_path = '', mime_type = '', updated_at = ${nowExpression()} WHERE cache_key = ?`).run(cacheKey)
    existing = { ...existing, status: 'pending', output_path: '', mime_type: '' }
  }

  const status = await upsertPending({ cacheKey, userId, poolId, file, provider })
  if (shouldEnqueue(cacheKey, status)) {
    enqueue(cacheKey, () => generateThumbnail(cacheKey, provider, storage, file))
  }

  return {
    status: status === 'failed' ? 'pending' : (status as ThumbnailStatus),
    cacheKey
  }
}

export function streamThumbnail(result: ThumbnailResult) {
  if (result.status !== 'ready' || !result.path) {
    return null
  }
  return fsSync.createReadStream(result.path)
}
