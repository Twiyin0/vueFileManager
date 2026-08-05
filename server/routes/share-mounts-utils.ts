import db from '../db'

export async function getUsernameByIdSafe(userId: number) {
  const row = await db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any
  return row?.username || `#${userId}`
}
