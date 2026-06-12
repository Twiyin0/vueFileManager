import { Router, Response } from 'express'
import crypto from 'crypto'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getUserQuota, formatBytes } from '../services/quota'

const router = Router()

router.get('/info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(req.userId!) as any

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const pools = await db.prepare(`
      SELECT id, name, storage_type, is_default, created_at
      FROM storage_pools
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at ASC
    `).all(req.userId!) as any[]

    const trashCount = (await db.prepare('SELECT COUNT(*) as c FROM trash WHERE user_id = ?').get(req.userId!) as any).c
    const favCount = (await db.prepare('SELECT COUNT(*) as c FROM favourites WHERE user_id = ?').get(req.userId!) as any).c
    const shareCount = (await db.prepare('SELECT COUNT(*) as c FROM shares WHERE user_id = ?').get(req.userId!) as any).c
    const apiKeyCount = (await db.prepare('SELECT COUNT(*) as c FROM api_keys WHERE user_id = ?').get(req.userId!) as any).c
    const guestShareCount = (await db.prepare('SELECT COUNT(*) as c FROM guest_shares WHERE user_id = ?').get(req.userId!) as any).c
    const quota = await getUserQuota(req.userId!)

    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        registerIp: user.register_ip,
        lastLoginIp: user.last_login_ip,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        settings: {
          guestEnabled: !!user.guest_enabled,
          guestPath: user.guest_path,
          theme: user.theme,
        },
        pools: pools.map((pool) => ({
          id: pool.id,
          name: pool.name,
          storageType: pool.storage_type,
          isDefault: !!pool.is_default,
          createdAt: pool.created_at,
        })),
        stats: {
          trashCount,
          favCount,
          shareCount,
          apiKeyCount,
          guestShareCount,
        },
        storage: {
          quota: quota.quota,
          used: quota.used,
          remaining: quota.remaining,
          quotaFormatted: formatBytes(quota.quota),
          usedFormatted: formatBytes(quota.used),
        },
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId!) as any

    if (!settings) {
      await db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(req.userId!)
      return res.json({
        settings: {
          guestEnabled: false,
          guestPath: '',
          theme: 'system',
        },
      })
    }

    res.json({
      settings: {
        guestEnabled: !!settings.guest_enabled,
        guestPath: settings.guest_path,
        theme: settings.theme,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { guestEnabled, guestPath, theme } = req.body
    const updates: string[] = []
    const values: any[] = []

    if (guestEnabled !== undefined) {
      updates.push('guest_enabled = ?')
      values.push(guestEnabled ? 1 : 0)
    }
    if (guestPath !== undefined) {
      updates.push('guest_path = ?')
      values.push(guestPath)
    }
    if (theme !== undefined) {
      updates.push('theme = ?')
      values.push(theme)
    }

    if (updates.length > 0) {
      values.push(req.userId!)
      await db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
    }

    res.json({ message: '设置已更新' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/apikeys', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const keys = await db.prepare('SELECT id, name, key, permissions, created_at FROM api_keys WHERE user_id = ?').all(req.userId!)
    res.json({ keys })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/apikeys', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, permissions } = req.body
    if (!name) {
      return res.status(400).json({ error: '名称不能为空' })
    }

    const key = `vfm_${crypto.randomBytes(32).toString('hex')}`
    const perms = permissions || 'read'

    await db.prepare('INSERT INTO api_keys (user_id, name, key, permissions) VALUES (?, ?, ?, ?)').run(
      req.userId!,
      name,
      key,
      perms,
    )

    res.json({ message: 'API Key 创建成功', key, name, permissions: perms })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/apikeys/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'API Key 不存在' })
    }
    res.json({ message: 'API Key 已删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/guest-shares', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const shares = await db.prepare(`
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

router.post('/guest-shares', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { folderPath, storagePoolId, label, permissions } = req.body
    if (!folderPath || !storagePoolId) {
      return res.status(400).json({ error: '缺少文件夹路径或存储池 ID' })
    }

    const pool = await db.prepare('SELECT id, name FROM storage_pools WHERE id = ? AND user_id = ?').get(storagePoolId, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: '存储池不存在' })
    }

    const existing = await db.prepare('SELECT id FROM guest_shares WHERE user_id = ? AND folder_path = ? AND storage_pool_id = ?')
      .get(req.userId!, folderPath, storagePoolId) as any
    if (existing) {
      return res.status(409).json({ error: '该文件夹已经分享至访客模式' })
    }

    const perms = permissions || 'read'
    const nextLabel = label || folderPath.split('/').pop() || '根目录'
    const result = await db.prepare('INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label, permissions) VALUES (?, ?, ?, ?, ?)')
      .run(req.userId!, folderPath, storagePoolId, nextLabel, perms)

    res.json({
      message: '已分享至访客模式',
      share: {
        id: result.lastInsertRowid,
        folder_path: folderPath,
        storage_pool_id: storagePoolId,
        label: nextLabel,
        permissions: perms,
        pool_name: pool.name,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/guest-shares/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { permissions, label } = req.body
    const id = parseInt(req.params.id as string, 10)

    const share = await db.prepare('SELECT id, label, permissions FROM guest_shares WHERE id = ? AND user_id = ?')
      .get(id, req.userId!) as any
    if (!share) {
      return res.status(404).json({ error: '分享不存在' })
    }

    const newPermissions = permissions || share.permissions
    const newLabel = label !== undefined ? label : share.label

    await db.prepare('UPDATE guest_shares SET permissions = ?, label = ? WHERE id = ? AND user_id = ?')
      .run(newPermissions, newLabel, id, req.userId!)

    res.json({
      message: '已更新',
      share: {
        id,
        permissions: newPermissions,
        label: newLabel,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/guest-shares/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.prepare('DELETE FROM guest_shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: '分享不存在' })
    }
    res.json({ message: '已取消访客分享' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
