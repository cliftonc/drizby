import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AIConfigForm } from './AIConfigForm'
import { ConnectionForm, type ConnectionFormData, type ProviderDef } from './ConnectionForm'
import { TableSelector } from './TableSelector'

// ── Types ──────────────────────────────────────────────────────────────

interface PlannedCube {
  name: string
  variableName: string
  title: string
  description: string
  tables: string[]
  schemaFile: string
}

interface JoinDef {
  targetCube: string
  relationship: string
  on: any
}

interface JoinProposal {
  cubeDefId: number
  cubeName: string
  joins: Record<string, JoinDef>
}

type WizardStep =
  | 'select-connection'
  | 'ai-config'
  | 'connect'
  | 'pulling'
  | 'select-tables'
  | 'saving-schema'
  | 'planning-cubes'
  | 'select-cubes'
  | 'generating-cubes'
  | 'planning-joins'
  | 'select-joins'
  | 'applying-joins'
  | 'done'

const PULL_UNSUPPORTED_ENGINES = new Set(['snowflake', 'databend'])

interface WizardState {
  step: WizardStep
  connectionId: number | null
  engineType?: string
  // Introspect
  source?: string
  tables?: string[]
  selectedTables: Set<string>
  savedSchemaName?: string
  // AI gen
  hasAI: boolean
  plannedCubes?: PlannedCube[]
  selectedCubes: Set<string>
  genCurrent?: number
  genTotal?: number
  savedCubeFiles: Array<{ name: string; id: number }>
  genErrors: Array<{ name: string; error: string }>
  // Joins
  joinProposals?: JoinProposal[]
  selectedJoins: Set<string>
  // Status
  message: string
  error?: string
}

// ── Step definitions for the left panel ──────────────────────────────────

const STEP_DEFS = [
  {
    key: 'connection',
    label: 'Connection',
    phases: ['select-connection', 'connect'] as WizardStep[],
  },
  { key: 'ai', label: 'AI Provider', phases: ['ai-config'] as WizardStep[] },
  {
    key: 'pull',
    label: 'Pull Schema',
    phases: ['pulling', 'select-tables', 'saving-schema'] as WizardStep[],
  },
  {
    key: 'cubes',
    label: 'Generate Cubes',
    phases: ['planning-cubes', 'select-cubes', 'generating-cubes'] as WizardStep[],
  },
  {
    key: 'joins',
    label: 'Joins',
    phases: ['planning-joins', 'select-joins', 'applying-joins'] as WizardStep[],
  },
  { key: 'done', label: 'Done', phases: ['done'] as WizardStep[] },
]

// ── Spinner helper ────────────────────────────────────────────────────

function SpinnerContent({ message }: { message: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: '3px solid var(--dc-border)',
          borderTop: '3px solid var(--dc-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div style={{ fontSize: 13, color: 'var(--dc-text-muted)' }}>{message}</div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  )
}

// ── Link button style ────────────────────────────────────────────────

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--dc-primary)',
  fontSize: 12,
  padding: 0,
  textDecoration: 'underline',
}

// ── Main component ───────────────────────────────────────────────────

