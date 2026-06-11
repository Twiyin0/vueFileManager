import { Router, Response } from 'express'
import db from '../../db'
import { authMiddleware, adminMiddleware, AuthRequest } from '../../middleware/auth'
import { sendServerError } from './shared'

const router = Router()

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/

function isValidIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false
  return ip.split('.').every(part => {
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function isValidIpPattern(pattern: string): boolean {
  const value = pattern.trim()
  if (CIDR_RE.test(value)) {
    const [ip, mask] = value.split('/')
    const maskNum = Number(mask)
    return maskNum >= 0 && maskNum <= 32 && isValidIpv4(ip)
  }
  return isValidIpv4(value)
}

function getIpTableName() {
  const row = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
  return row?.mode === 'whitelist' ? 'ip_whitelist' : 'ip_blacklist'
}

router.get('/ip-blacklist', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const entries = db.prepare(`
      SELECT t.*, u.username as created_by_name
      FROM ${table} t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `).all()
    res.json({ entries })
  } catch (err) {
    sendServerError(res, err)
  }
})

router.post('/ip-blacklist', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const { ip_pattern, reason } = req.body

    if (!ip_pattern || !isValidIpPattern(ip_pattern)) {
      return res.status(400).json({ error: '无效的 IP 或 CIDR 格式' })
    }

    const existing = db.prepare(`SELECT id FROM ${table} WHERE ip_pattern = ?`).get(ip_pattern.trim())
    if (existing) {
      return res.status(409).json({ error: '该 IP 或网段已存在' })
    }

    const result = db.prepare(`INSERT INTO ${table} (ip_pattern, reason, created_by) VALUES (?, ?, ?)`).run(
      ip_pattern.trim(),
      reason || '',
      req.userId
    )

    res.json({
      message: 'IP 条目添加成功',
      entry: { id: result.lastInsertRowid, ip_pattern: ip_pattern.trim(), reason: reason || '' }
    })
  } catch (err) {
    sendServerError(res, err)
  }
})

router.delete('/ip-blacklist/:id', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const table = getIpTableName()
    const id = Number(req.params.id)
    const entry = db.prepare(`SELECT id, ip_pattern FROM ${table} WHERE id = ?`).get(id) as any

    if (!entry) {
      return res.status(404).json({ error: '条目不存在' })
    }

    const configRow = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (configRow?.mode === 'whitelist' && entry.ip_pattern === '127.0.0.1') {
      return res.status(400).json({ error: '白名单模式下不能删除 127.0.0.1' })
    }

    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    res.json({ message: 'IP 条目已删除' })
  } catch (err) {
    sendServerError(res, err)
  }
})

router.get('/ip-list/mode', authMiddleware, adminMiddleware, (_req: AuthRequest, res: Response) => {
  try {
    const row = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    res.json({ mode: row?.mode || 'blacklist' })
  } catch (err) {
    sendServerError(res, err)
  }
})

router.put('/ip-list/mode', authMiddleware, adminMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { mode } = req.body
    if (!['blacklist', 'whitelist'].includes(mode)) {
      return res.status(400).json({ error: '仅支持 blacklist 或 whitelist' })
    }

    const current = db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get() as { mode: string } | undefined
    if (current?.mode === mode) {
      return res.json({ message: '模式未变化', mode })
    }

    db.prepare('UPDATE ip_list_config SET mode = ? WHERE id = 1').run(mode)

    if (mode === 'whitelist') {
      const defaults = [
        { ip: '127.0.0.1', reason: '本地回环地址' },
        { ip: '::1', reason: 'IPv6 本地回环' },
        { ip: 'localhost', reason: '本地主机名' }
      ]
      const existing = new Set((db.prepare('SELECT ip_pattern FROM ip_whitelist').all() as { ip_pattern: string }[]).map(row => row.ip_pattern))
      const insert = db.prepare('INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)')
      for (const item of defaults) {
        if (!existing.has(item.ip)) {
          insert.run(item.ip, item.reason, req.userId)
        }
      }
    }

    res.json({ message: `已切换为 ${mode} 模式`, mode })
  } catch (err) {
    sendServerError(res, err)
  }
})

export default router
