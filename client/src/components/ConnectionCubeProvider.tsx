import { CubeProvider } from 'drizzle-cube/client'
import type { ReactNode } from 'react'

const DEFAULT_FEATURES = {
  showSchemaDiagram: true,
  useAnalysisBuilder: true,
  thumbnail: {
    enabled: true,
    format: 'png' as const
  }
}

interface ConnectionCubeProviderProps {
  connectionId: number
  children: ReactNode
}

export default function ConnectionCubeProvider({ connectionId, children }: ConnectionCubeProviderProps) {
  return (
    <CubeProvider
      key={connectionId}
      apiOptions={{
        apiUrl: '/cubejs-api/v1',
        headers: { 'X-Connection-Id': String(connectionId) }
      }}
      features={DEFAULT_FEATURES}
    >
      {children}
    </CubeProvider>
  )
}
