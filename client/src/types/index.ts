// Re-export types from drizzle-cube client
export type {
  PortletConfig,
  ChartType,
  ChartAxisConfig,
  ChartDisplayConfig,
  DashboardConfig,
  CubeQuery,
  NotebookConfig,
} from 'drizzle-cube/client'

import type { DashboardConfig, NotebookConfig } from 'drizzle-cube/client'

export interface Connection {
  id: number
  name: string
  description?: string
  engineType: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface VisibilityGroup {
  groupId: number
  groupName: string
}

export interface AnalyticsPage {
  id: number
  name: string
  description?: string
  connectionId?: number | null
  organisationId: number
  config: DashboardConfig
  createdBy?: number | null
  createdByName?: string | null
  visibilityGroups?: VisibilityGroup[]
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAnalyticsPageRequest {
  name: string
  description?: string
  connectionId?: number
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
  connectionId?: number | null
  organisationId: number
  config: NotebookConfig | null
  createdBy?: number | null
  createdByName?: string | null
  visibilityGroups?: VisibilityGroup[]
  order: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateNotebookRequest {
  name: string
  description?: string
  connectionId?: number
  config?: NotebookConfig
  order?: number
}

export interface UpdateNotebookRequest {
  name?: string
  description?: string
  config?: NotebookConfig
  order?: number
}
