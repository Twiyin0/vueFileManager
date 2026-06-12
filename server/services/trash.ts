import type { StorageProvider } from './storage'

export interface TrashRecordLike {
  id: number
  file_name: string
  file_type: 'file' | 'folder'
  original_path: string
}

function ensureLeadingSlash(filePath: string) {
  return filePath.startsWith('/') ? filePath : `/${filePath}`
}

function joinPath(base: string, name: string) {
  const normalizedBase = ensureLeadingSlash(base).replace(/\/+$/, '')
  const normalizedName = name.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedName}`.replace(/\/+/g, '/')
}

export function buildTrashPath(id: number, fileName: string) {
  return `/.trash/${id}_${fileName}`
}

export function buildLegacyGuestTrashPath(fileName: string, id: number) {
  return `/.trash/${fileName}_${id}`
}

export function getTrashPathCandidates(item: TrashRecordLike) {
  return [
    buildTrashPath(item.id, item.file_name),
    buildLegacyGuestTrashPath(item.file_name, item.id),
    `/.trash/${item.file_name}`,
  ]
}

export async function resolveTrashPathCandidates(storage: StorageProvider, item: TrashRecordLike & { deleted_at?: string }) {
  const candidates = new Set(getTrashPathCandidates(item))

  try {
    const entries = await storage.list('/.trash')
    const fuzzyMatches = entries
      .filter((entry) => entry.name === item.file_name || entry.name.startsWith(`${item.file_name}_`))
      .sort((a, b) => {
        const aSuffix = a.name.slice(item.file_name.length + 1)
        const bSuffix = b.name.slice(item.file_name.length + 1)
        const aTime = /^\d+$/.test(aSuffix) ? Number(aSuffix) : Number.POSITIVE_INFINITY
        const bTime = /^\d+$/.test(bSuffix) ? Number(bSuffix) : Number.POSITIVE_INFINITY
        const deletedAt = item.deleted_at ? new Date(item.deleted_at).getTime() : 0
        return Math.abs(aTime - deletedAt) - Math.abs(bTime - deletedAt)
      })

    for (const entry of fuzzyMatches) {
      candidates.add(`/.trash/${entry.name}`)
    }
  } catch {}

  return Array.from(candidates)
}

async function ensureParentDirectories(storage: StorageProvider, fullPath: string) {
  const segments = ensureLeadingSlash(fullPath).split('/').filter(Boolean)
  if (segments.length <= 1) return

  let current = ''
  for (const segment of segments.slice(0, -1)) {
    current = `${current}/${segment}`
    await storage.mkdir(current).catch(() => {})
  }
}

async function copyEntry(storage: StorageProvider, sourcePath: string, targetPath: string, type: 'file' | 'folder') {
  if (type === 'folder') {
    await storage.mkdir(targetPath)
    const children = await storage.list(sourcePath)
    for (const child of children) {
      const childSourcePath = joinPath(sourcePath, child.name)
      const childTargetPath = joinPath(targetPath, child.name)
      await copyEntry(storage, childSourcePath, childTargetPath, child.type)
    }
    return
  }

  const data = await storage.download(sourcePath)
  await ensureParentDirectories(storage, targetPath)
  await storage.upload(targetPath, data)
}

async function removeEntry(storage: StorageProvider, targetPath: string, type: 'file' | 'folder') {
  if (type === 'folder') {
    const children = await storage.list(targetPath).catch(() => [])
    for (const child of children) {
      await removeEntry(storage, joinPath(targetPath, child.name), child.type)
    }
  }

  await storage.remove(targetPath).catch(() => {})
}

export async function moveToTrash(storage: StorageProvider, filePath: string, trashPath: string, type: 'file' | 'folder') {
  try {
    await ensureParentDirectories(storage, trashPath)
    await storage.move(filePath, trashPath)
    return
  } catch {}

  await copyEntry(storage, filePath, trashPath, type)
  await removeEntry(storage, filePath, type)
}

export async function restoreFromTrash(storage: StorageProvider, trashPath: string, originalPath: string, type: 'file' | 'folder') {
  try {
    await ensureParentDirectories(storage, originalPath)
    await storage.move(trashPath, originalPath)
    return true
  } catch {}

  try {
    await copyEntry(storage, trashPath, originalPath, type)
    await removeEntry(storage, trashPath, type)
    return true
  } catch {
    return false
  }
}
