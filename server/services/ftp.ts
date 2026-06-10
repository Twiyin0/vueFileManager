import * as ftp from 'basic-ftp'
import path from 'path'
import { PassThrough, Readable } from 'stream'
import { StorageProvider, FileInfo } from './storage'

export class FtpStorage implements StorageProvider {
  private config: {
    host: string
    port: number
    user: string
    password: string
    remotePath: string
  }
  private basePath: string

  constructor(config: Record<string, any>) {
    this.config = {
      host: config.ftpHost || config.host || 'localhost',
      port: config.ftpPort || config.port || 21,
      user: config.ftpUser || config.user || 'anonymous',
      password: config.ftpPassword || config.password || '',
      remotePath: config.ftpRemotePath || config.remotePath || '/',
    }
    this.basePath = this.config.remotePath
  }

  private async connect(): Promise<ftp.Client> {
    const client = new ftp.Client()
    client.ftp.verbose = false
    await client.access({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
    })
    return client
  }

  private fullPath(filePath: string): string {
    const cleaned = filePath.replace(/^\/+/, '')
    return path.posix.join(this.basePath, cleaned)
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(prefix || '')
      const items = await client.list(remotePath)
      return items
        .filter(item => item.name !== '.' && item.name !== '..')
        .map(item => ({
          name: item.name,
          type: item.isDirectory ? 'folder' as const : 'file' as const,
          size: item.size,
          modified: item.modifiedAt?.toISOString() || new Date().toISOString(),
          path: prefix ? `${prefix}/${item.name}` : item.name,
        }))
    } finally {
      client.close()
    }
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      // 确保父目录存在
      const dir = path.posix.dirname(remotePath)
      await client.ensureDir(dir)
      const readable = Readable.from(data)
      await client.uploadFrom(readable, remotePath)
    } finally {
      client.close()
    }
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      const dir = path.posix.dirname(remotePath)
      await client.ensureDir(dir)
      await client.uploadFrom(stream as Readable, remotePath)
    } finally {
      client.close()
    }
  }

  async download(filePath: string): Promise<Buffer> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      const chunks: Buffer[] = []
      const passThrough = new PassThrough()
      passThrough.on('data', (chunk: Buffer) => chunks.push(chunk))
      await client.downloadTo(passThrough, remotePath)
      return Buffer.concat(chunks)
    } finally {
      client.close()
    }
  }

  async remove(filePath: string): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      try {
        await client.remove(remotePath)
      } catch {
        // 可能是目录
        await client.removeDir(remotePath)
      }
    } finally {
      client.close()
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(dirPath)
      await client.ensureDir(remotePath)
    } finally {
      client.close()
    }
  }

  async info(filePath: string): Promise<FileInfo> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      const parentDir = path.posix.dirname(remotePath)
      const fileName = path.posix.basename(remotePath)
      const items = await client.list(parentDir)
      const item = items.find(i => i.name === fileName)
      if (!item) throw new Error('文件不存在')
      return {
        name: item.name,
        type: item.isDirectory ? 'folder' : 'file',
        size: item.size,
        modified: item.modifiedAt?.toISOString() || new Date().toISOString(),
        path: filePath,
      }
    } finally {
      client.close()
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await this.info(filePath)
      return true
    } catch {
      return false
    }
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const client = await this.connect()
    try {
      const remoteOld = this.fullPath(oldPath)
      const dir = path.posix.dirname(remoteOld)
      const remoteNew = path.posix.join(dir, newName)
      await client.rename(remoteOld, remoteNew)
    } finally {
      client.close()
    }
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const client = await this.connect()
    try {
      const remoteSrc = this.fullPath(srcPath)
      const remoteDest = this.fullPath(destPath)
      const dir = path.posix.dirname(remoteDest)
      await client.ensureDir(dir)
      await client.rename(remoteSrc, remoteDest)
    } finally {
      client.close()
    }
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const data = await this.download(srcPath)
    await this.upload(destPath, data)
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const client = await this.connect()
    try {
      await this.searchRecursive(client, this.fullPath(prefix || ''), keyword, results, prefix || '')
    } finally {
      client.close()
    }
    return results
  }

  private async searchRecursive(
    client: ftp.Client,
    remotePath: string,
    keyword: string,
    results: FileInfo[],
    relativePath: string
  ): Promise<void> {
    try {
      const items = await client.list(remotePath)
      for (const item of items) {
        if (item.name === '.' || item.name === '..') continue
        const itemRelPath = relativePath ? `${relativePath}/${item.name}` : item.name
        if (item.name.toLowerCase().includes(keyword.toLowerCase())) {
          results.push({
            name: item.name,
            type: item.isDirectory ? 'folder' : 'file',
            size: item.size,
            modified: item.modifiedAt?.toISOString() || new Date().toISOString(),
            path: itemRelPath,
          })
        }
        if (item.isDirectory) {
          await this.searchRecursive(
            client,
            path.posix.join(remotePath, item.name),
            keyword,
            results,
            itemRelPath
          )
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }
}
