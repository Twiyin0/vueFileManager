import path from 'path'
import type { FileInfo, StorageCapabilities, StorageProvider } from './storage'

export type TreeOperationKind = 'rename' | 'move' | 'copy'

export interface TreeOperationPlan {
  source: FileInfo
  strategy: 'native' | 'tree'
  capabilities: StorageCapabilities
  estimatedItems: number
  estimateTruncated: boolean
  recommendAsync: boolean
}

const DEFAULT_STORAGE_CAPABILITIES: StorageCapabilities = {
  nativeDirectoryRename: true,
  nativeDirectoryMove: true,
  nativeDirectoryCopy: true,
  recommendedAsyncTreeThreshold: 200,
}

function normalizeOperationPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  if (!normalized) return ''
  const normalizedPath = path.posix.normalize(normalized)
  return normalizedPath.length > 1 ? normalizedPath.replace(/\/+$/, '') : normalizedPath
}

function joinChildPath(basePath: string, childName: string): string {
  return path.posix.join(basePath || '', childName)
}

function buildRenamedPath(oldPath: string, newName: string): string {
  const normalizedOldPath = normalizeOperationPath(oldPath)
  const parentDir = path.posix.dirname(normalizedOldPath)
  return parentDir === '.' ? newName : path.posix.join(parentDir, newName)
}

function isDescendantPath(parentPath: string, childPath: string): boolean {
  const normalizedParent = normalizeOperationPath(parentPath)
  const normalizedChild = normalizeOperationPath(childPath)
  if (!normalizedParent || !normalizedChild || normalizedParent === normalizedChild) {
    return normalizedParent === normalizedChild
  }
  return normalizedChild.startsWith(`${normalizedParent}/`)
}

async function countTreeItems(storage: StorageProvider, rootPath: string, limit: number): Promise<{ count: number; truncated: boolean }> {
  let count = 1
  let truncated = false

  const walk = async (currentPath: string) => {
    if (truncated) return
    const entries = await storage.list(currentPath)
    for (const entry of entries) {
      count++
      if (count > limit) {
        truncated = true
        return
      }
      if (entry.type === 'folder') {
        await walk(entry.path)
        if (truncated) return
      }
    }
  }

  await walk(rootPath)
  return { count, truncated }
}

async function copyTreeEntry(storage: StorageProvider, source: FileInfo, targetPath: string): Promise<void> {
  if (source.type === 'folder') {
    await storage.mkdir(targetPath)
    const children = await storage.list(source.path)
    for (const child of children) {
      await copyTreeEntry(storage, child, joinChildPath(targetPath, child.name))
    }
    return
  }

  await storage.copy(source.path, targetPath)
}

async function copyTree(storage: StorageProvider, srcPath: string, destPath: string): Promise<void> {
  const source = await storage.info(srcPath)
  await copyTreeEntry(storage, source, destPath)
}

async function moveTree(storage: StorageProvider, srcPath: string, destPath: string): Promise<void> {
  await copyTree(storage, srcPath, destPath)
  await storage.remove(srcPath)
}

export async function getStorageCapabilities(storage: StorageProvider): Promise<StorageCapabilities> {
  if (!storage.getCapabilities) {
    return { ...DEFAULT_STORAGE_CAPABILITIES }
  }

  return {
    ...DEFAULT_STORAGE_CAPABILITIES,
    ...(await storage.getCapabilities()),
  }
}

export async function planTreeOperation(storage: StorageProvider, operation: TreeOperationKind, sourcePath: string): Promise<TreeOperationPlan> {
  const source = await storage.info(sourcePath)
  const capabilities = await getStorageCapabilities(storage)

  if (source.type === 'file') {
    return {
      source,
      capabilities,
      strategy: 'native',
      estimatedItems: 1,
      estimateTruncated: false,
      recommendAsync: false,
    }
  }

  const strategy = (
    operation === 'rename' ? capabilities.nativeDirectoryRename
      : operation === 'move' ? capabilities.nativeDirectoryMove
        : capabilities.nativeDirectoryCopy
  ) ? 'native' : 'tree'

  if (strategy === 'native') {
    return {
      source,
      capabilities,
      strategy,
      estimatedItems: 1,
      estimateTruncated: false,
      recommendAsync: false,
    }
  }

  const threshold = Math.max(1, capabilities.recommendedAsyncTreeThreshold)
  const { count, truncated } = await countTreeItems(storage, sourcePath, threshold + 1)

  return {
    source,
    capabilities,
    strategy,
    estimatedItems: count,
    estimateTruncated: truncated,
    recommendAsync: count > threshold,
  }
}

export async function renameStorageEntry(storage: StorageProvider, oldPath: string, newName: string): Promise<void> {
  const plan = await planTreeOperation(storage, 'rename', oldPath)
  if (plan.source.type === 'file' || plan.strategy === 'native') {
    await storage.rename(oldPath, newName)
    return
  }

  await moveStorageEntry(storage, oldPath, buildRenamedPath(oldPath, newName))
}

export async function moveStorageEntry(storage: StorageProvider, srcPath: string, destPath: string): Promise<void> {
  const normalizedSourcePath = normalizeOperationPath(srcPath)
  const normalizedTargetPath = normalizeOperationPath(destPath)
  const plan = await planTreeOperation(storage, 'move', normalizedSourcePath)

  if (plan.source.type === 'folder' && isDescendantPath(normalizedSourcePath, normalizedTargetPath)) {
    throw new Error('common.invalidPath')
  }

  if (plan.source.type === 'file' || plan.strategy === 'native') {
    await storage.move(srcPath, destPath)
    return
  }

  await moveTree(storage, srcPath, destPath)
}

export async function copyStorageEntry(storage: StorageProvider, srcPath: string, destPath: string): Promise<void> {
  const normalizedSourcePath = normalizeOperationPath(srcPath)
  const normalizedTargetPath = normalizeOperationPath(destPath)
  const plan = await planTreeOperation(storage, 'copy', normalizedSourcePath)

  if (plan.source.type === 'folder' && isDescendantPath(normalizedSourcePath, normalizedTargetPath)) {
    throw new Error('common.invalidPath')
  }

  if (plan.source.type === 'file' || plan.strategy === 'native') {
    await storage.copy(srcPath, destPath)
    return
  }

  await copyTree(storage, srcPath, destPath)
}
