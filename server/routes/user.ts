import { Router, type Response } from 'express'
import crypto from 'crypto'
import db from '../db'
import config, { type AppLanguage } from '../config'
import { authMiddleware, type AuthRequest } from '../middleware/auth'
import { Logger } from '../services/logger'
import { getUserQuota, formatBytes } from '../services/quota'
import { sendServerError } from './admin/shared'
import { normalizeStoragePath } from './files/shared'

const router = Router()

function normalizeOptionalPassword(password: unknown) {
  if (password === undefined) return undefined
  const value = String(password || '').trim()
  return value || null
}

function serializeGuestShare(share: any) {
  return {
    ...share,
    has_password: !!share.password,
    password: undefined
  }
}

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function getDefaultLanguage(): AppLanguage {
  return normalizeLanguage(config.default_language)
}

async function ensureUserSettingsRow(userId: number) {
  const settings = await db.prepare('SELECT user_id FROM user_settings WHERE user_id = ?').get(userId)
  if (settings) return
  await db.prepare('INSERT INTO user_settings (user_id, language) VALUES (?, ?)').run(userId, getDefaultLanguage())
}

async function getUsername(userId: number) {
  const user = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return user?.username || `#${userId}`
}

router.get('/info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await ensureUserSettingsRow(req.userId!)

    const user = await db.prepare(`
      SELECT u.id, u.username, u.role, u.register_ip, u.last_login_ip, u.last_login_at, u.created_at,
             s.guest_enabled, s.guest_path, s.theme, s.language, s.upload_concurrency
      FROM users u
      LEFT JOIN user_settings s ON u.id = s.user_id
      WHERE u.id = ?
    `).get(req.userId!) as any

    if (!user) {
      return res.status(404).json({ error: 'auth.userNotFound' })
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
      registration_enabled: config.allow_user_registration,
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
          theme: user.theme || 'system',
          language: normalizeLanguage(user.language || getDefaultLanguage()),
          uploadConcurrency: Number(user.upload_concurrency || 0),
          serverDefaultUploadConcurrency: Number(config.max_concurrent_uploads || 3)
        },
        pools: pools.map((pool) => ({
          id: pool.id,
          name: pool.name,
          storageType: pool.storage_type,
          isDefault: !!pool.is_default,
          createdAt: pool.created_at
        })),
        stats: {
          trashCount,
          favCount,
          shareCount,
          apiKeyCount,
          guestShareCount
        },
        storage: {
          quota: quota.quota,
          used: quota.used,
          remaining: quota.remaining,
          quotaFormatted: formatBytes(quota.quota),
          usedFormatted: formatBytes(quota.used)
        }
      }
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to load user info',
      context: { userId: req.userId }
    })
  }
})

router.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await ensureUserSettingsRow(req.userId!)

    const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId!) as any

    res.json({
      settings: {
        guestEnabled: !!settings.guest_enabled,
        guestPath: settings.guest_path || '',
        theme: settings.theme || 'system',
        language: normalizeLanguage(settings.language || getDefaultLanguage()),
        uploadConcurrency: Number(settings.upload_concurrency || 0),
        serverDefaultUploadConcurrency: Number(config.max_concurrent_uploads || 3)
      }
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to load user settings',
      context: { userId: req.userId }
    })
  }
})

router.put('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await ensureUserSettingsRow(req.userId!)

    const { guestEnabled, guestPath, theme, language, uploadConcurrency } = req.body
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
    if (language !== undefined) {
      updates.push('language = ?')
      values.push(normalizeLanguage(language))
    }
    if (uploadConcurrency !== undefined) {
      const parsed = Number(uploadConcurrency)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 16) {
        return res.status(400).json({ error: 'uploadConcurrency must be an integer between 0 and 16' })
      }
      updates.push('upload_concurrency = ?')
      values.push(parsed)
    }

    if (updates.length > 0) {
      values.push(req.userId!)
      await db.prepare(`UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = ?`).run(...values)
      const username = await getUsername(req.userId!)
      await Logger.info('api', 'user.ts', `User ${username} updated settings`)
    }

    res.json({ message: 'common.settingsUpdated' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to update user settings',
      context: { userId: req.userId }
    })
  }
})

router.get('/apikeys', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const keys = await db.prepare('SELECT id, name, key, permissions, created_at FROM api_keys WHERE user_id = ?').all(req.userId!)
    res.json({ keys })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to load API keys',
      context: { userId: req.userId }
    })
  }
})

router.post('/apikeys', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, permissions } = req.body
    if (!name) {
      return res.status(400).json({ error: 'common.nameRequired' })
    }

    const key = `vfm_${crypto.randomBytes(32).toString('hex')}`
    const perms = permissions || 'read'

    await db.prepare('INSERT INTO api_keys (user_id, name, key, permissions) VALUES (?, ?, ?, ?)').run(
      req.userId!,
      name,
      key,
      perms
    )

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'user.ts', `User ${username} generated API key "${name}" with permissions ${perms}`)

    res.json({ message: 'API key created successfully', key, name, permissions: perms })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to create API key',
      context: { userId: req.userId, name: req.body?.name }
    })
  }
})

