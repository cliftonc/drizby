import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type MetabaseCard,
  type MetabaseDashboard,
  type MetabaseDatabase,
  describeMetabaseQuery,
  extractMetabaseQueryContext,
  mapChartType,
  mapMetabaseDatabases,
  mapMetabaseEngine,
  translateDashboard,
  translateGridPosition,
} from '../src/services/metabase-parser'

// Load real Metabase API fixtures
const fixturesDir = join(__dirname, 'fixtures')
const loadFixture = (name: string) => JSON.parse(readFileSync(join(fixturesDir, name), 'utf-8'))

const metabaseDatabases: { data: MetabaseDatabase[] } = loadFixture('metabase-databases.json')
const metabaseCards: MetabaseCard[] = loadFixture('metabase-cards.json')
const metabaseDashboard: MetabaseDashboard = loadFixture('metabase-dashboard-1.json')

describe('mapMetabaseEngine', () => {
  it('maps postgres to postgres-js', () => {
    const result = mapMetabaseEngine('postgres')
    expect(result).toEqual({ engineType: 'postgres', provider: 'postgres-js' })
  })

  it('maps mysql to mysql2', () => {
    const result = mapMetabaseEngine('mysql')
    expect(result).toEqual({ engineType: 'mysql', provider: 'mysql2' })
  })

  it('maps snowflake', () => {
    const result = mapMetabaseEngine('snowflake')
    expect(result).toEqual({ engineType: 'snowflake', provider: 'snowflake' })
  })

  it('maps redshift to postgres (PG-wire compatible)', () => {
    const result = mapMetabaseEngine('redshift')
    expect(result).toEqual({ engineType: 'postgres', provider: 'postgres-js' })
  })

  it('returns null for unsupported engines', () => {
    expect(mapMetabaseEngine('h2')).toBeNull()
    expect(mapMetabaseEngine('sqlserver')).toBeNull()
    expect(mapMetabaseEngine('bigquery-cloud-sdk')).toBeNull()
    expect(mapMetabaseEngine('mongo')).toBeNull()
  })

  it('returns null for unknown engines', () => {
    expect(mapMetabaseEngine('unknown-db')).toBeNull()
  })
})

describe('mapChartType', () => {
  it('maps directly supported chart types', () => {
    expect(mapChartType('bar')).toBe('bar')
    expect(mapChartType('line')).toBe('line')
    expect(mapChartType('area')).toBe('area')
    expect(mapChartType('pie')).toBe('pie')
    expect(mapChartType('table')).toBe('table')
    expect(mapChartType('scatter')).toBe('scatter')
    expect(mapChartType('funnel')).toBe('funnel')
  })

  it('maps lossy chart types', () => {
    expect(mapChartType('scalar')).toBe('kpiNumber')
    expect(mapChartType('smartscalar')).toBe('kpiNumber')
    expect(mapChartType('row')).toBe('bar')
    expect(mapChartType('combo')).toBe('bar')
    expect(mapChartType('progress')).toBe('table')
    expect(mapChartType('gauge')).toBe('table')
    expect(mapChartType('pivot')).toBe('table')
    expect(mapChartType('map')).toBe('table')
    expect(mapChartType('waterfall')).toBe('bar')
    expect(mapChartType('object')).toBe('table')
    expect(mapChartType('boxplot')).toBe('table')
    expect(mapChartType('sankey')).toBe('table')
  })

  it('falls back to table for unknown display types', () => {
    expect(mapChartType('unknown-type')).toBe('table')
  })
})

describe('translateGridPosition', () => {
  it('translates 18-column grid to 12-column grid', () => {
    // Full width card
    expect(translateGridPosition({ row: 0, col: 0, size_x: 18, size_y: 4 })).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 4,
    })
  })

  it('translates half-width card', () => {
    // Half width at col 0
    const result = translateGridPosition({ row: 0, col: 0, size_x: 9, size_y: 4 })
    expect(result.w).toBe(6)
    expect(result.x).toBe(0)
  })

  it('translates offset card', () => {
    // Half width at col 9 (right half)
    const result = translateGridPosition({ row: 0, col: 9, size_x: 9, size_y: 4 })
    expect(result.x).toBe(6)
    expect(result.w).toBe(6)
  })

  it('clamps width to prevent overflow', () => {
    // Card that would overflow: starts at col 12 with width 12
    const result = translateGridPosition({ row: 0, col: 15, size_x: 6, size_y: 4 })
    expect(result.x + result.w).toBeLessThanOrEqual(12)
    expect(result.w).toBeGreaterThanOrEqual(1)
  })

  it('ensures minimum width and height of 1', () => {
    const result = translateGridPosition({ row: 0, col: 0, size_x: 0, size_y: 0 })
    expect(result.w).toBeGreaterThanOrEqual(1)
    expect(result.h).toBeGreaterThanOrEqual(1)
  })

  it('passes through y and h', () => {
    const result = translateGridPosition({ row: 10, col: 0, size_x: 18, size_y: 7 })
    expect(result.y).toBe(10)
    expect(result.h).toBe(7)
  })
})

