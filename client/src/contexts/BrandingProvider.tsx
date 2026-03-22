import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { type Branding, BrandingContext, defaults } from '../hooks/useBranding'

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data } = useQuery<Branding>({
    queryKey: ['branding'],
    queryFn: async () => {
      const res = await fetch('/api/branding')
      if (!res.ok) return defaults
      return res.json()
    },
    // Don't block app rendering — show defaults immediately, update when ready
    placeholderData: defaults,
    retry: 3,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
  })

  return <BrandingContext.Provider value={data ?? defaults}>{children}</BrandingContext.Provider>
}
