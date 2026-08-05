import path from 'path'

export const appRoot = process.cwd()

export function resolveFromRoot(...segments: string[]) {
  return path.resolve(appRoot, ...segments)
}
