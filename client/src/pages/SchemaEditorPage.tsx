import Editor, { type OnMount } from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  GitHubSyncButtons,
  GitHubSyncModals,
  useGitHubSync,
} from '../components/GitHubSyncControls'
import { QuickSetupWizard } from '../components/QuickSetupWizard'
import { TableSelector } from '../components/TableSelector'
import { useConfirm } from '../hooks/useConfirm'
import { usePrompt } from '../hooks/usePrompt'
import { initMonaco } from '../monaco-setup'

interface SchemaFile {
  id: number
  name: string
  sourceCode: string
  connectionId: number
  compiledAt: string | null
  compilationErrors: any[] | null
  createdAt: string
  updatedAt: string
}

interface CubeDefinition {
  id: number
  name: string
  title: string | null
  description: string | null
  sourceCode: string | null
  schemaFileId: number | null
  connectionId: number
  compiledAt: string | null
  compilationErrors: any[] | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Dashboard {
  id: number
  name: string
  description: string | null
  connectionId: number | null
  config: unknown
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface Connection {
  id: number
  name: string
  engineType: string
  isActive: boolean
}

type FileItem =
  | { type: 'schema'; data: SchemaFile }
  | { type: 'cube'; data: CubeDefinition }
  | { type: 'dashboard'; data: Dashboard }

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

interface AiGenState {
  phase:
    | 'idle'
    | 'planning'
    | 'select-cubes'
    | 'generating'
    | 'plan-joins'
    | 'select-joins'
    | 'applying-joins'
    | 'done'
  message: string
  plannedCubes?: PlannedCube[]
  selectedCubes: Set<string>
  current?: number
  total?: number
  savedFiles: Array<{ name: string; id: number }>
  errors: Array<{ name: string; error: string }>
  joinProposals?: JoinProposal[]
  selectedJoins: Set<string>
}

const INITIAL_AI_STATE: AiGenState = {
  phase: 'idle',
  message: '',
  selectedCubes: new Set(),
  savedFiles: [],
  errors: [],
  selectedJoins: new Set(),
}

interface IntrospectState {
  phase: 'idle' | 'pulling' | 'review' | 'saving' | 'done'
  source?: string
  tables?: string[]
  selectedTables: Set<string>
  savedFile?: { id: number; name: string; sourceCode: string }
  error?: string
}

const INITIAL_INTROSPECT_STATE: IntrospectState = { phase: 'idle', selectedTables: new Set() }

function useAppTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    cb => {
      const observer = new MutationObserver(cb)
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      })
      return () => observer.disconnect()
    },
    () => (document.documentElement.getAttribute('data-theme') === 'drizby-dark' ? 'dark' : 'light')
  )
}

