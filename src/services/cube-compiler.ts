/**
 * Cube Compiler Service
 * Transpiles TypeScript source to executable code using sandboxed require
 */

import ts from 'typescript'
import { createRequire } from 'node:module'

const esmRequire = createRequire(import.meta.url)

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
}

/**
 * Transpile TypeScript source and execute with a sandboxed require.
 * Only whitelisted modules are available.
 */
export function compileSource(
  sourceCode: string,
  resolveModule: (specifier: string) => any
): CompileResult {
  const errors: CompileError[] = []

  // Transpile TS -> JS
  let jsCode: string
  try {
    const result = ts.transpileModule(sourceCode, {
      compilerOptions: TS_COMPILE_OPTIONS,
      reportDiagnostics: true,
    })

    if (result.diagnostics && result.diagnostics.length > 0) {
      for (const d of result.diagnostics) {
        const pos = d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start)
          : undefined
        errors.push({
          message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
          line: pos ? pos.line + 1 : undefined,
          column: pos ? pos.character + 1 : undefined,
        })
      }
    }

    jsCode = result.outputText
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

  return compileSource(sourceCode, (specifier: string) => {
    if (specifier === 'drizzle-orm') return drizzleOrm
    if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
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
  schemaExports: Record<string, any>
): CompileResult {
  const drizzleOrm = esmRequire('drizzle-orm')
  const drizzlePgCore = esmRequire('drizzle-orm/pg-core')
  const drizzleCubeServer = esmRequire('drizzle-cube/server')

  return compileSource(sourceCode, (specifier: string) => {
    if (specifier === 'drizzle-orm') return drizzleOrm
    if (specifier === 'drizzle-orm/pg-core') return drizzlePgCore
    if (specifier === 'drizzle-cube/server') return drizzleCubeServer

    // Relative imports resolve to schema file exports
    // "./employees" or "./employees.ts" -> schemaExports["employees"]
    const normalized = specifier.replace(/^\.\//, '').replace(/\.ts$/, '')
    if (schemaExports[normalized]) return schemaExports[normalized]

    throw new Error(`Module '${specifier}' is not allowed in cube files`)
  })
}

/**
 * Generate TypeScript declaration content for a compiled schema file.
 * This provides autocomplete in Monaco for cube files importing the schema.
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

  // transpileModule with declaration: true emits .d.ts in outputText
  return result.outputText || ''
}
