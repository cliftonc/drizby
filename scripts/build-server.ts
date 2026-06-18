/**
 * Build the server into a single bundled ESM file using esbuild.
 * Native modules and the TypeScript compiler are kept external.
 */

import { build } from 'esbuild'

const sharedOptions = {
  bundle: true,
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'node20',
  sourcemap: true,
  external: ['better-sqlite3', 'typescript', 'postgres'],
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module';const require = __createRequire(import.meta.url);`,
  },
}

// Main server bundle
await build({
  ...sharedOptions,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.js',
})

// Worker thread for type-checking (loaded dynamically, must be a separate file)
await build({
  ...sharedOptions,
  entryPoints: ['src/services/typecheck-worker.js'],
  outfile: 'dist/typecheck-worker.js',
})

console.log('Server built to dist/server.js + dist/typecheck-worker.js')
