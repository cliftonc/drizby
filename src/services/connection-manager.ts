/**
 * ConnectionManager
 * Manages per-connection drizzle instances and SemanticLayerCompilers.
 * On startup, loads all connections/schemas/cubes from DB, compiles, and registers.
 */

import { SemanticLayerCompiler } from 'drizzle-cube/server'
import type { Cube, DrizzleDatabase } from 'drizzle-cube/server'
import { eq } from 'drizzle-orm'
import { connections, cubeDefinitions, schemaFiles } from '../../schema'
import { compileCube, compileSchema } from './cube-compiler'

interface ManagedConnection {
  connectionId: number
  client: any // postgres.Sql or better-sqlite3 Database
  drizzle: DrizzleDatabase
  semanticLayer: SemanticLayerCompiler
  schemaExports: Record<string, Record<string, any>> // schemaName -> exports
  schemaSources: Record<string, string> // schemaName -> source code
  engineType: string
}

class ConnectionManager {
  private connections = new Map<number, ManagedConnection>()

  /**
   * Initialize all active connections from the database.
   * Call this on server startup.
   */
  async initialize(db: any): Promise<void> {
    const activeConnections = await db
      .select()
      .from(connections)
      .where(eq(connections.isActive, true))

    for (const conn of activeConnections) {
      try {
        await this.createConnection(conn.id, conn.connectionString, conn.engineType)
      } catch (err) {
        console.error(`Failed to initialize connection ${conn.id} (${conn.name}):`, err)
      }
    }

    // Load and compile all schema files and cube definitions
    await this.compileAll(db)
  }

  /**
   * Create a managed connection entry (drizzle + semantic layer).
   */
  async createConnection(
    connectionId: number,
    connectionString: string,
    engineType: string
  ): Promise<ManagedConnection> {
    // Clean up existing if re-creating
    if (this.connections.has(connectionId)) {
      await this.remove(connectionId)
    }

    let client: any
    let db: DrizzleDatabase

    if (engineType === 'sqlite') {
      if (connectionString.startsWith('d1:')) {
        const { drizzle } = await import('drizzle-orm/d1')
        const databaseId = connectionString.replace(/^d1:/, '')
        db = drizzle({
          connection: {
            accountId: process.env.CF_ACCOUNT_ID!,
            databaseId,
            token: process.env.CF_API_TOKEN!,
          },
        }) as unknown as DrizzleDatabase
        client = null // No native handle to close
      } else {
        const Database = (await import('better-sqlite3')).default
        const { drizzle } = await import('drizzle-orm/better-sqlite3')
        const filePath = connectionString.replace(/^file:/, '')
        const sqlite = new Database(filePath)
        sqlite.pragma('journal_mode = WAL')
        sqlite.pragma('foreign_keys = ON')
        client = sqlite
        db = drizzle(sqlite) as unknown as DrizzleDatabase
      }
    } else {
      const postgres = (await import('postgres')).default
      const { drizzle } = await import('drizzle-orm/postgres-js')
      client = postgres(connectionString)
      db = drizzle(client) as unknown as DrizzleDatabase
    }

    const semanticLayer = new SemanticLayerCompiler({
      drizzle: db,
      engineType: engineType as any,
    })

    const managed: ManagedConnection = {
      connectionId,
      client,
      drizzle: db,
      semanticLayer,
      schemaExports: {},
      schemaSources: {},
      engineType,
    }

    this.connections.set(connectionId, managed)
    return managed
  }

  /**
   * Remove and clean up a connection.
   */
  async remove(connectionId: number): Promise<void> {
    const managed = this.connections.get(connectionId)
    if (!managed) return

    try {
      if (managed.client) {
        if (managed.engineType === 'sqlite') {
          managed.client.close()
        } else {
          await managed.client.end()
        }
      }
    } catch {}

    this.connections.delete(connectionId)
  }

  /**
   * Get a managed connection by ID.
   */
  get(connectionId: number): ManagedConnection | undefined {
    return this.connections.get(connectionId)
  }

  /**
   * Get semantic layer for a connection ID.
   */
  getSemanticLayer(connectionId: number): SemanticLayerCompiler | undefined {
    return this.connections.get(connectionId)?.semanticLayer
  }

  /**
   * Get all managed connection IDs.
   */
  getConnectionIds(): number[] {
    return [...this.connections.keys()]
  }