export default function SchemaEditorPage() {
  // Initialize Monaco on first render (lazy — not loaded until this page is visited)
  initMonaco()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const params = useParams<{ connectionId?: string; fileType?: string; fileName?: string }>()
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [compileOutput, setCompileOutput] = useState<{
    success?: boolean
    errors?: any[]
    cubes?: string[]
    exports?: string[]
  } | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null)
  const appTheme = useAppTheme()
  const monacoTheme = appTheme === 'dark' ? 'dc-dark' : 'dc-light'
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const handleSaveRef = useRef(() => {})
  const [confirm, ConfirmDialog] = useConfirm()
  const [prompt, PromptDialog] = usePrompt()
  const [showQuickSetup, setShowQuickSetup] = useState(false)

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json()),
  })

  const { data: schemaFiles = [] } = useQuery<SchemaFile[]>({
    queryKey: ['schema-files'],
    queryFn: () => fetch('/api/schema-files').then(r => r.json()),
  })

  const { data: cubeDefs = [] } = useQuery<CubeDefinition[]>({
    queryKey: ['cube-definitions'],
    queryFn: () => fetch('/api/cube-definitions').then(r => r.json()),
  })

  const { data: dashboards = [] } = useQuery<Dashboard[]>({
    queryKey: ['analytics-pages'],
    queryFn: async () => {
      const res = await fetch('/api/analytics-pages')
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: aiConfig } = useQuery<{ provider: string; hasApiKey: boolean }>({
    queryKey: ['settings', 'ai'],
    queryFn: async () => {
      const res = await fetch('/api/settings/ai', { credentials: 'include' })
      if (!res.ok) return { provider: '', hasApiKey: false }
      return res.json()
    },
  })
  const hasAI = !!(aiConfig?.provider && aiConfig?.hasApiKey)

  // GitHub sync
  const ghSync = useGitHubSync()

  // Initialize connection from URL or localStorage
  useEffect(() => {
    if (connections.length === 0 || selectedConnectionId !== null) return
    const connId = params.connectionId ? Number.parseInt(params.connectionId) : null
    const storedId = localStorage.getItem('dc-last-connection-id')
    const fallbackId = storedId ? Number.parseInt(storedId) : null
    const resolvedId =
      (connId && connections.some(c => c.id === connId) ? connId : null) ??
      (fallbackId && connections.some(c => c.id === fallbackId) ? fallbackId : null) ??
      connections[0].id
    setSelectedConnectionId(resolvedId)

    // If bare /schema-editor URL, try restoring last file for this connection
    if (!params.fileType && !params.fileName && resolvedId) {
      const raw = localStorage.getItem(`dc-schema-editor-conn-${resolvedId}`)
      if (raw) {
        try {
          const { fileType, fileName } = JSON.parse(raw)
          if (fileType && fileName) {
            navigate(`/schema-editor/${resolvedId}/${fileType}/${encodeURIComponent(fileName)}`, {
              replace: true,
            })
            return
          }
        } catch {}
      }
      navigate(`/schema-editor/${resolvedId}`, { replace: true })
    }
  }, [
    connections,
    selectedConnectionId,
    params.connectionId,
    params.fileType,
    params.fileName,
    navigate,
  ])

  // Initialize file selection from URL (waits for data to load)
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile intentionally excluded to avoid loop
  useEffect(() => {
    if (!params.fileType || !params.fileName || !selectedConnectionId || selectedFile) return
    const decodedName = decodeURIComponent(params.fileName)

    let file: FileItem | null = null
    if (params.fileType === 'schema') {
      const sf = schemaFiles.find(
        s => s.name === decodedName && s.connectionId === selectedConnectionId
      )
      if (sf) file = { type: 'schema', data: sf }
    } else if (params.fileType === 'cube') {
      const cd = cubeDefs.find(
        c => c.name === decodedName && c.connectionId === selectedConnectionId
      )
      if (cd) file = { type: 'cube', data: cd }
    }
    if (file) {
      setSelectedFile(file)
      setEditorContent(file.type === 'schema' ? file.data.sourceCode : file.data.sourceCode || '')
    }
  }, [schemaFiles, cubeDefs, selectedConnectionId, params.fileType, params.fileName])

  // Sync URL + localStorage when selection changes
  const updateUrl = useCallback(
    (connId: number | null, file: FileItem | null) => {
      if (!connId) return
      if (file) {
        const name = file.type === 'schema' ? file.data.name : file.data.name
        navigate(`/schema-editor/${connId}/${file.type}/${encodeURIComponent(name)}`, {
          replace: true,
        })
        const fileInfo = { fileType: file.type, fileName: name }
        localStorage.setItem(
          'dc-schema-editor-last',
          JSON.stringify({ connectionId: connId, ...fileInfo })
        )
        localStorage.setItem(`dc-schema-editor-conn-${connId}`, JSON.stringify(fileInfo))
      } else {
        navigate(`/schema-editor/${connId}`, { replace: true })
        localStorage.removeItem('dc-schema-editor-last')
      }
    },
    [navigate]
  )

  const filteredSchemas = schemaFiles.filter(s => s.connectionId === selectedConnectionId)
  const filteredCubes = cubeDefs.filter(c => c.connectionId === selectedConnectionId)
  const filteredDashboards = dashboards.filter(
    d => d.isActive && (d.connectionId === selectedConnectionId || !d.connectionId)
  )

  // Save schema file
  const saveSchema = useMutation({
    mutationFn: async (file: SchemaFile) => {
      const res = await fetch(`/api/schema-files/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, sourceCode: editorContent }),
      })
      return res.json()
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
      ghSync.invalidateSync()
    },
  })

  // Save cube definition
  const saveCube = useMutation({
    mutationFn: async (cube: CubeDefinition) => {
      const res = await fetch(`/api/cube-definitions/${cube.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cube, sourceCode: editorContent }),
      })
      return res.json()
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      ghSync.invalidateSync()
    },
  })

  // Save dashboard config
  const saveDashboard = useMutation({
    mutationFn: async (dashboard: Dashboard) => {
      let config: unknown
      try {
        config = JSON.parse(editorContent)
      } catch {
        throw new Error('Invalid JSON')
      }
      const res = await fetch(`/api/analytics-pages/${dashboard.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: dashboard.name, config }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save dashboard')
      }
      return res.json()
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['analytics-pages'] })
      ghSync.invalidateSync()
    },
  })

  // Compile schema file
  const compileSchema = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/schema-files/${id}/compile`, { method: 'POST' })
      return res.json()
    },
    onSuccess: data => {
      setCompileOutput(data)
      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      if (data.success) {
        setMarkers([])
        // Schema changes may affect cubes — invalidate cube meta cache
        queryClient.invalidateQueries({ queryKey: ['cube', 'meta'] })
      } else {
        setMarkersFromErrors(data.errors || [])
      }
    },
  })

  // Compile cube definition
  const compileCube = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/cube-definitions/${id}/compile`, { method: 'POST' })
      return res.json()
    },
    onSuccess: data => {
      setCompileOutput(data)
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      if (data.success) {
        setMarkers([])
        // Invalidate cube meta so Analysis Builder / dashboards pick up new cubes
        queryClient.invalidateQueries({ queryKey: ['cube', 'meta'] })
      } else {
        setMarkersFromErrors(data.errors || [])
      }
    },
  })

  // Create new schema file
  const createSchemaFile = async () => {
    const name = await prompt({
      title: 'New Schema File',
      message: 'Enter a name for the schema file',
      placeholder: 'orders.ts',
      submitText: 'Create',
    })
    if (!name) return
    const res = await fetch('/api/schema-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sanitizeFileName(name),
        sourceCode: `import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core'\n\nexport const myTable = pgTable('my_table', {\n  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),\n  name: text('name').notNull(),\n  createdAt: timestamp('created_at').defaultNow()\n})\n`,
        connectionId: selectedConnectionId,
      }),
    })
    const data = await res.json()
    queryClient.invalidateQueries({ queryKey: ['schema-files'] })
    queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
    const file: FileItem = { type: 'schema', data }
    setSelectedFile(file)
    setEditorContent(data.sourceCode)
    setIsDirty(false)
    updateUrl(selectedConnectionId, file)
  }

  // Create new cube definition
  const createCubeFile = async () => {
    const name = await prompt({
      title: 'New Cube Definition',
      message: 'Enter a name for the cube definition',
      placeholder: 'my-cube',
      submitText: 'Create',
    })
    if (!name) return
    const sanitizedName = sanitizeFileName(name)
    const res = await fetch('/api/cube-definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: sanitizedName,
        sourceCode: `import { eq } from 'drizzle-orm'\nimport { defineCube } from 'drizzle-cube/server'\nimport type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'\n// import { myTable } from './my-schema'\n\nexport const myCube = defineCube('MyCube', {\n  title: '${sanitizedName}',\n  description: '',\n\n  sql: (ctx: QueryContext): BaseQueryDefinition => ({\n    from: undefined as any, // replace with your table\n  }),\n\n  dimensions: {},\n  measures: {}\n}) as Cube\n`,
        connectionId: selectedConnectionId,
      }),
    })
    const data = await res.json()
    queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
    queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
    const file: FileItem = { type: 'cube', data }
    setSelectedFile(file)
    setEditorContent(data.sourceCode || '')
    setIsDirty(false)
    updateUrl(selectedConnectionId, file)
  }

  // ========== Introspect database (multi-step modal) ==========
  const [introState, setIntroState] = useState<IntrospectState>(INITIAL_INTROSPECT_STATE)

  const startIntrospect = useCallback(async () => {
    setIntroState({ phase: 'pulling', selectedTables: new Set() })
    try {
      const res = await fetch('/api/schema-files/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setIntroState({
          phase: 'idle',
          selectedTables: new Set(),
          error: data.error || 'Introspection failed',
        })
        setCompileOutput({
          success: false,
          errors: [{ message: data.error || 'Introspection failed' }],
        })
        return
      }
      setIntroState({
        phase: 'review',
        source: data.source,
        tables: data.tables,
        selectedTables: new Set(data.tables || []),
      })
    } catch (err: any) {
      setIntroState(INITIAL_INTROSPECT_STATE)
      setCompileOutput({
        success: false,
        errors: [{ message: `Introspection failed: ${err.message}` }],
      })
    }
  }, [selectedConnectionId])

  const saveIntrospectedSchema = useCallback(async () => {
    if (!introState.source) return
    const selected = introState.selectedTables
    const allTables = introState.tables || []
    const savedTables = allTables.filter(t => selected.has(t))
    setIntroState(prev => ({ ...prev, phase: 'saving' }))
    try {
      const res = await fetch('/api/schema-files/introspect/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          connectionId: selectedConnectionId,
          sourceCode: introState.source,
          // Only send selectedTables if user deselected some — backend uses LLM to filter
          selectedTables: selected.size < allTables.length ? savedTables : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Save failed')

      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      setIntroState({
        phase: 'done',
        savedFile: data.file,
        tables: savedTables,
        selectedTables: selected,
      })
    } catch (err: any) {
      setIntroState(prev => ({ ...prev, phase: 'review', error: err.message }))
    }
  }, [
    introState.source,
    introState.tables,
    introState.selectedTables,
    selectedConnectionId,
    queryClient,
  ])

  const closeIntrospectModal = useCallback(() => {
    if (introState.savedFile) {
      const file: FileItem = { type: 'schema', data: introState.savedFile as any }
      setSelectedFile(file)
      setEditorContent(introState.savedFile.sourceCode)
      setIsDirty(false)
      updateUrl(selectedConnectionId, file)
    }
    setIntroState(INITIAL_INTROSPECT_STATE)
  }, [introState.savedFile, selectedConnectionId, updateUrl])

  // ========== AI Cube Generation (multi-phase wizard) ==========
  const [aiGenState, setAiGenState] = useState<AiGenState>(INITIAL_AI_STATE)

  const planCubes = useCallback(async () => {
    setAiGenState({
      ...INITIAL_AI_STATE,
      phase: 'planning',
      message: 'Analyzing schemas and identifying cubes...',
    })

    try {
      const res = await fetch('/api/schema-files/plan-cubes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Planning failed')

      if (!data.cubes || data.cubes.length === 0) {
        setAiGenState(prev => ({
          ...prev,
          phase: 'done',
          message: 'All tables already have cubes. No new cubes to generate.',
        }))
        return
      }

      setAiGenState(prev => ({
        ...prev,
        phase: 'select-cubes',
        message: '',
        plannedCubes: data.cubes,
        selectedCubes: new Set(data.cubes.map((c: PlannedCube) => c.variableName)),
      }))
    } catch (err: any) {
      setAiGenState(prev => ({ ...prev, phase: 'idle' }))
      setCompileOutput({
        success: false,
        errors: [{ message: `AI planning failed: ${err.message}` }],
      })
    }
  }, [selectedConnectionId])

  const generateSelectedCubes = useCallback(async () => {
    const cubes = (aiGenState.plannedCubes || []).filter(c =>
      aiGenState.selectedCubes.has(c.variableName)
    )
    if (cubes.length === 0) return

    setAiGenState(prev => ({
      ...prev,
      phase: 'generating',
      message: `Generating ${cubes[0].title}...`,
      current: 0,
      total: cubes.length,
      savedFiles: [],
      errors: [],
    }))

    try {
      const res = await fetch('/api/schema-files/generate-selected-cubes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId, selectedCubes: cubes }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
                setAiGenState(prev => ({
                  ...prev,
                  message: data.message,
                  current: data.current,
                  total: data.total,
                }))
                break
              case 'cube_saved':
                queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
                setAiGenState(prev => ({
                  ...prev,
                  savedFiles: [...prev.savedFiles, { name: data.fileName, id: data.fileId }],
                }))
                break
              case 'cube_error':
                setAiGenState(prev => ({
                  ...prev,
                  errors: [...prev.errors, { name: data.name, error: data.error }],
                }))
                break
              case 'complete':
                // Auto-trigger join planning
                break
              case 'error':
                throw new Error(data.message)
            }
          }
        }
      }

      // Transition to join planning
      setAiGenState(prev => ({
        ...prev,
        phase: 'plan-joins',
        message: 'Analyzing relationships between cubes...',
      }))

      // Plan joins
      const joinRes = await fetch('/api/schema-files/plan-joins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      })
      const joinData = await joinRes.json()

      if (!joinRes.ok) {
        // Join planning failed, skip to done
        setAiGenState(prev => ({ ...prev, phase: 'done', message: '' }))
        return
      }

      if (!joinData.proposals || joinData.proposals.length === 0) {
        // No joins needed, skip to done
        setAiGenState(prev => ({ ...prev, phase: 'done', message: '' }))
        return
      }

      // Show join selection
      const allJoinKeys = new Set<string>()
      for (const p of joinData.proposals) {
        for (const joinName of Object.keys(p.joins)) {
          allJoinKeys.add(`${p.cubeName}.${joinName}`)
        }
      }

      setAiGenState(prev => ({
        ...prev,
        phase: 'select-joins',
        message: '',
        joinProposals: joinData.proposals,
        selectedJoins: allJoinKeys,
      }))
    } catch (err: any) {
      setAiGenState(prev => ({
        ...prev,
        phase: prev.savedFiles.length > 0 ? 'done' : 'idle',
        message: '',
      }))
      if (aiGenState.savedFiles.length === 0) {
        setCompileOutput({
          success: false,
          errors: [{ message: `AI generation failed: ${err.message}` }],
        })
      }
    }
  }, [
    aiGenState.plannedCubes,
    aiGenState.selectedCubes,
    aiGenState.savedFiles.length,
    selectedConnectionId,
    queryClient,
  ])

  const applySelectedJoins = useCallback(async () => {
    const proposals = aiGenState.joinProposals || []
    // Filter proposals to only include selected joins
    const filtered = proposals
      .map(p => {
        const selectedJoinEntries = Object.entries(p.joins).filter(([joinName]) =>
          aiGenState.selectedJoins.has(`${p.cubeName}.${joinName}`)
        )
        if (selectedJoinEntries.length === 0) return null
        return {
          cubeDefId: p.cubeDefId,
          cubeName: p.cubeName,
          joins: Object.fromEntries(selectedJoinEntries),
        }
      })
      .filter(Boolean)

    if (filtered.length === 0) {
      setAiGenState(prev => ({ ...prev, phase: 'done', message: '' }))
      return
    }

    setAiGenState(prev => ({ ...prev, phase: 'applying-joins', message: 'Applying joins...' }))

    try {
      const res = await fetch('/api/schema-files/apply-joins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId, selectedJoins: filtered }),
      })
      if (!res.ok) throw new Error('Failed to apply joins')
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })

      // Recompile affected cubes so joins are registered in the semantic layer
      setAiGenState(prev => ({ ...prev, message: 'Compiling cubes with joins...' }))
      const cubeIds = filtered.map((f: any) => f.cubeDefId as number)
      for (const id of cubeIds) {
        await fetch(`/api/cube-definitions/${id}/compile`, {
          method: 'POST',
          credentials: 'include',
        })
      }
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
      queryClient.invalidateQueries({ queryKey: ['cube', 'meta'] })
      setAiGenState(prev => ({ ...prev, phase: 'done', message: '' }))
    } catch {
      setAiGenState(prev => ({ ...prev, phase: 'done', message: '' }))
    }
  }, [aiGenState.joinProposals, aiGenState.selectedJoins, selectedConnectionId, queryClient])

  const closeAiWizard = useCallback(() => {
    // Select last created file if any
    if (aiGenState.savedFiles.length > 0) {
      const last = aiGenState.savedFiles[aiGenState.savedFiles.length - 1]
      const cubeFile = cubeDefs.find(c => c.id === last.id)
      if (cubeFile) {
        const file: FileItem = { type: 'cube', data: cubeFile }
        setSelectedFile(file)
        setEditorContent(cubeFile.sourceCode || '')
        setIsDirty(false)
        updateUrl(selectedConnectionId, file)
      }
    }
    setAiGenState(INITIAL_AI_STATE)
  }, [aiGenState.savedFiles, cubeDefs, selectedConnectionId, updateUrl])

  const setMarkers = useCallback((markers: any[]) => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, 'compiler', markers)
      }
    }
  }, [])

  const setMarkersFromErrors = useCallback(
    (errors: any[]) => {
      const markers = errors.map((e: any) => ({
        severity: 8, // MarkerSeverity.Error
        message: e.message,
        startLineNumber: e.line || 1,
        startColumn: e.column || 1,
        endLineNumber: e.line || 1,
        endColumn: e.column ? e.column + 20 : 100,
      }))
      setMarkers(markers)
    },
    [setMarkers]
  )

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Define custom dark theme matching Drizby's blue-slate palette
    monaco.editor.defineTheme('dc-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: '93c5fd' },
        { token: 'string', foreground: '86efac' },
        { token: 'number', foreground: 'fbbf24' },
        { token: 'type', foreground: '7dd3fc' },
        { token: 'identifier', foreground: 'e2e8f0' },
        { token: 'delimiter', foreground: '94a3b8' },
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#1e293b',
        'editor.selectionBackground': '#334155',
        'editor.inactiveSelectionBackground': '#1e293b',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#94a3b8',
        'editorCursor.foreground': '#60a5fa',
        'editorIndentGuide.background': '#1e293b',
        'editorIndentGuide.activeBackground': '#334155',
        'editorWidget.background': '#1e293b',
        'editorWidget.border': '#334155',
        'editorSuggestWidget.background': '#1e293b',
        'editorSuggestWidget.border': '#334155',
        'editorSuggestWidget.selectedBackground': '#334155',
        'editorHoverWidget.background': '#1e293b',
        'editorHoverWidget.border': '#334155',
        'editor.findMatchBackground': '#60a5fa33',
        'editor.findMatchHighlightBackground': '#60a5fa22',
        'minimap.background': '#0f172a',
        'scrollbarSlider.background': '#33415580',
        'scrollbarSlider.hoverBackground': '#47556980',
        'scrollbarSlider.activeBackground': '#64748b80',
      },
    })

    // Define custom light theme
    monaco.editor.defineTheme('dc-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '2563eb' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'd97706' },
        { token: 'type', foreground: '0284c7' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#1e293b',
        'editor.lineHighlightBackground': '#f8fafc',
        'editor.selectionBackground': '#dbeafe',
        'editorLineNumber.foreground': '#94a3b8',
        'editorLineNumber.activeForeground': '#475569',
        'editorCursor.foreground': '#3b82f6',
        'editorWidget.background': '#ffffff',
        'editorWidget.border': '#e2e8f0',
        'editorSuggestWidget.background': '#ffffff',
        'editorSuggestWidget.border': '#e2e8f0',
        'editorSuggestWidget.selectedBackground': '#eff6ff',
      },
    })

    // Apply the right theme immediately
    monaco.editor.setTheme(appTheme === 'dark' ? 'dc-dark' : 'dc-light')

    // Cmd/Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveRef.current()
    })

    // Configure TypeScript defaults
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      strict: false,
      esModuleInterop: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
    })

    // Load type definitions for drizzle-orm and drizzle-cube
    loadExtraLibs(monaco)
  }

  // Update Monaco theme when app theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(appTheme === 'dark' ? 'dc-dark' : 'dc-light')
    }
  }, [appTheme])

  // Re-register schema background models when schemaFiles data loads/changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedFile intentionally excluded to avoid re-render loop
  useEffect(() => {
    if (monacoRef.current && schemaFiles.length > 0) {
      updateSchemaModels(monacoRef.current, selectedFile)
    }
  }, [schemaFiles])

  const loadExtraLibs = async (monaco: any) => {
    // Load real .d.ts files from node_modules via the server
    const [drizzleOrmTypes, drizzleCubeTypes, drizzleDatabendTypes, drizzleSnowflakeTypes] =
      await Promise.all([
        fetch('/api/editor/types/drizzle-orm')
          .then(r => r.json())
          .catch(() => ({})),
        fetch('/api/editor/types/drizzle-cube')
          .then(r => r.json())
          .catch(() => ({})),
        fetch('/api/editor/types/drizzle-databend')
          .then(r => r.json())
          .catch(() => ({})),
        fetch('/api/editor/types/drizzle-snowflake')
          .then(r => r.json())
          .catch(() => ({})),
      ])

    const ts = monaco.languages.typescript.typescriptDefaults
    for (const [path, content] of Object.entries(drizzleOrmTypes) as [string, string][]) {
      ts.addExtraLib(content, `file:///node_modules/${path}`)
    }
    for (const [path, content] of Object.entries(drizzleCubeTypes) as [string, string][]) {
      ts.addExtraLib(content, `file:///node_modules/${path}`)
    }
    for (const [path, content] of Object.entries(drizzleDatabendTypes) as [string, string][]) {
      ts.addExtraLib(content, `file:///node_modules/${path}`)
    }
    for (const [path, content] of Object.entries(drizzleSnowflakeTypes) as [string, string][]) {
      ts.addExtraLib(content, `file:///node_modules/${path}`)
    }

    // Register schema files as background models for relative import resolution in cube files.
    // Uses real source code so TS infers proper pgTable column types for autocomplete.
    updateSchemaModels(monaco, selectedFile)
  }

  const updateSchemaModels = (monaco: any, currentFile?: FileItem | null) => {
    const currentSchemaName =
      currentFile?.type === 'schema' ? currentFile.data.name.replace(/\.ts$/, '') : null

    for (const sf of schemaFiles) {
      const name = sf.name.replace(/\.ts$/, '')
      const uri = monaco.Uri.parse(`file:///src/${name}.ts`)

      // Skip the file currently open in the editor — the Editor component owns that model.
      if (name === currentSchemaName) continue

      const existing = monaco.editor.getModel(uri)
      if (existing) {
        // Update content if source changed (e.g. after save/compile)
        if (existing.getValue() !== sf.sourceCode) {
          existing.setValue(sf.sourceCode)
        }
      } else {
        monaco.editor.createModel(sf.sourceCode, 'typescript', uri)
      }
    }
  }

  const handleSelectFile = async (file: FileItem) => {
    if (
      isDirty &&
      !(await confirm({
        title: 'Unsaved changes',
        message: 'You have unsaved changes. Discard them?',
        confirmText: 'Discard',
        variant: 'danger',
      }))
    )
      return
    setSelectedFile(file)
    const code =
      file.type === 'dashboard'
        ? JSON.stringify(file.data.config, null, 2)
        : file.type === 'schema'
          ? file.data.sourceCode
          : file.data.sourceCode || ''
    setEditorContent(code)
    setIsDirty(false)
    setCompileOutput(null)
    setMarkers([])
    updateUrl(selectedConnectionId, file)
    setFileBrowserOpen(false)

    // Refresh background schema models: recreate for the file we just left, skip the newly opened one
    if (monacoRef.current) {
      updateSchemaModels(monacoRef.current, file)
    }
  }

  const handleSave = () => {
    if (!selectedFile) return
    if (selectedFile.type === 'schema') saveSchema.mutate(selectedFile.data)
    else if (selectedFile.type === 'cube') saveCube.mutate(selectedFile.data)
    else if (selectedFile.type === 'dashboard') saveDashboard.mutate(selectedFile.data)
  }
  handleSaveRef.current = handleSave

  const handleCompile = () => {
    if (!selectedFile) return
    // Save first, then compile
    const doCompile = () => {
      if (selectedFile.type === 'schema') compileSchema.mutate(selectedFile.data.id)
      else compileCube.mutate(selectedFile.data.id)
    }
    if (selectedFile.type === 'dashboard') return
    if (isDirty) {
      if (selectedFile.type === 'schema') {
        saveSchema.mutate(selectedFile.data, { onSuccess: doCompile })
      } else if (selectedFile.type === 'cube') {
        saveCube.mutate(selectedFile.data, { onSuccess: doCompile })
      }
    } else {
      doCompile()
    }
  }

  const renameFile = async (type: 'schema' | 'cube', id: number, newName: string) => {
    const endpoint = type === 'schema' ? `/api/schema-files/${id}` : `/api/cube-definitions/${id}`
    const res = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      ghSync.invalidateSync()
    }
  }

  const handleDelete = async () => {
    if (!selectedFile) return
    const name = selectedFile.type === 'schema' ? selectedFile.data.name : selectedFile.data.name
    if (
      !(await confirm({
        title: 'Delete file',
        message: `Delete "${name}"? This cannot be undone.`,
        confirmText: 'Delete',
        variant: 'danger',
      }))
    )
      return

    const endpoint =
      selectedFile.type === 'schema'
        ? `/api/schema-files/${selectedFile.data.id}`
        : `/api/cube-definitions/${selectedFile.data.id}`

    await fetch(endpoint, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['schema-files'] })
    queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
    queryClient.invalidateQueries({ queryKey: ['cube', 'meta'] })
    queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })

    // Clean up background model for deleted schema file
    if (selectedFile.type === 'schema' && monacoRef.current) {
      const name = selectedFile.data.name.replace(/\.ts$/, '')
      const uri = monacoRef.current.Uri.parse(`file:///src/${name}.ts`)
      const model = monacoRef.current.editor.getModel(uri)
      if (model) model.dispose()
    }

    setSelectedFile(null)
    setEditorContent('')
    setCompileOutput(null)
    updateUrl(selectedConnectionId, null)
  }

  const isCompiling = compileSchema.isPending || compileCube.isPending
  const isSaving = saveSchema.isPending || saveCube.isPending
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false)
  const aiActive = aiGenState.phase !== 'idle'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 0',
          borderBottom: '1px solid var(--dc-border)',
          marginBottom: 0,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Mobile file browser toggle */}
        <button
          onClick={() => setFileBrowserOpen(o => !o)}
          className="md:hidden bg-transparent border-none cursor-pointer p-1 flex items-center"
          style={{ color: 'var(--dc-text-muted)' }}
          title="Toggle file browser"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        </button>
        <h1 className="text-xl sm:text-2xl font-semibold text-dc-text" style={{ margin: 0 }}>
          Semantic Layer
        </h1>

        {/* Connection selector + settings cog */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <select
            value={selectedConnectionId || ''}
            onChange={e => {
              const id = Number.parseInt(e.target.value)
              setSelectedConnectionId(id)
              localStorage.setItem('dc-last-connection-id', String(id))
              setSelectedFile(null)
              setEditorContent('')
              updateUrl(id, null)
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--dc-border)',
              backgroundColor: 'var(--dc-surface)',
              color: 'var(--dc-text)',
              fontSize: 13,
            }}
          >
            {connections.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => navigate('/settings/connections')}
            title="Connection settings"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--dc-text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              width={16}
              height={16}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
          <button
            onClick={() => setShowQuickSetup(true)}
            title="Setup Connection & Semantic Layer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--dc-primary)',
              backgroundColor: 'var(--dc-primary)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            Setup
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
          </button>
          {!hasAI && (
            <a
              href="/settings/ai"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--dc-text-muted)',
                textDecoration: 'none',
                marginLeft: 8,
              }}
              title="Configure an AI provider to auto-generate schemas and cubes from your database"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--dc-primary)">
                <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              <span>
                <span style={{ color: 'var(--dc-primary)' }}>Add an AI key</span> to auto-generate
                schemas &amp; cubes
              </span>
            </a>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <GitHubSyncButtons
          syncStatus={ghSync.syncStatus}
          pushing={ghSync.pushing}
          onPush={ghSync.handlePush}
          onOpenTags={() => ghSync.setShowTagsModal(true)}
          toolbarBtn={toolbarBtn}
        />
        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          style={toolbarBtn(!isDirty || isSaving)}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {selectedFile?.type !== 'dashboard' && (
          <button
            onClick={handleCompile}
            disabled={!selectedFile || isCompiling}
            style={toolbarBtn(!selectedFile || isCompiling, true)}
          >
            {isCompiling ? 'Compiling...' : 'Compile'}
          </button>
        )}
        {selectedFile?.type !== 'dashboard' && (
          <button
            onClick={handleDelete}
            disabled={!selectedFile}
            style={{ ...toolbarBtn(!selectedFile), color: selectedFile ? '#ef4444' : undefined }}
          >
            Delete
          </button>
        )}
      </div>
      <GitHubSyncModals
        syncStatus={ghSync.syncStatus}
        pushLogs={ghSync.pushLogs}
        pushing={ghSync.pushing}
        showTagsModal={ghSync.showTagsModal}
        onClosePushLogs={() => ghSync.setPushLogs([])}
        onCloseTagsModal={() => ghSync.setShowTagsModal(false)}
        onRestored={() => {
          queryClient.invalidateQueries({ queryKey: ['schema-files'] })
          queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
          ghSync.invalidateSync()
        }}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        {/* Mobile file browser backdrop */}
        {fileBrowserOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-10 md:hidden"
            onClick={() => setFileBrowserOpen(false)}
          />
        )}
        {/* Left sidebar — file tree */}
        <div
          className={`${fileBrowserOpen ? 'fixed left-0 top-12 bottom-0 w-[260px] z-20 shadow-lg' : 'hidden'} md:relative md:block md:w-[220px] md:shadow-none`}
          style={{
            flexShrink: 0,
            borderRight: '1px solid var(--dc-border)',
            overflow: 'auto',
            padding: '8px 0',
            backgroundColor: 'var(--dc-surface)',
          }}
        >
          {/* Schema files */}
          <div
            style={{
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--dc-text-secondary)',
                letterSpacing: 0.5,
              }}
            >
              Schemas
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => startIntrospect()}
                disabled={introState.phase === 'pulling'}
                title="Pull schema from database"
                style={sidebarActionBtn(introState.phase === 'pulling')}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                  <path d="M16 16h5v5" />
                </svg>
                {introState.phase === 'pulling' ? 'Pulling...' : 'Pull from DB'}
              </button>
              <button
                onClick={() => createSchemaFile()}
                title="New schema file"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: 'var(--dc-text-secondary)',
                  padding: '0 2px',
                }}
              >
                +
              </button>
            </div>
          </div>
          {filteredSchemas.map(sf => (
            <FileTreeItem
              key={`s-${sf.id}`}
              label={sf.name}
              isSelected={selectedFile?.type === 'schema' && selectedFile.data.id === sf.id}
              hasErrors={!!sf.compilationErrors?.length}
              isCompiled={!!sf.compiledAt}
              onClick={() => handleSelectFile({ type: 'schema', data: sf })}
              onRename={newName => renameFile('schema', sf.id, newName)}
            />
          ))}

          {/* Cube definitions */}
          <div
            style={{
              padding: '12px 12px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--dc-text-secondary)',
                letterSpacing: 0.5,
              }}
            >
              Cubes
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {hasAI && (
                <button
                  onClick={planCubes}
                  title="Generate cubes with AI"
                  disabled={aiActive || filteredSchemas.length === 0}
                  style={sidebarActionBtn(aiActive || filteredSchemas.length === 0)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                  </svg>
                  Generate
                </button>
              )}
              <button
                onClick={() => createCubeFile()}
                title="New cube definition"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: 'var(--dc-text-secondary)',
                  padding: '0 2px',
                }}
              >
                +
              </button>
            </div>
          </div>
          {filteredCubes.map(cd => (
            <FileTreeItem
              key={`c-${cd.id}`}
              label={cd.name}
              isSelected={selectedFile?.type === 'cube' && selectedFile.data.id === cd.id}
              hasErrors={!!cd.compilationErrors?.length}
              isCompiled={!!cd.compiledAt}
              onClick={() => handleSelectFile({ type: 'cube', data: cd })}
              onRename={newName => renameFile('cube', cd.id, newName)}
            />
          ))}

          {/* Dashboards */}
          {filteredDashboards.length > 0 && (
            <>
              <div
                style={{
                  padding: '12px 12px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: 'var(--dc-text-secondary)',
                    letterSpacing: 0.5,
                  }}
                >
                  Dashboards
                </span>
              </div>
              {filteredDashboards.map(d => (
                <FileTreeItem
                  key={`d-${d.id}`}
                  label={sanitizeFileName(d.name).replace(/\.ts$/, '.json')}
                  isSelected={selectedFile?.type === 'dashboard' && selectedFile.data.id === d.id}
                  hasErrors={false}
                  isCompiled
                  onClick={() => handleSelectFile({ type: 'dashboard', data: d })}
                />
              ))}
            </>
          )}

          {filteredSchemas.length === 0 && filteredCubes.length === 0 && (
            <div
              style={{
                padding: '16px 12px',
                fontSize: 12,
                color: 'var(--dc-text-secondary)',
                textAlign: 'center',
              }}
            >
              No files yet. Create a schema file or introspect a database to get started.
            </div>
          )}
        </div>

        {/* Main editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedFile ? (
            <>
              {/* Editor tab */}
              <div
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--dc-surface)',
                  borderBottom: '1px solid var(--dc-border)',
                  fontSize: 13,
                  color: 'var(--dc-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontWeight: 500 }}>
                  {selectedFile.type === 'schema' ? selectedFile.data.name : selectedFile.data.name}
                </span>
                {isDirty && <span style={{ color: 'var(--dc-text-secondary)' }}>(modified)</span>}
                {selectedFile.type === 'schema' && selectedFile.data.compiledAt && !isDirty && (
                  <span style={{ fontSize: 11, color: '#22c55e' }}>compiled</span>
                )}
                {selectedFile.type === 'cube' && selectedFile.data.compiledAt && !isDirty && (
                  <span style={{ fontSize: 11, color: '#22c55e' }}>compiled</span>
                )}
              </div>

              {/* Monaco Editor */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  language={selectedFile.type === 'dashboard' ? 'json' : 'typescript'}
                  theme={monacoTheme}
                  path={
                    selectedFile.type === 'dashboard'
                      ? `file:///dashboards/${selectedFile.data.id}.json`
                      : `file:///src/${selectedFile.type === 'schema' ? selectedFile.data.name : `${selectedFile.data.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.ts`}`
                  }
                  value={editorContent}
                  onChange={value => {
                    const v = value || ''
                    setEditorContent(v)
                    // Compare against saved source to avoid false dirty state from programmatic changes
                    if (selectedFile) {
                      const saved =
                        selectedFile.type === 'dashboard'
                          ? JSON.stringify(selectedFile.data.config, null, 2)
                          : selectedFile.type === 'schema'
                            ? selectedFile.data.sourceCode
                            : selectedFile.data.sourceCode || ''
                      setIsDirty(v !== saved)
                    } else {
                      setIsDirty(true)
                    }
                  }}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                    automaticLayout: true,
                  }}
                />
              </div>

              {/* Bottom panel — compilation output */}
              {compileOutput && (
                <div
                  style={{
                    borderTop: '1px solid var(--dc-border)',
                    padding: '8px 12px',
                    maxHeight: 150,
                    overflow: 'auto',
                    backgroundColor: compileOutput.success
                      ? appTheme === 'dark'
                        ? '#0a2e0a'
                        : '#f0fdf4'
                      : appTheme === 'dark'
                        ? '#2e0a0a'
                        : '#fef2f2',
                    fontSize: 12,
                    fontFamily: 'monospace',
                  }}
                >
                  {compileOutput.success ? (
                    <div style={{ color: appTheme === 'dark' ? '#22c55e' : '#16a34a' }}>
                      Compilation successful.
                      {compileOutput.cubes && compileOutput.cubes.length > 0 && (
                        <span> Registered cubes: {compileOutput.cubes.join(', ')}</span>
                      )}
                      {compileOutput.exports && compileOutput.exports.length > 0 && (
                        <span> Exports: {compileOutput.exports.join(', ')}</span>
                      )}
                    </div>
                  ) : (
                    <div>
                      {(compileOutput.errors || []).map((e: any) => (
                        <div key={e.message} style={{ color: '#ef4444', marginBottom: 4 }}>
                          {e.line && <span style={{ color: '#fbbf24' }}>Line {e.line}: </span>}
                          {e.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--dc-text-secondary)',
                fontSize: 14,
              }}
            >
              {filteredSchemas.length === 0 && selectedConnectionId ? (
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: 'var(--dc-text)',
                      marginBottom: 8,
                    }}
                  >
                    No schemas for this connection
                  </div>
                  <p style={{ marginBottom: 16, lineHeight: 1.5 }}>
                    Pull your database schema to generate Drizzle table definitions automatically.
                  </p>
                  <button
                    onClick={() => startIntrospect()}
                    disabled={introState.phase === 'pulling'}
                    style={{
                      ...toolbarBtn(introState.phase === 'pulling', true),
                      padding: '10px 24px',
                      fontSize: 14,
                    }}
                  >
                    {introState.phase === 'pulling'
                      ? 'Pulling schema...'
                      : 'Pull Schema from Database'}
                  </button>
                  {hasAI && (
                    <div style={{ marginTop: 12 }}>
                      <button
                        onClick={() => setShowQuickSetup(true)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--dc-primary)',
                          color: 'var(--dc-primary)',
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          padding: '6px 16px',
                          borderRadius: 6,
                        }}
                      >
                        {'\ud83e\ude84'} Quick Setup &mdash; Pull &amp; Generate
                      </button>
                    </div>
                  )}
                  <div style={{ marginTop: 12, fontSize: 12 }}>
                    or{' '}
                    <button
                      onClick={() => createSchemaFile()}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--dc-primary)',
                        cursor: 'pointer',
                        fontSize: 12,
                        textDecoration: 'underline',
                      }}
                    >
                      create a blank schema file
                    </button>
                  </div>
                </div>
              ) : (
                'Select a file from the sidebar to edit, or create a new one.'
              )}
            </div>
          )}
        </div>
      </div>
      {aiActive && (
        <AiWizardModal
          state={aiGenState}
          onUpdateState={setAiGenState}
          onGenerate={generateSelectedCubes}
          onApplyJoins={applySelectedJoins}
          onClose={closeAiWizard}
          onCancel={() => setAiGenState(INITIAL_AI_STATE)}
        />
      )}

      {introState.phase !== 'idle' && (
        <IntrospectModal
          state={introState}
          hasAI={hasAI}
          onUpdateState={setIntroState}
          onSave={saveIntrospectedSchema}
          onClose={closeIntrospectModal}
          onCancel={() => setIntroState(INITIAL_INTROSPECT_STATE)}
        />
      )}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      <ConfirmDialog />
      <PromptDialog />
      <QuickSetupWizard
        isOpen={showQuickSetup}
        connectionId={selectedConnectionId ?? undefined}
        onClose={() => setShowQuickSetup(false)}
        onComplete={connId => {
          setShowQuickSetup(false)
          // Reset editor state so no "unsaved changes" prompt
          setSelectedFile(null)
          setEditorContent('')
          setIsDirty(false)
          setCompileOutput(null)
          queryClient.invalidateQueries({ queryKey: ['schema-files'] })
          queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
          queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
          if (connId !== selectedConnectionId) {
            setSelectedConnectionId(connId)
            localStorage.setItem('dc-last-connection-id', String(connId))
          }
          // Navigate to the editor without a file selected — user picks from sidebar
          navigate(`/schema-editor/${connId}`, { replace: true })
        }}
      />
    </div>
  )
}

