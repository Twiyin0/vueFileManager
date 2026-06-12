import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const outdir = path.resolve('dist-server')

await mkdir(outdir, { recursive: true })

await build({
  entryPoints: {
    index: 'server/index.ts',
    'db-cli': 'server/db-migrate.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outdir,
  sourcemap: false,
  tsconfig: 'tsconfig.json',
  packages: 'external',
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true'
  },
  external: [
    'fsevents'
  ]
})

console.log('Built server bundles: dist-server/index.js, dist-server/db-cli.js')
