import { StorageProvider, FileInfo, StorageCapabilities } from './storage'
import { normalizeStoragePath, sanitizeUploadFileName } from '../routes/files/shared'

/**
 * Scope all operations to a fixed subdirectory of the underlying storage.
 * For example, prefix = '/my-app' makes list('') resolve within '/my-app',
 * while returned paths remain transparent to callers.
 */
export class PrefixStorage implements StorageProvider {
  private inner: StorageProvider
  private prefix: string

  constructor(inner: StorageProvider, prefix: string) {
    this.inner = inner
    // Normalize the prefix and trim trailing slashes.
    this.prefix = prefix.replace(/\/+$/, '') || ''
  }

  private withPrefix(filePath: string): string {
    const normalized = normalizeStoragePath(filePath || '')
    const p = normalized ? `/${normalized}` : '/'
    return this.prefix + p
  }

  private stripPrefix(filePath: string): string {
    let stripped = filePath
    if (this.prefix && filePath.startsWith(this.prefix)) {
      const rest = filePath.slice(this.prefix.length)
      stripped = rest.startsWith('/') ? rest.slice(1) : rest
    } else if (filePath.startsWith('/')) {
      stripped = filePath.slice(1)
    }
    return normalizeStoragePath(stripped)
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
      throw new Error('Streaming uploads are not supported by the current storage backend')
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
    const sanitizedName = sanitizeUploadFileName(newName)
    if (!sanitizedName || sanitizedName === '.' || sanitizedName === '..') {
      throw new Error('file.invalidFileName')
    }
    return this.inner.rename(this.withPrefix(oldPath), sanitizedName)
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

  async getCapabilities(): Promise<StorageCapabilities> {
    if (!this.inner.getCapabilities) {
      return {
        nativeDirectoryRename: true,
        nativeDirectoryMove: true,
        nativeDirectoryCopy: true,
        recommendedAsyncTreeThreshold: 200,
      }
    }
    return this.inner.getCapabilities()
  }

  async resolveLocalPath(filePath: string): Promise<string | null> {
    if (!this.inner.resolveLocalPath) {
      return null
    }
    return this.inner.resolveLocalPath(this.withPrefix(filePath))
  }
}