// ========== AI Wizard Modal Component ==========

const STEPS = [
  { key: 'plan', label: 'Plan' },
  { key: 'select', label: 'Select' },
  { key: 'generate', label: 'Generate' },
  { key: 'joins', label: 'Joins' },
  { key: 'done', label: 'Done' },
] as const

function getStepIndex(phase: AiGenState['phase']): number {
  switch (phase) {
    case 'planning':
      return 0
    case 'select-cubes':
      return 1
    case 'generating':
      return 2
    case 'plan-joins':
    case 'select-joins':
    case 'applying-joins':
      return 3
    case 'done':
      return 4
    default:
      return -1
  }
}

function AiWizardModal({
  state,
  onUpdateState,
  onGenerate,
  onApplyJoins,
  onClose,
  onCancel,
}: {
  state: AiGenState
  onUpdateState: (fn: (prev: AiGenState) => AiGenState) => void
  onGenerate: () => void
  onApplyJoins: () => void
  onClose: () => void
  onCancel: () => void
}) {
  const currentStep = getStepIndex(state.phase)
  const selectedCount = state.selectedCubes.size
  const selectedJoinCount = state.selectedJoins.size

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
            width: 160,
            flexShrink: 0,
            borderRight: '1px solid var(--dc-border)',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {STEPS.map((step, i) => (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: i === currentStep ? 600 : 400,
                color:
                  i < currentStep
                    ? 'var(--dc-success, #22c55e)'
                    : i === currentStep
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
                    i < currentStep
                      ? 'var(--dc-success, #22c55e)'
                      : i === currentStep
                        ? 'var(--dc-primary)'
                        : 'var(--dc-surface-tertiary, var(--dc-border))',
                  color: i <= currentStep ? '#fff' : 'var(--dc-text-muted)',
                }}
              >
                {i < currentStep ? '\u2713' : i + 1}
              </span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        {/* Right panel — step content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Planning phase */}
          {state.phase === 'planning' && (
            <SpinnerContent message="Analyzing schemas and identifying cubes..." />
          )}

          {/* Select cubes phase */}
          {state.phase === 'select-cubes' && state.plannedCubes && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '20px 24px 12px' }}>
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
                      onUpdateState(prev => ({
                        ...prev,
                        selectedCubes: new Set(prev.plannedCubes!.map(c => c.variableName)),
                      }))
                    }
                    style={linkBtn}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => onUpdateState(prev => ({ ...prev, selectedCubes: new Set() }))}
                    style={linkBtn}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
                {state.plannedCubes.map(cube => (
                  <label
                    key={cube.variableName}
                    style={{
                      display: 'flex',
                      gap: 10,
                      padding: '8px 0',
                      borderBottom: '1px solid var(--dc-border)',
                      cursor: 'pointer',
                      alignItems: 'flex-start',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={state.selectedCubes.has(cube.variableName)}
                      onChange={() => {
                        onUpdateState(prev => {
                          const next = new Set(prev.selectedCubes)
                          if (next.has(cube.variableName)) next.delete(cube.variableName)
                          else next.add(cube.variableName)
                          return { ...prev, selectedCubes: next }
                        })
                      }}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--dc-text)' }}>
                        {cube.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--dc-text-muted)' }}>
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
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <button onClick={onCancel} style={toolbarBtn(false)}>
                  Cancel
                </button>
                <button
                  onClick={onGenerate}
                  disabled={selectedCount === 0}
                  style={toolbarBtn(selectedCount === 0, true)}
                >
                  Generate Selected ({selectedCount})
                </button>
              </div>
            </div>
          )}

          {/* Generating phase */}
          {state.phase === 'generating' && (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                Generating Cube Definitions
              </div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-muted)' }}>{state.message}</div>
              {state.total && (
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: 'var(--dc-surface-tertiary, var(--dc-border))',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 2,
                      backgroundColor: 'var(--dc-primary)',
                      width: `${((state.current || 0) / state.total) * 100}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
              <div style={{ fontSize: 12 }}>
                {(state.plannedCubes || [])
                  .filter(c => state.selectedCubes.has(c.variableName))
                  .map((cube, i) => {
                    const saved = state.savedFiles.some(
                      f => f.name === cube.variableName || f.name.startsWith(cube.variableName)
                    )
                    const failed = state.errors.some(e => e.name === cube.name)
                    const isCurrent = !saved && !failed && i === (state.current || 1) - 1
                    return (
                      <div
                        key={cube.variableName}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 0',
                          color: saved
                            ? 'var(--dc-success, #22c55e)'
                            : failed
                              ? '#ef4444'
                              : isCurrent
                                ? 'var(--dc-text)'
                                : 'var(--dc-text-muted)',
                        }}
                      >
                        <span style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>
                          {saved ? '\u2713' : failed ? '\u2717' : isCurrent ? '\u25CF' : '\u25CB'}
                        </span>
                        <span>{cube.title}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Plan joins phase */}
          {state.phase === 'plan-joins' && (
            <SpinnerContent message="Analyzing relationships between cubes..." />
          )}

          {/* Select joins phase */}
          {state.phase === 'select-joins' && state.joinProposals && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '20px 24px 12px' }}>
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
                        for (const name of Object.keys(p.joins)) all.add(`${p.cubeName}.${name}`)
                      }
                      onUpdateState(prev => ({ ...prev, selectedJoins: all }))
                    }}
                    style={linkBtn}
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => onUpdateState(prev => ({ ...prev, selectedJoins: new Set() }))}
                    style={linkBtn}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
                {state.joinProposals.map(proposal => (
                  <div key={proposal.cubeDefId} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--dc-text)',
                        padding: '6px 0',
                      }}
                    >
                      {proposal.cubeName}
                    </div>
                    {Object.entries(proposal.joins).map(([joinName, join]) => {
                      const key = `${proposal.cubeName}.${joinName}`
                      return (
                        <label
                          key={key}
                          style={{
                            display: 'flex',
                            gap: 10,
                            padding: '4px 0 4px 12px',
                            cursor: 'pointer',
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={state.selectedJoins.has(key)}
                            onChange={() => {
                              onUpdateState(prev => {
                                const next = new Set(prev.selectedJoins)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return { ...prev, selectedJoins: next }
                              })
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--dc-text-secondary)' }}>
                            {proposal.cubeName} → {join.targetCube}{' '}
                            <span style={{ color: 'var(--dc-text-muted)' }}>
                              ({join.relationship})
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
                  justifyContent: 'flex-end',
                  gap: 8,
                }}
              >
                <button
                  onClick={() => onUpdateState(prev => ({ ...prev, phase: 'done', message: '' }))}
                  style={toolbarBtn(false)}
                >
                  Skip
                </button>
                <button
                  onClick={onApplyJoins}
                  disabled={selectedJoinCount === 0}
                  style={toolbarBtn(selectedJoinCount === 0, true)}
                >
                  Apply Selected ({selectedJoinCount})
                </button>
              </div>
            </div>
          )}

          {/* Applying joins phase */}
          {state.phase === 'applying-joins' && (
            <SpinnerContent message="Applying joins to cube definitions..." />
          )}

          {/* Done phase */}
          {state.phase === 'done' && (
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>Complete</div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-secondary)' }}>
                {state.message ? (
                  state.message
                ) : (
                  <>
                    Created {state.savedFiles.length} cube{state.savedFiles.length !== 1 ? 's' : ''}
                    {state.errors.length > 0 && `, ${state.errors.length} failed`}
                  </>
                )}
              </div>
              {state.savedFiles.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  {state.savedFiles.map(f => (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 0',
                        color: 'var(--dc-success, #22c55e)',
                      }}
                    >
                      <span>{'\u2713'}</span>
                      <span>{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {state.errors.length > 0 && (
                <div style={{ fontSize: 12 }}>
                  {state.errors.map(e => (
                    <div
                      key={e.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 0',
                        color: '#ef4444',
                      }}
                    >
                      <span>{'\u2717'}</span>
                      <span>
                        {e.name}: {e.error}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={toolbarBtn(false, true)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const INTROSPECT_STEPS = [
  { key: 'pull', label: 'Pull' },
  { key: 'select', label: 'Select' },
  { key: 'save', label: 'Save' },
  { key: 'done', label: 'Done' },
] as const

function getIntroStepIndex(phase: IntrospectState['phase']): number {
  switch (phase) {
    case 'pulling':
      return 0
    case 'review':
      return 1
    case 'saving':
      return 2
    case 'done':
      return 3
    default:
      return -1
  }
}

function IntrospectModal({
  state,
  hasAI,
  onUpdateState,
  onSave,
  onClose,
  onCancel,
}: {
  state: IntrospectState
  hasAI: boolean
  onUpdateState: (fn: (prev: IntrospectState) => IntrospectState) => void
  onSave: () => void
  onClose: () => void
  onCancel: () => void
}) {
  const allTables = state.tables || []
  const selectedCount = state.selectedTables.size
  const currentStep = getIntroStepIndex(state.phase)
  const canFilterTables = hasAI

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
            width: 160,
            flexShrink: 0,
            borderRight: '1px solid var(--dc-border)',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {INTROSPECT_STEPS.map((step, i) => (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: i === currentStep ? 600 : 400,
                color:
                  i < currentStep
                    ? 'var(--dc-success, #22c55e)'
                    : i === currentStep
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
                    i < currentStep
                      ? 'var(--dc-success, #22c55e)'
                      : i === currentStep
                        ? 'var(--dc-primary)'
                        : 'var(--dc-surface-tertiary, var(--dc-border))',
                  color: i <= currentStep ? '#fff' : 'var(--dc-text-muted)',
                }}
              >
                {i < currentStep ? '\u2713' : i + 1}
              </span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        {/* Right panel — step content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Pulling phase */}
          {state.phase === 'pulling' && (
            <SpinnerContent message="Pulling schema from database..." />
          )}

          {/* Review / select tables phase */}
          {state.phase === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: '20px 24px 8px', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                  {canFilterTables ? 'Select Tables' : 'Tables Found'}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '4px 24px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <TableSelector
                  tables={allTables}
                  selectedTables={state.selectedTables}
                  onSelectionChange={tables =>
                    onUpdateState(prev => ({ ...prev, selectedTables: tables }))
                  }
                  readOnly={!canFilterTables}
                />
              </div>
              <div
                style={{
                  padding: '12px 24px',
                  borderTop: '1px solid var(--dc-border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button onClick={onCancel} style={toolbarBtn(false)}>
                  Cancel
                </button>
                <button
                  onClick={onSave}
                  disabled={selectedCount === 0}
                  style={toolbarBtn(selectedCount === 0, true)}
                >
                  Save Schema ({selectedCount})
                </button>
              </div>
            </div>
          )}

          {/* Saving phase */}
          {state.phase === 'saving' && (
            <SpinnerContent
              message={
                state.selectedTables.size < allTables.length
                  ? 'Filtering and saving schema...'
                  : 'Saving schema file...'
              }
            />
          )}

          {/* Done phase */}
          {state.phase === 'done' && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 16,
                padding: 24,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                Schema Saved
              </div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-secondary)', textAlign: 'center' }}>
                Saved {state.tables?.length || 0} table
                {(state.tables?.length || 0) !== 1 ? 's' : ''} as{' '}
                <strong>{state.savedFile?.name}</strong>
              </div>
              <button onClick={onClose} style={toolbarBtn(false, true)}>
                Open in Editor
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
        padding: 32,
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 1s linear infinite' }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="var(--dc-border-secondary, var(--dc-border))"
          strokeWidth="3"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="var(--dc-primary)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div style={{ fontSize: 13, color: 'var(--dc-text-muted)', textAlign: 'center' }}>
        {message}
      </div>
    </div>
  )
}

function sanitizeFileName(name: string): string {
  let stem = name.replace(/\.ts$/i, '')
  stem = stem.replace(/\./g, '-')
  stem = stem
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!stem) stem = 'untitled'
  return `${stem}.ts`
}

function FileTreeItem({
  label,
  isSelected,
  hasErrors,
  isCompiled,
  onClick,
  onRename,
}: {
  label: string
  isSelected: boolean
  hasErrors: boolean
  isCompiled: boolean
  onClick: () => void
  onRename?: (newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const stem = label.replace(/\.ts$/i, '')
  const [editValue, setEditValue] = useState(stem)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const commitRename = () => {
    const sanitized = sanitizeFileName(editValue)
    setEditing(false)
    if (sanitized !== label && onRename) {
      onRename(sanitized)
    }
    setEditValue(sanitized.replace(/\.ts$/i, ''))
  }

  return (
    <div
      onClick={onClick}
      style={{
        padding: '5px 12px 5px 20px',
        fontSize: 13,
        cursor: 'pointer',
        backgroundColor: isSelected ? 'var(--dc-surface-hover)' : 'transparent',
        color: hasErrors ? '#ef4444' : isSelected ? 'var(--dc-text)' : 'var(--dc-text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderLeft: isSelected ? '2px solid var(--dc-primary)' : '2px solid transparent',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          flexShrink: 0,
          backgroundColor: hasErrors ? '#ef4444' : isCompiled ? '#22c55e' : '#6b7280',
        }}
      />
      {editing ? (
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setEditValue(stem)
                setEditing(false)
              }
            }}
            onClick={e => e.stopPropagation()}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              padding: '0 4px',
              border: '1px solid var(--dc-primary)',
              borderRadius: '3px 0 0 3px',
              backgroundColor: 'var(--dc-input-bg)',
              color: 'var(--dc-text)',
              outline: 'none',
            }}
          />
          <span
            style={{
              fontSize: 13,
              padding: '0 4px',
              color: 'var(--dc-text-muted)',
              border: '1px solid var(--dc-primary)',
              borderLeft: 'none',
              borderRadius: '0 3px 3px 0',
              backgroundColor: 'var(--dc-surface-hover)',
            }}
          >
            .ts
          </span>
        </div>
      ) : (
        <span
          onDoubleClick={e => {
            e.stopPropagation()
            if (onRename) {
              setEditValue(stem)
              setEditing(true)
            }
          }}
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

function toolbarBtn(disabled: boolean, primary = false): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: 6,
    border: primary ? 'none' : '1px solid var(--dc-border)',
    backgroundColor: primary ? (disabled ? '#4b5563' : 'var(--dc-primary)') : 'var(--dc-surface)',
    color: primary ? '#fff' : 'var(--dc-text)',
    fontSize: 13,
    fontWeight: 500,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function sidebarActionBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    background: 'none',
    border: '1px solid var(--dc-primary)',
    borderRadius: 4,
    cursor: disabled ? 'default' : 'pointer',
    fontSize: 11,
    color: 'var(--dc-primary)',
    padding: '2px 6px',
    opacity: disabled ? 0.4 : 1,
    whiteSpace: 'nowrap',
    width: 90,
  }
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--dc-primary)',
  cursor: 'pointer',
  fontSize: 12,
  padding: 0,
  textDecoration: 'underline',
}
