/**
 * ConnectionManager
 * Manages per-connection drizzle instances and SemanticLayerCompilers.
 * On startup, loads all connections/schemas/cubes from DB, compiles, and registers.
 */

import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { SemanticLayerCompiler } from 'drizzle-cube/server'
import type { DrizzleDatabase, Cube } from 'drizzle-cube/server'
import { connections, schemaFiles, cubeDefinitions } from '../../schema'
import { compileSchema, compileCube } from './cube-compiler'

interface ManagedConnection {
  connectionId: number
  client: postgres.Sql
  drizzle: DrizzleDatabase
  semanticLayer: SemanticLayerCompiler
  schemaExports: Record<string, Record<string, any>> // schemaName -> exports
}

class ConnectionManager {
  private connections = new Map<number, ManagedConnection>()
  private cubeConnectionMap = new Map<string, number>() // cubeName -> connectionId

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

    const client = postgres(connectionString)
    const db = drizzle(client) as unknown as DrizzleDatabase

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

    // Remove cube->connection mappings for this connection
    for (const [cubeName, connId] of this.cubeConnectionMap) {
      if (connId === connectionId) {
        this.cubeConnectionMap.delete(cubeName)
      }
    }

    try {
      await managed.client.end()
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
   * Get the semantic layer for a given cube name.
   */
  getSemanticLayerForCube(cubeName: string): { semanticLayer: SemanticLayerCompiler; connectionId: number } | undefined {
    const connectionId = this.cubeConnectionMap.get(cubeName)
    if (connectionId === undefined) return undefined
    const managed = this.connections.get(connectionId)
    if (!managed) return undefined
    return { semanticLayer: managed.semanticLayer, connectionId }
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
   * Get cube -> connectionId mapping.
   */
  getCubeConnectionMap(): Map<string, number> {
    return new Map(this.cubeConnectionMap)
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
            // Update compiledAt in DB
            await db.update(schemaFiles)
              .set({ compiledAt: new Date(), compilationErrors: null })
              .where(eq(schemaFiles.id, sf.id))
          } else {
            await db.update(schemaFiles)
              .set({ compilationErrors: result.errors })
              .where(eq(schemaFiles.id, sf.id))
            console.error(`Schema ${sf.name} compilation errors:`, result.errors)
          }
        } catch (err: any) {
          console.error(`Schema ${sf.name} compilation failed:`, err.message)
          await db.update(schemaFiles)
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
        const result = compileCube(cubeDef.sourceCode, managed.schemaExports)
        if (result.errors.length === 0) {
          // Find exported cubes and register them
          const registeredCubes = this.registerExportedCubes(result.exports, managed, cubeDef.connectionId)
          await db.update(cubeDefinitions)
            .set({
              compiledAt: new Date(),
              compilationErrors: null,
              definition: registeredCubes.length > 0 ? { cubes: registeredCubes.map(c => c.name) } : null
            })
            .where(eq(cubeDefinitions.id, cubeDef.id))
        } else {
          await db.update(cubeDefinitions)
            .set({ compilationErrors: result.errors })
            .where(eq(cubeDefinitions.id, cubeDef.id))
          console.error(`Cube ${cubeDef.name} compilation errors:`, result.errors)
        }
      } catch (err: any) {
        console.error(`Cube ${cubeDef.name} compilation failed:`, err.message)
        await db.update(cubeDefinitions)
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
    }
    return { errors: result.errors }
  }

  /**
   * Compile a single cube definition and register its cubes.
   */
  compileCubeDefinition(connectionId: number, sourceCode: string): { cubes: string[]; errors: any[] } {
    const managed = this.connections.get(connectionId)
    if (!managed) return { cubes: [], errors: [{ message: `Connection ${connectionId} not found` }] }

    const result = compileCube(sourceCode, managed.schemaExports)
    if (result.errors.length > 0) {
      return { cubes: [], errors: result.errors }
    }

    const registered = this.registerExportedCubes(result.exports, managed, connectionId)
    return { cubes: registered.map(c => c.name), errors: [] }
  }

  /**
   * Find and register all Cube objects from compiled exports.
   */
  private isCube(value: any): value is Cube {
    return value && typeof value === 'object' && value.name && value.dimensions && value.measures && value.sql
  }

  private registerExportedCubes(
    exports: Record<string, any>,
    managed: ManagedConnection,
    connectionId: number
  ): Cube[] {
    const registered: Cube[] = []
    const seen = new Set<string>()

    const tryRegister = (cube: Cube) => {
      if (seen.has(cube.name)) return
      seen.add(cube.name)
      try {
        managed.semanticLayer.registerCube(cube)
        this.cubeConnectionMap.set(cube.name, connectionId)
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
