import path from 'path'
import { Readable } from 'stream'
import SftpClient from 'ssh2-sftp-client'
import { StorageProvider, FileInfo } from './storage'

interface SftpListItem {
  name: string
  type: string
  size?: number
  modifyTime?: number
}

export class SftpStorage implements StorageProvider {
  private config: {
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    rootPath: string
  }

  constructor(config: Record<string, any>) {
    this.config = {
      host: config.sftpHost || config.host || '127.0.0.1',
      port: Number(config.sftpPort || config.port || 22),
      username: config.sftpUser || config.username || 'root',
      password: config.sftpPassword || config.password || undefined,
      privateKey: config.sftpPrivateKey || config.privateKey || undefined,
      rootPath: config.sftpRootPath || config.rootPath || '/'
    }
  }

  private async connect() {
    const client = new SftpClient()
    await client.connect({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      privateKey: this.config.privateKey
    })
    return client
  }

  private fullPath(filePath: string) {
    const cleaned = (filePath || '').replace(/^\/+/, '')
    return path.posix.join(this.config.rootPath, cleaned)
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(prefix || '')
      const items = await client.list(remotePath) as SftpListItem[]
      return items
        .filter(item => item.name !== '.' && item.name !== '..')
        .map(item => ({
          name: item.name,
          type: item.type === 'd' ? 'folder' : 'file',
          size: item.size || 0,
          modified: item.modifyTime ? new Date(item.modifyTime).toISOString() : new Date().toISOString(),
          path: prefix ? `${prefix}/${item.name}` : item.name
        }))
    } finally {
      await client.end()
    }
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      await client.mkdir(path.posix.dirname(remotePath), true)
      await client.put(data, remotePath)
    } finally {
      await client.end()
    }
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      await client.mkdir(path.posix.dirname(remotePath), true)
      await client.put(stream as Readable, remotePath)
    } finally {
      await client.end()
    }
  }

  async download(filePath: string): Promise<Buffer> {
    const client = await this.connect()
    try {
      const data = await client.get(this.fullPath(filePath), undefined, {})
      if (Buffer.isBuffer(data)) {
        return data
      }
      if (typeof data === 'string') {
        return Buffer.from(data)
      }
      throw new Error('Unsupported SFTP download result')
    } finally {
      await client.end()
    }
  }

  async remove(filePath: string): Promise<void> {
    const client = await this.connect()
    try {
      const remotePath = this.fullPath(filePath)
      const exists = await client.exists(remotePath)
      if (exists === 'd') {
        await client.rmdir(remotePath, true)
      } else if (exists) {
        await client.delete(remotePath)
      }
    } finally {
      await client.end()
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const client = await this.connect()
    try {
      await client.mkdir(this.fullPath(dirPath), true)
    } finally {
      await client.end()
    }
  }

  async info(filePath: string): Promise<FileInfo> {
    const client = await this.connect()
    try {
      const stat = await client.stat(this.fullPath(filePath))
      return {
        name: path.posix.basename(filePath),
        type: stat.isDirectory ? 'folder' : 'file',
        size: stat.size || 0,
        modified: stat.modifyTime ? new Date(stat.modifyTime).toISOString() : new Date().toISOString(),
        path: filePath
      }
    } finally {
      await client.end()
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const client = await this.connect()
    try {
      return !!(await client.exists(this.fullPath(filePath)))
    } finally {
      await client.end()
    }
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const client = await this.connect()
    try {
      const oldRemote = this.fullPath(oldPath)
      const newRemote = path.posix.join(path.posix.dirname(oldRemote), newName)
      await client.rename(oldRemote, newRemote)
    } finally {
      await client.end()
    }
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const client = await this.connect()
    try {
      const srcRemote = this.fullPath(srcPath)
      const destRemote = this.fullPath(destPath)
      await client.mkdir(path.posix.dirname(destRemote), true)
      await client.rename(srcRemote, destRemote)
    } finally {
      await client.end()
    }
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const data = await this.download(srcPath)
    await this.upload(destPath, data)
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const lowerKeyword = keyword.toLowerCase()
    const client = await this.connect()

    const walk = async (relativePath: string) => {
      const items = await client.list(this.fullPath(relativePath)) as SftpListItem[]
      for (const item of items) {
        if (item.name === '.' || item.name === '..') continue
        const itemPath = relativePath ? `${relativePath}/${item.name}` : item.name
        if (item.name.toLowerCase().includes(lowerKeyword)) {
          results.push({
            name: item.name,
            type: item.type === 'd' ? 'folder' : 'file',
            size: item.size || 0,
            modified: item.modifyTime ? new Date(item.modifyTime).toISOString() : new Date().toISOString(),
            path: itemPath
          })
        }
        if (item.type === 'd' && results.length < 100) {
          await walk(itemPath)
        }
      }
    }

    try {
      await walk(prefix || '')
      return results
    } finally {
      await client.end()
    }
  }
}
