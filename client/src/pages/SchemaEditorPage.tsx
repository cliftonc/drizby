import Editor, { type OnMount } from '@monaco-editor/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useConfirm } from '../hooks/useConfirm'
import { usePrompt } from '../hooks/usePrompt'

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
}

interface Connection {
  id: number
  name: string
  engineType: string
  isActive: boolean
}

type FileItem = { type: 'schema'; data: SchemaFile } | { type: 'cube'; data: CubeDefinition }

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
    () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light')
  )
}

export default function SchemaEditorPage() {
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

  // Initialize connection from URL or localStorage
  useEffect(() => {
    if (connections.length === 0 || selectedConnectionId !== null) return
    const connId = params.connectionId ? Number.parseInt(params.connectionId) : null
    const resolvedId = connId && connections.some(c => c.id === connId) ? connId : connections[0].id
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
        name,
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
    const res = await fetch('/api/cube-definitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        sourceCode: `import { eq } from 'drizzle-orm'\nimport { defineCube } from 'drizzle-cube/server'\nimport type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'\n// import { myTable } from './my-schema'\n\nexport const myCube = defineCube('MyCube', {\n  title: '${name}',\n  description: '',\n\n  sql: (ctx: QueryContext): BaseQueryDefinition => ({\n    from: undefined as any, // replace with your table\n  }),\n\n  dimensions: {},\n  measures: {}\n}) as Cube\n`,
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

  // Introspect database
  const introspect = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/schema-files/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      })
      return res.json()
    },
    onSuccess: async data => {
      if (data.source) {
        const name = await prompt({
          title: 'Save Introspected Schema',
          message: 'Enter a name for the schema file',
          defaultValue: 'introspected.ts',
          submitText: 'Save',
        })
        if (name) {
          const res = await fetch('/api/schema-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              sourceCode: data.source,
              connectionId: selectedConnectionId,
            }),
          })
          const newFile = await res.json()
          queryClient.invalidateQueries({ queryKey: ['schema-files'] })
          queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
          const file: FileItem = { type: 'schema', data: newFile }
          setSelectedFile(file)
          setEditorContent(newFile.sourceCode)
          setIsDirty(false)
          updateUrl(selectedConnectionId, file)
        }
      } else if (data.error) {
        setCompileOutput({ success: false, errors: [{ message: data.error }] })
      }
    },
  })

  // AI cube generation state
  const [aiGenState, setAiGenState] = useState<{
    active: boolean
    phase: string
    message: string
    current?: number
    total?: number
    cubes?: Array<{ name: string; title: string }>
    completedCubes?: string[]
  }>({ active: false, phase: '', message: '' })

  const generateCubesWithAI = useCallback(async () => {
    setAiGenState({
      active: true,
      phase: 'planning',
      message: 'Analyzing schema and planning cubes...',
      completedCubes: [],
    })

    try {
      const res = await fetch('/api/schema-files/generate-cubes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId: selectedConnectionId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Generation failed')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalSource = ''

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
                  phase: data.phase,
                  message: data.message,
                  current: data.current,
                  total: data.total,
                }))
                break
              case 'plan':
                setAiGenState(prev => ({ ...prev, cubes: data.cubes }))
                break
              case 'cube_done':
                setAiGenState(prev => ({
                  ...prev,
                  completedCubes: [...(prev.completedCubes || []), data.name],
                }))
                break
              case 'cube_error':
                setAiGenState(prev => ({
                  ...prev,
                  completedCubes: [...(prev.completedCubes || []), `${data.name} (failed)`],
                }))
                break
              case 'complete':
                finalSource = data.source
                break
              case 'error':
                throw new Error(data.message)
            }
          }
        }
      }

      setAiGenState(prev => ({ ...prev, active: false }))

      if (finalSource) {
        const name = await prompt({
          title: 'Save AI-Generated Cubes',
          message: 'Enter a name for the cube definition file',
          defaultValue: 'cubes',
          submitText: 'Save',
        })
        if (name) {
          const saveRes = await fetch('/api/cube-definitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              sourceCode: finalSource,
              connectionId: selectedConnectionId,
            }),
          })
          const newFile = await saveRes.json()
          queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
          queryClient.invalidateQueries({ queryKey: ['connections', 'status'] })
          const file: FileItem = { type: 'cube', data: newFile }
          setSelectedFile(file)
          setEditorContent(newFile.sourceCode || '')
          setIsDirty(false)
          updateUrl(selectedConnectionId, file)
        }
      }
    } catch (err: any) {
      setAiGenState(prev => ({ ...prev, active: false }))
      setCompileOutput({
        success: false,
        errors: [{ message: `AI generation failed: ${err.message}` }],
      })
    }
  }, [selectedConnectionId, prompt, queryClient, updateUrl])

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
    const [drizzleOrmTypes, drizzleCubeTypes] = await Promise.all([
      fetch('/api/editor/types/drizzle-orm')
        .then(r => r.json())
        .catch(() => ({})),
      fetch('/api/editor/types/drizzle-cube')
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
    const code = file.type === 'schema' ? file.data.sourceCode : file.data.sourceCode || ''
    setEditorContent(code)
    setIsDirty(false)
    setCompileOutput(null)
    setMarkers([])
    updateUrl(selectedConnectionId, file)

    // Refresh background schema models: recreate for the file we just left, skip the newly opened one
    if (monacoRef.current) {
      updateSchemaModels(monacoRef.current, file)
    }
  }

  const handleSave = () => {
    if (!selectedFile) return
    if (selectedFile.type === 'schema') saveSchema.mutate(selectedFile.data)
    else saveCube.mutate(selectedFile.data)
  }
  handleSaveRef.current = handleSave

  const handleCompile = () => {
    if (!selectedFile) return
    // Save first, then compile
    const doCompile = () => {
      if (selectedFile.type === 'schema') compileSchema.mutate(selectedFile.data.id)
      else compileCube.mutate(selectedFile.data.id)
    }
    if (isDirty) {
      if (selectedFile.type === 'schema') {
        saveSchema.mutate(selectedFile.data, { onSuccess: doCompile })
      } else {
        saveCube.mutate(selectedFile.data, { onSuccess: doCompile })
      }
    } else {
      doCompile()
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
        }}
      >
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
        </div>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          style={toolbarBtn(!isDirty || isSaving)}
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={handleCompile}
          disabled={!selectedFile || isCompiling}
          style={toolbarBtn(!selectedFile || isCompiling, true)}
        >
          {isCompiling ? 'Compiling...' : 'Compile'}
        </button>
        <button
          onClick={handleDelete}
          disabled={!selectedFile}
          style={{ ...toolbarBtn(!selectedFile), color: selectedFile ? '#ef4444' : undefined }}
        >
          Delete
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left sidebar — file tree */}
        <div
          style={{
            width: 220,
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
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => introspect.mutate()}
                title="Introspect database"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--dc-text-secondary)',
                  padding: '0 2px',
                }}
              >
                {introspect.isPending ? '...' : 'DB'}
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
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={generateCubesWithAI}
                title="Generate cubes with AI"
                disabled={aiGenState.active || filteredSchemas.length === 0}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: aiGenState.active || filteredSchemas.length === 0 ? 'default' : 'pointer',
                  fontSize: 13,
                  color: 'var(--dc-text-secondary)',
                  padding: '0 2px',
                  opacity: aiGenState.active || filteredSchemas.length === 0 ? 0.4 : 1,
                }}
              >
                {aiGenState.active ? '...' : 'AI'}
              </button>
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
            />
          ))}

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
                  language="typescript"
                  theme={monacoTheme}
                  path={`file:///src/${selectedFile.type === 'schema' ? selectedFile.data.name : `${selectedFile.data.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.ts`}`}
                  value={editorContent}
                  onChange={value => {
                    setEditorContent(value || '')
                    setIsDirty(true)
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
                    onClick={() => introspect.mutate()}
                    disabled={introspect.isPending}
                    style={{
                      ...toolbarBtn(introspect.isPending, true),
                      padding: '10px 24px',
                      fontSize: 14,
                    }}
                  >
                    {introspect.isPending ? 'Pulling schema...' : 'Pull Schema from Database'}
                  </button>
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
      {aiGenState.active && (
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
              padding: '32px 40px',
              border: '1px solid var(--dc-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              minWidth: 320,
              maxWidth: 420,
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" stroke="var(--dc-border-secondary)" strokeWidth="3" />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="var(--dc-primary)"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--dc-text)' }}>
                Generating Cube Definitions
              </div>
              <div style={{ fontSize: 13, color: 'var(--dc-text-muted)', marginTop: 4 }}>
                {aiGenState.message}
              </div>
              {aiGenState.total && (
                <div
                  style={{
                    marginTop: 12,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: 'var(--dc-surface-tertiary)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      borderRadius: 2,
                      backgroundColor: 'var(--dc-primary)',
                      width: `${((aiGenState.current || 0) / aiGenState.total) * 100}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
              {aiGenState.cubes && aiGenState.cubes.length > 0 && (
                <div style={{ marginTop: 12, textAlign: 'left', fontSize: 12 }}>
                  {aiGenState.cubes.map(cube => {
                    const isDone = aiGenState.completedCubes?.includes(cube.name)
                    const isFailed = aiGenState.completedCubes?.includes(`${cube.name} (failed)`)
                    const isCurrent =
                      !isDone &&
                      !isFailed &&
                      aiGenState.phase === 'generating' &&
                      aiGenState.cubes?.findIndex(c => c.name === cube.name) ===
                        (aiGenState.current || 1) - 1
                    return (
                      <div
                        key={cube.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '3px 0',
                          color: isDone
                            ? 'var(--dc-success)'
                            : isFailed
                              ? 'var(--dc-error)'
                              : isCurrent
                                ? 'var(--dc-text)'
                                : 'var(--dc-text-muted)',
                        }}
                      >
                        <span style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>
                          {isDone ? '✓' : isFailed ? '✗' : isCurrent ? '●' : '○'}
                        </span>
                        <span>{cube.title}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
      <ConfirmDialog />
      <PromptDialog />
    </div>
  )
}

function FileTreeItem({
  label,
  isSelected,
  hasErrors,
  isCompiled,
  onClick,
}: {
  label: string
  isSelected: boolean
  hasErrors: boolean
  isCompiled: boolean
  onClick: () => void
}) {
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
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
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
