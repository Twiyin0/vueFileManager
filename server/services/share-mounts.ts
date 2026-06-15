import db from '../db'
import { getStorageByPoolId } from './factory'
import type { FileInfo } from './storage'
import { isJunkFile, isTemporaryUploadFile } from '../routes/files/shared'

export interface ShareMountDirectoryRow {
  id: number
  user_id: number
  path: string
  created_at: string
}

export interface ShareMountRow {
  id: number
  user_id: number
  target_path: string
  source_pool_id: number
  source_path: string
  created_at: string
}

export interface ShareMountListItem extends FileInfo {
  poolId?: number
  directUrl?: string
  fileUrl?: string
  isVirtual?: boolean
  mountId?: number
  sourcePath?: string
  sourcePoolId?: number
}

export interface ShareMountFlatFile {
  fileName: string
  filePath: string
  fileDirect: string
}

interface NamedMount {
  mount: ShareMountRow
  displayName: string
}

interface ResolvedVirtualDirectory {
  kind: 'virtual-dir'
  virtualPath: string
}

interface ResolvedMountedPath {
  kind: 'mounted'
  virtualPath: string
  mountRootPath: string
  mountDisplayName: string
  mount: ShareMountRow
  sourceFullPath: string
  relativeSubPath: string
}

export type ResolvedShareMountPath = ResolvedVirtualDirectory | ResolvedMountedPath

