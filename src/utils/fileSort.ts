import type { FileItem } from '@/stores/files'

export type FileSortKey = 'name' | 'modified' | 'type' | 'size'
export type FileSortDirection = 'asc' | 'desc'

export function fileTypeLabel(file: FileItem) {
  if (file.isPool) return 'pool'
  if (file.type === 'folder') return 'folder'
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  return ext || 'file'
}

export function sortFiles(
  files: FileItem[],
  sortKey: FileSortKey,
  sortDirection: FileSortDirection
) {
  const direction = sortDirection === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1
    }

    let result = 0
    switch (sortKey) {
      case 'modified':
        result = new Date(a.modified).getTime() - new Date(b.modified).getTime()
        break
      case 'type':
        result = fileTypeLabel(a).localeCompare(fileTypeLabel(b))
        break
      case 'size':
        result = (a.size || 0) - (b.size || 0)
        break
      case 'name':
      default:
        result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        break
    }

    if (result === 0) {
      result = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    }

    return result * direction
  })
}
