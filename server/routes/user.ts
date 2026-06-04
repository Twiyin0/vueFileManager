import { Router, Response } from 'express'
import crypto from 'crypto'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { clearStorageCache } from '../services/factory'

const router = Router()

// 获取用户设置
router.get('/settings', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId!) as any
    if (!settings) {
      db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(req.userId!)
      return res.json({
        settings: {
          guestEnabled: false,
          guestPath: '',
          theme: 'system'
        }
      })
    }
    res.json({
      settings: {
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
      guestEnabled, guestPath, theme
    } = req.body

    const updates: string[] = []
    const values: any[] = []

    if (guestEnabled !== undefined) { updates.push('guest_enabled = ?'); values.push(guestEnabled ? 1 : 0) }
    if (guestPath !== undefined) { updates.push('guest_path = ?'); values.push(guestPath) }
    if (theme !== undefined) { updates.push('theme = ?'); values.push(theme) }

    if (updates.length > 0) {
      values.push(req.userId!)
      db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
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

// ---- 访客分享管理 ----

// 获取当前用户的访客分享列表
router.get('/guest-shares', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const shares = db.prepare(`
      SELECT gs.*, sp.name as pool_name
      FROM guest_shares gs
      JOIN storage_pools sp ON gs.storage_pool_id = sp.id
      WHERE gs.user_id = ?
      ORDER BY gs.created_at DESC
    `).all(req.userId!)
    res.json({ shares })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 创建访客分享
router.post('/guest-shares', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { folderPath, storagePoolId, label } = req.body
    if (!folderPath || !storagePoolId) {
      return res.status(400).json({ error: '缺少文件夹路径或存储池ID' })
    }

    // 验证存储池属于当前用户
    const pool = db.prepare('SELECT id, name FROM storage_pools WHERE id = ? AND user_id = ?').get(storagePoolId, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    // 检查是否已分享过同一路径
    const existing = db.prepare('SELECT id FROM guest_shares WHERE user_id = ? AND folder_path = ? AND storage_pool_id = ?')
      .get(req.userId!, folderPath, storagePoolId) as any
    if (existing) {
      return res.status(409).json({ error: '该文件夹已分享至访客模式' })
    }

    const result = db.prepare('INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label) VALUES (?, ?, ?, ?)')
      .run(req.userId!, folderPath, storagePoolId, label || folderPath.split('/').pop() || '根目录')

    res.json({
      message: '已分享至访客模式',
      share: {
        id: result.lastInsertRowid,
        folder_path: folderPath,
        storage_pool_id: storagePoolId,
        label: label || folderPath.split('/').pop() || '根目录',
        pool_name: pool.name
      }
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 删除访客分享
router.delete('/guest-shares/:id', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const result = db.prepare('DELETE FROM guest_shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: '分享不存在' })
    }
    res.json({ message: '已取消访客分享' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
