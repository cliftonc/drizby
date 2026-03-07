/**
 * Cube Compiler Service
 * Type-checks and compiles TypeScript source using sandboxed require
 */

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const esmRequire = createRequire(import.meta.url)
const PROJECT_ROOT = process.cwd()

interface CompileResult {
  exports: Record<string, any>
  errors: CompileError[]
}

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

/**
 * Build a virtual file system for type-checking.
 * Maps file paths to content for allowed modules + the user's source.
 */
function buildVirtualFiles(
  fileName: string,
  sourceCode: string,
  extraFiles?: Record<string, string>
): Map<string, string> {
  const files = new Map<string, string>()
  files.set(fileName, sourceCode)

  if (extraFiles) {
    for (const [path, content] of Object.entries(extraFiles)) {
      files.set(path, content)
    }
  }

  return files
}

// Stub for drizzle-cube/server — the real .d.ts pulls in too many transitive deps
const DRIZZLE_CUBE_SERVER_DTS = `
export interface SecurityContext { organisationId?: number | string; userId?: number | string; [key: string]: any; }
export interface QueryContext { securityContext: SecurityContext; }
export interface BaseQueryDefinition { from: any; where?: any; }
export interface Cube { name: string; title?: string; description?: string; sql: any; dimensions: any; measures: any; joins?: any; }
export interface DimensionDef { name: string; title?: string; sql: any; type: 'string' | 'number' | 'boolean' | 'time'; primaryKey?: boolean; }
export interface MeasureDef { name: string; title?: string; sql: any; type: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max'; filters?: any[]; }
export interface JoinDef { targetCube: () => Cube; relationship: 'belongsTo' | 'hasMany' | 'hasOne'; on: Array<{ source: any; target: any }>; }
export declare function defineCube(name: string, config: {
  title?: string;
  description?: string;
  sql: (ctx: QueryContext) => BaseQueryDefinition;
  joins?: Record<string, JoinDef>;
  dimensions: Record<string, DimensionDef>;
  measures: Record<string, MeasureDef>;
}): Cube;
`

/**
 * Try to read a file from the real filesystem.
 */
function tryReadRealFile(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return undefined
  }
}

/**
 * Type-check source code using ts.createProgram with real drizzle-orm types,
 * then transpile and execute.
 */
