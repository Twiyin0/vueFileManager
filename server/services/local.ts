import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { StorageProvider, FileInfo } from './storage'

export class LocalStorage implements StorageProvider {
  private basePath: string

  constructor(basePath: string, userPrefix?: string) {
    // 如果提供了 userPrefix，将 basePath 设为 basePath/userPrefix/（用户隔离）
    this.basePath = userPrefix
      ? path.resolve(basePath, userPrefix)
      : path.resolve(basePath)
    // 确保基础目录存在
    fsSync.mkdirSync(this.basePath, { recursive: true })
  }

  /** 确保子目录存在（供 PrefixStorage rootPath 使用） */
  ensureSubdir(subdir: string): void {
    // 去掉开头的 /，避免 path.resolve 当成绝对路径
    const clean = subdir.replace(/^\/+/, '')
    if (!clean) return
    const full = path.resolve(this.basePath, clean)
    if (full.startsWith(this.basePath)) {
      fsSync.mkdirSync(full, { recursive: true })
    }
  }

  private fullPath(filePath: string): string {
    // 去掉开头的 /，避免 path.resolve 当成绝对路径
    const clean = filePath.replace(/^\/+/, '')
    const resolved = path.resolve(this.basePath, clean)
    // 安全检查：防止路径遍历
    const baseWithSlash = this.basePath.endsWith(path.sep) ? this.basePath : this.basePath + path.sep
    if (resolved !== this.basePath && !resolved.startsWith(baseWithSlash)) {
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
        // macOS 使用 NFD 编码中文文件名，统一标准化为 NFC
        const normalizedName = entry.name.normalize('NFC')
        files.push({
          name: normalizedName,
          type: entry.isDirectory() ? 'folder' : 'file',
          size: stat.size,
          modified: stat.mtime.toISOString(),
          path: path.join(prefix || '', normalizedName).replace(/\\/g, '/')
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
    let fullPath = this.fullPath(filePath)
    if (await this.exists(filePath)) {
      fullPath = await this.resolvePath(filePath)
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, data)
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream): Promise<void> {
    let fullPath = this.fullPath(filePath)
    if (await this.exists(filePath)) {
      fullPath = await this.resolvePath(filePath)
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    const writeStream = fsSync.createWriteStream(fullPath)
    await pipeline(stream, writeStream)
  }

  async download(filePath: string): Promise<Buffer> {
    const fullPath = await this.resolvePath(filePath)
    return await fs.readFile(fullPath)
  }

  /** Resolve a possibly-mangled path by matching against actual filesystem entries */
  async resolvePath(filePath: string): Promise<string> {
    const direct = this.fullPath(filePath)
    try { await fs.access(direct); return direct } catch {}
    // ENOENT — try matching against sibling files (fixes encoding mismatches on external drives)
    const dir = path.dirname(direct)
    const targetName = path.basename(direct)
    try {
      const entries = await fs.readdir(dir)
      // Try exact match first, then case-insensitive, then NFC/NFD normalization
      let match = entries.find(e => e === targetName)
      if (!match) match = entries.find(e => e.toLowerCase() === targetName.toLowerCase())
      if (!match) match = entries.find(e => e.normalize('NFC') === targetName.normalize('NFC'))
      if (!match) match = entries.find(e => e.normalize('NFD') === targetName.normalize('NFD'))
      if (match) return path.join(dir, match)
    } catch {}
    return direct // fall through — let the original error surface
  }

  async remove(filePath: string): Promise<void> {
    const fullPath = await this.resolvePath(filePath)
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
    const fullPath = await this.resolvePath(filePath)
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
      const fullPath = await this.resolvePath(filePath)
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }

  async rename(oldPath: string, newName: string): Promise<void> {
    const fullOld = await this.resolvePath(oldPath)
    const parentDir = path.dirname(fullOld)
    const fullNew = path.join(parentDir, newName)
    if (!fullNew.startsWith(this.basePath)) throw new Error('路径越界')
    await fs.rename(fullOld, fullNew)
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const fullSrc = await this.resolvePath(srcPath)
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
  async resolveLocalPath(filePath: string): Promise<string | null> {
    return this.resolvePath(filePath)
  }
}
