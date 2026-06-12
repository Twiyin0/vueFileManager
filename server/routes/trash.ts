import { Router, Response } from 'express'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getStorageByPoolId } from '../services/factory'
import { getTrashPathCandidates, resolveTrashPathCandidates, restoreFromTrash } from '../services/trash'

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
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = await db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: '回收站项目不存在' })
    }

    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    const exists = await storage.exists(item.original_path).catch(() => false)
    if (exists) {
      return res.status(400).json({ error: '原路径已存在同名文件或目录，无法恢复' })
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
    res.json({ message: restored ? '已恢复' : '已移除回收站记录' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = await db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: '回收站项目不存在' })
    }

    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    for (const trashPath of await resolveTrashPathCandidates(storage, item)) {
      await storage.remove(trashPath).catch(() => {})
    }

    await db.prepare('DELETE FROM trash WHERE id = ?').run(item.id)
    res.json({ message: '已永久删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
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
    res.json({ message: '回收站已清空' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
