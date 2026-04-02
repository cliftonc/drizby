/** Types for the Metabase import wizard — mirrors server-side types from metabase-parser.ts */

export interface MappedDatabase {
  metabaseId: number
  name: string
  engine: string
  host?: string
  port?: number
  database?: string
  username?: string
  drizbyEngineType: string | null
  drizbyProvider: string | null
  supported: boolean
  unsupportedReason?: string
  connectionStringTemplate?: string
}
