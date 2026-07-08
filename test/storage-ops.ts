import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { LocalStorage } from '../server/services/local'
import { copyStorageEntry, moveStorageEntry, renameStorageEntry } from '../server/services/storage-ops'
import type { StorageCapabilities } from '../server/services/storage'

class TreeFallbackLocalStorage extends LocalStorage {
  async getCapabilities(): Promise<StorageCapabilities> {
    return {
      nativeDirectoryRename: false,
      nativeDirectoryMove: false,
      nativeDirectoryCopy: false,
      recommendedAsyncTreeThreshold: 5,
    }
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

async function seedTree(storage: LocalStorage) {
  await storage.mkdir('docs/nested')
  await storage.upload('docs/readme.txt', Buffer.from('hello world'))
  await storage.upload('docs/nested/info.txt', Buffer.from('nested file'))
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vuefm-storage-ops-'))

  try {
    const nativeStorage = new LocalStorage(path.join(tempRoot, 'native'))
    await seedTree(nativeStorage)
    await renameStorageEntry(nativeStorage, 'docs', 'docs-renamed')
    assert(await nativeStorage.exists('docs-renamed/readme.txt'), 'native rename should keep top-level file')
    assert(await nativeStorage.exists('docs-renamed/nested/info.txt'), 'native rename should keep nested file')

    const fallbackStorage = new TreeFallbackLocalStorage(path.join(tempRoot, 'fallback'))
    await seedTree(fallbackStorage)

    await renameStorageEntry(fallbackStorage, 'docs', 'docs-renamed')
    assert(await fallbackStorage.exists('docs-renamed/readme.txt'), 'tree rename should keep top-level file')
    assert(await fallbackStorage.exists('docs-renamed/nested/info.txt'), 'tree rename should keep nested file')

    await copyStorageEntry(fallbackStorage, 'docs-renamed', 'docs-copy')
    assert(await fallbackStorage.exists('docs-copy/readme.txt'), 'tree copy should keep top-level file')
    assert(await fallbackStorage.exists('docs-copy/nested/info.txt'), 'tree copy should keep nested file')

    await moveStorageEntry(fallbackStorage, 'docs-copy', 'archive/docs-moved')
    assert(await fallbackStorage.exists('archive/docs-moved/readme.txt'), 'tree move should keep top-level file')
    assert(await fallbackStorage.exists('archive/docs-moved/nested/info.txt'), 'tree move should keep nested file')
    assert(!(await fallbackStorage.exists('docs-copy')), 'tree move should remove source directory')

    let blocked = false
    try {
      await moveStorageEntry(fallbackStorage, 'docs-renamed', 'docs-renamed/child')
    } catch (err: any) {
      blocked = err.message === 'common.invalidPath'
    }
    assert(blocked, 'moving a directory into itself should be rejected')

    console.log('storage-ops tests passed')
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