describe('mapMetabaseDatabases', () => {
  it('maps real Metabase database fixtures', () => {
    const result = mapMetabaseDatabases(metabaseDatabases.data)
    expect(result.length).toBeGreaterThan(0)

    // The sample database is H2 — should be unsupported
    const sampleDb = result.find(r => r.engine === 'h2')
    expect(sampleDb).toBeDefined()
    expect(sampleDb!.supported).toBe(false)
    expect(sampleDb!.drizbyEngineType).toBeNull()
    expect(sampleDb!.unsupportedReason).toBeTruthy()
  })

  it('marks supported engines correctly', () => {
    const testDbs: MetabaseDatabase[] = [
      {
        id: 1,
        name: 'PG DB',
        engine: 'postgres',
        details: { host: 'pg.example.com', port: 5432, dbname: 'analytics', user: 'admin' },
      },
      {
        id: 2,
        name: 'MySQL DB',
        engine: 'mysql',
        details: { host: 'mysql.example.com', port: 3306, dbname: 'app', user: 'root' },
      },
    ]
    const result = mapMetabaseDatabases(testDbs)

    expect(result[0].supported).toBe(true)
    expect(result[0].drizbyEngineType).toBe('postgres')
    expect(result[0].drizbyProvider).toBe('postgres-js')
    expect(result[0].host).toBe('pg.example.com')
    expect(result[0].port).toBe(5432)
    expect(result[0].database).toBe('analytics')
    expect(result[0].username).toBe('admin')
    expect(result[0].connectionStringTemplate).toContain('postgresql://')
    expect(result[0].connectionStringTemplate).toContain('__PASSWORD__')

    expect(result[1].supported).toBe(true)
    expect(result[1].drizbyEngineType).toBe('mysql')
    expect(result[1].connectionStringTemplate).toContain('mysql://')
  })

  it('builds snowflake connection as structured JSON', () => {
    const testDbs: MetabaseDatabase[] = [
      {
        id: 1,
        name: 'Snowflake',
        engine: 'snowflake',
        details: {
          account: 'abc123',
          user: 'analyst',
          db: 'PROD',
          warehouse: 'COMPUTE_WH',
          schema: 'PUBLIC',
        },
      },
    ]
    const result = mapMetabaseDatabases(testDbs)
    expect(result[0].supported).toBe(true)
    expect(result[0].connectionStringTemplate).toBeTruthy()
    const parsed = JSON.parse(result[0].connectionStringTemplate!)
    expect(parsed.account).toBe('abc123')
    expect(parsed.password).toBe('__PASSWORD__')
  })
})

