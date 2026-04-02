/**
 * Metabase → Drizby mapping and translation functions.
 * Pure functions with no side effects — used by metabase-import route.
 */

// --- Types ---

export interface MetabaseDatabase {
  id: number
  name: string
  engine: string
  details: Record<string, any>
  is_sample?: boolean
}

export interface MetabaseCard {
  id: number
  name: string
  description?: string | null
  display: string
  database_id: number
  dataset_query: {
    type?: 'native' | 'query'
    database?: number
    native?: { query: string; 'template-tags'?: Record<string, any> }
    query?: Record<string, any>
    stages?: Array<Record<string, any>>
  }
  visualization_settings: Record<string, any>
  result_metadata?: Array<{ name: string; display_name: string; base_type: string }>
}

export interface MetabaseDashcard {
  id: number
  card_id: number | null
  card?: MetabaseCard | null
  row: number
  col: number
  size_x: number
  size_y: number
  visualization_settings: Record<string, any>
  parameter_mappings?: any[]
  series?: any[]
}

export interface MetabaseDashboard {
  id: number
  name: string
  description?: string | null
  dashcards: MetabaseDashcard[]
  parameters?: any[]
  tabs?: Array<{ id: number; name: string }>
}

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

export interface MappedPortlet {
  id: string
  title: string
  chartType: string
  chartConfig?: { xAxis?: string[]; yAxis?: string[] }
  displayConfig?: Record<string, any>
  query?: string
  w: number
  h: number
  x: number
  y: number
  metabaseSource?: {
    cardId: number
    cardName: string
    queryType: 'native' | 'structured' | 'stages'
    nativeQuery?: string
    structuredQuery?: any
    databaseId: number
    visualizationSettings?: Record<string, any>
  }
}

// --- Engine Mapping ---

const METABASE_ENGINE_MAP: Record<string, { engineType: string; provider: string }> = {
  postgres: { engineType: 'postgres', provider: 'postgres-js' },
  mysql: { engineType: 'mysql', provider: 'mysql2' },
  sqlite: { engineType: 'sqlite', provider: 'better-sqlite3' },
  snowflake: { engineType: 'snowflake', provider: 'snowflake' },
  redshift: { engineType: 'postgres', provider: 'postgres-js' },
  duckdb: { engineType: 'duckdb', provider: 'duckdb' },
}

const UNSUPPORTED_ENGINES: Record<string, string> = {
  h2: "H2 is Metabase's internal database — skip this",
  sqlserver: 'SQL Server is not supported by Drizby',
  'bigquery-cloud-sdk': 'BigQuery is not supported by Drizby',
  mongo: 'MongoDB is not supported by Drizby',
  oracle: 'Oracle is not supported by Drizby',
  sparksql: 'SparkSQL is not supported by Drizby',
  presto: 'Presto is not supported by Drizby',
  clickhouse: 'ClickHouse is not supported by Drizby',
  druid: 'Druid is not supported by Drizby',
  athena: 'Athena is not supported by Drizby',
}

export function mapMetabaseEngine(engine: string): { engineType: string; provider: string } | null {
  return METABASE_ENGINE_MAP[engine] ?? null
}

// --- Chart Type Mapping ---

const CHART_TYPE_MAP: Record<string, string> = {
  bar: 'bar',
  line: 'line',
  area: 'area',
  pie: 'pie',
  table: 'table',
  scatter: 'scatter',
  funnel: 'funnel',
  // Lossy mappings
  scalar: 'kpiNumber',
  smartscalar: 'kpiNumber',
  row: 'bar',
  combo: 'bar',
  progress: 'table',
  gauge: 'table',
  pivot: 'table',
  map: 'table',
  waterfall: 'bar',
  object: 'table',
  boxplot: 'table',
  sankey: 'table',
}

export function mapChartType(display: string): string {
  return CHART_TYPE_MAP[display] ?? 'table'
}

// --- Grid Translation ---

/**
 * Translate Metabase grid position (18 columns) to Drizby (12 columns).
 */
export function translateGridPosition(pos: {
  row: number
  col: number
  size_x: number
  size_y: number
}): { x: number; y: number; w: number; h: number } {
  const x = Math.round(pos.col * (12 / 18))
  let w = Math.max(1, Math.round(pos.size_x * (12 / 18)))
  // Clamp so portlet doesn't overflow the grid
  w = Math.min(w, 12 - x)
  w = Math.max(w, 1)

  return {
    x,
    y: pos.row,
    w,
    h: Math.max(1, pos.size_y),
  }
}