function typeCheckAndCompile(
  sourceCode: string,
  resolveModule: (specifier: string) => any,
  virtualFiles?: Record<string, string>
): CompileResult {
  const errors: CompileError[] = []
  const fileName = '/virtual/src/index.ts'
  const files = buildVirtualFiles(fileName, sourceCode)

  // Add extra virtual files (schema sources) under /virtual/src/
  if (virtualFiles) {
    for (const [path, content] of Object.entries(virtualFiles)) {
      // Remap /src/X.ts → /virtual/src/X.ts
      const virtualPath = path.startsWith('/src/') ? `/virtual${path}` : path
      files.set(virtualPath, content)
    }
  }

  // Add drizzle-cube/server stub as a virtual file
  const cubeDtsPath = join(PROJECT_ROOT, 'node_modules/drizzle-cube/dist/server/index.d.ts')
  files.set(cubeDtsPath, DRIZZLE_CUBE_SERVER_DTS)

  const tsLibDir = dirname(esmRequire.resolve('typescript'))

  // Real filesystem-backed module resolution host
  const realModuleResolutionHost: ts.ModuleResolutionHost = {
    fileExists: f => existsSync(f),
    readFile: f => tryReadRealFile(f),
  }

  const host: ts.CompilerHost = {
    getSourceFile: (name, languageVersion) => {
      // Virtual files first
      const content = files.get(name)
      if (content !== undefined) {
        return ts.createSourceFile(name, content, languageVersion)
      }
      // Real filesystem (node_modules .d.ts files, lib files)
      const realContent = tryReadRealFile(name)
      if (realContent !== undefined) {
        return ts.createSourceFile(name, realContent, languageVersion)
      }
      // TS lib files
      const libContent = tryReadRealFile(join(tsLibDir, name.replace(/^\//, '')))
      if (libContent !== undefined) {
        return ts.createSourceFile(name, libContent, languageVersion)
      }
      return undefined
    },
    getDefaultLibFileName: options => join(tsLibDir, ts.getDefaultLibFileName(options)),
    writeFile: () => {},
    getCurrentDirectory: () => PROJECT_ROOT,
    getCanonicalFileName: f => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: name => {
      if (files.has(name)) return true
      if (existsSync(name)) return true
      // TS lib files
      try {
        const libPath = join(tsLibDir, name.replace(/^\//, ''))
        return existsSync(libPath)
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
        // Relative imports within virtual /src/ files → check virtual files
        if (isVirtualFile && (name.startsWith('./') || name.startsWith('../'))) {
          const virtualResolved = `/virtual/src/${name.replace(/^\.\//, '').replace(/\.ts$/, '')}.ts`
          if (files.has(virtualResolved)) {
            return { resolvedFileName: virtualResolved, isExternalLibraryImport: false }
          }
        }

        // drizzle-cube/server → use our stub (real .d.ts has too many transitive deps)
        if (name === 'drizzle-cube/server') {
          return { resolvedFileName: cubeDtsPath, isExternalLibraryImport: true }
        }

        // Use real TS module resolution for everything else
        // For virtual files, resolve packages from project root
        // For real files (node_modules internals), resolve from their actual location
        const resolveFrom = isVirtualFile ? join(PROJECT_ROOT, 'index.ts') : containingFile
        const result = ts.resolveModuleName(
          name,
          resolveFrom,
          TS_COMPILE_OPTIONS,
          realModuleResolutionHost
        )
        if (result.resolvedModule) {
          return result.resolvedModule
        }

        return undefined
      })
    },
  }

  // Create program and type-check
  const program = ts.createProgram(
    [fileName],
    {
      ...TS_COMPILE_OPTIONS,
      noEmit: true,
      skipLibCheck: true,
    },
    host
  )

  const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()]

  for (const d of diagnostics) {
    // Only report diagnostics from user virtual files
    if (d.file && !d.file.fileName.startsWith('/virtual/src/')) continue
    const pos =
      d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined
    errors.push({
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      line: pos ? pos.line + 1 : undefined,
      column: pos ? pos.character + 1 : undefined,
    })
  }

  if (errors.length > 0) {
    return { exports: {}, errors }
  }

  // Type-check passed — now transpile (fast, no checking) and execute
  let jsCode: string
  try {
    const transpiled = ts.transpileModule(sourceCode, {
      compilerOptions: TS_COMPILE_OPTIONS,
    })
    jsCode = transpiled.outputText
  } catch (err: any) {
    errors.push({ message: `Transpilation failed: ${err.message}` })
    return { exports: {}, errors }
  }

  // Execute with sandboxed require
  const moduleObj = { exports: {} as Record<string, any> }
  const sandboxedRequire = (specifier: string) => {
    try {
      return resolveModule(specifier)
    } catch (err: any) {
      throw new Error(`Cannot resolve module '${specifier}': ${err.message}`)
    }
  }

  try {
    const fn = new Function('require', 'exports', 'module', jsCode)
    fn(sandboxedRequire, moduleObj.exports, moduleObj)
  } catch (err: any) {
    errors.push({ message: `Runtime error: ${err.message}` })
    return { exports: {}, errors }
  }

  return { exports: moduleObj.exports, errors }
}

/**
 * Compile a schema file (pgTable definitions).
 * Returns the exported table objects.
 */
export function compileSchema(sourceCode: string): CompileResult {
  const drizzleOrm = esmRequire('drizzle-orm')
  const drizzlePgCore = esmRequire('drizzle-orm/pg-core')
  const drizzleSqliteCore = esmRequire('drizzle-orm/sqlite-core')

  return typeCheckAndCompile(sourceCode, (specifier: string) => {
    if (specifier === 'drizzle-orm') return drizzleOrm
    if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
    if (specifier === 'drizzle-orm/sqlite-core') return drizzleSqliteCore
    throw new Error(`Module '${specifier}' is not allowed in schema files`)
  })
}

/**
 * Compile a cube definition file.
 * schemaExports maps schema file names to their compiled exports,
 * so the cube file can import them with relative paths like './employees'.
 */
export function compileCube(
  sourceCode: string,
  schemaExports: Record<string, any>,
  schemaSources?: Record<string, string>
): CompileResult {
  const drizzleOrm = esmRequire('drizzle-orm')
  const drizzlePgCore = esmRequire('drizzle-orm/pg-core')
  const drizzleSqliteCore = esmRequire('drizzle-orm/sqlite-core')
  const drizzleCubeServer = esmRequire('drizzle-cube/server')

  // Build virtual files for schema imports so type-checking resolves them.
  // Use the actual schema source code so the type checker sees real column types.
  const schemaVirtualFiles: Record<string, string> = {}
  for (const [name, exports] of Object.entries(schemaExports)) {
    if (schemaSources?.[name]) {
      // Use actual source — type checker sees table definitions with real column keys
      schemaVirtualFiles[`/src/${name}.ts`] = schemaSources[name]
    } else {
      // Fallback: stub with `any`
      const exportNames = Object.keys(exports)
      const stub = `${exportNames.map(n => `export declare const ${n}: any;`).join('\n')}\n`
      schemaVirtualFiles[`/src/${name}.ts`] = stub
    }
  }

  const result = typeCheckAndCompile(
    sourceCode,
    (specifier: string) => {
      if (specifier === 'drizzle-orm') return drizzleOrm
      if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
      if (specifier === 'drizzle-orm/sqlite-core') return drizzleSqliteCore
      if (specifier === 'drizzle-cube/server') return drizzleCubeServer

      const normalized = specifier.replace(/^\.\//, '').replace(/\.ts$/, '')
      if (schemaExports[normalized]) return schemaExports[normalized]

      throw new Error(`Module '${specifier}' is not allowed in cube files`)
    },
    schemaVirtualFiles
  )

  if (result.errors.length === 0) {
    const validationErrors = validateCubeExports(result.exports)
    result.errors.push(...validationErrors)
  }

  return result
}

/**
 * Validate compiled cube exports for common errors like undefined column references.
 */
function validateCubeExports(exports: Record<string, any>): CompileError[] {
  const errors: CompileError[] = []

  const checkCube = (cube: any) => {
    if (!cube || !cube.name) return

    if (cube.dimensions) {
      for (const [key, dim] of Object.entries(cube.dimensions) as [string, any][]) {
        if (dim.sql === undefined || dim.sql === null) {
          errors.push({
            message: `Cube "${cube.name}": dimension "${key}" has undefined sql reference. Check that the column exists on the table.`,
          })
        }
      }
    }

    if (cube.measures) {
      for (const [key, measure] of Object.entries(cube.measures) as [string, any][]) {
        if (measure.sql === undefined || measure.sql === null) {
          errors.push({
            message: `Cube "${cube.name}": measure "${key}" has undefined sql reference. Check that the column exists on the table.`,
          })
        }
      }
    }

    if (cube.joins) {
      for (const [key, join] of Object.entries(cube.joins) as [string, any][]) {
        if (join.on) {
          for (const cond of join.on) {
            if (cond.source === undefined || cond.source === null) {
              errors.push({
                message: `Cube "${cube.name}": join "${key}" has undefined source column.`,
              })
            }
            if (cond.target === undefined || cond.target === null) {
              errors.push({
                message: `Cube "${cube.name}": join "${key}" has undefined target column.`,
              })
            }
          }
        }
      }
    }
  }

  for (const value of Object.values(exports)) {
    if (Array.isArray(value)) {
      value.forEach(checkCube)
    } else {
      checkCube(value)
    }
  }

  return errors
}

/**
 * Generate TypeScript declaration content for a compiled schema file.
 */
export function generateSchemaTypes(sourceCode: string): string {
  const result = ts.transpileModule(sourceCode, {
    compilerOptions: {
      ...TS_COMPILE_OPTIONS,
      declaration: true,
      emitDeclarationOnly: true,
    },
    reportDiagnostics: false,
  })

  return result.outputText || ''
}
