import { StorageProvider, FileInfo } from './storage'

/**
 * 路径前缀包装器：将所有操作限定在存储的某个子目录下
 * 例如 prefix = '/my-app'，则 list('') 实际列出 '/my-app' 下的内容，
 * 返回的 path 已去掉前缀，对客户端透明
 */
export class PrefixStorage implements StorageProvider {
  private inner: StorageProvider
  private prefix: string

  constructor(inner: StorageProvider, prefix: string) {
    this.inner = inner
    // 规范化前缀：以 / 开头，去掉尾部 /
    this.prefix = prefix.replace(/\/+$/, '') || ''
  }

  private withPrefix(filePath: string): string {
    const p = filePath.startsWith('/') ? filePath : `/${filePath}`
    return this.prefix + p
  }

  private stripPrefix(filePath: string): string {
    if (this.prefix && filePath.startsWith(this.prefix)) {
      const rest = filePath.slice(this.prefix.length)
      return rest.startsWith('/') ? rest : `/${rest}`
    }
    return filePath
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const files = await this.inner.list(this.withPrefix(prefix))
    return files.map(f => ({
      ...f,
      path: this.stripPrefix(f.path)
    }))
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    return this.inner.upload(this.withPrefix(filePath), data)
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream, size?: number): Promise<void> {
    if (!this.inner.uploadStream) {
      throw new Error('当前存储不支持流式上传')
    }
    return this.inner.uploadStream(this.withPrefix(filePath), stream, size)
  }

  async download(filePath: string): Promise<Buffer> {
    return this.inner.download(this.withPrefix(filePath))
  }

  async remove(filePath: string): Promise<void> {
    return this.inner.remove(this.withPrefix(filePath))
  }

  async mkdir(dirPath: string): Promise<void> {
    return this.inner.mkdir(this.withPrefix(dirPath))
  }

  async info(filePath: string): Promise<FileInfo> {
    const info = await this.inner.info(this.withPrefix(filePath))
    return { ...info, path: this.stripPrefix(info.path) }
  }

  async exists(filePath: string): Promise<boolean> {
    return this.inner.exists(this.withPrefix(filePath))
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    return this.inner.rename(this.withPrefix(oldPath), newName)
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    return this.inner.move(this.withPrefix(srcPath), this.withPrefix(destPath))
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    return this.inner.copy(this.withPrefix(srcPath), this.withPrefix(destPath))
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const results = await this.inner.search(this.withPrefix(prefix), keyword)
    return results.map(f => ({
      ...f,
      path: this.stripPrefix(f.path)
    }))
  }
  async resolveLocalPath(filePath: string): Promise<string | null> {
    if (!this.inner.resolveLocalPath) {
      return null
    }
    return this.inner.resolveLocalPath(this.withPrefix(filePath))
  }
}
