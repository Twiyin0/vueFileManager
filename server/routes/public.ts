import { Router, Response, Request } from 'express'
import path from 'path'
import db from '../db'
import { getGuestStorage, getStorageByPoolId } from '../services/factory'
import { getRequestTranslator } from '../services/server-i18n'

const router = Router()

async function getUserByUsername(username: string) {
  return await db.prepare('SELECT id, username FROM users WHERE username = ?').get(username) as any
}

const mimeTypes: Record<string, string> = {
  'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
  'gif': 'image/gif', 'svg': 'image/svg+xml', 'webp': 'image/webp',
  'mp4': 'video/mp4', 'webm': 'video/webm', 'ogg': 'audio/ogg',
  'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'flac': 'audio/flac',
  'pdf': 'application/pdf',
  'txt': 'text/plain', 'md': 'text/markdown', 'json': 'application/json',
  'js': 'text/javascript', 'ts': 'text/typescript', 'html': 'text/html',
  'css': 'text/css', 'xml': 'text/xml', 'yaml': 'text/yaml', 'yml': 'text/yml',
  'py': 'text/x-python', 'java': 'text/x-java', 'go': 'text/x-go',
  'rs': 'text/x-rust', 'vue': 'text/x-vue', 'sh': 'text/x-shellscript',
}

function isPathSafe(targetPath: string): boolean {
  if (!targetPath) return true
  if (/\.\./.test(targetPath)) return false
  return true
}

router.get('/:username/*', async (req: Request, res: Response) => {
  try {
    const t = getRequestTranslator(req)
    const { username } = req.params
    const filePath = (req.params as any)[0]

    if (!filePath) {
      return res.status(400).json({ error: t('common.missingFilePath', 'Missing file path') })
    }

    const user = await getUserByUsername(username as string)
    if (!user) {
      return res.status(404).json({ error: t('auth.userNotFound', 'User not found') })
    }

    const guestConfig = await getGuestStorage(user.id)
    if (!guestConfig) {
      return res.status(403).json({ error: t('guest.guestModeDisabled', 'Guest mode is disabled for this user') })
    }

    const { storage, basePath } = guestConfig

    const fullPath = basePath ? (filePath ? `${basePath}/${filePath}` : basePath) : filePath

    if (!isPathSafe(filePath) || !isPathSafe(fullPath)) {
      return res.status(403).json({ error: t('public.pathAccessDenied', 'No permission to access this path') })
    }

    const fileInfo = await storage.info(fullPath)
    if (fileInfo.type !== 'file') {
      return res.status(400).json({ error: t('public.folderAccessUnsupported', 'Folder access is not supported') })
    }

    const data = await storage.download(fullPath)
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const fileName = filePath.split('/').pop() || 'file'

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream')
    res.setHeader('Content-Length', data.length)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`)
    res.setHeader('Cache-Control', 'public, max-age=86400')

    res.send(data)
  } catch (err: any) {
    const t = getRequestTranslator(req)
    if (err.message === 'File not found' || err.code === 'ENOENT') {
      return res.status(404).json({ error: t('common.fileNotFound', 'File not found') })
    }
    res.status(500).json({ error: err.message })
  }
})

export default router
