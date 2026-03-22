import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext } from 'react'

interface User {
  id: number
  email: string
  name: string
  role: string
  avatarUrl?: string
  emailVerified?: boolean
}

interface CompilationProgress {
  current: number
  total: number
  label: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  needsSetup: boolean
  pendingAdminSetup: boolean
  needsSeed: boolean
  authenticated: boolean
  enabledProviders: string[]
  googleEnabled: boolean
  compiling: boolean
  compilationProgress: CompilationProgress | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refetch: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const res = await fetch('/api/auth/status', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch auth status')
      return res.json()
    },
    staleTime: 30 * 1000,
    // Poll every 2s while compiling, otherwise normal staleTime
    refetchInterval: query => (query.state.data?.compiling ? 2000 : false),
    // Fast retries — handles server not yet ready during dev startup
    retry: 10,
    retryDelay: 500,
  })

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Login failed')
      }
      await refetch()
    },
    [refetch]
  )

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Registration failed')
      }
      await refetch()
    },
    [refetch]
  )

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    queryClient.clear()
    await refetch()
  }, [refetch, queryClient])

  return (
    <AuthContext.Provider
      value={{
        user: data?.user || null,
        isLoading,
        needsSetup: data?.needsSetup || false,
        pendingAdminSetup: data?.pendingAdminSetup || false,
        needsSeed: data?.needsSeed || false,
        authenticated: data?.authenticated || false,
        enabledProviders: data?.enabledProviders || [],
        googleEnabled: (data?.enabledProviders || []).includes('google'),
        compiling: data?.compiling || false,
        compilationProgress: data?.compilationProgress || null,
        login,
        register,
        logout,
        refetch: () => refetch(),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