function normalizeSegments(rawPath: string) {
  return rawPath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

export function normalizeShareMountPath(rawPath: string | undefined | null) {
  return normalizeSegments(rawPath || '').join('/')
}

export function getShareMountBaseName(rawPath: string) {
  const normalized = normalizeShareMountPath(rawPath)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

export function getShareMountParentPath(rawPath: string) {
  const normalized = normalizeShareMountPath(rawPath)
  const segments = normalized.split('/').filter(Boolean)
  segments.pop()
  return segments.join('/')
}

function normalizeSourceStoragePath(rawPath: string | undefined | null) {
  const normalized = normalizeSegments(rawPath || '').join('/')
  if (!normalized) return ''
  const hasLeadingSlash = (rawPath || '').replace(/\\/g, '/').startsWith('/')
  return hasLeadingSlash ? `/${normalized}` : normalized
}

function getSourceStorageBaseName(rawPath: string) {
  const normalized = normalizeSourceStoragePath(rawPath)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

function getSourceStorageParentPath(rawPath: string) {
  const normalized = normalizeSourceStoragePath(rawPath)
  const segments = normalized.split('/').filter(Boolean)
  const hasLeadingSlash = normalized.startsWith('/')
  segments.pop()
  if (segments.length === 0) {
    return hasLeadingSlash ? '/' : ''
  }
  const parent = segments.join('/')
  return hasLeadingSlash ? `/${parent}` : parent
}

function joinShareMountPath(...parts: Array<string | undefined>) {
  return parts
    .flatMap((part) => normalizeSegments(part || ''))
    .join('/')
}

function buildUrlPath(virtualPath: string) {
  const normalized = normalizeShareMountPath(virtualPath)
  if (!normalized) return '/share'
  return `/share/${normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`
}

async function isFolderLike(userId: number, sourcePoolId: number, sourcePath: string) {
  const normalizedPath = normalizeSourceStoragePath(sourcePath)
  const storage = getStorageByPoolId(userId, sourcePoolId)

  try {
    const info = await storage.info(normalizedPath)
    if (info.type === 'folder') {
      return true
    }
  } catch {
    // Fall through to additional checks below.
  }

  const parentPath = getSourceStorageParentPath(normalizedPath)
  const baseName = getSourceStorageBaseName(normalizedPath)

  if (baseName) {
    try {
      const siblings = await storage.list(parentPath)
      const match = siblings.find((item) => item.name === baseName)
      if (match) {
        return match.type === 'folder'
      }
    } catch {
      // Continue to directory probe.
    }
  }

  try {
    await storage.list(normalizedPath)
    return true
  } catch {
    return false
  }
}

async function getDirectoryRows(userId: number) {
  return await db.prepare(`
    SELECT id, user_id, path, created_at
    FROM share_mount_dirs
    WHERE user_id = ?
    ORDER BY path ASC
  `).all<ShareMountDirectoryRow>(userId)
}

async function getMountRowsByTarget(userId: number, targetPath: string) {
  return await db.prepare(`
    SELECT id, user_id, target_path, source_pool_id, source_path, created_at
    FROM share_mounts
    WHERE user_id = ? AND target_path = ?
    ORDER BY created_at ASC, id ASC
  `).all<ShareMountRow>(userId, normalizeShareMountPath(targetPath))
}

function getImmediateDirectoryChildren(rows: ShareMountDirectoryRow[], parentPath: string) {
  const normalizedParent = normalizeShareMountPath(parentPath)
  return rows.filter((row) => getShareMountParentPath(row.path) === normalizedParent)
}

function assignMountDisplayNames(mounts: ShareMountRow[], reservedNames: Set<string>) {
  const usage = new Map<string, number>()
  const baseNameCount = new Map<string, number>()
  for (const mount of mounts) {
    const baseName = getSourceStorageBaseName(mount.source_path) || `pool_${mount.source_pool_id}`
    baseNameCount.set(baseName, (baseNameCount.get(baseName) || 0) + 1)
  }

  const named: NamedMount[] = []
  for (const mount of mounts) {
    const baseName = getSourceStorageBaseName(mount.source_path) || `pool_${mount.source_pool_id}`
    const needsSuffix = (baseNameCount.get(baseName) || 0) > 1 || reservedNames.has(baseName)
    let candidate = needsSuffix ? `${baseName}_${mount.source_pool_id}` : baseName
    if (!candidate) {
      candidate = `pool_${mount.source_pool_id}`
    }

    let finalName = candidate
    let index = 2
    while (reservedNames.has(finalName) || usage.has(finalName)) {
      finalName = `${candidate}_${index}`
      index += 1
    }

    usage.set(finalName, 1)
    named.push({ mount, displayName: finalName })
  }
  return named
}

async function ensureSourceFolders(userId: number, items: Array<{ sourcePoolId: number; sourcePath: string }>) {
  for (const item of items) {
    const isFolder = await isFolderLike(userId, item.sourcePoolId, item.sourcePath)
    if (!isFolder) {
      throw new Error(`Only folders can be mounted: ${item.sourcePath}`)
    }
  }
}

export async function ensureShareMountDirectory(userId: number, rawPath: string) {
  const normalized = normalizeShareMountPath(rawPath)
  if (!normalized) return

  const segments = normalized.split('/')
  const paths: string[] = []
  for (let index = 0; index < segments.length; index += 1) {
    paths.push(segments.slice(0, index + 1).join('/'))
  }

  const statement = db.prepare('INSERT OR IGNORE INTO share_mount_dirs (user_id, path) VALUES (?, ?)')
  for (const path of paths) {
    await statement.run(userId, path)
  }
}

export async function createShareMountDirectory(userId: number, rawPath: string) {
  const normalized = normalizeShareMountPath(rawPath)
  if (!normalized) {
    throw new Error('Directory path is required')
  }
  await ensureShareMountDirectory(userId, normalized)
  return normalized
}

export async function listShareMountDirectories(userId: number) {
  const rows = await getDirectoryRows(userId)
  return ['', ...rows.map((row) => normalizeShareMountPath(row.path))]
}

export async function addShareMounts(
  userId: number,
  rawTargetPath: string,
  items: Array<{ sourcePoolId: number; sourcePath: string }>
) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No folders selected for mounting')
  }

  const targetPath = normalizeShareMountPath(rawTargetPath)
  await ensureSourceFolders(userId, items.map((item) => ({
    sourcePoolId: Number(item.sourcePoolId),
    sourcePath: normalizeSourceStoragePath(item.sourcePath)
  })))
  await ensureShareMountDirectory(userId, targetPath)

  const statement = db.prepare(`
    INSERT OR IGNORE INTO share_mounts (user_id, target_path, source_pool_id, source_path)
    VALUES (?, ?, ?, ?)
  `)

  for (const item of items) {
    await statement.run(
        userId,
        targetPath,
        Number(item.sourcePoolId),
        normalizeSourceStoragePath(item.sourcePath)
      )
  }
}

export async function removeShareMount(userId: number, mountId: number) {
  const mount = await db.prepare(`
    SELECT id, user_id, target_path, source_pool_id, source_path, created_at
    FROM share_mounts
    WHERE id = ? AND user_id = ?
  `).get<ShareMountRow>(mountId, userId)

  if (!mount) {
    throw new Error('Share mount not found')
  }

  await db.prepare('DELETE FROM share_mounts WHERE id = ? AND user_id = ?').run(mountId, userId)
  return mount
}

export async function removeShareMountDirectory(userId: number, rawPath: string) {
  const targetPath = normalizeShareMountPath(rawPath)
  if (!targetPath) {
    throw new Error('Directory path is required')
  }

  const directory = await db.prepare(`
    SELECT id, user_id, path, created_at
    FROM share_mount_dirs
    WHERE user_id = ? AND path = ?
  `).get<ShareMountDirectoryRow>(userId, targetPath)

  if (!directory) {
    throw new Error('Share mount directory not found')
  }

  const pathPrefix = `${targetPath}/%`

  await db.prepare(`
    DELETE FROM share_mounts
    WHERE user_id = ?
      AND (target_path = ? OR target_path LIKE ?)
  `).run(userId, targetPath, pathPrefix)

  await db.prepare(`
    DELETE FROM share_mount_dirs
    WHERE user_id = ?
      AND (path = ? OR path LIKE ?)
  `).run(userId, targetPath, pathPrefix)

  return directory
}

export async function resolveShareMountPath(userId: number, rawPath: string): Promise<ResolvedShareMountPath | null> {
  const virtualPath = normalizeShareMountPath(rawPath)
  const segments = virtualPath ? virtualPath.split('/') : []
  const directoryRows = await getDirectoryRows(userId)

  if (segments.length === 0) {
    return { kind: 'virtual-dir', virtualPath: '' }
  }

  let currentPath = ''
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const childDirs = getImmediateDirectoryChildren(directoryRows, currentPath)
    const childDirMap = new Map(childDirs.map((row) => [getShareMountBaseName(row.path), row]))
    const childDir = childDirMap.get(segment)
    if (childDir) {
      currentPath = normalizeShareMountPath(childDir.path)
      continue
    }

    const mounts = await getMountRowsByTarget(userId, currentPath)
    const reservedNames = new Set(childDirs.map((row) => getShareMountBaseName(row.path)))
    const namedMounts = assignMountDisplayNames(mounts, reservedNames)
    const matchedMount = namedMounts.find((item) => item.displayName === segment)
    if (!matchedMount) {
      return null
    }

    const relativeSegments = segments.slice(index + 1)
    const relativeSubPath = relativeSegments.join('/')
    return {
      kind: 'mounted',
      virtualPath,
      mountRootPath: joinShareMountPath(currentPath, matchedMount.displayName),
      mountDisplayName: matchedMount.displayName,
      mount: matchedMount.mount,
      sourceFullPath: joinShareMountPath(matchedMount.mount.source_path, relativeSubPath),
      relativeSubPath
    }
  }

  return { kind: 'virtual-dir', virtualPath: currentPath }
}

