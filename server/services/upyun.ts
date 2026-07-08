// @ts-ignore - upyun has no type declarations
import upyun from 'upyun'
import https from 'https'
import path from 'path'
import { PassThrough } from 'stream'
import { StorageProvider, FileInfo, StorageCapabilities } from './storage'

// Global HTTPS agent with keepalive for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
})

type UpyunHeadResult = false | {
  type?: 'file' | 'folder'
  size?: number
  date?: number
}

/** Retry wrapper with exponential backoff for transient Upyun errors */
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      const isRetryable =
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' ||
        err.statusCode === 429 ||
        err.statusCode === 503 ||
        err.statusCode === 504
      if (i < retries && isRetryable) {
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 500))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

export class UpyunStorage implements StorageProvider {
  private client: upyun.Client
  private serviceName: string

  constructor(operator: string, password: string, bucket: string, endpoint: string = 'v0.api.upyun.com') {
    const service = new upyun.Service(bucket, operator, password, endpoint)
    this.client = new upyun.Client(service)
    this.serviceName = bucket

    // Inject keepalive agent into the underlying axios instance
    try {
      const req = (this.client as any).req
      if (req?.defaults) {
        req.defaults.httpsAgent = httpsAgent
        req.defaults.timeout = 30000
      }
    } catch {
      // Ignore internal SDK changes.
    }
  }

  private normalizePath(filePath: string): string {
    let normalized = filePath.startsWith('/') ? filePath : `/${filePath}`
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  }

  private basename(filePath: string): string {
    const normalized = this.normalizePath(filePath)
    return normalized === '/' ? '' : path.posix.basename(normalized)
  }

  private joinPath(basePath: string, name: string): string {
    return this.normalizePath(path.posix.join(basePath, name))
  }

  private async stat(filePath: string): Promise<UpyunHeadResult> {
    return withRetry(() => this.client.headFile(this.normalizePath(filePath)))
  }

  private toFileInfo(filePath: string, stat: Exclude<UpyunHeadResult, false>): FileInfo {
    return {
      name: this.basename(filePath),
      type: stat.type === 'folder' ? 'folder' : 'file',
      size: stat.type === 'folder' ? 0 : stat.size || 0,
      modified: typeof stat.date === 'number'
        ? new Date(stat.date * 1000).toISOString()
        : new Date().toISOString(),
      path: this.normalizePath(filePath),
    }
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath)
    if (normalized === '/') return

    const parts = normalized.split('/').filter(Boolean)
    let current = ''

