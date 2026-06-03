import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { StorageProvider, FileInfo } from './storage'

export class LocalStorage implements StorageProvider {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath)
    // 确保基础目录存在
    fsSync.mkdirSync(this.basePath, { recursive: true })
  }

  private fullPath(filePath: string): string {
    const resolved = path.resolve(this.basePath, filePath)
    // 安全检查：防止路径遍历
    if (!resolved.startsWith(this.basePath)) {
      throw new Error('路径越界')
    }
    return resolved
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const dirPath = this.fullPath(prefix || '')
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })
      const files: FileInfo[] = []

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        const stat = await fs.stat(fullPath)
        files.push({
          name: entry.name,
          type: entry.isDirectory() ? 'folder' : 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          path: path.join(prefix || '', entry.name)
        })
      }

      // 排序：文件夹在前，然后按名称
      return files.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch (err: any) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const fullPath = this.fullPath(filePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, data)
  }

  async download(filePath: string): Promise<Buffer> {
    const fullPath = this.fullPath(filePath)
    return await fs.readFile(fullPath)
  }

  async remove(filePath: string): Promise<void> {
    const fullPath = this.fullPath(filePath)
    const stat = await fs.stat(fullPath)
    if (stat.isDirectory()) {
      await fs.rm(fullPath, { recursive: true })
    } else {
      await fs.unlink(fullPath)
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const fullPath = this.fullPath(dirPath)
    await fs.mkdir(fullPath, { recursive: true })
  }

  async info(filePath: string): Promise<FileInfo> {
    const fullPath = this.fullPath(filePath)
    const stat = await fs.stat(fullPath)
    return {
      name: path.basename(filePath),
      type: stat.isDirectory() ? 'folder' : 'file',
      size: stat.size,
      modified: stat.mtime.toISOString(),
      path: filePath
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(filePath))
      return true
    } catch {
      return false
    }
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const fullOld = this.fullPath(oldPath)
    const parentDir = path.dirname(fullOld)
    const fullNew = path.join(parentDir, newName)
    if (!fullNew.startsWith(this.basePath)) throw new Error('路径越界')
    await fs.rename(fullOld, fullNew)
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const fullSrc = this.fullPath(srcPath)
    const fullDest = this.fullPath(destPath)
    await fs.mkdir(path.dirname(fullDest), { recursive: true })
    await fs.rename(fullSrc, fullDest)
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const fullSrc = this.fullPath(srcPath)
    const fullDest = this.fullPath(destPath)
    const stat = await fs.stat(fullSrc)
    if (stat.isDirectory()) {
      await fs.mkdir(fullDest, { recursive: true })
      const entries = await fs.readdir(fullSrc, { withFileTypes: true })
      for (const entry of entries) {
        await this.copy(
          path.join(srcPath, entry.name),
          path.join(destPath, entry.name)
        )
      }
    } else {
      await fs.mkdir(path.dirname(fullDest), { recursive: true })
      await fs.copyFile(fullSrc, fullDest)
    }
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const results: FileInfo[] = []
    const searchDir = this.fullPath(prefix || '')
    const lowerKeyword = keyword.toLowerCase()

    async function walk(dir: string, relBase: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name
          if (entry.name.toLowerCase().includes(lowerKeyword)) {
            const stat = await fs.stat(fullPath)
            results.push({
              name: entry.name,
              type: entry.isDirectory() ? 'folder' : 'file',
              size: stat.size,
              modified: stat.mtime.toISOString(),
              path: relPath
            })
          }
          if (entry.isDirectory()) {
            await walk(fullPath, relPath)
          }
        }
      } catch { /* 忽略无权限的目录 */ }
    }

    await walk(searchDir, prefix || '')
    return results.slice(0, 100) // 限制返回数量
  }
}
