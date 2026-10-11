/**
 * Cube Compiler Service
 * Type-checks and compiles TypeScript source using sandboxed require.
 * Type-checking runs in a worker thread to avoid blocking the event loop.
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { Worker } from 'node:worker_threads'
import ts from 'typescript'

const esmRequire = createRequire(import.meta.url)
const PROJECT_ROOT = process.cwd()

/** VM execution timeout in ms. Override via SANDBOX_TIMEOUT_MS env var for tests. */
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 30000

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
 * Resolve the worker script path.
 * Uses the same directory and extension as the current file —
 * in dev this is .ts (handled by tsx), in production it's .js (compiled).
 */
const CURRENT_FILE = fileURLToPath(import.meta.url)
const CURRENT_DIR = CURRENT_FILE.replace(/[/\\][^/\\]+$/, '')
const WORKER_EXT = CURRENT_FILE.endsWith('.ts') ? '.ts' : '.js'
const WORKER_PATH = join(CURRENT_DIR, `typecheck-worker${WORKER_EXT}`)

/**
 * Build execArgv for the worker thread.
 * When the worker is a .ts file, we need a TypeScript loader registered.
 * Node ≥ 22.6 handles .ts natively (--experimental-strip-types, on by default in v24+).
 * Older Node versions need tsx. We check:
 *   1. Parent already has tsx/ts-node flags → propagate them
 *   2. Node has native TS stripping → no extra flags needed
 *   3. Otherwise → add --import tsx so the worker can load .ts
 */
function buildWorkerExecArgv(): string[] {
  if (WORKER_EXT === '.js') return []

  const parentArgv = process.execArgv.filter(arg => !arg.startsWith('-e') && arg !== '--')

  // Parent already has tsx or ts-node loader registered
  if (parentArgv.some(arg => arg.includes('tsx') || arg.includes('ts-node'))) {
    return parentArgv
  }

  // Node ≥ 22.6 has --experimental-strip-types (on by default in v24+)
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major > 22 || (major === 22 && minor >= 6)) {
    return parentArgv
  }

  // Older Node — try to add tsx as a loader
  try {
    esmRequire.resolve('tsx')
    return [...parentArgv, '--import', 'tsx']
  } catch {
    // tsx not installed — fall back to parent argv and hope for the best
    return parentArgv
  }
}

/**
 * Run type-checking in a worker thread so it doesn't block the event loop.
 * Returns only errors (serializable). Execution happens on the main thread afterward.
 */
function typeCheckInWorker(
  sourceCode: string,
  virtualFiles?: Record<string, string>
): Promise<CompileError[]> {
  return new Promise(resolve => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { sourceCode, virtualFiles, projectRoot: PROJECT_ROOT },
      execArgv: buildWorkerExecArgv(),
    })
    worker.on('message', (msg: { errors: CompileError[] }) => {
      resolve(msg.errors)
    })
    worker.on('error', err => {
      resolve([{ message: `Type-check worker error: ${err.message}` }])
    })
    worker.on('exit', code => {
      if (code !== 0) {
        resolve([{ message: `Type-check worker exited with code ${code}` }])
      }
    })
  })
}

/**
 * Type-check source code in a worker thread, then transpile and execute on main thread.
 */
async function typeCheckAndCompile(
  sourceCode: string,
  resolveModule: (specifier: string) => any,
  virtualFiles?: Record<string, string>
): Promise<CompileResult> {
  const errors = await typeCheckInWorker(sourceCode, virtualFiles)

  if (errors.length > 0) {
    return { exports: {}, errors }
  }

  return transpileAndExecute(sourceCode, resolveModule)
}

/**
 * Transpile TypeScript and execute in a sandboxed V8 context.
 * Skips type-checking — use typeCheckAndCompile() for full validation.
 * Exported for testing the sandbox in isolation.
 */
export function transpileAndExecute(
  sourceCode: string,
  resolveModule: (specifier: string) => any
): CompileResult {
  const errors: CompileError[] = []

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

  // Execute in isolated V8 context with sandboxed require
  const moduleObj = { exports: {} as Record<string, any> }
  const sandboxedRequire = (specifier: string) => {
    try {
      return resolveModule(specifier)
    } catch (err: any) {
      throw new Error(`Cannot resolve module '${specifier}': ${err.message}`)
    }
  }

  try {
    // Object.create(null) prevents prototype chain escapes (e.g. this.constructor.constructor)
    const contextObj = Object.create(null)
    contextObj.require = sandboxedRequire
    contextObj.exports = moduleObj.exports
    contextObj.module = moduleObj

    const context = vm.createContext(contextObj, {
      name: 'cube-compiler-sandbox',
      codeGeneration: {
        strings: false, // Blocks eval() and new Function() inside sandbox
        wasm: false,
      },
    })

    const script = new vm.Script(jsCode, {
      filename: 'compiled-cube.js',
    })

    script.runInContext(context, {
      timeout: SANDBOX_TIMEOUT_MS,
    })
  } catch (err: any) {
    errors.push({ message: `Runtime error: ${err.message}` })
    return { exports: {}, errors }
  }

  return { exports: moduleObj.exports, errors }
}

