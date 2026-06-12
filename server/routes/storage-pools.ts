import { Router, Response } from 'express'
import path from 'path'
import db from '../db'
import config from '../config'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'

const router = Router()

function maskSecrets(rawConfig: Record<string, any>) {
  const cfg = { ...rawConfig }
  if (cfg.upyunPassword) cfg.upyunPassword = '******'
  if (cfg.ftpPassword) cfg.ftpPassword = '******'
  if (cfg.s3SecretAccessKey) cfg.s3SecretAccessKey = '******'
  if (cfg.sftpPassword) cfg.sftpPassword = '******'
  if (cfg.sftpPrivateKey) cfg.sftpPrivateKey = '*** hidden ***'
  return cfg
}

function validateStorageConfig(storageType: string, storageConfig: Record<string, any>) {
  if (!['local', 'upyun', 'ftp', 's3', 'sftp'].includes(storageType)) {
    throw new Error('不支持的存储类型')
  }

  if (storageType === 'upyun') {
    if (!storageConfig.upyunOperator || !storageConfig.upyunPassword || !storageConfig.upyunBucket) {
      throw new Error('又拍云存储需要填写操作员、密码和服务名')
    }
  }

  if (storageType === 'ftp') {
    if (!storageConfig.ftpHost) {
      throw new Error('FTP 存储需要填写主机地址')
    }
  }

  if (storageType === 'sftp') {
    if (!storageConfig.sftpHost || !storageConfig.sftpUser) {
      throw new Error('SFTP 存储需要填写主机地址和用户名')
    }
    if (!storageConfig.sftpPassword && !storageConfig.sftpPrivateKey) {
      throw new Error('SFTP 存储需要密码或私钥')
    }
  }

  if (storageType === 's3') {
    if (!storageConfig.s3Bucket) {
      throw new Error('S3 存储需要填写 Bucket 名称')
    }
    if (!storageConfig.s3AccessKeyId || !storageConfig.s3SecretAccessKey) {
      throw new Error('S3 存储需要填写 Access Key')
    }
  }
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pools = await db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId!) as any[]

    const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
    const username = user?.username || ''

    const safePools = pools.map(pool => {
      const cfg = maskSecrets(JSON.parse(pool.config || '{}'))
      let resolvedPath = ''

      if (pool.storage_type === 'local') {
        const base = path.resolve(config.storage_root || './uploads', username)
        resolvedPath = cfg.rootPath && cfg.rootPath !== '/'
          ? path.join(base, cfg.rootPath)
          : base
      }

      return {
        id: pool.id,
        name: pool.name,
        storageType: pool.storage_type,
        isDefault: !!pool.is_default,
        config: cfg,
        resolvedPath,
        createdAt: pool.created_at
      }
    })

    res.json({ pools: safePools })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, storageType, config: storageConfig } = req.body

    if (!name || !storageType || !storageConfig) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    validateStorageConfig(storageType, storageConfig)

    const existingPools = await db.prepare('SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?').get(req.userId!) as any
    const isFirst = existingPools.count === 0

    const result = await db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.userId!,
      name,
      storageType,
      isFirst ? 1 : 0,
      JSON.stringify(storageConfig)
    )

    clearStorageCache(req.userId!)

    res.json({
      message: '存储池创建成功',
      pool: {
        id: result.lastInsertRowid,
        name,
        storageType,
        isDefault: isFirst,
        config: maskSecrets(storageConfig)
      }
    })
  } catch (err: any) {
    res.status(err.message === '不支持的存储类型' ? 400 : 500).json({ error: err.message })
  }
})

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { name, storageType, config: nextConfig } = req.body

    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    const mergedConfig = nextConfig ? { ...JSON.parse(pool.config || '{}'), ...nextConfig } : undefined
    if (storageType && mergedConfig) {
      validateStorageConfig(storageType, mergedConfig)
    }

    if (mergedConfig) {
      if (nextConfig.upyunPassword === '******' || !nextConfig.upyunPassword) {
        mergedConfig.upyunPassword = JSON.parse(pool.config || '{}').upyunPassword
      }
      if (nextConfig.ftpPassword === '******' || !nextConfig.ftpPassword) {
        mergedConfig.ftpPassword = JSON.parse(pool.config || '{}').ftpPassword
      }
      if (nextConfig.s3SecretAccessKey === '******' || !nextConfig.s3SecretAccessKey) {
        mergedConfig.s3SecretAccessKey = JSON.parse(pool.config || '{}').s3SecretAccessKey
      }
      if (nextConfig.sftpPassword === '******' || !nextConfig.sftpPassword) {
        mergedConfig.sftpPassword = JSON.parse(pool.config || '{}').sftpPassword
      }
      if (nextConfig.sftpPrivateKey === '*** hidden ***' || !nextConfig.sftpPrivateKey) {
        mergedConfig.sftpPrivateKey = JSON.parse(pool.config || '{}').sftpPrivateKey
      }
    }

    const updates: string[] = []
    const values: any[] = []

    if (name !== undefined) {
      updates.push('name = ?')
      values.push(name)
    }
    if (storageType !== undefined) {
      updates.push('storage_type = ?')
      values.push(storageType)
    }
    if (mergedConfig !== undefined) {
      updates.push('config = ?')
      values.push(JSON.stringify(mergedConfig))
    }

    if (updates.length > 0) {
      values.push(id, req.userId!)
      await db.prepare(`UPDATE storage_pools SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
      clearStorageCache(req.userId!)
    }

    res.json({ message: '存储池更新成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }
    if (pool.is_default) {
      return res.status(400).json({ error: '不能删除默认存储池，请先设置其他存储池为默认' })
    }

    await db.prepare('DELETE FROM storage_pools WHERE id = ? AND user_id = ?').run(id, req.userId!)
    clearStorageCache(req.userId!)

    res.json({ message: '存储池删除成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/batch-delete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (ids.length === 0) {
      return res.status(400).json({ error: '缺少存储池 ID 列表' })
    }

    const deletedIds: number[] = []
    const errors: string[] = []

    for (const rawId of ids) {
      const id = Number(rawId)
      if (!Number.isInteger(id) || id <= 0) {
        errors.push(`无效的存储池 ID: ${rawId}`)
        continue
      }

      const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
      if (!pool) {
        errors.push(`存储池不存在: #${id}`)
        continue
      }
      if (pool.is_default) {
        errors.push(`不能删除默认存储池 ${pool.name}`)
        continue
      }

      await db.prepare('DELETE FROM storage_pools WHERE id = ? AND user_id = ?').run(id, req.userId!)
      deletedIds.push(id)
    }

    if (deletedIds.length > 0) {
      clearStorageCache(req.userId!)
    }

    res.json({
      message: deletedIds.length > 0 ? `已删除 ${deletedIds.length} 个存储池` : '没有存储池被删除',
      deletedIds,
      errors
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/set-default', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    await db.prepare('UPDATE storage_pools SET is_default = 0 WHERE user_id = ?').run(req.userId!)
    await db.prepare('UPDATE storage_pools SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, req.userId!)
    clearStorageCache(req.userId!)

    res.json({ message: '默认存储池设置成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    const poolConfig = JSON.parse(pool.config || '{}')

    if (pool.storage_type === 'local') {
      const fs = await import('fs/promises')
      const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
      const localPath = path.resolve(config.storage_root || './uploads', user?.username || '')
      try {
        await fs.access(localPath)
        return res.json({ success: true, message: `本地路径可访问: ${localPath}` })
      } catch {
        return res.json({ success: false, message: `本地路径不可访问: ${localPath}` })
      }
    }

    if (pool.storage_type === 'upyun') {
      const { UpyunStorage } = await import('../services/upyun')
      try {
        const storage = new UpyunStorage(
          poolConfig.upyunOperator,
          poolConfig.upyunPassword,
          poolConfig.upyunBucket,
          poolConfig.upyunEndpoint || 'v0.api.upyun.com'
        )
        await storage.list('/')
        return res.json({ success: true, message: '又拍云连接成功' })
      } catch (err: any) {
        return res.json({ success: false, message: `又拍云连接失败: ${err.message}` })
      }
    }

    if (pool.storage_type === 'ftp') {
      const { FtpStorage } = await import('../services/ftp')
      try {
        const storage = new FtpStorage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'FTP 连接成功' })
      } catch (err: any) {
        return res.json({ success: false, message: `FTP 连接失败: ${err.message}` })
      }
    }

    if (pool.storage_type === 'sftp') {
      const { SftpStorage } = await import('../services/sftp')
      try {
        const storage = new SftpStorage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'SFTP 连接成功' })
      } catch (err: any) {
        return res.json({ success: false, message: `SFTP 连接失败: ${err.message}` })
      }
    }

    if (pool.storage_type === 's3') {
      const { S3Storage } = await import('../services/s3')
      try {
        const storage = new S3Storage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'S3/OSS 连接成功' })
      } catch (err: any) {
        return res.json({ success: false, message: `S3/OSS 连接失败: ${err.message}` })
      }
    }

    res.json({ success: false, message: '不支持的存储类型' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
