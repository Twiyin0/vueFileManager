import type { Response } from 'express'

export function sendServerError(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : '服务器内部错误'
  res.status(500).json({ error: message })
}