    for (const part of parts) {
      current += `/${part}`
      const stat = await this.stat(current)
      if (stat) {
        if (stat.type !== 'folder') {
          throw new Error('common.invalidPath')
        }
        continue
      }
      const created = await withRetry(() => this.client.makeDir(current))
      if (!created) {
        throw new Error('Failed to create directory in UpYun')
      }
    }
  }

  private async ensureParentDirectory(filePath: string): Promise<void> {
    const parentDir = path.posix.dirname(this.normalizePath(filePath))
    if (parentDir !== '/') {
      await this.ensureDirectory(parentDir)
    }
  }

  private encodeHeaderPath(filePath: string): string {
    const normalized = this.normalizePath(filePath)
    const encodedPath = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `/${this.serviceName}${encodedPath ? `/${encodedPath}` : ''}`
  }

  private async requestFileOperation(
    operation: 'copy' | 'move',
    sourcePath: string,
    targetPath: string
  ): Promise<boolean> {
    const req = (this.client as any).req
    const headerName = operation === 'copy' ? 'x-upyun-copy-source' : 'x-upyun-move-source'
    const response = await withRetry<{ status: number }>(() => req.put(targetPath, null, {
      headers: {
        [headerName]: this.encodeHeaderPath(sourcePath),
      },
    }))
    return response.status >= 200 && response.status < 300
  }

  private async moveFile(sourcePath: string, targetPath: string): Promise<void> {
    await this.ensureParentDirectory(targetPath)
    const moved = await this.requestFileOperation('move', sourcePath, targetPath)
    if (!moved) {
      throw new Error('Failed to move file in UpYun')
    }
  }

  private async copyFile(sourcePath: string, targetPath: string): Promise<void> {
    await this.ensureParentDirectory(targetPath)
    const copied = await this.requestFileOperation('copy', sourcePath, targetPath)
    if (!copied) {
      throw new Error('Failed to copy file in UpYun')
    }
  }

  private async copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
    await this.ensureDirectory(targetPath)

    const entries = await this.list(sourcePath)
    for (const entry of entries) {
      const nextTarget = this.joinPath(targetPath, entry.name)
      if (entry.type === 'folder') {
        await this.copyDirectory(entry.path, nextTarget)
      } else {
        await this.copyFile(this.normalizePath(entry.path), nextTarget)
      }
    }
  }

  private async moveDirectory(sourcePath: string, targetPath: string): Promise<void> {
    await this.copyDirectory(sourcePath, targetPath)
    await this.remove(sourcePath)
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const dirPath = this.normalizePath(prefix || '/')
    try {
      const result = await withRetry(() => this.client.listDir(dirPath))
      if (!result || !(result as any).files) return []

      const files: FileInfo[] = (result as any).files.map((file: any) => {
        const filePath = dirPath === '/' ? `/${file.name}` : `${dirPath}/${file.name}`
        return {
          name: file.name,
          type: file.type === 'F' ? 'folder' : 'file',
          size: file.type === 'F' ? 0 : file.size || 0,
          modified: file.time ? new Date(file.time * 1000).toISOString() : new Date().toISOString(),
          path: filePath,
        }
      })

      return files.sort((a: FileInfo, b: FileInfo) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch (err: any) {
      if (err.statusCode === 404) return []
      throw err
    }
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    await this.ensureParentDirectory(remotePath)
    await withRetry(() => this.client.putFile(remotePath, data))
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    await this.ensureParentDirectory(remotePath)
    await withRetry(() => this.client.putFile(remotePath, stream as any))
  }

  async download(filePath: string): Promise<Buffer> {
    const remotePath = this.normalizePath(filePath)
    const chunks: Buffer[] = []
    const passThrough = new PassThrough()
    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk))

    const result = await withRetry(() => this.client.getFile(remotePath, passThrough))
    if (!result) {
      throw new Error('common.fileNotFound')
    }

    return Buffer.concat(chunks)
  }

  async remove(filePath: string): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    const stat = await this.stat(remotePath)
    if (!stat) return

    if (stat.type === 'file') {
      const deleted = await withRetry(() => this.client.deleteFile(remotePath))
      if (!deleted) {
        throw new Error('Failed to delete file in UpYun')
      }
      return
    }

    const files = await this.list(remotePath)
    for (const file of files) {
      await this.remove(file.path)
      await new Promise(r => setTimeout(r, 100))
    }

    const deleted = await withRetry(() => this.client.deleteDir(remotePath))
    if (!deleted) {
      throw new Error('Failed to delete directory in UpYun')
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    await this.ensureDirectory(dirPath)
  }

  async info(filePath: string): Promise<FileInfo> {
    const stat = await this.stat(filePath)
    if (!stat) {
      throw new Error('common.fileNotFound')
    }
    return this.toFileInfo(filePath, stat)
  }

  async exists(filePath: string): Promise<boolean> {
    return !!(await this.stat(filePath))
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const sourcePath = this.normalizePath(oldPath)
    const parentDir = path.posix.dirname(sourcePath)
    const targetPath = parentDir === '/' ? `/${newName}` : this.joinPath(parentDir, newName)
    await this.move(sourcePath, targetPath)
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const sourcePath = this.normalizePath(srcPath)
    const targetPath = this.normalizePath(destPath)
    const stat = await this.stat(sourcePath)

    if (!stat) {
      throw new Error('common.fileNotFound')
    }
    if (sourcePath === targetPath) {
      return
    }
    if (stat.type === 'folder' && targetPath.startsWith(`${sourcePath}/`)) {
      throw new Error('common.invalidPath')
    }

    if (stat.type === 'folder') {
      await this.moveDirectory(sourcePath, targetPath)
      return
    }

    await this.moveFile(sourcePath, targetPath)
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const sourcePath = this.normalizePath(srcPath)
    const targetPath = this.normalizePath(destPath)
    const stat = await this.stat(sourcePath)

    if (!stat) {
      throw new Error('common.fileNotFound')
    }
    if (sourcePath === targetPath) {
      return
    }
    if (stat.type === 'folder' && targetPath.startsWith(`${sourcePath}/`)) {
      throw new Error('common.invalidPath')
    }

    if (stat.type === 'folder') {
      await this.copyDirectory(sourcePath, targetPath)
      return
    }

    await this.copyFile(sourcePath, targetPath)
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const lowerKeyword = keyword.toLowerCase()

    async function walk(this: UpyunStorage, dir: string) {
      try {
        const files = await this.list(dir)
        for (const file of files) {
          if (file.name.toLowerCase().includes(lowerKeyword)) results.push(file)
          if (file.type === 'folder' && results.length < 100) await walk.call(this, file.path)
          if (results.length >= 100) break
        }
      } catch {
        // Ignore search misses under partial permission or transient list failures.
      }
    }

    await walk.call(this, prefix || '/')
    return results
  }

  async getCapabilities(): Promise<StorageCapabilities> {
    return {
      nativeDirectoryRename: false,
      nativeDirectoryMove: false,
      nativeDirectoryCopy: false,
      recommendedAsyncTreeThreshold: 80,
    }
  }
}
