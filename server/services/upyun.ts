import upyun from 'upyun'
import { StorageProvider, FileInfo } from './storage'

export class UpyunStorage implements StorageProvider {
  private client: upyun.Client
  private bucket: string

  constructor(operator: string, password: string, bucket: string, endpoint: string = 'v0.api.upyun.com') {
    const service = new upyun.Service(bucket, operator, password, endpoint)
    this.client = new upyun.Client(service)
    this.bucket = bucket
  }

  private normalizePath(filePath: string): string {
    // 确保路径以 / 开头，不以 / 结尾（目录除外）
    let p = filePath.startsWith('/') ? filePath : '/' + filePath
    // 移除尾部 / (但如果是根路径则保留)
    if (p.length > 1 && p.endsWith('/')) {
      p = p.slice(0, -1)
    }
    return p
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const dirPath = this.normalizePath(prefix || '/')
    try {
      const result = await this.client.listDir(dirPath)
      if (!result || !result.files) return []

      const files: FileInfo[] = result.files.map((file: any) => {
        const filePath = dirPath === '/' ? `/${file.name}` : `${dirPath}/${file.name}`
        return {
          name: file.name,
          type: file.type === 'F' ? 'folder' : 'file',
          size: file.size || 0,
          modified: file.time ? new Date(file.time * 1000).toISOString() : new Date().toISOString(),
          path: filePath
        }
      })

      return files.sort((a: FileInfo, b: FileInfo) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch (err: any) {
      // 如果目录不存在返回空数组
      if (err.statusCode === 404) return []
      throw err
    }
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    await this.client.putFile(remotePath, data)
  }

  async download(filePath: string): Promise<Buffer> {
    const remotePath = this.normalizePath(filePath)
    const data = await this.client.getFile(remotePath)
    if (!data) throw new Error('文件不存在')
    return Buffer.isBuffer(data) ? data : Buffer.from(data)
  }

  async remove(filePath: string): Promise<void> {
    const remotePath = this.normalizePath(filePath)
    // 先尝试作为文件删除
    try {
      await this.client.deleteFile(remotePath)
      return
    } catch (err: any) {
      // 如果是 404，文件不存在，继续尝试目录
      if (err.statusCode !== 404) {
        // 不是 404 错误，可能是其他问题，但继续尝试目录删除
      }
    }
    // 作为目录删除：先递归删除内容，再删除空目录
    try {
      const files = await this.list(filePath)
      for (const file of files) {
        await this.remove(file.path)
        // 添加小延迟避免限流
        await new Promise(r => setTimeout(r, 100))
      }
      await this.client.deleteDir(remotePath)
    } catch (err: any) {
      // 如果目录不存在（404），视为成功
      if (err.statusCode === 404) return
      throw err
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const remotePath = this.normalizePath(dirPath)
    await this.client.makeDir(remotePath)
  }

  async info(filePath: string): Promise<FileInfo> {
    const remotePath = this.normalizePath(filePath)
    const stat = await this.client.headFile(remotePath)
    return {
      name: filePath.split('/').pop() || '',
      type: 'file', // headFile 通常用于文件
      size: (stat as any)?.size || 0,
      modified: (stat as any)?.lastModified || new Date().toISOString(),
      path: filePath
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const remotePath = this.normalizePath(filePath)
      await this.client.headFile(remotePath)
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
          if (file.name.toLowerCase().includes(lowerKeyword)) {
            results.push(file)
          }
          if (file.type === 'folder' && results.length < 100) {
            await walk.call(this, file.path)
          }
          if (results.length >= 100) break
        }
      } catch { /* 忽略错误 */ }
    }

    await walk.call(this, prefix || '/')
    return results
  }
}