export function QuickSetupWizard({
  isOpen,
  onClose,
  connectionId,
  onComplete,
}: {
  isOpen: boolean
  onClose: () => void
  connectionId?: number
  onComplete: (connectionId: number) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [cubeFilter, setCubeFilter] = useState('')

  const { data: aiConfig } = useQuery<{ provider: string; hasApiKey: boolean }>({
    queryKey: ['settings', 'ai'],
    queryFn: async () => {
      const res = await fetch('/api/settings/ai', { credentials: 'include' })
      if (!res.ok) return { provider: '', hasApiKey: false }
      return res.json()
    },
    enabled: isOpen,
  })

  const { data: providers = [] } = useQuery<ProviderDef[]>({
    queryKey: ['providers'],
    queryFn: () => fetch('/api/connections/providers').then(r => r.json()),
    enabled: isOpen,
  })

  const initialHasAI = !!(aiConfig?.provider && aiConfig?.hasApiKey)

  const { data: existingConnections = [] } = useQuery<
    Array<{ id: number; name: string; engineType: string; isActive: boolean }>
  >({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json()),
    enabled: isOpen,
  })

  const [state, setState] = useState<WizardState>(() => ({
    step: 'select-connection',
    connectionId: connectionId ?? null,
    selectedTables: new Set<string>(),
    hasAI: false,
    selectedCubes: new Set<string>(),
    savedCubeFiles: [],
    genErrors: [],
    selectedJoins: new Set<string>(),
    message: '',
  }))

  // Track whether we've initialized, to auto-advance past completed steps
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!isOpen || initializedRef.current || aiConfig === undefined) return
    initializedRef.current = true

    const hasAI = !!(aiConfig?.provider && aiConfig?.hasApiKey)

    // If connectionId provided, skip connection selection
    if (connectionId) {
      const engine = existingConnections.find(c => c.id === connectionId)?.engineType
      const startStep: WizardStep = hasAI ? 'pulling' : 'ai-config'
      setState(prev => ({
        ...prev,
        step: startStep,
        connectionId,
        engineType: engine,
        hasAI,
      }))
      if (startStep === 'pulling') {
        startPullOrSkip(connectionId, engine)
      }
    } else {
      // Start at connection selection
      setState(prev => ({
        ...prev,
        step: 'select-connection',
        hasAI,
      }))
    }
  }, [isOpen, aiConfig, connectionId, existingConnections])

  // Reset state when wizard closes
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false
      setState({
        step: 'select-connection',
        connectionId: connectionId ?? null,
        selectedTables: new Set<string>(),
        hasAI: false,
        selectedCubes: new Set<string>(),
        savedCubeFiles: [],
        genErrors: [],
        selectedJoins: new Set<string>(),
        message: '',
      })
    }
  }, [isOpen, connectionId])

  // ── Flow actions ─────────────────────────────────────────────────────

  const getEngineForConnection = useCallback(
    (connId: number): string | undefined => {
      return existingConnections.find(c => c.id === connId)?.engineType
    },
    [existingConnections]
  )

  const startPullOrSkip = useCallback((connId: number, engine?: string) => {
    if (engine && PULL_UNSUPPORTED_ENGINES.has(engine)) {
      setState(prev => ({
        ...prev,
        connectionId: connId,
        engineType: engine,
        step: 'done',
        message: `Schema pull is not supported for ${engine}. Create your schema and cube definitions manually in the editor.`,
      }))
      return
    }
    setState(prev => ({ ...prev, step: 'pulling' }))
    runIntrospect(connId)
  }, [])

  const handleAISaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['settings', 'ai'] })
    setState(prev => ({ ...prev, hasAI: true }))
    if (state.connectionId) {
      startPullOrSkip(
        state.connectionId,
        state.engineType || getEngineForConnection(state.connectionId)
      )
    }
  }, [state.connectionId, state.engineType, queryClient, startPullOrSkip, getEngineForConnection])

  const handleAISkipped = useCallback(() => {
    setState(prev => ({ ...prev, hasAI: false }))
    if (state.connectionId) {
      startPullOrSkip(
        state.connectionId,
        state.engineType || getEngineForConnection(state.connectionId)
      )
    }
  }, [state.connectionId, state.engineType, startPullOrSkip, getEngineForConnection])

  const handleSelectExistingConnection = useCallback(
    (connId: number) => {
      const hasAI = state.hasAI
      const engine = getEngineForConnection(connId)
      setState(prev => ({
        ...prev,
        connectionId: connId,
        engineType: engine,
        step: hasAI ? 'pulling' : 'ai-config',
      }))
      if (hasAI) {
        startPullOrSkip(connId, engine)
      }
    },
    [state.hasAI, getEngineForConnection, startPullOrSkip]
  )

  const handleConnectionCreated = useCallback(
    async (data: ConnectionFormData) => {
      setIsCreating(true)
      try {
        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
        const conn = await res.json()
        if (!res.ok) throw new Error(conn.error || 'Failed to create connection')
        queryClient.invalidateQueries({ queryKey: ['connections'] })
        const hasAI = state.hasAI
        const engine = data.engineType
        setState(prev => ({
          ...prev,
          connectionId: conn.id,
          engineType: engine,
          step: hasAI ? 'pulling' : 'ai-config',
        }))
        if (hasAI) {
          startPullOrSkip(conn.id, engine)
        }
      } catch (err: any) {
        setState(prev => ({ ...prev, error: err.message }))
      } finally {
        setIsCreating(false)
      }
    },
    [queryClient, state.hasAI, startPullOrSkip]
  )

  const runIntrospect = async (connId: number) => {
    setState(prev => ({
      ...prev,
      step: 'pulling',
      message: 'Pulling schema from database...',
      error: undefined,
    }))
    try {
      const res = await fetch('/api/schema-files/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: connId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Introspection failed')
      setState(prev => ({
        ...prev,
        step: 'select-tables',
        source: data.source,
        tables: data.tables,
        selectedTables: new Set(data.tables || []),
      }))
    } catch (err: any) {
      setState(prev => ({ ...prev, step: 'select-tables', error: err.message, tables: [] }))
    }
  }

  const saveSchema = async () => {
    if (!state.source || !state.connectionId) return
    const allTables = state.tables || []
    const savedTables = allTables.filter(t => state.selectedTables.has(t))
    const isFiltering = state.selectedTables.size < allTables.length
    setState(prev => ({
      ...prev,
      step: 'saving-schema',
      message: isFiltering ? 'Filtering schema to selected tables (AI)...' : 'Saving schema...',
    }))

    try {
      const res = await fetch('/api/schema-files/introspect/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          connectionId: state.connectionId,
          sourceCode: state.source,
          selectedTables: state.selectedTables.size < allTables.length ? savedTables : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Save failed')

      queryClient.invalidateQueries({ queryKey: ['schema-files'] })

      setState(prev => ({
        ...prev,
        savedSchemaName: data.file?.name,
        message: 'Compiling schema...',
      }))

      // Compile the saved schema — stop if compilation fails
      if (data.file?.id) {
        const compileRes = await fetch(`/api/schema-files/${data.file.id}/compile`, {
          method: 'POST',
          credentials: 'include',
        })
        const compileData = await compileRes.json()
        queryClient.invalidateQueries({ queryKey: ['schema-files'] })
        queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })

        if (!compileData.success && compileData.errors?.length > 0) {
          const errorMessages = compileData.errors
            .map((e: any) => (e.line ? `Line ${e.line}: ${e.message}` : e.message))
            .join('\n')
          setState(prev => ({
            ...prev,
            step: 'done',
            message: `Schema saved but compilation failed. Please fix errors in the editor.\n\n${errorMessages}`,
          }))
          return
        }
      }

      if (state.hasAI) {
        planCubes(state.connectionId)
      } else {
        setState(prev => ({
          ...prev,
          step: 'done',
          message: 'Schema saved. Configure an AI provider to auto-generate cube definitions.',
        }))
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, step: 'select-tables', error: err.message }))
    }
  }

  const planCubes = async (connId: number) => {
    setState(prev => ({
      ...prev,
      step: 'planning-cubes',
      message: 'Analyzing schemas and identifying cubes...',
    }))

    try {
      const res = await fetch('/api/schema-files/plan-cubes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: connId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Planning failed')

      if (!data.cubes || data.cubes.length === 0) {
        setState(prev => ({
          ...prev,
          step: 'done',
          message: 'All tables already have cubes. No new cubes to generate.',
        }))
        return
      }

      setState(prev => ({
        ...prev,
        step: 'select-cubes',
        plannedCubes: data.cubes,
        selectedCubes: new Set(data.cubes.map((c: PlannedCube) => c.variableName)),
      }))
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        step: 'done',
        message: `Schema saved. AI cube planning failed: ${err.message}`,
      }))
    }
  }

  const generateCubes = async () => {
    const cubes = (state.plannedCubes || []).filter(c => state.selectedCubes.has(c.variableName))
    if (cubes.length === 0) return

    setState(prev => ({
      ...prev,
      step: 'generating-cubes',
      message: `Generating ${cubes[0].title}...`,
      genCurrent: 0,
      genTotal: cubes.length,
      savedCubeFiles: [],
      genErrors: [],
    }))

    try {
      const res = await fetch('/api/schema-files/generate-selected-cubes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: state.connectionId, selectedCubes: cubes }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const savedIds: number[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))
            switch (eventType) {
              case 'status':
                setState(prev => ({
                  ...prev,
                  message: data.message,
                  genCurrent: data.current,
                  genTotal: data.total,
                }))
                break
              case 'cube_saved':
                savedIds.push(data.fileId)
                queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
                setState(prev => ({
                  ...prev,
                  savedCubeFiles: [
                    ...prev.savedCubeFiles,
                    { name: data.fileName, id: data.fileId },
                  ],
                }))
                break
              case 'cube_error':
                setState(prev => ({
                  ...prev,
                  genErrors: [...prev.genErrors, { name: data.name, error: data.error }],
                }))
                break
              case 'error':
                throw new Error(data.message)
            }
          }
        }
      }

      // Compile all generated cubes
      if (savedIds.length > 0) {
        setState(prev => ({ ...prev, message: 'Compiling cube definitions...' }))
        for (const id of savedIds) {
          await fetch(`/api/cube-definitions/${id}/compile`, {
            method: 'POST',
            credentials: 'include',
          })
        }
        queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
        queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      }

      // Plan joins
      await planJoins()
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        step: 'done',
        message:
          prev.savedCubeFiles.length > 0
            ? `Generated ${prev.savedCubeFiles.length} cube(s). Some errors occurred.`
            : `Generation failed: ${err.message}`,
      }))
    }
  }

  const planJoins = async () => {
    setState(prev => ({
      ...prev,
      step: 'planning-joins',
      message: 'Analyzing relationships between cubes...',
    }))

    try {
      const res = await fetch('/api/schema-files/plan-joins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: state.connectionId }),
      })
      const data = await res.json()

      if (!res.ok || !data.proposals || data.proposals.length === 0) {
        setState(prev => ({ ...prev, step: 'done', message: '' }))
        return
      }

      const allJoinKeys = new Set<string>()
      for (const p of data.proposals) {
        for (const joinName of Object.keys(p.joins)) {
          allJoinKeys.add(`${p.cubeName}.${joinName}`)
        }
      }

      setState(prev => ({
        ...prev,
        step: 'select-joins',
        joinProposals: data.proposals,
        selectedJoins: allJoinKeys,
      }))
    } catch {
      setState(prev => ({ ...prev, step: 'done', message: '' }))
    }
  }

  const applyJoins = async () => {
    const proposals = state.joinProposals || []
    const filtered = proposals
      .map(p => {
        const selectedEntries = Object.entries(p.joins).filter(([joinName]) =>
          state.selectedJoins.has(`${p.cubeName}.${joinName}`)
        )
        if (selectedEntries.length === 0) return null
        return {
          cubeDefId: p.cubeDefId,
          cubeName: p.cubeName,
          joins: Object.fromEntries(selectedEntries),
        }
      })
      .filter(Boolean)

    if (filtered.length === 0) {
      setState(prev => ({ ...prev, step: 'done', message: '' }))
      return
    }

    setState(prev => ({ ...prev, step: 'applying-joins', message: 'Applying joins...' }))

    try {
      const res = await fetch('/api/schema-files/apply-joins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: state.connectionId, selectedJoins: filtered }),
      })
      if (!res.ok) throw new Error('Failed to apply joins')
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })

      // Recompile all affected cubes so joins are registered in the semantic layer
      setState(prev => ({ ...prev, message: 'Compiling cubes with joins...' }))
      const cubeIds = filtered.map((f: any) => f.cubeDefId as number)
      for (const id of cubeIds) {
        await fetch(`/api/cube-definitions/${id}/compile`, {
          method: 'POST',
          credentials: 'include',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
    } catch {}
    setState(prev => ({ ...prev, step: 'done', message: '' }))
  }

  const handleDone = () => {
    if (state.connectionId) {
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      onComplete(state.connectionId)
    } else {
      onClose()
    }
  }

  const exitToEditor = () => {
    if (state.connectionId) {
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      navigate(`/schema-editor/${state.connectionId}`)
    }
    onClose()
  }

  if (!isOpen) return null

  // ── Determine which high-level steps to show ──────────────────────────

  const visibleSteps = STEP_DEFS.filter(s => {
    if (s.key === 'connection' && connectionId) return false
    if (s.key === 'ai' && initialHasAI) return false
    if (s.key === 'cubes' && !state.hasAI) return false
    if (s.key === 'joins' && !state.hasAI) return false
    return true
  })

  const visibleStepIndex = visibleSteps.findIndex(s => s.phases.includes(state.step))

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--dc-surface)',
          borderRadius: 12,
          border: '1px solid var(--dc-border)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          display: 'flex',
          width: 'calc(100vw - 80px)',
          height: 'calc(100vh - 80px)',
          maxWidth: 1100,
          maxHeight: 800,
          overflow: 'hidden',
        }}
      >
        {/* Left panel — step list */}
        <div
          style={{
            width: 170,
            flexShrink: 0,
            borderRight: '1px solid var(--dc-border)',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <div
            style={{
              padding: '0 16px 16px',
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--dc-text)',
            }}
          >
            Quick Setup
          </div>
          {visibleSteps.map((step, i) => (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: i === visibleStepIndex ? 600 : 400,
                color:
                  i < visibleStepIndex
                    ? 'var(--dc-success, #22c55e)'
                    : i === visibleStepIndex
                      ? 'var(--dc-text)'
                      : 'var(--dc-text-muted)',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  backgroundColor:
                    i < visibleStepIndex
                      ? 'var(--dc-success, #22c55e)'
                      : i === visibleStepIndex
                        ? 'var(--dc-primary)'
                        : 'var(--dc-surface-tertiary, var(--dc-border))',
                  color: i <= visibleStepIndex ? '#fff' : 'var(--dc-text-muted)',
                }}
              >
                {i < visibleStepIndex ? '\u2713' : i + 1}
              </span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        {/* Right panel — step content */}
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Close button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '12px 16px 0',
              flexShrink: 0,
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--dc-text-muted)',
                fontSize: 18,
                padding: '0 4px',
                lineHeight: 1,
              }}
              title="Close"
            >
              &times;
            </button>
          </div>

          {/* Select connection step */}
          {state.step === 'select-connection' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 24px' }}>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 4 }}
              >
                Select a Connection
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--dc-text-muted)',
                  marginTop: 0,
                  marginBottom: 16,
                }}
              >
                Choose an existing database connection or create a new one.
              </p>

              {existingConnections.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--dc-text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: 8,
                    }}
                  >
                    Existing connections
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {existingConnections.map(conn => (
                      <button
                        key={conn.id}
                        onClick={() => handleSelectExistingConnection(conn.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid var(--dc-border)',
                          backgroundColor: 'var(--dc-surface)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'border-color 0.15s',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--dc-primary)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--dc-border)'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dc-text)' }}>
                            {conn.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--dc-text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            {conn.engineType}
                            {PULL_UNSUPPORTED_ENGINES.has(conn.engineType) && (
                              <span
                                style={{
                                  fontSize: 10,
                                  color: 'var(--dc-text-muted)',
                                  opacity: 0.7,
                                }}
                              >
                                (manual schema only)
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--dc-primary)',
                            fontWeight: 500,
                          }}
                        >
                          Select →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--dc-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: 8,
                }}
              >
                {existingConnections.length > 0
                  ? 'Or create a new connection'
                  : 'Create a connection'}
              </div>
              <button
                onClick={() => setState(prev => ({ ...prev, step: 'connect' }))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1.5px dashed var(--dc-border)',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  width: '100%',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s',
                  color: 'var(--dc-text-secondary)',
                  fontSize: 14,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--dc-border)'
                }}
              >
                <span style={{ fontSize: 18 }}>+</span>
                <span>New Connection</span>
              </button>
            </div>
          )}

          {/* AI Config step */}
          {state.step === 'ai-config' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 24px' }}>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 4 }}
              >
                Configure AI Provider
              </div>
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--dc-text-muted)',
                  marginTop: 0,
                  marginBottom: 16,
                }}
              >
                An AI provider enables automatic cube generation from your schema. You can skip this
                and write cubes manually.
              </p>
              <AIConfigForm onSaved={handleAISaved} onSkip={handleAISkipped} compact />
            </div>
          )}

          {/* Connect step */}
          {state.step === 'connect' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px 24px' }}>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 12 }}
              >
                Connect to Your Database
              </div>
              {state.error && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    marginBottom: 12,
                    backgroundColor: 'var(--dc-error-bg)',
                    border: '1px solid var(--dc-error-border)',
                    color: 'var(--dc-error)',
                  }}
                >
                  {state.error}
                </div>
              )}
              <ConnectionForm
                providers={providers}
                onSubmit={handleConnectionCreated}
                isLoading={isCreating}
                onCancel={() =>
                  connectionId
                    ? onClose()
                    : setState(prev => ({ ...prev, step: 'select-connection' }))
                }
                showTest
                title=""
              />
            </div>
          )}

          {/* Pulling schema */}
          {state.step === 'pulling' && <SpinnerContent message="Pulling schema from database..." />}

          {/* Select tables */}
          {state.step === 'select-tables' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              {state.error ? (
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 24,
                  }}
                >
                  <div style={{ fontSize: 14, color: 'var(--dc-error)', textAlign: 'center' }}>
                    {state.error}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => state.connectionId && runIntrospect(state.connectionId)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: 'var(--dc-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      Retry
                    </button>
                    <button onClick={exitToEditor} style={{ ...secondaryBtn }}>
                      Exit to Editor
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ padding: '8px 24px 0', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                      Select Tables
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, padding: '4px 24px 0' }}>
                    <TableSelector
                      tables={state.tables || []}
                      selectedTables={state.selectedTables}
                      onSelectionChange={tables =>
                        setState(prev => ({ ...prev, selectedTables: tables }))
                      }
                    />
                  </div>
                  <div
                    style={{
                      padding: '12px 24px',
                      borderTop: '1px solid var(--dc-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexShrink: 0,
                    }}
                  >
                    <button onClick={exitToEditor} style={secondaryBtn}>
                      Skip to Editor
                    </button>
                    <button
                      onClick={saveSchema}
                      disabled={state.selectedTables.size === 0}
                      style={{
                        padding: '8px 20px',
                        backgroundColor: 'var(--dc-primary)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: state.selectedTables.size === 0 ? 'not-allowed' : 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        opacity: state.selectedTables.size === 0 ? 0.5 : 1,
                      }}
                    >
                      {state.hasAI
                        ? `Save & Generate Cubes (${state.selectedTables.size})`
                        : `Save Schema (${state.selectedTables.size})`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Saving schema */}
          {state.step === 'saving-schema' && (
            <SpinnerContent message={state.message || 'Saving schema...'} />
          )}

          {/* Planning cubes */}
          {state.step === 'planning-cubes' && (
            <SpinnerContent message="Analyzing schemas and identifying cubes..." />
          )}

          {/* Select cubes */}
          {state.step === 'select-cubes' && state.plannedCubes && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '8px 24px 0', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                  Select Cubes to Generate
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--dc-text-muted)',
                    marginTop: 4,
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  <button
                    onClick={() =>
                      setState(prev => ({
                        ...prev,
                        selectedCubes: new Set(prev.plannedCubes!.map(c => c.variableName)),
                      }))
                    }
                    style={linkBtn}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedCubes: new Set() }))}
                    style={linkBtn}
                  >
                    Deselect All
                  </button>
                </div>
                {state.plannedCubes.length > 8 && (
                  <input
                    type="text"
                    value={cubeFilter}
                    onChange={e => setCubeFilter(e.target.value)}
                    placeholder="Filter cubes..."
                    style={searchInputStyle}
                  />
                )}
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 24px' }}>
                {state.plannedCubes
                  .filter(
                    c =>
                      !cubeFilter ||
                      c.title.toLowerCase().includes(cubeFilter.toLowerCase()) ||
                      c.description.toLowerCase().includes(cubeFilter.toLowerCase())
                  )
                  .map(cube => (
                    <label
                      key={cube.variableName}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--dc-border)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={state.selectedCubes.has(cube.variableName)}
                        onChange={() =>
                          setState(prev => {
                            const next = new Set(prev.selectedCubes)
                            next.has(cube.variableName)
                              ? next.delete(cube.variableName)
                              : next.add(cube.variableName)
                            return { ...prev, selectedCubes: next }
                          })
                        }
                        style={{ marginTop: 3, accentColor: 'var(--dc-primary)' }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)' }}>
                          {cube.title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--dc-text-muted)' }}>
                          {cube.description}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
              <div
                style={{
                  padding: '12px 24px',
                  borderTop: '1px solid var(--dc-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <button onClick={exitToEditor} style={secondaryBtn}>
                  Skip to Editor
                </button>
                <button
                  onClick={generateCubes}
                  disabled={state.selectedCubes.size === 0}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: 'var(--dc-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: state.selectedCubes.size === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: state.selectedCubes.size === 0 ? 0.5 : 1,
                  }}
                >
                  Generate Selected ({state.selectedCubes.size})
                </button>
              </div>
            </div>
          )}

          {/* Generating cubes */}
          {state.step === 'generating-cubes' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 24 }}>
              <div
                style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)', marginBottom: 12 }}
              >
                Generating Cube Definitions
              </div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginBottom: 16 }}>
                {state.message}
              </div>
              {state.genTotal != null && (
                <div
                  style={{
                    height: 6,
                    backgroundColor: 'var(--dc-border)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${((state.savedCubeFiles.length + state.genErrors.length) / state.genTotal) * 100}%`,
                      backgroundColor: 'var(--dc-primary)',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              )}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {(state.plannedCubes || [])
                  .filter(c => state.selectedCubes.has(c.variableName))
                  .map((cube, idx) => {
                    const nameVariants = [cube.name, cube.variableName, `${cube.variableName}.ts`]
                    const saved = state.savedCubeFiles.find(f => nameVariants.includes(f.name))
                    const errored = state.genErrors.find(e => nameVariants.includes(e.name))
                    const isCurrent =
                      !saved && !errored && state.genCurrent != null && idx + 1 === state.genCurrent
                    return (
                      <div
                        key={cube.variableName}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 0',
                          fontSize: 13,
                        }}
                      >
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {saved ? (
                            <span style={{ color: 'var(--dc-success, #22c55e)' }}>{'\u2713'}</span>
                          ) : errored ? (
                            <span style={{ color: 'var(--dc-error)' }}>{'\u2717'}</span>
                          ) : isCurrent ? (
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                border: '2px solid var(--dc-border)',
                                borderTop: '2px solid var(--dc-primary)',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                              }}
                            />
                          ) : (
                            <span style={{ color: 'var(--dc-text-muted)' }}>{'\u25CB'}</span>
                          )}
                        </span>
                        <span
                          style={{
                            color: saved
                              ? 'var(--dc-text)'
                              : errored
                                ? 'var(--dc-error)'
                                : isCurrent
                                  ? 'var(--dc-text)'
                                  : 'var(--dc-text-muted)',
                            fontWeight: isCurrent ? 500 : 400,
                          }}
                        >
                          {cube.title}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Planning joins */}
          {state.step === 'planning-joins' && (
            <SpinnerContent message="Analyzing relationships between cubes..." />
          )}

          {/* Select joins */}
          {state.step === 'select-joins' && state.joinProposals && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '8px 24px 8px' }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                  Review Proposed Joins
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--dc-text-muted)',
                    marginTop: 4,
                    display: 'flex',
                    gap: 12,
                  }}
                >
                  <button
                    onClick={() => {
                      const all = new Set<string>()
                      for (const p of state.joinProposals!) {
                        for (const jn of Object.keys(p.joins)) all.add(`${p.cubeName}.${jn}`)
                      }
                      setState(prev => ({ ...prev, selectedJoins: all }))
                    }}
                    style={linkBtn}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, selectedJoins: new Set() }))}
                    style={linkBtn}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
                {state.joinProposals.map(proposal => (
                  <div key={proposal.cubeName} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--dc-text)',
                        marginBottom: 4,
                      }}
                    >
                      {proposal.cubeName}
                    </div>
                    {Object.entries(proposal.joins).map(([joinName, joinDef]) => {
                      const key = `${proposal.cubeName}.${joinName}`
                      return (
                        <label
                          key={key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 0 4px 12px',
                            fontSize: 12,
                            color: 'var(--dc-text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={state.selectedJoins.has(key)}
                            onChange={() =>
                              setState(prev => {
                                const next = new Set(prev.selectedJoins)
                                next.has(key) ? next.delete(key) : next.add(key)
                                return { ...prev, selectedJoins: next }
                              })
                            }
                            style={{ accentColor: 'var(--dc-primary)' }}
                          />
                          <span>
                            {'\u2192'} {joinDef.targetCube}{' '}
                            <span style={{ color: 'var(--dc-text-muted)' }}>
                              ({joinDef.relationship})
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div
                style={{
                  padding: '12px 24px',
                  borderTop: '1px solid var(--dc-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <button
                  onClick={() => setState(prev => ({ ...prev, step: 'done', message: '' }))}
                  style={secondaryBtn}
                >
                  Skip
                </button>
                <button
                  onClick={applyJoins}
                  disabled={state.selectedJoins.size === 0}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: 'var(--dc-primary)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: state.selectedJoins.size === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: state.selectedJoins.size === 0 ? 0.5 : 1,
                  }}
                >
                  Apply Selected ({state.selectedJoins.size})
                </button>
              </div>
            </div>
          )}

          {/* Applying joins */}
          {state.step === 'applying-joins' && (
            <SpinnerContent message="Applying joins to cube definitions..." />
          )}

          {/* Done */}
          {state.step === 'done' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                padding: 24,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: 'var(--dc-success, #22c55e)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  color: '#fff',
                }}
              >
                {'\u2713'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--dc-text)' }}>
                Setup Complete
              </div>

              {/* Summary */}
              <div style={{ fontSize: 13, color: 'var(--dc-text-secondary)', maxWidth: 360 }}>
                {state.savedSchemaName && (
                  <div>
                    Schema saved: <strong>{state.savedSchemaName}</strong>
                  </div>
                )}
                {state.savedCubeFiles.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    Created {state.savedCubeFiles.length} cube
                    {state.savedCubeFiles.length !== 1 ? 's' : ''}
                  </div>
                )}
                {state.genErrors.length > 0 && (
                  <div style={{ marginTop: 4, color: 'var(--dc-error)' }}>
                    {state.genErrors.length} error{state.genErrors.length !== 1 ? 's' : ''} during
                    generation
                  </div>
                )}
                {state.message && <div style={{ marginTop: 8 }}>{state.message}</div>}
              </div>

              <button
                onClick={handleDone}
                style={{
                  padding: '10px 24px',
                  backgroundColor: 'var(--dc-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  marginTop: 8,
                }}
              >
                Open Editor
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  backgroundColor: 'transparent',
  color: 'var(--dc-text-secondary)',
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
}

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  marginTop: 8,
  border: '1px solid var(--dc-border)',
  borderRadius: 6,
  fontSize: 13,
  backgroundColor: 'var(--dc-background)',
  color: 'var(--dc-text)',
  outline: 'none',
  boxSizing: 'border-box',
}
