/**
 * Worker thread for TypeScript type-checking.
 * Runs ts.createProgram + diagnostics off the main event loop.
 *
 * Input (workerData): { sourceCode, virtualFiles, projectRoot }
 * Output (parentPort.postMessage): { errors: CompileError[] }
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import ts from 'typescript'

const esmRequire = createRequire(import.meta.url)

interface CompileError {
  message: string
  line?: number
  column?: number
}

const TS_COMPILE_OPTIONS: ts.CompilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  strict: false,
  esModuleInterop: true,
  skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  noEmit: false,
}

// Stub for drizzle-cube/server
const DRIZZLE_CUBE_SERVER_DTS = `
export interface SecurityContext { organisationId?: number | string; userId?: number | string; role?: string; groups?: Record<string, string[]>; groupIds?: number[]; [key: string]: any; }
export interface QueryContext { securityContext: SecurityContext; }
export interface BaseQueryDefinition { from: any; where?: any; }
export interface Cube { name: string; title?: string; description?: string; sql: any; dimensions: any; measures: any; joins?: any; }
export interface DimensionDef { name: string; title?: string; sql: any; type: 'string' | 'number' | 'boolean' | 'time'; primaryKey?: boolean; }
export interface MeasureDef { name: string; title?: string; sql: any; type: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max'; filters?: any[]; }
export interface JoinDef { targetCube: (() => Cube) | string; relationship: 'belongsTo' | 'hasMany' | 'hasOne' | 'belongsToMany'; on: Array<{ source: any; target: any }>; sqlJoinType?: 'inner' | 'left' | 'right' | 'full'; preferredFor?: string[]; through?: { table: any; sourceKey: Array<{ source: any; target: any; as?: any }>; targetKey: Array<{ source: any; target: any; as?: any }>; securitySql?: (securityContext: SecurityContext) => any }; }
export declare function defineCube(name: string, config: {
  title?: string;
  description?: string;
  sql: (ctx?: QueryContext) => BaseQueryDefinition;
  joins?: Record<string, JoinDef>;
  dimensions: Record<string, DimensionDef>;
  measures: Record<string, MeasureDef>;
  meta?: Record<string, any>;
}): Cube;
`

function tryReadRealFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

function typeCheck(
  sourceCode: string,
  projectRoot: string,
  virtualFiles?: Record<string, string>
): CompileError[] {
  const errors: CompileError[] = []
  const fileName = '/virtual/src/index.ts'
  const files = new Map<string, string>()
  files.set(fileName, sourceCode)

  if (virtualFiles) {
    for (const [path, content] of Object.entries(virtualFiles)) {
      const virtualPath = path.startsWith('/src/') ? `/virtual${path}` : path
      files.set(virtualPath, content)
    }
  }

  const cubeDtsPath = join(projectRoot, 'node_modules/drizzle-cube/dist/server/index.d.ts')
  files.set(cubeDtsPath, DRIZZLE_CUBE_SERVER_DTS)

  const tsLibDir = dirname(esmRequire.resolve('typescript'))

  const realModuleResolutionHost: ts.ModuleResolutionHost = {
    fileExists: f => existsSync(f),
    readFile: f => tryReadRealFile(f),
  }

  const host: ts.CompilerHost = {
    getSourceFile: (name, languageVersion) => {
      const content = files.get(name)
      if (content !== undefined) return ts.createSourceFile(name, content, languageVersion)
      const realContent = tryReadRealFile(name)
      if (realContent !== undefined) return ts.createSourceFile(name, realContent, languageVersion)
      const libContent = tryReadRealFile(join(tsLibDir, name.replace(/^\//, '')))
      if (libContent !== undefined) return ts.createSourceFile(name, libContent, languageVersion)
      return undefined
    },
    getDefaultLibFileName: options => join(tsLibDir, ts.getDefaultLibFileName(options)),
    writeFile: () => {},
    getCurrentDirectory: () => projectRoot,
    getCanonicalFileName: f => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: name => {
      if (files.has(name)) return true
      if (existsSync(name)) return true
      try {
        return existsSync(join(tsLibDir, name.replace(/^\//, '')))
      } catch {}
      return false
    },
    readFile: name => {
      if (files.has(name)) return files.get(name)
      const real = tryReadRealFile(name)
      if (real !== undefined) return real
      return tryReadRealFile(join(tsLibDir, name.replace(/^\//, '')))
    },
    resolveModuleNames: (moduleNames, containingFile) => {
      const isVirtualFile = containingFile.startsWith('/virtual/')

      return moduleNames.map(name => {
        if (isVirtualFile && (name.startsWith('./') || name.startsWith('../'))) {
          const virtualResolved = `/virtual/src/${name.replace(/^\.\//, '').replace(/\.ts$/, '')}.ts`
          if (files.has(virtualResolved)) {
            return { resolvedFileName: virtualResolved, isExternalLibraryImport: false }
          }
        }

        if (name === 'drizzle-cube/server') {
          return { resolvedFileName: cubeDtsPath, isExternalLibraryImport: true }
        }

        const resolveFrom = isVirtualFile ? join(projectRoot, 'index.ts') : containingFile
        const result = ts.resolveModuleName(
          name,
          resolveFrom,
          TS_COMPILE_OPTIONS,
          realModuleResolutionHost
        )
        if (result.resolvedModule) return result.resolvedModule
        return undefined
      })
    },
  }

  const program = ts.createProgram(
    [fileName],
    { ...TS_COMPILE_OPTIONS, noEmit: true, skipLibCheck: true },
    host
  )

  const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()]

  for (const d of diagnostics) {
    if (d.file && !d.file.fileName.startsWith('/virtual/src/')) continue
    const pos =
      d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined
    errors.push({
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      line: pos ? pos.line + 1 : undefined,
      column: pos ? pos.character + 1 : undefined,
    })
  }

  return errors
}

// Execute type-check and send result back to main thread
const { sourceCode, virtualFiles, projectRoot } = workerData as {
  sourceCode: string
  virtualFiles?: Record<string, string>
  projectRoot: string
}

try {
  const errors = typeCheck(sourceCode, projectRoot, virtualFiles)
  parentPort?.postMessage({ errors })
} catch (err: any) {
  parentPort?.postMessage({ errors: [{ message: `Type-check worker error: ${err.message}` }] })
}
