import { Router, type Response } from 'express'
import path from 'path'
import db from '../db'
import config from '../config'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'
import { Logger } from '../services/logger'
import { sendServerError } from './admin/shared'

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
    throw new Error('storagePool.unsupportedType')
  }

  if (storageType === 'upyun') {
    if (!storageConfig.upyunOperator || !storageConfig.upyunPassword || !storageConfig.upyunBucket) {
      throw new Error('storagePool.upyunRequiresFields')
    }
  }

  if (storageType === 'ftp') {
    if (!storageConfig.ftpHost) {
      throw new Error('storagePool.ftpRequiresHost')
    }
  }

  if (storageType === 'sftp') {
    if (!storageConfig.sftpHost || !storageConfig.sftpUser) {
      throw new Error('storagePool.sftpRequiresHostAndUsername')
    }
    if (!storageConfig.sftpPassword && !storageConfig.sftpPrivateKey) {
      throw new Error('storagePool.sftpRequiresPasswordOrKey')
    }
  }

  if (storageType === 's3') {
    if (!storageConfig.s3Bucket) {
      throw new Error('storagePool.s3RequiresBucket')
    }
    if (!storageConfig.s3AccessKeyId || !storageConfig.s3SecretAccessKey) {
      throw new Error('storagePool.s3RequiresAccessKey')
    }
  }
}

function joinMappedPath(basePath: string, rootPath?: string) {
  const base = path.resolve(basePath)
  const normalizedRoot = typeof rootPath === 'string'
    ? rootPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    : ''

  if (!normalizedRoot) {
    return base
  }

  const segments = normalizedRoot.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..' || /[\u0000-\u001f]/.test(segment))) {
    throw new Error('common.invalidPath')
  }

  const resolved = path.resolve(base, ...segments)
  const baseWithSlash = base.endsWith(path.sep) ? base : `${base}${path.sep}`
  if (resolved !== base && !resolved.startsWith(baseWithSlash)) {
    throw new Error('common.invalidPath')
  }
  return resolved
}

async function resolveLocalPoolPath(userId: number, poolConfig: Record<string, any>) {
  const configuredPath = [poolConfig.path, poolConfig.localPath]
    .find((value) => typeof value === 'string' && value.trim())
    ?.trim() || ''

  if (configuredPath) {
    return joinMappedPath(path.resolve(configuredPath), poolConfig.rootPath)
  }

  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  const username = user?.username || ''
  return joinMappedPath(path.resolve(config.storage_root || './uploads', username), poolConfig.rootPath)
}

async function getUsername(userId: number) {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return user?.username || `#${userId}`
}

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pools = await db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId!) as any[]

    const safePools = await Promise.all(pools.map(async (pool) => {
      const cfg = maskSecrets(JSON.parse(pool.config || '{}'))
      let resolvedPath = ''

      if (pool.storage_type === 'local') {
        resolvedPath = await resolveLocalPoolPath(req.userId!, cfg)
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
    }))

    res.json({ pools: safePools })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to list storage pools',
      context: { userId: req.userId }
    })
  }
})

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, storageType, config: storageConfig } = req.body

    if (!name || !storageType || !storageConfig) {
      return res.status(400).json({ error: 'common.missingRequiredParameters' })
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

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'storage-pools.ts', `User ${username} created storage pool "${name}" type=${storageType}`)

    res.json({
      message: 'storagePool.created',
      pool: {
        id: result.lastInsertRowid,
        name,
        storageType,
        isDefault: isFirst,
        config: maskSecrets(storageConfig)
      }
    })
  } catch (err: any) {
    if (err instanceof Error && err.message === 'storagePool.unsupportedType') {
      return res.status(400).json({ error: err.message })
    }
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to create storage pool',
      context: { userId: req.userId, name: req.body?.name, storageType: req.body?.storageType }
    })
  }
})

router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { name, storageType, config: nextConfig } = req.body

    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: 'storagePool.notFound' })
    }

    const existingConfig = JSON.parse(pool.config || '{}')
    const mergedConfig = nextConfig ? { ...existingConfig, ...nextConfig } : undefined
    if (storageType && mergedConfig) {
      validateStorageConfig(storageType, mergedConfig)
    }

    if (mergedConfig) {
      if (nextConfig.upyunPassword === '******' || !nextConfig.upyunPassword) {
        mergedConfig.upyunPassword = existingConfig.upyunPassword
      }
      if (nextConfig.ftpPassword === '******' || !nextConfig.ftpPassword) {
        mergedConfig.ftpPassword = existingConfig.ftpPassword
      }
      if (nextConfig.s3SecretAccessKey === '******' || !nextConfig.s3SecretAccessKey) {
        mergedConfig.s3SecretAccessKey = existingConfig.s3SecretAccessKey
      }
      if (nextConfig.sftpPassword === '******' || !nextConfig.sftpPassword) {
        mergedConfig.sftpPassword = existingConfig.sftpPassword
      }
      if (nextConfig.sftpPrivateKey === '*** hidden ***' || !nextConfig.sftpPrivateKey) {
        mergedConfig.sftpPrivateKey = existingConfig.sftpPrivateKey
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

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'storage-pools.ts', `User ${username} updated storage pool #${id}`)

    res.json({ message: 'storagePool.updated' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to update storage pool',
      context: { userId: req.userId, poolId: req.params.id, name: req.body?.name, storageType: req.body?.storageType }
    })
  }
})

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: 'storagePool.notFound' })
    }
    if (pool.is_default) {
      return res.status(400).json({ error: 'storagePool.cannotDeleteDefault' })
    }

    await db.prepare('DELETE FROM storage_pools WHERE id = ? AND user_id = ?').run(id, req.userId!)
    clearStorageCache(req.userId!)

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'storage-pools.ts', `User ${username} deleted storage pool #${id} "${pool.name}"`)

    res.json({ message: 'storagePool.deleted' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to delete storage pool',
      context: { userId: req.userId, poolId: req.params.id }
    })
  }
})

