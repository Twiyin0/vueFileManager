// @ts-ignore - upyun has no type declarations
import upyun from 'upyun'
import https from 'https'
import { PassThrough } from 'stream'
import { StorageProvider, FileInfo } from './storage'

// Global HTTPS agent with keepalive for connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 60000,
})

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
  private bucket: string

  constructor(operator: string, password: string, bucket: string, endpoint: string = 'v0.api.upyun.com') {
    const service = new upyun.Service(bucket, operator, password, endpoint)
    this.client = new upyun.Client(service)
    this.bucket = bucket
    // Inject keepalive agent into the underlying axios instance
    try {
      const req = (this.client as any).req
      if (req?.defaults) {
        req.defaults.httpsAgent = httpsAgent
        req.defaults.timeout = 30000
      }
    } catch { /* ignore if internal API changes */ }
  }

  private normalizePath(filePath: string): string {
    let p = filePath.startsWith('/') ? filePath : '/' + filePath
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
    return p
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
          size: file.size || 0,
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
    await withRetry(() => this.client.putFile(remotePath, data))
  }

  async download(filePath: string): Promise<Buffer> {
    const remotePath = this.normalizePath(filePath)
    const chunks: Buffer[] = []
    const passThrough = new PassThrough()
    passThrough.on('data', (chunk: Buffer) => chunks.push(chunk))
    await withRetry(() => this.client.getFile(remotePath, passThrough))
    if (chunks.length === 0) throw new Error('文件不存在')
    return Buffer.concat(chunks)
  }

  async remove(filePath: string): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    try {
      await withRetry(() => this.client.deleteFile(remotePath))
      return
    } catch (err: any) {
      if (err.statusCode !== 404) { /* continue to dir removal */ }
    }
    try {
      const files = await this.list(filePath)
      for (const file of files) {
        await this.remove(file.path)
        await new Promise(r => setTimeout(r, 100))
      }
      await withRetry(() => this.client.deleteDir(remotePath))
    } catch (err: any) {
      if (err.statusCode === 404) return
      throw err
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const remotePath = this.normalizePath(dirPath)
    await withRetry(() => this.client.makeDir(remotePath))
  }

  async info(filePath: string): Promise<FileInfo> {
    const remotePath = this.normalizePath(filePath)
    const stat = await withRetry(() => this.client.headFile(remotePath))
    return {
      name: filePath.split('/').pop() || '',
      type: 'file',
      size: (stat as any)?.size || 0,
      modified: (stat as any)?.lastModified || new Date().toISOString(),
      path: filePath,
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await withRetry(() => this.client.headFile(this.normalizePath(filePath)))
      return true
    } catch {
      return false
    }
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'))
    const destPath = parentDir ? `${parentDir}/${newName}` : `/${newName}`
    await this.move(oldPath, destPath)
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const srcData = await this.download(srcPath)
    await this.upload(destPath, srcData)
    await this.remove(srcPath)
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcData = await this.download(srcPath)
    await this.upload(destPath, srcData)
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
      } catch { /* ignore */ }
    }

    await walk.call(this, prefix || '/')
    return results
  }
}