  /**
   * Compile all schema files and cube definitions from the database.
   */
  async compileAll(db: any): Promise<void> {
    // Load all schema files
    const allSchemaFiles = await db.select().from(schemaFiles)

    // Group by connection
    const schemasByConnection = new Map<number, typeof allSchemaFiles>()
    for (const sf of allSchemaFiles) {
      const list = schemasByConnection.get(sf.connectionId) || []
      list.push(sf)
      schemasByConnection.set(sf.connectionId, list)
    }

    // Compile schemas per connection
    for (const [connectionId, schemas] of schemasByConnection) {
      const managed = this.connections.get(connectionId)
      if (!managed) continue

      for (const sf of schemas) {
        try {
          const result = compileSchema(sf.sourceCode)
          if (result.errors.length === 0) {
            const name = sf.name.replace(/\.ts$/, '')
            managed.schemaExports[name] = result.exports
            managed.schemaSources[name] = sf.sourceCode
            // Update compiledAt in DB
            await db
              .update(schemaFiles)
              .set({ compiledAt: new Date(), compilationErrors: null })
              .where(eq(schemaFiles.id, sf.id))
          } else {
            await db
              .update(schemaFiles)
              .set({ compilationErrors: result.errors })
              .where(eq(schemaFiles.id, sf.id))
            console.error(`Schema ${sf.name} compilation errors:`, result.errors)
          }
        } catch (err: any) {
          console.error(`Schema ${sf.name} compilation failed:`, err.message)
          await db
            .update(schemaFiles)
            .set({ compilationErrors: [{ message: err.message }] })
            .where(eq(schemaFiles.id, sf.id))
        }
      }
    }

    // Load and compile all cube definitions
    const allCubeDefs = await db
      .select()
      .from(cubeDefinitions)
      .where(eq(cubeDefinitions.isActive, true))

    for (const cubeDef of allCubeDefs) {
      if (!cubeDef.sourceCode) continue

      const managed = this.connections.get(cubeDef.connectionId)
      if (!managed) continue

      try {
        const result = compileCube(cubeDef.sourceCode, managed.schemaExports, managed.schemaSources)
        if (result.errors.length === 0) {
          // Find exported cubes and register them
          const registeredCubes = this.registerExportedCubes(result.exports, managed)
          await db
            .update(cubeDefinitions)
            .set({
              compiledAt: new Date(),
              compilationErrors: null,
              definition:
                registeredCubes.length > 0 ? { cubes: registeredCubes.map(c => c.name) } : null,
            })
            .where(eq(cubeDefinitions.id, cubeDef.id))
        } else {
          await db
            .update(cubeDefinitions)
            .set({ compilationErrors: result.errors })
            .where(eq(cubeDefinitions.id, cubeDef.id))
          console.error(`Cube ${cubeDef.name} compilation errors:`, result.errors)
        }
      } catch (err: any) {
        console.error(`Cube ${cubeDef.name} compilation failed:`, err.message)
        await db
          .update(cubeDefinitions)
          .set({ compilationErrors: [{ message: err.message }] })
          .where(eq(cubeDefinitions.id, cubeDef.id))
      }
    }
  }

  /**
   * Compile a single schema file and update the managed connection's exports.
   */
  compileSchemaFile(connectionId: number, name: string, sourceCode: string): { errors: any[] } {
    const managed = this.connections.get(connectionId)
    if (!managed) return { errors: [{ message: `Connection ${connectionId} not found` }] }

    const result = compileSchema(sourceCode)
    if (result.errors.length === 0) {
      const normalizedName = name.replace(/\.ts$/, '')
      managed.schemaExports[normalizedName] = result.exports
      managed.schemaSources[normalizedName] = sourceCode
    }
    return { errors: result.errors }
  }

  /**
   * Unregister a cube by name from the semantic layer.
   */
  unregisterCube(connectionId: number, cubeName: string): boolean {
    const managed = this.connections.get(connectionId)
    if (!managed) return false
    managed.semanticLayer.unregisterCube(cubeName)
    return true
  }

  /**
   * Compile a single cube definition and register its cubes.
   */
  compileCubeDefinition(
    connectionId: number,
    sourceCode: string
  ): { cubes: string[]; errors: any[] } {
    const managed = this.connections.get(connectionId)
    if (!managed)
      return { cubes: [], errors: [{ message: `Connection ${connectionId} not found` }] }

    const result = compileCube(sourceCode, managed.schemaExports, managed.schemaSources)
    if (result.errors.length > 0) {
      return { cubes: [], errors: result.errors }
    }

    const registered = this.registerExportedCubes(result.exports, managed)
    return { cubes: registered.map(c => c.name), errors: [] }
  }

  /**
   * Find and register all Cube objects from compiled exports.
   */
  private isCube(value: any): value is Cube {
    return (
      value &&
      typeof value === 'object' &&
      value.name &&
      value.dimensions &&
      value.measures &&
      value.sql
    )
  }

  private registerExportedCubes(exports: Record<string, any>, managed: ManagedConnection): Cube[] {
    const registered: Cube[] = []
    const seen = new Set<string>()

    const tryRegister = (cube: Cube) => {
      if (seen.has(cube.name)) return
      seen.add(cube.name)
      try {
        managed.semanticLayer.registerCube(cube)
        registered.push(cube)
      } catch (err: any) {
        console.error(`Failed to register cube ${cube.name}:`, err.message)
      }
    }

    for (const value of Object.values(exports)) {
      if (this.isCube(value)) {
        tryRegister(value)
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (this.isCube(item)) tryRegister(item)
        }
      }
    }

    return registered
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager()