router.delete('/apikeys/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const keyRecord = await db.prepare('SELECT name FROM api_keys WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    const result = await db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'API key not found' })
    }
    const username = await getUsername(req.userId!)
    await Logger.info('api', 'user.ts', `User ${username} deleted API key "${keyRecord?.name || req.params.id}"`)
    res.json({ message: 'API key deleted' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to delete API key',
      context: { userId: req.userId, apiKeyId: req.params.id }
    })
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

    res.json({ shares: (shares as any[]).map(serializeGuestShare) })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to load guest shares',
      context: { userId: req.userId }
    })
  }
})

router.post('/guest-shares', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { folderPath, storagePoolId, label, permissions, password } = req.body
    if (folderPath === undefined || folderPath === null || !storagePoolId) {
      return res.status(400).json({ error: 'common.missingFolderPathOrPoolId' })
    }

    let normalizedFolderPath = ''
    try {
      normalizedFolderPath = normalizeStoragePath(String(folderPath || ''))
    } catch {
      return res.status(400).json({ error: 'common.invalidPath' })
    }

    const pool = await db.prepare('SELECT id, name FROM storage_pools WHERE id = ? AND user_id = ?').get(storagePoolId, req.userId!) as any
    if (!pool) {
      return res.status(404).json({ error: 'storagePool.notFound' })
    }

    await ensureUserSettingsRow(req.userId!)
    await db.prepare('UPDATE user_settings SET guest_enabled = 1 WHERE user_id = ?').run(req.userId!)

    const existing = await db.prepare(`
      SELECT * FROM guest_shares
      WHERE user_id = ? AND folder_path = ? AND storage_pool_id = ?
    `).get(req.userId!, normalizedFolderPath, storagePoolId) as any

    const perms = permissions || 'read'
    const nextLabel = label || normalizedFolderPath.split('/').filter(Boolean).pop() || pool.name || 'Guest Folder'
    const normalizedPassword = normalizeOptionalPassword(password)

    if (existing) {
      const updates = ['label = ?', 'permissions = ?']
      const values: any[] = [nextLabel, perms]
      if (normalizedPassword !== undefined) {
        updates.push('password = ?')
        values.push(normalizedPassword)
      }
      values.push(existing.id, req.userId!)

      await db.prepare(`
        UPDATE guest_shares
        SET ${updates.join(', ')}
        WHERE id = ? AND user_id = ?
      `).run(...values)

      const username = await getUsername(req.userId!)
      await Logger.info('api', 'user.ts', `User ${username} updated existing guest share in poolID:#${storagePoolId} ${normalizedFolderPath || '/'}`)

      return res.json({
        message: 'guest.guestShareUpdated',
        guestEnabled: true,
        share: serializeGuestShare({
          ...existing,
          folder_path: normalizedFolderPath,
          storage_pool_id: storagePoolId,
          label: nextLabel,
          permissions: perms,
          password: normalizedPassword !== undefined ? normalizedPassword : existing.password
        })
      })
    }

    const result = await db.prepare(`
      INSERT INTO guest_shares (user_id, folder_path, storage_pool_id, label, permissions, password)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.userId!, normalizedFolderPath, storagePoolId, nextLabel, perms, normalizedPassword ?? null)

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'user.ts', `User ${username} shared folder to guest mode in poolID:#${storagePoolId} ${normalizedFolderPath || '/'}`)

    res.json({
      message: 'guest.sharedToGuestMode',
      guestEnabled: true,
      share: serializeGuestShare({
        id: result.lastInsertRowid,
        folder_path: normalizedFolderPath,
        storage_pool_id: storagePoolId,
        label: nextLabel,
        permissions: perms,
        password: normalizedPassword
      })
    })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to create guest share',
      context: { userId: req.userId, folderPath: req.body?.folderPath, storagePoolId: req.body?.storagePoolId }
    })
  }
})

router.put('/guest-shares/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, permissions, password } = req.body
    const share = await db.prepare('SELECT * FROM guest_shares WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any

    if (!share) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }

    const updates = ['label = ?', 'permissions = ?']
    const values: any[] = [label || '', permissions || 'read']
    const normalizedPassword = normalizeOptionalPassword(password)
    if (normalizedPassword !== undefined) {
      updates.push('password = ?')
      values.push(normalizedPassword)
    }
    values.push(req.params.id, req.userId!)

    await db.prepare(`
      UPDATE guest_shares
      SET ${updates.join(', ')}
      WHERE id = ? AND user_id = ?
    `).run(...values)

    const username = await getUsername(req.userId!)
    await Logger.info('api', 'user.ts', `User ${username} updated guest share in poolID:#${share.storage_pool_id} ${share.folder_path}`)

    res.json({ message: 'guest.guestShareUpdated' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to update guest share',
      context: { userId: req.userId, shareId: req.params.id }
    })
  }
})

router.delete('/guest-shares/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const share = await db.prepare('SELECT folder_path, storage_pool_id FROM guest_shares WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    const result = await db.prepare('DELETE FROM guest_shares WHERE id = ? AND user_id = ?').run(req.params.id, req.userId!)
    if (result.changes === 0) {
      return res.status(404).json({ error: 'guest.shareNotFound' })
    }
    const username = await getUsername(req.userId!)
    await Logger.info('api', 'user.ts', `User ${username} removed guest share in poolID:#${share?.storage_pool_id || 'unknown'} ${share?.folder_path || ''}`.trim())
    res.json({ message: 'guest.guestShareDeleted' })
  } catch (err) {
    await sendServerError(req, res, err, {
      source: 'api',
      fileName: 'user.ts',
      message: 'Failed to delete guest share',
      context: { userId: req.userId, shareId: req.params.id }
    })
  }
})

export default router
