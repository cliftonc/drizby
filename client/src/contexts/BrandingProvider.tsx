import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { type Branding, BrandingContext, defaults } from '../hooks/useBranding'

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery<Branding>({
    queryKey: ['branding'],
    queryFn: async () => {
      const res = await fetch('/api/branding')
      if (!res.ok) return defaults
      return res.json()
    },
  })

  // Block rendering until branding is loaded to prevent flash of default branding
  if (isLoading) return null

  return <BrandingContext.Provider value={data ?? defaults}>{children}</BrandingContext.Provider>
}