export async function listShareMountPath(
  userId: number,
  rawPath: string,
  buildDirectUrl?: (virtualPath: string) => string
): Promise<ShareMountListItem[]> {
  const resolved = await resolveShareMountPath(userId, rawPath)
  if (!resolved) {
    throw new Error('Share mount path not found')
  }

  if (resolved.kind === 'virtual-dir') {
    const directoryRows = await getDirectoryRows(userId)
    const childDirs = getImmediateDirectoryChildren(directoryRows, resolved.virtualPath)
    const reservedNames = new Set(childDirs.map((row) => getShareMountBaseName(row.path)))
    const mounts = await getMountRowsByTarget(userId, resolved.virtualPath)
    const namedMounts = assignMountDisplayNames(mounts, reservedNames)

    const dirItems: ShareMountListItem[] = childDirs.map((row) => ({
      name: getShareMountBaseName(row.path),
      type: 'folder',
      size: 0,
      modified: row.created_at || new Date().toISOString(),
      path: normalizeShareMountPath(row.path),
      directUrl: '',
      fileUrl: '',
      isVirtual: true
    }))

    const mountItems: ShareMountListItem[] = namedMounts.map(({ mount, displayName }) => ({
      name: displayName,
      type: 'folder',
      size: 0,
      modified: mount.created_at || new Date().toISOString(),
      path: joinShareMountPath(resolved.virtualPath, displayName),
      poolId: mount.source_pool_id,
      directUrl: '',
      fileUrl: '',
      mountId: mount.id,
      sourcePath: mount.source_path,
      sourcePoolId: mount.source_pool_id
    }))

    return [...dirItems, ...mountItems].sort((left, right) => {
      if (left.type !== right.type) return left.type === 'folder' ? -1 : 1
      return left.name.localeCompare(right.name, 'zh-CN')
    })
  }

  const storage = getStorageByPoolId(userId, resolved.mount.source_pool_id)
  const files = await storage.list(resolved.sourceFullPath)
  return files
    .filter((file) => !isJunkFile(file.name) && !isTemporaryUploadFile(file.name))
    .map((file) => {
      const virtualChildPath = joinShareMountPath(resolved.virtualPath, file.name)
      const directUrl = file.type === 'file' && buildDirectUrl ? buildDirectUrl(virtualChildPath) : ''
      return {
        ...file,
        path: virtualChildPath,
        poolId: resolved.mount.source_pool_id,
        directUrl,
        fileUrl: directUrl,
        sourcePoolId: resolved.mount.source_pool_id
      } satisfies ShareMountListItem
    })
}

export async function listAllShareMountFiles(
  userId: number,
  rawPath: string,
  buildDirectUrl: (virtualPath: string) => string
): Promise<ShareMountFlatFile[]> {
  const files = await listShareMountPath(userId, rawPath, buildDirectUrl)
  const results: ShareMountFlatFile[] = []

  for (const item of files) {
    if (item.type === 'file') {
      results.push({
        fileName: item.name,
        filePath: item.path,
        fileDirect: item.directUrl || buildDirectUrl(item.path)
      })
      continue
    }

    const nested = await listAllShareMountFiles(userId, item.path, buildDirectUrl)
    results.push(...nested)
  }

  return results
}

export async function getShareMountFileInfo(userId: number, rawPath: string) {
  const resolved = await resolveShareMountPath(userId, rawPath)
  if (!resolved || resolved.kind !== 'mounted') {
    throw new Error('Share mount file not found')
  }

  const storage = getStorageByPoolId(userId, resolved.mount.source_pool_id)
  const info = await storage.info(resolved.sourceFullPath)
  return {
    resolved,
    storage,
    info
  }
}

export function buildShareMountAccessPath(rawPath: string) {
  return buildUrlPath(rawPath)
}
