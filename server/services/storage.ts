// 存储抽象层接口

export interface FileInfo {
  name: string
  type: 'file' | 'folder'
  size: number
  modified: string
  path: string
}

export interface StorageProvider {
  // 文件列表
  list(prefix: string): Promise<FileInfo[]>
  // 上传文件
  upload(filePath: string, data: Buffer): Promise<void>
  // 流式上传文件（可选，用于减少大文件二次落盘/读回）
  uploadStream?(filePath: string, stream: NodeJS.ReadableStream, size?: number): Promise<void>
  // 下载文件
  download(filePath: string): Promise<Buffer>
  // 删除文件/文件夹
  remove(filePath: string): Promise<void>
  // 创建文件夹
  mkdir(dirPath: string): Promise<void>
  // 获取文件信息
  info(filePath: string): Promise<FileInfo>
  // 检查路径是否存在
  exists(filePath: string): Promise<boolean>
  // 重命名
  rename(oldPath: string, newName: string): Promise<void>
  // 移动
  move(srcPath: string, destPath: string): Promise<void>
  // 复制
  copy(srcPath: string, destPath: string): Promise<void>
  // 搜索（递归）
  search(prefix: string, keyword: string): Promise<FileInfo[]>
  resolveLocalPath?(filePath: string): Promise<string | null>
}
