import { Router } from 'express'
import db from '../../db'
import { authMiddleware, adminMiddleware, type AuthRequest } from '../../middleware/auth'
import { sendServerError } from './shared'

const router = Router()

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function isValidIpv4(ip: string): boolean {
  if (!IPV4_RE.test(ip)) return false
  return ip.split('.').every((part) => {
    const n = Number(part)
    return n >= 0 && n <= 255
  })
}

function isValidIpPattern(pattern: string): boolean {
  const value = pattern.trim()
  if (LOOPBACK_HOSTS.has(value)) return true
  if (CIDR_RE.test(value)) {
    const [ip, mask] = value.split('/')
    const maskNum = Number(mask)
    return maskNum >= 0 && maskNum <= 32 && isValidIpv4(ip)
  }
  return isValidIpv4(value)
}

async function getIpTableName() {
  const row = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
  return row?.mode === 'whitelist' ? 'ip_whitelist' : 'ip_blacklist'
}

router.get('/ip-blacklist', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const table = await getIpTableName()
    const entries = await db.prepare(`
      SELECT t.*, u.username as created_by_name
      FROM ${table} t
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.created_at DESC
    `).all()
    res.json({ entries })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'ip-list.ts', message: 'Failed to load IP entries' })
  }
})

router.post('/ip-blacklist', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const table = await getIpTableName()
    const { ip_pattern, reason } = req.body

    if (!ip_pattern || !isValidIpPattern(ip_pattern)) {
      return res.status(400).json({ error: 'storagePool.invalidIpOrCidr' })
    }

    const existing = await db.prepare(`SELECT id FROM ${table} WHERE ip_pattern = ?`).get(ip_pattern.trim())
    if (existing) {
      return res.status(409).json({ error: 'storagePool.ipOrRangeExists' })
    }

    const result = await db.prepare(`INSERT INTO ${table} (ip_pattern, reason, created_by) VALUES (?, ?, ?)`).run(
      ip_pattern.trim(),
      reason || '',
      req.userId
    )

    res.json({
      message: 'storagePool.ipEntryAdded',
      entry: { id: result.lastInsertRowid, ip_pattern: ip_pattern.trim(), reason: reason || '' }
    })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'ip-list.ts', message: 'Failed to create IP entry' })
  }
})

router.delete('/ip-blacklist/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const table = await getIpTableName()
    const id = Number(req.params.id)
    const entry = await db.prepare(`SELECT id, ip_pattern FROM ${table} WHERE id = ?`).get(id) as any

    if (!entry) {
      return res.status(404).json({ error: 'storagePool.ipEntryNotFound' })
    }

    const configRow = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
    if (configRow?.mode === 'whitelist' && LOOPBACK_HOSTS.has(entry.ip_pattern)) {
      return res.status(400).json({ error: 'storagePool.cannotDeleteLoopbackWhitelist' })
    }

    await db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id)
    res.json({ message: 'storagePool.ipEntryDeleted' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'ip-list.ts', message: 'Failed to delete IP entry' })
  }
})

router.get('/ip-list/mode', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const row = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
    res.json({ mode: row?.mode || 'blacklist' })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'ip-list.ts', message: 'Failed to load IP list mode' })
  }
})

router.put('/ip-list/mode', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { mode } = req.body
    if (!['blacklist', 'whitelist'].includes(mode)) {
      return res.status(400).json({ error: 'storagePool.onlyBlacklistOrWhitelist' })
    }

    const current = await db.prepare('SELECT mode FROM ip_list_config WHERE id = 1').get<{ mode: string }>()
    if (current?.mode === mode) {
      return res.json({ message: 'storagePool.modeUnchanged', mode })
    }

    await db.prepare('UPDATE ip_list_config SET mode = ? WHERE id = 1').run(mode)

    if (mode === 'whitelist') {
      const defaults = [
        { ip: '127.0.0.1', reason: 'Local loopback address' },
        { ip: '::1', reason: 'IPv6 local loopback' },
        { ip: 'localhost', reason: 'Local hostname' }
      ]
      const existing = new Set((await db.prepare('SELECT ip_pattern FROM ip_whitelist').all<{ ip_pattern: string }>()).map((row) => row.ip_pattern))
      const insert = db.prepare('INSERT INTO ip_whitelist (ip_pattern, reason, created_by) VALUES (?, ?, ?)')
      for (const item of defaults) {
        if (!existing.has(item.ip)) {
          await insert.run(item.ip, item.reason, req.userId)
        }
      }
    }

    res.json({ message: `Switched to ${mode} mode`, mode })
  } catch (err) {
    await sendServerError(req, res, err, { source: 'api', fileName: 'ip-list.ts', message: 'Failed to update IP list mode' })
  }
})

export default router
