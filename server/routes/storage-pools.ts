import { Router, Response } from 'express'
import path from 'path'
import db from '../db'
import config from '../config'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'

const router = Router()

// 获取用户所有存储池
router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const pools = db.prepare(`
      SELECT id, name, storage_type, is_default, config, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId!)

    // 获取用户名
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
    const username = user?.username || ''

    // 解析config JSON，但不返回密码
    const safePools = pools.map((pool: any) => {
      const cfg = JSON.parse(pool.config)
      // 移除敏感信息
      if (cfg.upyunPassword) cfg.upyunPassword = '••••••'
      if (cfg.ftpPassword) cfg.ftpPassword = '••••••'
      if (cfg.s3SecretAccessKey) cfg.s3SecretAccessKey = '••••••'

      // 本地存储：返回实际路径
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

// 创建存储池
router.post('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, storageType, config } = req.body

    if (!name || !storageType || !config) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    // 验证存储类型
    if (!['local', 'upyun', 'ftp', 's3'].includes(storageType)) {
      return res.status(400).json({ error: '不支持的存储类型' })
    }

    // 本地存储无需验证路径（自动使用 storage_root/username）

    if (storageType === 'upyun') {
      if (!config.upyunOperator || !config.upyunPassword || !config.upyunBucket) {
        return res.status(400).json({ error: '又拍云存储需要填写操作员名称、密码和服务名' })
      }
    }

    if (storageType === 'ftp') {
      if (!config.ftpHost) {
        return res.status(400).json({ error: 'FTP 存储需要填写主机地址' })
      }
    }

    if (storageType === 's3') {
      if (!config.s3Bucket) {
        return res.status(400).json({ error: 'S3 存储需要填写 Bucket 名称' })
      }
      if (!config.s3AccessKeyId || !config.s3SecretAccessKey) {
        return res.status(400).json({ error: 'S3 存储需要填写 Access Key' })
      }
    }

    // 检查是否是第一个存储池（自动设为默认）
    const existingPools = db.prepare('SELECT COUNT(*) as count FROM storage_pools WHERE user_id = ?').get(req.userId!) as any
    const isFirst = existingPools.count === 0

    const result = db.prepare(`
      INSERT INTO storage_pools (user_id, name, storage_type, is_default, config)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.userId!,
      name,
      storageType,
      isFirst ? 1 : 0,
      JSON.stringify(config)
    )

    // 清除存储缓存
    clearStorageCache(req.userId!)

    res.json({
      message: '存储池创建成功',
      pool: {
        id: result.lastInsertRowid,
        name,
        storageType,
        isDefault: isFirst,
        config
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 更新存储池
router.put('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params
    const { name, storageType, config } = req.body

    // 检查存储池是否存在且属于当前用户
    const pool = db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    if (storageType === 'upyun' && config) {
      // 如果密码为空或占位符，保留原密码
      if (config.upyunPassword === '••••••' || !config.upyunPassword) {
        const oldConfig = JSON.parse(pool.config)
        config.upyunPassword = oldConfig.upyunPassword
      }
      if (!config.upyunOperator || !config.upyunBucket) {
        return res.status(400).json({ error: '又拍云存储需要填写操作员名称和服务名' })
      }
    }

    // 构建更新语句
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
    if (config !== undefined) {
      updates.push('config = ?')
      values.push(JSON.stringify(config))
    }

    if (updates.length > 0) {
      values.push(id, req.userId!)
      db.prepare(`UPDATE storage_pools SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values)
      clearStorageCache(req.userId!)
    }

    res.json({ message: '存储池更新成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除存储池
router.delete('/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // 检查存储池是否存在且属于当前用户
    const pool = db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    // 不能删除默认存储池
    if (pool.is_default) {
      return res.status(400).json({ error: '不能删除默认存储池，请先设置其他存储池为默认' })
    }

    db.prepare('DELETE FROM storage_pools WHERE id = ? AND user_id = ?').run(id, req.userId!)
    clearStorageCache(req.userId!)

    res.json({ message: '存储池删除成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 设置默认存储池
router.post('/:id/set-default', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // 检查存储池是否存在且属于当前用户
    const pool = db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    // 取消所有默认
    db.prepare('UPDATE storage_pools SET is_default = 0 WHERE user_id = ?').run(req.userId!)

    // 设置新的默认
    db.prepare('UPDATE storage_pools SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, req.userId!)

    clearStorageCache(req.userId!)

    res.json({ message: '默认存储池设置成功' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 测试存储池连接
router.post('/:id/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params

    // 检查存储池是否存在且属于当前用户
    const pool = db.prepare('SELECT * FROM storage_pools WHERE id = ? AND user_id = ?').get(id, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    const config = JSON.parse(pool.config)

    // 根据存储类型测试连接
    if (pool.storage_type === 'local') {
      const fs = await import('fs/promises')
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(req.userId!) as any
      const localPath = path.resolve(config.storage_root || './uploads', user?.username || '')
      try {
        await fs.access(localPath)
        res.json({ success: true, message: `本地路径可访问: ${localPath}` })
      } catch {
        res.json({ success: false, message: `本地路径不可访问: ${localPath}` })
      }
    } else if (pool.storage_type === 'upyun') {
      // 测试又拍云连接
      const { UpyunStorage } = await import('../services/upyun')
      try {
        const storage = new UpyunStorage(
          config.upyunOperator,
          config.upyunPassword,
          config.upyunBucket,
          config.upyunEndpoint || 'v0.api.upyun.com'
        )
        await storage.list('/')
        res.json({ success: true, message: '又拍云连接成功' })
      } catch (err: any) {
        res.json({ success: false, message: `又拍云连接失败: ${err.message}` })
      }
    } else {
      res.json({ success: false, message: '不支持的存储类型' })
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
