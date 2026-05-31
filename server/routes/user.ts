import { Router, Response } from 'express'
import crypto from 'crypto'
import db from '../db.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { clearStorageCache } from '../services/factory.js'

const router = Router()

// 获取用户设置
router.get('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId!) as any
    if (!settings) {
      db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(req.userId!)
      return res.json({
        settings: {
          storageType: 'local',
          localPath: './uploads',
          upyunOperator: '',
          upyunBucket: '',
          upyunEndpoint: 'v0.api.upyun.com',
          guestEnabled: false,
          guestPath: '',
          theme: 'system'
        }
      })
    }
    res.json({
      settings: {
        storageType: settings.storage_type,
        localPath: settings.local_path,
        upyunOperator: settings.upyun_operator,
        upyunBucket: settings.upyun_bucket,
        upyunEndpoint: settings.upyun_endpoint,
        guestEnabled: !!settings.guest_enabled,
        guestPath: settings.guest_path,
        theme: settings.theme
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 更新用户设置
router.put('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const {
      storageType, localPath, upyunOperator, upyunPassword, upyunBucket, upyunEndpoint,
      guestEnabled, guestPath, theme
    } = req.body

    const updates: string[] = []
    const values: any[] = []

    if (storageType !== undefined) { updates.push('storage_type = ?'); values.push(storageType) }
    if (localPath !== undefined) { updates.push('local_path = ?'); values.push(localPath) }
    if (upyunOperator !== undefined) { updates.push('upyun_operator = ?'); values.push(upyunOperator) }
    if (upyunPassword !== undefined && upyunPassword !== '') { updates.push('upyun_password = ?'); values.push(upyunPassword) }
    if (upyunBucket !== undefined) { updates.push('upyun_bucket = ?'); values.push(upyunBucket) }
    if (upyunEndpoint !== undefined) { updates.push('upyun_endpoint = ?'); values.push(upyunEndpoint) }
    if (guestEnabled !== undefined) { updates.push('guest_enabled = ?'); values.push(guestEnabled ? 1 : 0) }
    if (guestPath !== undefined) { updates.push('guest_path = ?'); values.push(guestPath) }
    if (theme !== undefined) { updates.push('theme = ?'); values.push(theme) }

    if (updates.length > 0) {
      values.push(req.userId!)
      db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
      clearStorageCache(req.userId!)
    }

    res.json({ message: '设置已更新' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// API Key 列表
router.get('/apikeys', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const keys = db.prepare('SELECT id, name, key, permissions, created_at FROM api_keys WHERE user_id = ?').all(req.userId!)
    res.json({ keys })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 创建 API Key
router.post('/apikeys', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, permissions } = req.body
    if (!name) {
      return res.status(400).json({ error: '名称不能为空' })
    }

    const key = 'vfm_' + crypto.randomBytes(32).toString('hex')
    const perms = permissions || 'read'

    db.prepare('INSERT INTO api_keys (user_id, name, key, permissions) VALUES (?, ?, ?, ?)').run(
      req.userId!, name, key, perms
    )

    res.json({ message: 'API Key 创建成功', key, name, permissions: perms })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除 API Key
router.delete('/apikeys/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'API Key 不存在' })
    }
    res.json({ message: 'API Key 已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
