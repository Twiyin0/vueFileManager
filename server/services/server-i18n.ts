import type { NextFunction, Request, Response } from 'express'
import config, { type AppLanguage } from '../config'
import db from '../db'
import enUsMessages from '../i18n/en-us.json'
import zhCnMessages from '../i18n/zh-cn.json'

type TranslationValue = string | Record<string, string>
interface TranslationTree {
  [key: string]: TranslationValue | TranslationTree
}
type FlatDictionary = Record<string, string>
type TranslationBundle = {
  flat: FlatDictionary
  reverse: FlatDictionary
}

const dictionaries: Record<AppLanguage, TranslationBundle> = {
  'en-US': createTranslationBundle(enUsMessages as TranslationTree),
  'zh-CN': createTranslationBundle(zhCnMessages as TranslationTree)
}

const fallbackLanguage: AppLanguage = 'en-US'

function flattenTranslations(tree: TranslationTree, prefix = ''): FlatDictionary {
  const output: FlatDictionary = {}

  for (const [key, value] of Object.entries(tree)) {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      output[nextKey] = value
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const childValues = value as Record<string, unknown>
      const allLeafStrings = Object.values(childValues).every((item) => typeof item === 'string')
      if (allLeafStrings && Object.keys(childValues).length > 0) {
        output[nextKey] = JSON.stringify(childValues)
      } else {
        Object.assign(output, flattenTranslations(value as TranslationTree, nextKey))
      }
    }
  }

  return output
}

function createTranslationBundle(tree: TranslationTree): TranslationBundle {
  const flat = flattenTranslations(tree)
  return {
    flat,
    reverse: buildReverseDictionary(flat)
  }
}

function buildReverseDictionary(dictionary: FlatDictionary): FlatDictionary {
  const reverse: FlatDictionary = {}

  for (const [key, value] of Object.entries(dictionary)) {
    reverse[value] = key

    const structured = parseStructuredTranslation(value)
    if (structured) {
      reverse[structured] = key
    }
  }

  return reverse
}