// --- Database Mapping ---

/**
 * Map Metabase databases to Drizby connection format.
 */
export function mapMetabaseDatabases(databases: MetabaseDatabase[]): MappedDatabase[] {
  return databases.map(db => {
    const mapping = mapMetabaseEngine(db.engine)
    const unsupported = UNSUPPORTED_ENGINES[db.engine]

    const result: MappedDatabase = {
      metabaseId: db.id,
      name: db.name,
      engine: db.engine,
      drizbyEngineType: mapping?.engineType ?? null,
      drizbyProvider: mapping?.provider ?? null,
      supported: !!mapping,
      unsupportedReason:
        unsupported || (!mapping ? `Engine "${db.engine}" is not supported` : undefined),
    }

    // Extract connection details
    const details = db.details || {}
    if (details.host) result.host = details.host
    if (details.port) result.port = details.port
    if (details.dbname || details.db) result.database = details.dbname || details.db
    if (details.user) result.username = details.user

    // Build connection string template
    if (mapping) {
      result.connectionStringTemplate = buildConnectionStringTemplate(mapping.engineType, details)
    }

    return result
  })
}

/**
 * Build a connection string template from Metabase database details.
 * Password is replaced with __PASSWORD__ placeholder since Metabase redacts them.
 */
function buildConnectionStringTemplate(
  engineType: string,
  details: Record<string, any>
): string | undefined {
  const host = details.host || 'localhost'
  const user = details.user || ''
  const dbname = details.dbname || details.db || ''

  switch (engineType) {
    case 'postgres': {
      const port = details.port || 5432
      const ssl = details.ssl ? '?sslmode=require' : ''
      return `postgresql://${user}:__PASSWORD__@${host}:${port}/${dbname}${ssl}`
    }
    case 'mysql': {
      const port = details.port || 3306
      return `mysql://${user}:__PASSWORD__@${host}:${port}/${dbname}`
    }
    case 'sqlite':
      return details.db || undefined
    case 'snowflake':
      return JSON.stringify({
        account: details.account || '',
        username: user,
        password: '__PASSWORD__',
        database: dbname,
        warehouse: details.warehouse || '',
        schema: details.schema || 'public',
      })
    default:
      return undefined
  }
}

// --- Dashboard Translation ---

/**
 * Translate a Metabase dashboard into Drizby analytics page config.
 */
export function translateDashboard(
  mbDashboard: MetabaseDashboard,
  connectionId: number
): {
  name: string
  description: string | null
  connectionId: number
  config: { portlets: MappedPortlet[] }
} {
  const portlets: MappedPortlet[] = []

  for (const dashcard of mbDashboard.dashcards) {
    const portlet = translateDashcard(dashcard)
    if (portlet) portlets.push(portlet)
  }

  return {
    name: mbDashboard.name,
    description: mbDashboard.description || null,
    connectionId,
    config: { portlets },
  }
}

/**
 * Translate a single Metabase dashcard to a Drizby portlet.
 */
function translateDashcard(dashcard: MetabaseDashcard): MappedPortlet | null {
  const grid = translateGridPosition({
    row: dashcard.row,
    col: dashcard.col,
    size_x: dashcard.size_x,
    size_y: dashcard.size_y,
  })

  // Text/heading cards (no card_id)
  if (dashcard.card_id === null || !dashcard.card) {
    const vizSettings = dashcard.visualization_settings || {}
    const text = vizSettings.text || vizSettings.heading || ''
    if (!text) return null

    return {
      id: `mb-text-${dashcard.id}`,
      title: '',
      chartType: 'text',
      displayConfig: { text },
      ...grid,
    }
  }

  const card = dashcard.card
  const chartType = mapChartType(card.display)

  // Build chart config from visualization settings
  const vizSettings = {
    ...card.visualization_settings,
    ...dashcard.visualization_settings,
  }
  const chartConfig: { xAxis?: string[]; yAxis?: string[] } = {}
  if (vizSettings['graph.dimensions']) {
    chartConfig.xAxis = vizSettings['graph.dimensions']
  }
  if (vizSettings['graph.metrics']) {
    chartConfig.yAxis = vizSettings['graph.metrics']
  }

  // Build display config
  const displayConfig: Record<string, any> = {}
  if (vizSettings['stackable.stack_type']) {
    displayConfig.stacked = true
    displayConfig.stackType = vizSettings['stackable.stack_type']
  }
  if (vizSettings['graph.show_values'] !== undefined) {
    displayConfig.showValues = vizSettings['graph.show_values']
  }

  // Build metabase source metadata
  const metabaseSource = extractMetabaseQueryContext(card)

  return {
    id: `mb-card-${card.id}`,
    title: card.name,
    chartType,
    chartConfig: Object.keys(chartConfig).length > 0 ? chartConfig : undefined,
    displayConfig: Object.keys(displayConfig).length > 0 ? displayConfig : undefined,
    metabaseSource,
    ...grid,
  }
}

