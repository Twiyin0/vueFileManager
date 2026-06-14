import type { Request, Response } from 'express'
import { Logger, type LogSource } from '../../services/logger'
import { getRequestTranslator } from '../../services/server-i18n'

interface ServerErrorOptions {
  source?: LogSource
  fileName?: string
  status?: number
  message?: string
  context?: Record<string, unknown>
}

export async function sendServerError(
  req: Request,
  res: Response,
  err: unknown,
  options: ServerErrorOptions = {}
) {
  const status = options.status || 500
  const fallbackMessage = options.message || 'Internal server error'
  const message = err instanceof Error ? err.message : fallbackMessage

  await Logger.error(
    options.source || 'api',
    options.fileName || 'unknown.ts',
    options.message || message,
    err,
    options.context
  )

  const t = getRequestTranslator(req)
  res.status(status).json({ error: t(message || fallbackMessage) })
}
