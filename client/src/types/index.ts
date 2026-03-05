// Re-export types from drizzle-cube client
export type {
  PortletConfig,
  ChartType,
  ChartAxisConfig,
  ChartDisplayConfig,
  DashboardConfig,
  CubeQuery,
  NotebookConfig
} from 'drizzle-cube/client'

import type { DashboardConfig, NotebookConfig } from 'drizzle-cube/client'

export interface AnalyticsPage {
  id: number
  name: string
  description?: string
  organisationId: number
  config: DashboardConfig
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAnalyticsPageRequest {
  name: string
  description?: string
  config: DashboardConfig
  order?: number
}

export interface UpdateAnalyticsPageRequest {
  name?: string
  description?: string
  config?: DashboardConfig
  order?: number
}

export interface Notebook {
  id: number
  name: string
  description?: string
  organisationId: number
  config: NotebookConfig | null
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateNotebookRequest {
  name: string
  description?: string
  config?: NotebookConfig
  order?: number
}

export interface UpdateNotebookRequest {
  name?: string
  description?: string
  config?: NotebookConfig
  order?: number
}
