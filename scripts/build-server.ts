/**
 * Build the server into a single bundled ESM file using esbuild.
 * Native modules and the TypeScript compiler are kept external.
 */

import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server.js',
  sourcemap: true,
  // Native modules + TypeScript (huge, uses dynamic requires for runtime compilation)
  external: [
    'better-sqlite3',
    'typescript',
    'postgres',
  ],
  banner: {
    // createRequire shim for external CJS modules in ESM bundle
    js: `import { createRequire as __createRequire } from 'node:module';const require = __createRequire(import.meta.url);`,
  },
})

console.log('Server built to dist/server.js')
