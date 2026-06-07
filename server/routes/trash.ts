import { Router, Response } from 'express'
import db from '../db'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getStorage, getStorageByPoolId } from '../services/factory'

const router = Router()

// 获取回收站列表
router.get('/', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const items = db.prepare(`
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

// 恢复文件
router.post('/:id/restore', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: '回收站项目不存在' })
    }

    // 检查原路径是否已存在
    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    const exists = await storage.exists(item.original_path).catch(() => false)

    if (exists) {
      return res.status(400).json({ error: '原路径已存在同名文件，无法恢复' })
    }

    // 从回收站临时目录恢复文件（兼容新旧两种路径格式）
    const trashPathNew = `/.trash/${item.id}_${item.file_name}`
    const trashPathOld = `/.trash/${item.file_name}`
    let restored = false
    for (const trashPath of [trashPathNew, trashPathOld]) {
      try {
        const data = await storage.download(trashPath)
        await storage.upload(item.original_path, data)
        await storage.remove(trashPath)
        restored = true
        break
      } catch { /* 继续尝试下一个路径 */ }
    }
    if (!restored) {
      // 回收站文件不存在，只删除记录（可能是文件夹）
    }

    db.prepare('DELETE FROM trash WHERE id = ?').run(item.id)
    res.json({ message: '文件已恢复' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 永久删除
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(req.params.id, req.userId!) as any
    if (!item) {
      return res.status(404).json({ error: '回收站项目不存在' })
    }

    // 删除回收站中的文件（兼容新旧路径格式）
    const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
    await storage.remove(`/.trash/${item.id}_${item.file_name}`).catch(() => {})
    await storage.remove(`/.trash/${item.file_name}`).catch(() => {})

    db.prepare('DELETE FROM trash WHERE id = ?').run(item.id)
    res.json({ message: '已永久删除' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// 清空回收站
router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const items = db.prepare('SELECT * FROM trash WHERE user_id = ?').all(req.userId!) as any[]

    for (const item of items) {
      const storage = getStorageByPoolId(req.userId!, item.storage_pool_id)
      await storage.remove(`/.trash/${item.id}_${item.file_name}`).catch(() => {})
      await storage.remove(`/.trash/${item.file_name}`).catch(() => {})
    }

    db.prepare('DELETE FROM trash WHERE user_id = ?').run(req.userId!)
    res.json({ message: '回收站已清空' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
