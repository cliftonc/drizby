import { useCallback, useState } from 'react'
import { useConfirm } from '../../hooks/useConfirm'
import { usePrompt } from '../../hooks/usePrompt'

export default function DataSettingsPage() {
  const [reseeding, setReseeding] = useState(false)
  const [reseedMessage, setReseedMessage] = useState('')
  const [reseedError, setReseedError] = useState('')
  const [clearing, setClearing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirm, ConfirmDialog] = useConfirm()
  const [prompt, PromptDialog] = usePrompt()

  const handleReseedDemo = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Reseed Demo Data',
      message:
        'This will delete and recreate the demo database with fresh sample data. Your other connections and data will not be affected.',
      confirmText: 'Reseed',
      variant: 'danger',
    })
    if (!confirmed) return

    setReseeding(true)
    setReseedError('')
    setReseedMessage('')
    try {
      const res = await fetch('/api/settings/reseed-demo', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Reseed failed')
      }
      setReseedMessage('Demo data reseeded successfully. Reloading...')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setReseedError(err.message)
      setReseeding(false)
    }
  }, [confirm])

  const handleClearDemo = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Clear Demo Data',
      message:
        'This will remove the demo connection, its dashboards, cubes, schemas, and the demo Department groups. Your other connections and user-created groups will not be affected.',
      confirmText: 'Clear Demo',
      variant: 'danger',
    })
    if (!confirmed) return

    setClearing(true)
    setReseedError('')
    setReseedMessage('')
    try {
      const res = await fetch('/api/settings/clear-demo', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Clear failed')
      }
      setReseedMessage('Demo data cleared. Reloading...')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err: any) {
      setReseedError(err.message)
      setClearing(false)
    }
  }, [confirm])

  const handleFactoryReset = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Factory Reset',
      message:
        'This will permanently delete ALL data: connections, schemas, cubes, dashboards, notebooks, users, and settings. This cannot be undone.',
      confirmText: 'Continue',
      variant: 'danger',
    })
    if (!confirmed) return

    const typed = await prompt({
      title: 'Confirm Factory Reset',
      message: 'Type "RESET" to confirm you want to wipe all data.',
      placeholder: 'RESET',
      submitText: 'Reset Everything',
    })
    if (typed !== 'RESET') return

    setResetting(true)
    try {
      const res = await fetch('/api/settings/factory-reset', {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Reset failed')
      }
      window.location.href = '/'
    } catch (err: any) {
      setReseedError(err.message)
      setResetting(false)
    }
  }, [confirm, prompt])

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--dc-text)', margin: '0 0 8px' }}>
        Data
      </h2>
      <p style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 0, marginBottom: 24 }}>
        Manage demo data and perform destructive operations.
      </p>

      <div
        style={{
          padding: 20,
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px solid var(--dc-border)',
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--dc-text)',
            marginBottom: 4,
            marginTop: 0,
          }}
        >
          Demo Data
        </h3>
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 12, marginTop: 0 }}>
          Regenerate the demo database with fresh sample data. Other connections are not affected.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleReseedDemo}
            disabled={reseeding}
            style={{
              padding: '6px 16px',
              backgroundColor: 'transparent',
              color: 'var(--dc-warning, #f59e0b)',
              fontWeight: 500,
              borderRadius: 6,
              border: '1px solid var(--dc-warning, #f59e0b)',
              cursor: reseeding ? 'not-allowed' : 'pointer',
              fontSize: 13,
              opacity: reseeding ? 0.5 : 1,
            }}
          >
            {reseeding ? 'Reseeding...' : 'Reseed Demo Data'}
          </button>
          <button
            onClick={handleClearDemo}
            disabled={clearing}
            style={{
              padding: '6px 16px',
              backgroundColor: 'transparent',
              color: 'var(--dc-warning, #f59e0b)',
              fontWeight: 500,
              borderRadius: 6,
              border: '1px solid var(--dc-warning, #f59e0b)',
              cursor: clearing ? 'not-allowed' : 'pointer',
              fontSize: 13,
              opacity: clearing ? 0.5 : 1,
            }}
          >
            {clearing ? 'Clearing...' : 'Clear Demo Data'}
          </button>
        </div>
        {reseedError && (
          <div
            style={{
              backgroundColor: 'var(--dc-error-bg)',
              border: '1px solid var(--dc-error-border)',
              color: 'var(--dc-error)',
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 6,
              marginTop: 12,
            }}
          >
            {reseedError}
          </div>
        )}
        {reseedMessage && (
          <div
            style={{
              backgroundColor: 'var(--dc-success-bg)',
              border: '1px solid var(--dc-success-border)',
              color: 'var(--dc-success)',
              fontSize: 12,
              padding: '8px 12px',
              borderRadius: 6,
              marginTop: 12,
            }}
          >
            {reseedMessage}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 24,
          padding: 20,
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 8,
          border: '1px solid var(--dc-error-border, #ef4444)',
        }}
      >
        <h3
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--dc-error, #ef4444)',
            marginBottom: 4,
            marginTop: 0,
          }}
        >
          Danger Zone
        </h3>
        <p style={{ fontSize: 12, color: 'var(--dc-text-muted)', marginBottom: 12, marginTop: 0 }}>
          Permanently delete all data and reset Drizby to a fresh state. Demo data will be
          re-created on next server restart.
        </p>
        <button
          onClick={handleFactoryReset}
          disabled={resetting}
          style={{
            padding: '6px 16px',
            backgroundColor: 'transparent',
            color: 'var(--dc-error, #ef4444)',
            fontWeight: 500,
            borderRadius: 6,
            border: '1px solid var(--dc-error-border, #ef4444)',
            cursor: resetting ? 'not-allowed' : 'pointer',
            fontSize: 13,
            opacity: resetting ? 0.5 : 1,
          }}
        >
          {resetting ? 'Resetting...' : 'Factory Reset'}
        </button>
      </div>

      <ConfirmDialog />
      <PromptDialog />
    </div>
  )
}