router.post('/batch-delete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
    if (ids.length === 0) {
      return res.status(400).json({ error: 'storagePool.missingIdList' })
    }

    const deletedIds: number[] = []
    const errors: Array<string | { error: string; params?: Record<string, string | number> }> = []

    for (const rawId of ids) {
      const id = Number(rawId)
      if (!Number.isInteger(id) || id <= 0) {
        errors.push({ error: 'storagePool.invalidId', params: { value: String(rawId) } })
        continue
      }

      const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
      if (!pool) {
        errors.push({ error: 'storagePool.notFoundWithId', params: { id } })
        continue
      }
      if (pool.is_default) {
        errors.push({ error: 'storagePool.cannotDeleteDefaultNamed', params: { name: pool.name } })
        continue
      }

      await db.prepare('DELETE FROM storage_pools WHERE id = ? AND user_id = ?').run(id, req.userId!)
      deletedIds.push(id)
    }

    if (deletedIds.length > 0) {
      clearStorageCache(req.userId!)
      const username = await getUsername(req.userId!)
      await Logger.info('api', 'storage-pools.ts', `User ${username} batch deleted ${deletedIds.length} storage pool(s)`)
    }

    res.json({
      message: deletedIds.length > 0 ? 'storagePool.deletedCount' : 'storagePool.noneDeleted',
      params: deletedIds.length > 0 ? { count: deletedIds.length } : undefined,
      deletedIds,
      errors
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to batch delete storage pools',
      context: { userId: req.userId, ids: req.body?.ids }
    })
  }
})

router.post('/:id/set-default', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: 'storagePool.notFound' })
    }

    await db.prepare('UPDATE storage_pools SET is_default = 0 WHERE user_id = ?').run(req.userId!)
    await db.prepare('UPDATE storage_pools SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, req.userId!)
    clearStorageCache(req.userId!)

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'storage-pools.ts', `User ${username} set storage pool #${id} as default`)

    res.json({ message: 'storagePool.defaultUpdated' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to set default storage pool',
      context: { userId: req.userId, poolId: req.params.id }
    })
  }
})

router.post('/:id/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const pool = await db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: 'storagePool.notFound' })
    }

    const poolConfig = JSON.parse(pool.config || '{}')

    if (pool.storage_type === 'local') {
      const fs = await import('fs/promises')
      const localPath = await resolveLocalPoolPath(req.userId!, poolConfig)
      try {
        await fs.mkdir(localPath, { recursive: true })
        await fs.access(localPath)
        return res.json({ success: true, message: 'storagePool.localPathAccessible', params: { path: localPath } })
      } catch {
        return res.json({ success: false, message: 'storagePool.localPathInaccessible', params: { path: localPath } })
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
        return res.json({ success: true, message: 'UpYun connection successful' })
      } catch (err: any) {
        return res.json({ success: false, message: `UpYun connection failed: ${err.message}` })
      }
    }

    if (pool.storage_type === 'ftp') {
      const { FtpStorage } = await import('../services/ftp')
      try {
        const storage = new FtpStorage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'FTP connection successful' })
      } catch (err: any) {
        return res.json({ success: false, message: `FTP connection failed: ${err.message}` })
      }
    }

    if (pool.storage_type === 'sftp') {
      const { SftpStorage } = await import('../services/sftp')
      try {
        const storage = new SftpStorage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'SFTP connection successful' })
      } catch (err: any) {
        return res.json({ success: false, message: `SFTP connection failed: ${err.message}` })
      }
    }

    if (pool.storage_type === 's3') {
      const { S3Storage } = await import('../services/s3')
      try {
        const storage = new S3Storage(poolConfig)
        await storage.list('')
        return res.json({ success: true, message: 'S3/OSS connection successful' })
      } catch (err: any) {
        return res.json({ success: false, message: `S3/OSS connection failed: ${err.message}` })
      }
    }

    res.json({ success: false, message: 'Unsupported storage type' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'storage-pools.ts',
      message: 'Failed to test storage pool',
      context: { userId: req.userId, poolId: req.params.id }
    })
  }
})

export default router
