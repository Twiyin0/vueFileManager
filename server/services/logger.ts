import fs from 'fs/promises'
import path from 'path'
import config from '../config'
import { resolveFromRoot } from '../runtime-paths'

export type LogSource = 'api' | 'web' | 'webdav' | 'system'
export type LogLevelName = 'error' | 'info' | 'debug'

const LEVEL_WEIGHT: Record<LogLevelName, number> = {
  error: 1,
  info: 2,
  debug: 3
}

const LOG_DIR = resolveFromRoot('data', 'log')
const FILE_COUNTERS = new Map<string, number>()

function pad(value: number, width = 2) {
  return String(value).padStart(width, '0')
}

function formatTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function formatFileSegment(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

async function resolveExistingDailyCounter(prefix: string) {
  const entries = await fs.readdir(LOG_DIR).catch(() => [])
  let maxNumber = 0

  for (const entry of entries) {
    const match = entry.match(new RegExp(`^${prefix}_(\\d+)\\.log$`))
    if (!match) continue
    const current = Number(match[1])
    if (Number.isInteger(current) && current > maxNumber) {
      maxNumber = current
    }
  }

  return maxNumber
}

async function resolveLogFilePath(date = new Date()) {
  await fs.mkdir(LOG_DIR, { recursive: true })
  const prefix = formatFileSegment(date)

  if (!FILE_COUNTERS.has(prefix)) {
    const existing = await resolveExistingDailyCounter(prefix)
    FILE_COUNTERS.set(prefix, existing > 0 ? existing : 1)
  }

  const fileNumber = FILE_COUNTERS.get(prefix) || 1
  return path.join(LOG_DIR, `${prefix}_${fileNumber}.log`)
}

function getConfiguredLevel() {
  const level = Number(config.log_level || 2)
  if (level === 1 || level === 2 || level === 3) {
    return level
  }
  return 2
}

function normalizeMessage(message: string) {
  return message.replace(/\r\n/g, '\n').trim()
}

function serializeUnknown(error: unknown) {
  if (error instanceof Error) {
    const stack = error.stack || `${error.name}: ${error.message}`
    const cause = 'cause' in error && error.cause ? `\nCause: ${String(error.cause)}` : ''
    return `${error.name}: ${error.message}\n${stack}${cause}`
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error, null, 2)
  } catch {
    return String(error)
  }
}

async function appendLog(level: LogLevelName, source: LogSource, fileName: string, message: string) {
  if (LEVEL_WEIGHT[level] > getConfiguredLevel()) {
    return
  }

  const now = new Date()
  const line = `[${source}][${level}]${formatTimestamp(now)}(${fileName}): ${normalizeMessage(message)}\n`
  const filePath = await resolveLogFilePath(now)
  await fs.appendFile(filePath, line, 'utf8')
}

export const Logger = {
  async error(source: LogSource, fileName: string, message: string, error?: unknown, context?: Record<string, unknown>) {
    const parts = [message]
    if (context && Object.keys(context).length > 0) {
      parts.push(`Context: ${JSON.stringify(context, null, 2)}`)
    }
    if (error !== undefined) {
      parts.push(`Error: ${serializeUnknown(error)}`)
    }
    await appendLog('error', source, fileName, parts.join('\n'))
  },

  async info(source: LogSource, fileName: string, message: string) {
    await appendLog('info', source, fileName, message)
  },

  async debug(source: LogSource, fileName: string, message: string) {
    await appendLog('debug', source, fileName, message)
  }
}
