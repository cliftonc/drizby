import { createContext, useContext } from 'react'

export interface Branding {
  name: string
  logoUrl: string
}

export const defaults: Branding = { name: 'Drizby', logoUrl: '/logo.png' }

export const BrandingContext = createContext<Branding>(defaults)

export function useBranding(): Branding {
  return useContext(BrandingContext)
}