function normalizeLanguage(language: unknown): AppLanguage {
  return language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function extractLanguageFromHeader(headerValue: string | undefined): AppLanguage {
  if (!headerValue) {
    return normalizeLanguage(config.default_language)
  }

  const firstLanguage = headerValue
    .split(',')
    .map((value) => value.trim())
    .find(Boolean)
    ?.toLowerCase()

  if (firstLanguage?.startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en-US'
}

function translateTemplate(template: string, params?: Record<string, string | number>) {
  if (!params) return template

  let output = template
  for (const [key, value] of Object.entries(params)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }
  return output
}

function looksLikeTranslationKey(input: string) {
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i.test(input)
}

function parseStructuredTranslation(input: string | undefined, params?: Record<string, string | number>) {
  if (!input) return undefined

  try {
    const parsed = JSON.parse(input) as Record<string, string>
    if (parsed && typeof parsed === 'object') {
      const value = parsed.default ?? parsed.message ?? ''
      if (value) {
        return translateTemplate(value, params)
      }
    }
  } catch {
    // ignore non-JSON leaf values
  }

  return undefined
}

export function translateServerText(
  keyOrMessage: string,
  language: AppLanguage,
  fallback?: string,
  params?: Record<string, string | number>
): string {
  const preferred = dictionaries[language]
  const fallbackDictionary = dictionaries[fallbackLanguage]
  const directPreferred = preferred.flat[keyOrMessage]
  const directFallback = fallbackDictionary.flat[keyOrMessage]

  const preferredValue = parseStructuredTranslation(directPreferred, params) || (directPreferred ? translateTemplate(directPreferred, params) : undefined)
  if (preferredValue) return preferredValue

  const fallbackValue = parseStructuredTranslation(directFallback, params) || (directFallback ? translateTemplate(directFallback, params) : undefined)
  if (fallbackValue) return fallbackValue

  const reverseKey = preferred.reverse[keyOrMessage] || fallbackDictionary.reverse[keyOrMessage]
  if (reverseKey) {
    const reversePreferred = preferred.flat[reverseKey]
    const reverseFallback = fallbackDictionary.flat[reverseKey]
    const reversePreferredValue = parseStructuredTranslation(reversePreferred, params) || (reversePreferred ? translateTemplate(reversePreferred, params) : undefined)
    if (reversePreferredValue) return reversePreferredValue

    const reverseFallbackValue = parseStructuredTranslation(reverseFallback, params) || (reverseFallback ? translateTemplate(reverseFallback, params) : undefined)
    if (reverseFallbackValue) return reverseFallbackValue
  }

  if (looksLikeTranslationKey(keyOrMessage)) {
    const fallbackMessage = fallback || keyOrMessage
    return translateTemplate(fallbackMessage, params)
  }

  return translateTemplate(fallback || keyOrMessage, params)
}

export async function resolveRequestLanguage(req: Request): Promise<AppLanguage> {
  const requestWithUser = req as Request & { userId?: number }
  if (requestWithUser.userId) {
    try {
      const row = await db.prepare('SELECT language FROM user_settings WHERE user_id = ?').get(requestWithUser.userId) as { language?: string } | undefined
      if (row?.language) {
        return normalizeLanguage(row.language)
      }
    } catch {
      // Ignore language lookup failures and fall back to request headers.
    }
  }

  return extractLanguageFromHeader(req.headers['accept-language'] as string | undefined)
}

function translatePayloadValue(value: unknown, language: AppLanguage): unknown {
  if (typeof value === 'string' && looksLikeTranslationKey(value)) {
    return translateServerText(value, language)
  }

  if (typeof value === 'string') {
    return translateServerText(value, language)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => translatePayloadValue(entry, language))
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const params = record.params && typeof record.params === 'object'
      ? record.params as Record<string, string | number>
      : undefined
    const next: Record<string, unknown> = {}
    for (const [key, childValue] of Object.entries(value)) {
      if (key === 'params') {
        continue
      }

      if (key === 'message' || key === 'error') {
        if (typeof childValue === 'string') {
          next[key] = translateServerText(childValue, language, undefined, params)
        } else {
          next[key] = childValue
        }
        continue
      }

      if (key === 'error_message') {
        if (typeof childValue === 'string') {
          next[key] = translateServerText(childValue, language, undefined, params)
        } else {
          next[key] = childValue
        }
        continue
      }

      if (key === 'errors' && Array.isArray(childValue)) {
        next[key] = childValue.map((entry) => translatePayloadValue(entry, language))
        continue
      }

      if (Array.isArray(childValue)) {
        next[key] = childValue.map((entry) => translatePayloadValue(entry, language))
        continue
      }

      if (childValue && typeof childValue === 'object') {
        next[key] = translatePayloadValue(childValue, language)
        continue
      }

      next[key] = childValue
    }
    return next
  }

  return value
}

export async function translateResponsePayload(req: Request, payload: unknown) {
  const language = await resolveRequestLanguage(req)
  return translatePayloadValue(payload, language)
}

export function registerServerI18nMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const resolvedLanguage = await resolveRequestLanguage(req)
    ;(req as any).__resolvedLanguage = resolvedLanguage
    ;(req as any).t = (
      keyOrMessage: string,
      fallback?: string,
      params?: Record<string, string | number>
    ) => translateServerText(keyOrMessage, resolvedLanguage, fallback, params)

    const originalJson = res.json.bind(res)
    res.json = ((body: unknown) => originalJson(translatePayloadValue(body, resolvedLanguage))) as Response['json']
    next()
  }
}

export function getRequestTranslator(req: Request) {
  const language = ((req as any).__resolvedLanguage as AppLanguage | undefined) || fallbackLanguage
  return (
    keyOrMessage: string,
    fallback?: string,
    params?: Record<string, string | number>
  ) => translateServerText(keyOrMessage, language, fallback, params)
}
