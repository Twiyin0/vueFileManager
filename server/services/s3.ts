import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import path from 'path'
import { StorageProvider, FileInfo } from './storage'

export class S3Storage implements StorageProvider {
  private client: S3Client
  private bucket: string
  private prefix: string

  constructor(config: Record<string, any>) {
    this.bucket = config.s3Bucket || config.bucket || ''
    this.prefix = (config.s3Prefix || config.prefix || '').replace(/^\/+|\/+$/g, '')

    this.client = new S3Client({
      region: config.s3Region || config.region || 'us-east-1',
      endpoint: config.s3Endpoint || config.endpoint || undefined,
      forcePathStyle: config.s3ForcePathStyle ?? config.forcePathStyle ?? true,
      credentials: {
        accessKeyId: config.s3AccessKeyId || config.accessKeyId || '',
        secretAccessKey: config.s3SecretAccessKey || config.secretAccessKey || '',
      },
    })
  }

  private fullKey(filePath: string): string {
    const cleaned = filePath.replace(/^\/+/, '')
    return this.prefix ? `${this.prefix}/${cleaned}` : cleaned
  }

  private relativePath(key: string): string {
    if (this.prefix && key.startsWith(this.prefix + '/')) {
      return key.slice(this.prefix.length + 1)
    }
    return key
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  private encodeCopySource(key: string): string {
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `${this.bucket}/${encodedKey}`
  }

  async list(prefix: string): Promise<FileInfo[]> {
    const fullPrefix = this.fullKey(prefix || '')
    const delimiter = '/'
    const files: FileInfo[] = []

    let continuationToken: string | undefined
    do {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: fullPrefix ? fullPrefix + '/' : '',
        Delimiter: delimiter,
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(command)

      // 文件
      for (const obj of response.Contents || []) {
        const key = obj.Key!
        if (key === fullPrefix + '/') continue // 跳过自身
        const relPath = this.relativePath(key)
        if (!relPath) continue
        files.push({
          name: path.basename(relPath),
          type: 'file',
          size: obj.Size || 0,
          modified: obj.LastModified?.toISOString() || new Date().toISOString(),
          path: relPath,
        })
      }

      // 文件夹（公共前缀）
      for (const cp of response.CommonPrefixes || []) {
        const key = cp.Prefix!
        const relPath = this.relativePath(key.replace(/\/$/, ''))
        if (!relPath) continue
        files.push({
          name: path.basename(relPath),
          type: 'folder',
          size: 0,
          modified: new Date().toISOString(),
          path: relPath,
        })
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return files
  }

  async upload(filePath: string, data: Buffer): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(filePath),
      Body: data,
    })
    await this.client.send(command)
  }

  async uploadStream(filePath: string, stream: NodeJS.ReadableStream, size?: number): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(filePath),
      Body: stream as Readable,
      ...(typeof size === 'number' ? { ContentLength: size } : {}),
    })
    await this.client.send(command)
  }

  async download(filePath: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.fullKey(filePath),
    })
    const response = await this.client.send(command)
    return this.streamToBuffer(response.Body as Readable)
  }

  async remove(filePath: string): Promise<void> {
    const key = this.fullKey(filePath)
    // 先尝试作为文件删除
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch {}

    // 列出并删除子对象（文件夹场景）
    let continuationToken: string | undefined
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: key + '/',
        ContinuationToken: continuationToken,
      })
      const response = await this.client.send(listCommand)
      for (const obj of response.Contents || []) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key! }))
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)
  }

  async mkdir(_dirPath: string): Promise<void> {
    // S3 没有真正的文件夹概念，上传一个空对象模拟
    const key = this.fullKey(_dirPath) + '/'
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: '',
    }))
  }

  async info(filePath: string): Promise<FileInfo> {
    const key = this.fullKey(filePath)
    try {
      const command = new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      const response = await this.client.send(command)
      return {
        name: path.basename(filePath),
        type: 'file',
        size: response.ContentLength || 0,
        modified: response.LastModified?.toISOString() || new Date().toISOString(),
        path: filePath,
      }
    } catch {
      // 可能是文件夹
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: key + '/',
        MaxKeys: 1,
      })
      const response = await this.client.send(listCommand)
      if ((response.Contents || []).length > 0 || (response.CommonPrefixes || []).length > 0) {
        return {
          name: path.basename(filePath),
          type: 'folder',
          size: 0,
          modified: new Date().toISOString(),
          path: filePath,
        }
      }
      throw new Error('文件不存在')
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
    const oldKey = this.fullKey(oldPath)
    const dir = path.dirname(oldPath)
    const newPath = dir === '.' ? newName : `${dir}/${newName}`
    const newKey = this.fullKey(newPath)

    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: this.encodeCopySource(oldKey),
      Key: newKey,
    }))
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: oldKey }))
  }

  async move(srcPath: string, destPath: string): Promise<void> {
    const srcKey = this.fullKey(srcPath)
    const destKey = this.fullKey(destPath)

    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: this.encodeCopySource(srcKey),
      Key: destKey,
    }))
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: srcKey }))
  }

  async copy(srcPath: string, destPath: string): Promise<void> {
    const srcKey = this.fullKey(srcPath)
    const destKey = this.fullKey(destPath)

    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: this.encodeCopySource(srcKey),
      Key: destKey,
    }))
  }

  async search(prefix: string, keyword: string): Promise<FileInfo[]> {
    const allFiles = await this.list(prefix || '')
    return allFiles.filter(f => f.name.toLowerCase().includes(keyword.toLowerCase()))
  }
}
