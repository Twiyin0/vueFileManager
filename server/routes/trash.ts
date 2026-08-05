import { Router, Response } from 'express'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getStorageByPoolId } from '../services/factory'
import { getTrashPathCandidates, resolveTrashPathCandidates, restoreFromTrash } from '../services/trash'
import { sendServerError } from './admin/shared'

const router = Router()

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const items = await db.prepare(`
      SELECT t.*, t.deleted_by, sp.name as pool_name, sp.storage_type
      FROM trash t
      JOIN storage_pools sp ON t.storage_pool_id = sp.id
      WHERE t.user_id = ?
      ORDER BY t.deleted_at DESC
    `).all(req.userId!)

    res.json({ items })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'trash.ts', message: 'Failed to load trash items' })
  }
})

router.post('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = await db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: 'trash.itemNotFound' })
    }

    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    const exists = await storage.exists(item.original_path).catch(() => false)
    if (exists) {
      return res.status(400).json({ error: 'trash.restoreConflict' })
    }

    let restored = false
    for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
      restored = await restoreFromTrash(storage, trashPath, item.original_path, item.file_type)
      if (restored) break
    }

    if (!restored && item.file_type === 'folder') {
      await storage.mkdir(item.original_path).catch(() => {})
      restored = await storage.exists(item.original_path).catch(() => false)
    }

    await db.prepare('DELETE FROM trash WHERE id = ?').run(item.id)
    res.json({ message: restored ? 'trash.restored' : 'trash.recordRemoved' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'trash.ts', message: 'Failed to restore trash item' })
  }
})

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = await db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: 'trash.itemNotFound' })
    }

    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
      await storage.remove(trashPath).catch(() => {})
    }

    await db.prepare('DELETE FROM trash WHERE id = ?').run(item.id)
    res.json({ message: 'trash.deletedPermanently' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'trash.ts', message: 'Failed to delete trash item' })
  }
})

router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const items = await db.prepare('SELECT * FROM trash WHERE user_id = ?').all(req.userId!) as any[]

    for (const item of items) {
      const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
      for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
        await storage.remove(trashPath).catch(() => {})
      }
    }

    await db.prepare('DELETE FROM trash WHERE user_id = ?').run(req.userId!)
    res.json({ message: 'trash.emptied' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'trash.ts', message: 'Failed to empty trash' })
  }
})

export default router
