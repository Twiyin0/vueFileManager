// Storage abstraction interface.

export interface FileInfo {
  name: string
  type: 'file' | 'folder'
  size: number
  modified: string
  path: string
}

export interface StorageProvider {
  // List files.
  list(prefix: string): Promise<FileInfo[]>
  // Upload a file.
  upload(filePath: string, data: Buffer): Promise<void>
  // Upload a stream when supported to avoid extra temp writes for large files.
  uploadStream?(filePath: string, stream: NodeJS.ReadableStream, size?: number): Promise<void>
  // Download a file.
  download(filePath: string): Promise<Buffer>
  // Remove a file or folder.
  remove(filePath: string): Promise<void>
  // Create a folder.
  mkdir(dirPath: string): Promise<void>
  // Read file metadata.
  info(filePath: string): Promise<FileInfo>
  // Check whether a path exists.
  exists(filePath: string): Promise<boolean>
  // Rename an item.
  rename(oldPath: string, newName: string): Promise<void>
  // Move an item.
  move(srcPath: string, destPath: string): Promise<void>
  // Copy an item.
  copy(srcPath: string, destPath: string): Promise<void>
  // Search recursively.
  search(prefix: string, keyword: string): Promise<FileInfo[]>
  resolveLocalPath?(filePath: string): Promise<string | null>
}
