import { Router, type Response } from 'express'
import db from '../db'
import { authMiddleware, type AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const poolId = req.query.poolId as string | undefined
    const items = poolId
      ? await db.prepare(`
          SELECT f.*, sp.name as pool_name, sp.storage_type
          FROM favourites f
          JOIN storage_pools sp ON f.storage_pool_id = sp.id
          WHERE f.user_id = ? AND f.storage_pool_id = ?
          ORDER BY f.created_at DESC
        `).all(req.userId!, parseInt(poolId, 10))
      : await db.prepare(`
          SELECT f.*, sp.name as pool_name, sp.storage_type
          FROM favourites f
          JOIN storage_pools sp ON f.storage_pool_id = sp.id
          WHERE f.user_id = ?
          ORDER BY f.created_at DESC
        `).all(req.userId!)

    res.json({ items })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { filePath, fileName, fileType, storagePoolId } = req.body
    if (!filePath || !fileName || !fileType || !storagePoolId) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    await db.prepare(`
      INSERT OR IGNORE INTO favourites (user_id, file_path, file_name, file_type, storage_pool_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId!, filePath, fileName, fileType, storagePoolId)

    res.json({ message: '已添加到收藏' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { filePath, storagePoolId } = req.query
    if (!filePath || !storagePoolId) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    await db.prepare('DELETE FROM favourites WHERE user_id = ? AND file_path = ? AND storage_pool_id = ?')
      .run(req.userId!, filePath, parseInt(storagePoolId as string, 10))

    res.json({ message: '已取消收藏' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/check', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { filePath, storagePoolId } = req.query
    if (!filePath || !storagePoolId) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const item = await db.prepare('SELECT id FROM favourites WHERE user_id = ? AND file_path = ? AND storage_pool_id = ?')
      .get(req.userId!, filePath, parseInt(storagePoolId as string, 10))

    res.json({ isFavourited: !!item })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