/**
 * Compile a schema file (pgTable definitions).
 * Returns the exported table objects.
 * @param skipTypeCheck - Skip TS type-checking (use during startup for speed)
 */
export async function compileSchema(
  sourceCode: string,
  skipTypeCheck = false
): Promise<CompileResult> {
  const drizzleOrm = esmRequire('drizzle-orm')
  const drizzlePgCore = esmRequire('drizzle-orm/pg-core')
  const drizzleSqliteCore = esmRequire('drizzle-orm/sqlite-core')

  // Lazy-load optional drivers (may not be installed)
  let drizzleDatabend: any
  try {
    drizzleDatabend = esmRequire('drizzle-databend')
  } catch {}
  let drizzleSnowflake: any
  try {
    drizzleSnowflake = esmRequire('drizzle-snowflake')
  } catch {}

  const resolveModule = (specifier: string) => {
    if (specifier === 'drizzle-orm') return drizzleOrm
    if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
    if (specifier === 'drizzle-orm/sqlite-core') return drizzleSqliteCore
    if (specifier === 'drizzle-databend' && drizzleDatabend) return drizzleDatabend
    if (specifier === 'drizzle-snowflake' && drizzleSnowflake) return drizzleSnowflake
    throw new Error(`Module '${specifier}' is not allowed in schema files`)
  }

  if (skipTypeCheck) {
    return transpileAndExecute(sourceCode, resolveModule)
  }
  return await typeCheckAndCompile(sourceCode, resolveModule)
}

/**
 * Compile a cube definition file.
 * schemaExports maps schema file names to their compiled exports,
 * so the cube file can import them with relative paths like './employees'.
 * @param skipTypeCheck - Skip TS type-checking (use during startup for speed)
 */
export async function compileCube(
  sourceCode: string,
  schemaExports: Record<string, any>,
  schemaSources?: Record<string, string>,
  skipTypeCheck = false
): Promise<CompileResult> {
  const drizzleOrm = esmRequire('drizzle-orm')
  const drizzlePgCore = esmRequire('drizzle-orm/pg-core')
  const drizzleSqliteCore = esmRequire('drizzle-orm/sqlite-core')
  const drizzleCubeServer = esmRequire('drizzle-cube/server')

  let drizzleDatabend: any
  try {
    drizzleDatabend = esmRequire('drizzle-databend')
  } catch {}
  let drizzleSnowflake: any
  try {
    drizzleSnowflake = esmRequire('drizzle-snowflake')
  } catch {}

  const resolveModule = (specifier: string) => {
    if (specifier === 'drizzle-orm') return drizzleOrm
    if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
    if (specifier === 'drizzle-orm/sqlite-core') return drizzleSqliteCore
    if (specifier === 'drizzle-cube/server') return drizzleCubeServer
    if (specifier === 'drizzle-databend' && drizzleDatabend) return drizzleDatabend
    if (specifier === 'drizzle-snowflake' && drizzleSnowflake) return drizzleSnowflake

    const normalized = specifier.replace(/^\.\//, '').replace(/\.ts$/, '')
    if (schemaExports[normalized]) return schemaExports[normalized]

    throw new Error(`Module '${specifier}' is not allowed in cube files`)
  }

  let result: CompileResult

  if (skipTypeCheck) {
    result = transpileAndExecute(sourceCode, resolveModule)
  } else {
    // Build virtual files for schema imports so type-checking resolves them.
    const schemaVirtualFiles: Record<string, string> = {}
    for (const [name, exports] of Object.entries(schemaExports)) {
      if (schemaSources?.[name]) {
        schemaVirtualFiles[`/src/${name}.ts`] = schemaSources[name]
      } else {
        const exportNames = Object.keys(exports)
        const stub = `${exportNames.map(n => `export declare const ${n}: any;`).join('\n')}\n`
        schemaVirtualFiles[`/src/${name}.ts`] = stub
      }
    }
    result = await typeCheckAndCompile(sourceCode, resolveModule, schemaVirtualFiles)
  }

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
