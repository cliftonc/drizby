import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

interface FeaturesConfig {
  mcpEnabled: boolean
  appUrl: string
  brandName: string
  brandLogoUrl: string
}

export default function ServerFeaturesPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<FeaturesConfig>({
    queryKey: ['settings', 'features'],
    queryFn: async () => {
      const res = await fetch('/api/settings/features', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch feature settings')
      return res.json()
    },
  })

  const [brandName, setBrandName] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  useEffect(() => {
    if (data) {
      setBrandName(data.brandName)
      setBrandLogoUrl(data.brandLogoUrl)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/settings/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'features'] })
      queryClient.invalidateQueries({ queryKey: ['branding'] })
      setFeedback({ type: 'success', message: 'Settings saved.' })
      setTimeout(() => setFeedback(null), 3000)
    },
    onError: (err: Error) => {
      setFeedback({ type: 'error', message: err.message })
    },
  })

  const handleSave = () => {
    saveMutation.mutate({ brandName, brandLogoUrl })
  }

  if (isLoading) return <div style={{ color: 'var(--dc-text-muted)' }}>Loading...</div>

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        Server Features
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Configure server-level features and branding.
      </p>

      {feedback && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 16,
            backgroundColor:
              feedback.type === 'success' ? 'var(--dc-success-bg, #dcfce7)' : 'var(--dc-error-bg)',
            border: `1px solid ${feedback.type === 'success' ? 'var(--dc-success, #22c55e)' : 'var(--dc-error-border)'}`,
            color: feedback.type === 'success' ? 'var(--dc-success, #16a34a)' : 'var(--dc-error)',
          }}
        >
          {feedback.message}
        </div>
      )}

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Branding */}
        <div
          style={{
            border: '1px solid var(--dc-border)',
            borderRadius: 8,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)', marginBottom: 12 }}>
            Branding
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Application Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Drizby"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--dc-input-border)',
                  backgroundColor: 'var(--dc-input-bg)',
                  color: 'var(--dc-text)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--dc-text-muted)',
                  marginBottom: 4,
                }}
              >
                Logo URL
              </label>
              <input
                type="text"
                value={brandLogoUrl}
                onChange={e => setBrandLogoUrl(e.target.value)}
                placeholder="/logo.png"
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 13,
                  borderRadius: 6,
                  border: '1px solid var(--dc-input-border)',
                  backgroundColor: 'var(--dc-input-bg)',
                  color: 'var(--dc-text)',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ fontSize: 11, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                URL for the logo shown in the sidebar and login pages. Leave blank for the default.
              </div>
            </div>
          </div>
        </div>

        <div>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--dc-primary)',
              color: 'var(--dc-primary-content)',
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              opacity: saveMutation.isPending ? 0.5 : 1,
            }}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