describe('translateDashboard', () => {
  it('translates real Metabase dashboard fixture', () => {
    const result = translateDashboard(metabaseDashboard, 1)

    expect(result.name).toBe(metabaseDashboard.name)
    expect(result.connectionId).toBe(1)
    expect(result.config.portlets.length).toBeGreaterThan(0)
  })

  it('creates portlets for cards with queries', () => {
    const result = translateDashboard(metabaseDashboard, 1)
    const cardPortlets = result.config.portlets.filter(p => p.id.startsWith('mb-card-'))

    expect(cardPortlets.length).toBeGreaterThan(0)
    for (const p of cardPortlets) {
      expect(p.title).toBeTruthy()
      expect(p.chartType).toBeTruthy()
      expect(p.w).toBeGreaterThanOrEqual(1)
      expect(p.h).toBeGreaterThanOrEqual(1)
      expect(p.metabaseSource).toBeDefined()
      expect(p.metabaseSource!.cardId).toBeGreaterThan(0)
    }
  })

  it('creates text portlets for text/heading dashcards', () => {
    const result = translateDashboard(metabaseDashboard, 1)
    const textPortlets = result.config.portlets.filter(p => p.chartType === 'text')

    expect(textPortlets.length).toBeGreaterThan(0)
    for (const p of textPortlets) {
      expect(p.id).toMatch(/^mb-text-/)
      expect(p.displayConfig?.text).toBeTruthy()
    }
  })

  it('maps chart types correctly from fixture data', () => {
    const result = translateDashboard(metabaseDashboard, 1)
    const cardPortlets = result.config.portlets.filter(p => p.id.startsWith('mb-card-'))

    // Check that known display types are mapped
    for (const p of cardPortlets) {
      expect([
        'bar',
        'line',
        'area',
        'pie',
        'table',
        'scatter',
        'funnel',
        'text',
        'kpiNumber',
      ]).toContain(p.chartType)
    }
  })

  it('ensures all portlets fit within 12-column grid', () => {
    const result = translateDashboard(metabaseDashboard, 1)
    for (const p of result.config.portlets) {
      expect(p.x + p.w).toBeLessThanOrEqual(12)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.w).toBeGreaterThanOrEqual(1)
      expect(p.h).toBeGreaterThanOrEqual(1)
    }
  })

  it('handles empty dashboard', () => {
    const empty: MetabaseDashboard = {
      id: 99,
      name: 'Empty Dashboard',
      dashcards: [],
    }
    const result = translateDashboard(empty, 1)
    expect(result.config.portlets).toEqual([])
  })
})

describe('extractMetabaseQueryContext', () => {
  it('extracts stages-based query context from real fixtures', () => {
    // Find a card with stages
    const card = metabaseCards.find(
      c => c.dataset_query.stages && c.dataset_query.stages.length > 0
    )
    expect(card).toBeDefined()

    const ctx = extractMetabaseQueryContext(card!)!
    expect(ctx.cardId).toBe(card!.id)
    expect(ctx.cardName).toBe(card!.name)
    expect(ctx.queryType).toBe('stages')
    expect(ctx.structuredQuery).toBeDefined()
    expect(ctx.structuredQuery.stages).toBeDefined()
  })

  it('extracts native SQL query context', () => {
    const card: MetabaseCard = {
      id: 100,
      name: 'Custom SQL',
      display: 'table',
      database_id: 1,
      dataset_query: {
        type: 'native',
        database: 1,
        native: { query: 'SELECT * FROM orders WHERE total > 100' },
      },
      visualization_settings: {},
    }

    const ctx = extractMetabaseQueryContext(card)!
    expect(ctx.queryType).toBe('native')
    expect(ctx.nativeQuery).toBe('SELECT * FROM orders WHERE total > 100')
  })

  it('extracts legacy structured query context', () => {
    const card: MetabaseCard = {
      id: 101,
      name: 'Structured',
      display: 'bar',
      database_id: 1,
      dataset_query: {
        type: 'query',
        database: 1,
        query: { 'source-table': 3, aggregation: [['count']] },
      },
      visualization_settings: {},
    }

    const ctx = extractMetabaseQueryContext(card)!
    expect(ctx.queryType).toBe('structured')
    expect(ctx.structuredQuery).toEqual({ 'source-table': 3, aggregation: [['count']] })
  })
})

describe('describeMetabaseQuery', () => {
  it('describes a card from real fixtures', () => {
    const card = metabaseCards.find(c => {
      const stages = c.dataset_query.stages || []
      return stages.length > 0 && stages[0].aggregation
    })
    expect(card).toBeDefined()

    const desc = describeMetabaseQuery(card!)
    expect(desc).toContain(card!.name)
    expect(desc).toContain(card!.display)
    expect(desc).toContain('Structured query')
  })

  it('describes a native SQL card', () => {
    const card: MetabaseCard = {
      id: 100,
      name: 'Revenue Report',
      display: 'line',
      database_id: 1,
      dataset_query: {
        type: 'native',
        database: 1,
        native: { query: 'SELECT date, SUM(total) FROM orders GROUP BY date' },
      },
      visualization_settings: {
        'graph.dimensions': ['date'],
        'graph.metrics': ['sum'],
      },
    }

    const desc = describeMetabaseQuery(card)
    expect(desc).toContain('Native SQL')
    expect(desc).toContain('SELECT date')
    expect(desc).toContain('X-axis dimensions: date')
    expect(desc).toContain('Y-axis metrics: sum')
  })
})
