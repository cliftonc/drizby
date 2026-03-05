import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Editor, { type OnMount } from '@monaco-editor/react'

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

export default function SchemaEditorPage() {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [compileOutput, setCompileOutput] = useState<{ success?: boolean; errors?: any[]; cubes?: string[]; exports?: string[] } | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null)
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)

  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => fetch('/api/connections').then(r => r.json())
  })

  const { data: schemaFiles = [] } = useQuery<SchemaFile[]>({
    queryKey: ['schema-files'],
    queryFn: () => fetch('/api/schema-files').then(r => r.json())
  })

  const { data: cubeDefs = [] } = useQuery<CubeDefinition[]>({
    queryKey: ['cube-definitions'],
    queryFn: () => fetch('/api/cube-definitions').then(r => r.json())
  })

  // Auto-select first connection
  useEffect(() => {
    if (connections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connections[0].id)
    }
  }, [connections, selectedConnectionId])

  const filteredSchemas = schemaFiles.filter(s => s.connectionId === selectedConnectionId)
  const filteredCubes = cubeDefs.filter(c => c.connectionId === selectedConnectionId)

  // Save schema file
  const saveSchema = useMutation({
    mutationFn: async (file: SchemaFile) => {
      const res = await fetch(`/api/schema-files/${file.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, sourceCode: editorContent })
      })
      return res.json()
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
    }
  })

  // Save cube definition
  const saveCube = useMutation({
    mutationFn: async (cube: CubeDefinition) => {
      const res = await fetch(`/api/cube-definitions/${cube.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cube, sourceCode: editorContent })
      })
      return res.json()
    },
    onSuccess: () => {
      setIsDirty(false)
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
    }
  })

  // Compile schema file
  const compileSchema = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/schema-files/${id}/compile`, { method: 'POST' })
      return res.json()
    },
    onSuccess: (data) => {
      setCompileOutput(data)
      queryClient.invalidateQueries({ queryKey: ['schema-files'] })
      if (data.success) setMarkers([])
      else setMarkersFromErrors(data.errors || [])
    }
  })

  // Compile cube definition
  const compileCube = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/cube-definitions/${id}/compile`, { method: 'POST' })
      return res.json()
    },
    onSuccess: (data) => {
      setCompileOutput(data)
      queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
      if (data.success) setMarkers([])
      else setMarkersFromErrors(data.errors || [])
    }
  })

  // Create new schema file
  const createSchema = useMutation({
    mutationFn: async () => {
      const name = prompt('Schema file name (e.g. orders.ts):')
      if (!name) return null
      const res = await fetch('/api/schema-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceCode: `import { pgTable, integer, text, timestamp } from 'drizzle-orm/pg-core'\n\nexport const myTable = pgTable('my_table', {\n  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),\n  name: text('name').notNull(),\n  createdAt: timestamp('created_at').defaultNow()\n})\n`,
          connectionId: selectedConnectionId,
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['schema-files'] })
        setSelectedFile({ type: 'schema', data })
        setEditorContent(data.sourceCode)
        setIsDirty(false)
      }
    }
  })

  // Create new cube definition
  const createCube = useMutation({
    mutationFn: async () => {
      const name = prompt('Cube definition name:')
      if (!name) return null
      const res = await fetch('/api/cube-definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceCode: `import { eq } from 'drizzle-orm'\nimport { defineCube } from 'drizzle-cube/server'\nimport type { QueryContext, BaseQueryDefinition, Cube } from 'drizzle-cube/server'\n// import { myTable } from './my-schema'\n\nexport const myCube = defineCube('MyCube', {\n  title: '${name}',\n  description: '',\n\n  sql: (ctx: QueryContext): BaseQueryDefinition => ({\n    from: undefined as any, // replace with your table\n  }),\n\n  dimensions: {},\n  measures: {}\n}) as Cube\n`,
          connectionId: selectedConnectionId,
        })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
        setSelectedFile({ type: 'cube', data })
        setEditorContent(data.sourceCode || '')
        setIsDirty(false)
      }
    }
  })

  // Introspect database
  const introspect = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/schema-files/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: selectedConnectionId })
      })
      return res.json()
    },
    onSuccess: (data) => {
      if (data.source) {
        // Create a new schema file with introspected source
        const name = prompt('Name for introspected schema file:', 'introspected.ts')
        if (name) {
          fetch('/api/schema-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              sourceCode: data.source,
              connectionId: selectedConnectionId,
            })
          }).then(r => r.json()).then(newFile => {
            queryClient.invalidateQueries({ queryKey: ['schema-files'] })
            setSelectedFile({ type: 'schema', data: newFile })
            setEditorContent(newFile.sourceCode)
            setIsDirty(false)
          })
        }
      } else if (data.error) {
        setCompileOutput({ success: false, errors: [{ message: data.error }] })
      }
    }
  })

  const setMarkers = useCallback((markers: any[]) => {
    if (monacoRef.current && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monacoRef.current.editor.setModelMarkers(model, 'compiler', markers)
      }
    }
  }, [])

  const setMarkersFromErrors = useCallback((errors: any[]) => {
    const markers = errors.map((e: any) => ({
      severity: 8, // MarkerSeverity.Error
      message: e.message,
      startLineNumber: e.line || 1,
      startColumn: e.column || 1,
      endLineNumber: e.line || 1,
      endColumn: e.column ? e.column + 20 : 100,
    }))
    setMarkers(markers)
  }, [setMarkers])

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

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

  const loadExtraLibs = async (monaco: any) => {
    // Provide ambient module declarations so Monaco resolves imports without errors.
    // These declare the shape of the modules users import in schema/cube files.
    const drizzleOrmPgCoreDecl = `
declare module 'drizzle-orm/pg-core' {
  export function pgTable(name: string, columns: Record<string, any>, extra?: (table: any) => any[]): any;
  export function integer(name: string): any;
  export function text(name: string): any;
  export function real(name: string): any;
  export function boolean(name: string): any;
  export function timestamp(name: string): any;
  export function jsonb(name: string): any;
  export function serial(name: string): any;
  export function varchar(name: string, config?: any): any;
  export function numeric(name: string): any;
  export function date(name: string): any;
  export function smallint(name: string): any;
  export function bigint(name: string, config?: any): any;
  export function index(name: string): any;
  export function uniqueIndex(name: string): any;
}
`
    const drizzleOrmDecl = `
declare module 'drizzle-orm' {
  export function eq(left: any, right: any): any;
  export function ne(left: any, right: any): any;
  export function gt(left: any, right: any): any;
  export function gte(left: any, right: any): any;
  export function lt(left: any, right: any): any;
  export function lte(left: any, right: any): any;
  export function and(...conditions: any[]): any;
  export function or(...conditions: any[]): any;
  export function not(condition: any): any;
  export function inArray(column: any, values: any[]): any;
  export function notInArray(column: any, values: any[]): any;
  export function isNull(column: any): any;
  export function isNotNull(column: any): any;
  export function between(column: any, min: any, max: any): any;
  export function like(column: any, pattern: string): any;
  export function ilike(column: any, pattern: string): any;
  export function sql(strings: TemplateStringsArray, ...values: any[]): any;
  export function asc(column: any): any;
  export function desc(column: any): any;
  export function count(column?: any): any;
  export function sum(column: any): any;
  export function avg(column: any): any;
  export function min(column: any): any;
  export function max(column: any): any;
  export function relations(table: any, fn: (helpers: { one: any; many: any }) => any): any;
}
`
    const drizzleCubeDecl = `
declare module 'drizzle-cube/server' {
  export interface SecurityContext { organisationId?: number | string; userId?: number | string; [key: string]: any; }
  export interface QueryContext { securityContext: SecurityContext; }
  export interface BaseQueryDefinition { from: any; where?: any; }
  export interface Cube { name: string; title?: string; description?: string; sql: any; dimensions: any; measures: any; joins?: any; }
  export interface DimensionDef { name: string; title?: string; sql: any; type: 'string' | 'number' | 'boolean' | 'time'; primaryKey?: boolean; }
  export interface MeasureDef { name: string; title?: string; sql: any; type: 'count' | 'countDistinct' | 'sum' | 'avg' | 'min' | 'max'; filters?: any[]; }
  export interface JoinDef { targetCube: () => Cube; relationship: 'belongsTo' | 'hasMany' | 'hasOne'; on: Array<{ source: any; target: any }>; }
  export function defineCube(name: string, config: {
    title?: string;
    description?: string;
    sql: (ctx: QueryContext) => BaseQueryDefinition;
    joins?: Record<string, JoinDef>;
    dimensions: Record<string, DimensionDef>;
    measures: Record<string, MeasureDef>;
  }): Cube;
}
`
    monaco.languages.typescript.typescriptDefaults.addExtraLib(drizzleOrmPgCoreDecl, 'file:///node_modules/drizzle-orm/pg-core/index.d.ts')
    monaco.languages.typescript.typescriptDefaults.addExtraLib(drizzleOrmDecl, 'file:///node_modules/drizzle-orm/index.d.ts')
    monaco.languages.typescript.typescriptDefaults.addExtraLib(drizzleCubeDecl, 'file:///node_modules/drizzle-cube/server/index.d.ts')

    // Load schema file types for relative imports (e.g. './demo-schema')
    for (const sf of schemaFiles) {
      try {
        const res = await fetch(`/api/schema-files/${sf.id}/types`)
        if (res.ok) {
          const dts = await res.text()
          if (dts) {
            const name = sf.name.replace(/\.ts$/, '')
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
              dts,
              `file:///./${name}.d.ts`
            )
          }
        }
      } catch {}
    }
  }

  const handleSelectFile = (file: FileItem) => {
    if (isDirty && !confirm('You have unsaved changes. Discard?')) return
    setSelectedFile(file)
    const code = file.type === 'schema' ? file.data.sourceCode : (file.data.sourceCode || '')
    setEditorContent(code)
    setIsDirty(false)
    setCompileOutput(null)
    setMarkers([])
  }

  const handleSave = () => {
    if (!selectedFile) return
    if (selectedFile.type === 'schema') saveSchema.mutate(selectedFile.data)
    else saveCube.mutate(selectedFile.data)
  }

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
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return

    const endpoint = selectedFile.type === 'schema'
      ? `/api/schema-files/${selectedFile.data.id}`
      : `/api/cube-definitions/${selectedFile.data.id}`

    await fetch(endpoint, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['schema-files'] })
    queryClient.invalidateQueries({ queryKey: ['cube-definitions'] })
    setSelectedFile(null)
    setEditorContent('')
    setCompileOutput(null)
  }

  const isCompiling = compileSchema.isPending || compileCube.isPending
  const isSaving = saveSchema.isPending || saveCube.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
        borderBottom: '1px solid var(--dc-border)', marginBottom: 0, flexShrink: 0
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--dc-text)' }}>Schema Editor</h1>
        <div style={{ flex: 1 }} />

        {/* Connection selector */}
        <select
          value={selectedConnectionId || ''}
          onChange={e => setSelectedConnectionId(parseInt(e.target.value))}
          style={{
            padding: '6px 10px', borderRadius: 6, border: '1px solid var(--dc-border)',
            backgroundColor: 'var(--dc-surface)', color: 'var(--dc-text)', fontSize: 13
          }}
        >
          {connections.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button onClick={handleSave} disabled={!isDirty || isSaving}
          style={toolbarBtn(!isDirty || isSaving)}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button onClick={handleCompile} disabled={!selectedFile || isCompiling}
          style={toolbarBtn(!selectedFile || isCompiling, true)}>
          {isCompiling ? 'Compiling...' : 'Compile'}
        </button>
        <button onClick={handleDelete} disabled={!selectedFile}
          style={{ ...toolbarBtn(!selectedFile), color: selectedFile ? '#ef4444' : undefined }}>
          Delete
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left sidebar — file tree */}
        <div style={{
          width: 220, flexShrink: 0, borderRight: '1px solid var(--dc-border)',
          overflow: 'auto', padding: '8px 0', backgroundColor: 'var(--dc-surface)'
        }}>
          {/* Schema files */}
          <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--dc-text-secondary)', letterSpacing: 0.5 }}>
              Schemas
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => introspect.mutate()} title="Introspect database"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--dc-text-secondary)', padding: '0 2px' }}>
                {introspect.isPending ? '...' : 'DB'}
              </button>
              <button onClick={() => createSchema.mutate()} title="New schema file"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--dc-text-secondary)', padding: '0 2px' }}>
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
          <div style={{ padding: '12px 12px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--dc-text-secondary)', letterSpacing: 0.5 }}>
              Cubes
            </span>
            <button onClick={() => createCube.mutate()} title="New cube definition"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--dc-text-secondary)', padding: '0 2px' }}>
              +
            </button>
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
            <div style={{ padding: '16px 12px', fontSize: 12, color: 'var(--dc-text-secondary)', textAlign: 'center' }}>
              No files yet. Create a schema file or introspect a database to get started.
            </div>
          )}
        </div>

        {/* Main editor area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedFile ? (
            <>
              {/* Editor tab */}
              <div style={{
                padding: '6px 12px', backgroundColor: 'var(--dc-surface)',
                borderBottom: '1px solid var(--dc-border)', fontSize: 13, color: 'var(--dc-text)',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
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
                  theme="vs-dark"
                  value={editorContent}
                  onChange={(value) => {
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
                <div style={{
                  borderTop: '1px solid var(--dc-border)',
                  padding: '8px 12px',
                  maxHeight: 150,
                  overflow: 'auto',
                  backgroundColor: compileOutput.success ? '#0a2e0a' : '#2e0a0a',
                  fontSize: 12,
                  fontFamily: 'monospace'
                }}>
                  {compileOutput.success ? (
                    <div style={{ color: '#22c55e' }}>
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
                      {(compileOutput.errors || []).map((e: any, i: number) => (
                        <div key={i} style={{ color: '#ef4444', marginBottom: 4 }}>
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
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--dc-text-secondary)', fontSize: 14
            }}>
              Select a file from the sidebar to edit, or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FileTreeItem({ label, isSelected, hasErrors, isCompiled, onClick }: {
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
        display: 'flex', alignItems: 'center', gap: 6,
        borderLeft: isSelected ? '2px solid var(--dc-primary)' : '2px solid transparent'
      }}
    >
      <span style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        backgroundColor: hasErrors ? '#ef4444' : isCompiled ? '#22c55e' : '#6b7280'
      }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
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