/**
 * Extract a serialized description of a Metabase card's query for AI translation.
 */
export function extractMetabaseQueryContext(card: MetabaseCard): MappedPortlet['metabaseSource'] {
  const dq = card.dataset_query

  if (dq.type === 'native' && dq.native?.query) {
    return {
      cardId: card.id,
      cardName: card.name,
      queryType: 'native',
      nativeQuery: dq.native.query,
      databaseId: dq.database || card.database_id,
      visualizationSettings: card.visualization_settings,
    }
  }

  if (dq.type === 'query' && dq.query) {
    return {
      cardId: card.id,
      cardName: card.name,
      queryType: 'structured',
      structuredQuery: dq.query,
      databaseId: dq.database || card.database_id,
      visualizationSettings: card.visualization_settings,
    }
  }

  // MLv2 stages format (newer Metabase versions)
  if (dq.stages && dq.stages.length > 0) {
    return {
      cardId: card.id,
      cardName: card.name,
      queryType: 'stages',
      structuredQuery: { stages: dq.stages },
      databaseId: dq.database || card.database_id,
      visualizationSettings: card.visualization_settings,
    }
  }

  return {
    cardId: card.id,
    cardName: card.name,
    queryType: 'structured',
    structuredQuery: dq,
    databaseId: dq.database || card.database_id,
    visualizationSettings: card.visualization_settings,
  }
}

/**
 * Build a human-readable description of a Metabase query for AI prompt context.
 * Used when asking AI to translate Metabase queries into cube queries.
 */
export function describeMetabaseQuery(card: MetabaseCard): string {
  const dq = card.dataset_query
  const parts: string[] = [`Card: "${card.name}" (display: ${card.display})`]

  if (dq.type === 'native' && dq.native?.query) {
    parts.push('Type: Native SQL')
    parts.push(`SQL: ${dq.native.query}`)
  } else if (dq.stages && dq.stages.length > 0) {
    parts.push('Type: Structured query (MLv2 stages)')
    const stage = dq.stages[0]
    if (stage['source-table']) parts.push(`Source table ID: ${stage['source-table']}`)
    if (stage.aggregation) {
      const aggs = stage.aggregation.map((a: any) => {
        if (Array.isArray(a) && a.length > 0) return a[0]
        return String(a)
      })
      parts.push(`Aggregations: ${aggs.join(', ')}`)
    }
    if (stage.breakout) {
      parts.push(`Breakout fields: ${stage.breakout.length} field(s)`)
    }
    if (stage.filters) {
      parts.push(`Filters: ${stage.filters.length} filter(s)`)
    }
  } else if (dq.type === 'query' && dq.query) {
    parts.push('Type: Structured query (legacy)')
    const q = dq.query
    if (q['source-table']) parts.push(`Source table ID: ${q['source-table']}`)
    if (q.aggregation) parts.push(`Aggregations: ${JSON.stringify(q.aggregation)}`)
    if (q.breakout) parts.push(`Breakouts: ${JSON.stringify(q.breakout)}`)
  }

  const viz = card.visualization_settings || {}
  if (viz['graph.dimensions']) {
    parts.push(`X-axis dimensions: ${viz['graph.dimensions'].join(', ')}`)
  }
  if (viz['graph.metrics']) {
    parts.push(`Y-axis metrics: ${viz['graph.metrics'].join(', ')}`)
  }

  return parts.join('\n')
}
