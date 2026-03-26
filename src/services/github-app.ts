/**
 * GitHub App integration service
 * Handles JWT auth, installation tokens, repo operations, and sync logic
 */

import crypto from 'node:crypto'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Octokit } from 'octokit'
import {
  analyticsPages,
  connections,
  cubeDefinitions,
  githubAppConfig,
  githubInstallations,
  githubSyncConfig,
  schemaFiles,
} from '../../schema'
import { maybeDecrypt } from '../auth/encryption'

// ============================================================================
// JWT Generation for GitHub App Authentication
// ============================================================================

/**
 * Generate a JWT signed with the GitHub App's private key (RS256).
 * Used to authenticate as the App itself (not as an installation).
 */
export function generateAppJWT(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // issued 60s ago to account for clock drift
      exp: now + 600, // 10 minute expiry (GitHub max)
      iss: appId,
    })
  ).toString('base64url')

  const signature = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(privateKey, 'base64url')

  return `${header}.${payload}.${signature}`
}

// ============================================================================
// Config Helpers
// ============================================================================

export interface GitHubAppConfigData {
  id: number
  appId: string
  appName: string | null
  appSlug: string | null
  privateKey: string
  clientId: string
  clientSecret: string
  webhookSecret: string | null
}

/** Load and decrypt the GitHub App config from the database. Returns null if not configured. */
export async function getAppConfig(db: DrizzleDatabase): Promise<GitHubAppConfigData | null> {
  const [row] = await (db as any)
    .select()
    .from(githubAppConfig)
    .where(eq(githubAppConfig.organisationId, 1))
  if (!row) return null

  return {
    id: row.id,
    appId: row.appId,
    appName: row.appName,
    appSlug: row.appSlug,
    privateKey: await maybeDecrypt(row.privateKey),
    clientId: row.clientId,
    clientSecret: await maybeDecrypt(row.clientSecret),
    webhookSecret: row.webhookSecret ? await maybeDecrypt(row.webhookSecret) : null,
  }
}

/** Create an Octokit instance authenticated as the GitHub App (JWT). */
export function getAppOctokit(appId: string, privateKey: string): Octokit {
  const jwt = generateAppJWT(appId, privateKey)
  return new Octokit({ auth: jwt })
}

/** Create an Octokit instance authenticated as an installation. */
export async function getInstallationOctokit(
  appId: string,
  privateKey: string,
  installationId: number
): Promise<Octokit> {
  const appOctokit = getAppOctokit(appId, privateKey)
  const { data } = await appOctokit.rest.apps.createInstallationAccessToken({
    installation_id: installationId,
  })
  return new Octokit({ auth: data.token })
}

// ============================================================================
// Installation Operations
// ============================================================================

/** List all installations for the configured GitHub App. */
export async function listAppInstallations(
  db: DrizzleDatabase
): Promise<Array<{ id: number; account: { login: string; type: string }; appSlug: string }>> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const octokit = getAppOctokit(config.appId, config.privateKey)
  const { data } = await octokit.rest.apps.listInstallations()

  return data.map(inst => ({
    id: inst.id,
    account: {
      login: inst.account?.login ?? 'unknown',
      type: inst.account?.type ?? 'Unknown',
    },
    appSlug: inst.app_slug,
  }))
}

/** Save a GitHub installation to the database. */
export async function saveInstallation(
  db: DrizzleDatabase,
  configId: number,
  installationId: number,
  accountLogin: string,
  accountType: string
): Promise<void> {
  // Upsert: delete existing then insert
  await (db as any)
    .delete(githubInstallations)
    .where(eq(githubInstallations.installationId, installationId))
  await (db as any).insert(githubInstallations).values({
    installationId,
    accountLogin,
    accountType,
    githubAppConfigId: configId,
    organisationId: 1,
  })
}

// ============================================================================
// Repository Operations
// ============================================================================

/** List repositories accessible to an installation. */
export async function listInstallationRepos(
  db: DrizzleDatabase,
  installationId: number
): Promise<
  Array<{ id: number; name: string; fullName: string; private: boolean; defaultBranch: string }>
> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const octokit = await getInstallationOctokit(config.appId, config.privateKey, installationId)

  const allRepos: Array<{
    id: number
    name: string
    fullName: string
    private: boolean
    defaultBranch: string
  }> = []

  let page = 1
  while (true) {
    const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
      page,
    })
    for (const repo of data.repositories) {
      allRepos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
      })
    }
    if (allRepos.length >= data.total_count || data.repositories.length < 100) break
    page++
  }

  return allRepos
}

/** Create a new repository in an organization. Personal accounts must create repos manually. */
export async function createRepo(
  db: DrizzleDatabase,
  installationId: number,
  org: string,
  name: string,
  isPrivate: boolean
): Promise<{ id: number; name: string; fullName: string; defaultBranch: string }> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const octokit = await getInstallationOctokit(config.appId, config.privateKey, installationId)
  const { data } = await octokit.rest.repos.createInOrg({
    org,
    name,
    private: isPrivate,
    auto_init: true,
    description: 'Drizby schema and cube definitions',
  })

  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name,
    defaultBranch: data.default_branch,
  }
}

/** List branches for a repository. */
export async function listBranches(
  db: DrizzleDatabase,
  installationId: number,
  owner: string,
  repo: string
): Promise<Array<{ name: string; sha: string }>> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const octokit = await getInstallationOctokit(config.appId, config.privateKey, installationId)
  const { data } = await octokit.rest.repos.listBranches({ owner, repo, per_page: 100 })

  return data.map(branch => ({
    name: branch.name,
    sha: branch.commit.sha,
  }))
}

/** Create a new branch from an existing ref. */
export async function createBranch(
  db: DrizzleDatabase,
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string
): Promise<void> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const octokit = await getInstallationOctokit(config.appId, config.privateKey, installationId)
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: fromSha,
  })
}

// ============================================================================
// Tags
// ============================================================================

export interface GitTag {
  name: string
  sha: string
  date: string | null
  message: string | null
}

/** List tags from the repo, sorted newest first. */
export async function listTags(db: DrizzleDatabase): Promise<GitTag[]> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const [syncConf] = await (db as any)
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))
  if (!syncConf) throw new Error('No sync configuration found')

  const octokit = await getInstallationOctokit(
    config.appId,
    config.privateKey,
    syncConf.installationId
  )

  const { data: refs } = await octokit.rest.git.listMatchingRefs({
    owner: syncConf.repoOwner,
    repo: syncConf.repoName,
    ref: 'tags/',
  })

  const tags: GitTag[] = []
  for (const ref of refs) {
    const tagName = ref.ref.replace('refs/tags/', '')
    let sha = ref.object.sha
    let date: string | null = null
    let message: string | null = null

    // Annotated tags have type 'tag', need to dereference
    if (ref.object.type === 'tag') {
      try {
        const { data: tagData } = await octokit.rest.git.getTag({
          owner: syncConf.repoOwner,
          repo: syncConf.repoName,
          tag_sha: sha,
        })
        sha = tagData.object.sha
        date = tagData.tagger?.date ?? null
        message = tagData.message ?? null
      } catch {
        // Fall through with lightweight tag data
      }
    }

    if (!date) {
      try {
        const { data: commitData } = await octokit.rest.git.getCommit({
          owner: syncConf.repoOwner,
          repo: syncConf.repoName,
          commit_sha: sha,
        })
        date = commitData.author?.date ?? null
      } catch {
        // Ignore
      }
    }

    tags.push({ name: tagName, sha, date, message })
  }

  // Sort by semver descending, falling back to date
  tags.sort((a, b) => {
    const va = a.name.replace(/^v/, '').split('.').map(Number)
    const vb = b.name.replace(/^v/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const diff = (vb[i] || 0) - (va[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  })

  return tags
}

/** Create an annotated tag on the last synced commit. */
export async function createTag(
  db: DrizzleDatabase,
  version: string
): Promise<{ name: string; sha: string }> {
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const [syncConf] = await (db as any)
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))
  if (!syncConf) throw new Error('No sync configuration found')
  if (!syncConf.lastSyncCommitSha) throw new Error('No commit to tag — push first')

  const octokit = await getInstallationOctokit(
    config.appId,
    config.privateKey,
    syncConf.installationId
  )

  const tagName = version.startsWith('v') ? version : `v${version}`

  // Create annotated tag object
  const { data: tagObj } = await octokit.rest.git.createTag({
    owner: syncConf.repoOwner,
    repo: syncConf.repoName,
    tag: tagName,
    message: `Release ${tagName}`,
    object: syncConf.lastSyncCommitSha,
    type: 'commit',
  })

  // Create the ref pointing to the tag
  await octokit.rest.git.createRef({
    owner: syncConf.repoOwner,
    repo: syncConf.repoName,
    ref: `refs/tags/${tagName}`,
    sha: tagObj.sha,
  })

  return { name: tagName, sha: syncConf.lastSyncCommitSha }
}

// ============================================================================
// Restore from tag
// ============================================================================

export interface RestoreResult {
  schemasUpdated: number
  schemasCreated: number
  cubesUpdated: number
  cubesCreated: number
}

/**
 * Restore schema files and cube definitions from a git ref (tag or commit SHA).
 * Reads the tree, parses managed files, and upserts into the database.
 */
export async function restoreFromRef(
  db: DrizzleDatabase,
  ref: string,
  onProgress?: SyncProgressFn
): Promise<RestoreResult> {
  const progress = onProgress ?? (() => {})
  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  const [syncConf] = await (db as any)
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))
  if (!syncConf) throw new Error('No sync configuration found')

  const octokit = await getInstallationOctokit(
    config.appId,
    config.privateKey,
    syncConf.installationId
  )

  const owner = syncConf.repoOwner
  const repo = syncConf.repoName

  // Resolve the ref to a commit
  progress('Resolving ref', ref)
  let commitSha: string
  try {
    const { data } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${ref}`,
    })
    // Dereference annotated tags
    if (data.object.type === 'tag') {
      const { data: tagData } = await octokit.rest.git.getTag({
        owner,
        repo,
        tag_sha: data.object.sha,
      })
      commitSha = tagData.object.sha
    } else {
      commitSha = data.object.sha
    }
  } catch {
    // Try as a raw commit SHA
    commitSha = ref
  }

  // Get the tree
  progress('Reading tree', commitSha.slice(0, 7))
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: commitSha,
  })
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commitData.tree.sha,
    recursive: 'true',
  })

  // Load all connections to map directory names back to connection IDs
  const allConnections = await (db as any)
    .select()
    .from(connections)
    .where(and(eq(connections.organisationId, 1), eq(connections.isActive, true)))

  const connectionBySlug = new Map<string, number>()
  for (const conn of allConnections) {
    const slug = conn.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
    connectionBySlug.set(slug, conn.id)
  }

  const result: RestoreResult = {
    schemasUpdated: 0,
    schemasCreated: 0,
    cubesUpdated: 0,
    cubesCreated: 0,
  }

  // Process each managed file in the tree
  for (const item of tree.tree) {
    if (!item.path || item.type !== 'blob' || !item.sha) continue

    let type: 'schema' | 'cube' | null = null
    let connSlug: string | null = null
    let fileName: string | null = null

    if (item.path.startsWith('schemas/')) {
      const parts = item.path.slice('schemas/'.length).split('/')
      if (parts.length === 2) {
        type = 'schema'
        connSlug = parts[0]
        fileName = parts[1]
      }
    } else if (item.path.startsWith('cubes/')) {
      const parts = item.path.slice('cubes/'.length).split('/')
      if (parts.length === 2) {
        type = 'cube'
        connSlug = parts[0]
        fileName = parts[1]
      }
    }

    if (!type || !connSlug || !fileName) continue

    const connectionId = connectionBySlug.get(connSlug)
    if (!connectionId) {
      progress('Skipping', `${item.path} (no matching connection for "${connSlug}")`)
      continue
    }

    // Fetch file content
    progress('Restoring', item.path)
    const { data: blob } = await octokit.rest.git.getBlob({
      owner,
      repo,
      file_sha: item.sha,
    })
    const content = Buffer.from(blob.content, 'base64').toString('utf-8')

    if (type === 'schema') {
      // Upsert schema file
      const [existing] = await (db as any)
        .select()
        .from(schemaFiles)
        .where(
          and(
            eq(schemaFiles.name, fileName),
            eq(schemaFiles.connectionId, connectionId),
            eq(schemaFiles.organisationId, 1)
          )
        )

      if (existing) {
        await (db as any)
          .update(schemaFiles)
          .set({ sourceCode: content, updatedAt: new Date() })
          .where(eq(schemaFiles.id, existing.id))
        result.schemasUpdated++
      } else {
        await (db as any)
          .insert(schemaFiles)
          .values({ name: fileName, sourceCode: content, connectionId, organisationId: 1 })
        result.schemasCreated++
      }
    } else {
      // Upsert cube definition
      const [existing] = await (db as any)
        .select()
        .from(cubeDefinitions)
        .where(
          and(
            eq(cubeDefinitions.name, fileName),
            eq(cubeDefinitions.connectionId, connectionId),
            eq(cubeDefinitions.organisationId, 1)
          )
        )

      if (existing) {
        await (db as any)
          .update(cubeDefinitions)
          .set({ sourceCode: content, updatedAt: new Date() })
          .where(eq(cubeDefinitions.id, existing.id))
        result.cubesUpdated++
      } else {
        await (db as any).insert(cubeDefinitions).values({
          name: fileName,
          sourceCode: content,
          connectionId,
          organisationId: 1,
          isActive: true,
        })
        result.cubesCreated++
      }
    }
  }

  progress(
    'Done',
    `Restored ${result.schemasUpdated + result.schemasCreated} schema(s), ${result.cubesUpdated + result.cubesCreated} cube(s)`
  )
  return result
}

// ============================================================================
// Sync Logic
// ============================================================================

/** Sanitize a connection name for use as a directory name. */
function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
}

/** Generate README.md content listing all synced files. */
function generateReadme(
  syncedConnections: Array<{
    name: string
    schemas: Array<{ name: string }>
    cubes: Array<{ name: string; title: string | null }>
    dashboards: Array<{ name: string }>
  }>
): string {
  const lines: string[] = [
    '# Drizby Schemas, Cubes & Dashboards',
    '',
    '> This repository is managed by [Drizby](https://github.com/cliftonc/drizby). Do not edit files directly — changes will be overwritten on the next sync.',
    '',
  ]

  for (const conn of syncedConnections) {
    const safeName = sanitizeName(conn.name)
    lines.push(`## Connection: ${conn.name}`, '')

    if (conn.schemas.length > 0) {
      lines.push('### Schemas', '')
      for (const s of conn.schemas) {
        lines.push(`- [\`schemas/${safeName}/${s.name}\`](schemas/${safeName}/${s.name})`)
      }
      lines.push('')
    }

    if (conn.cubes.length > 0) {
      lines.push('### Cubes', '')
      for (const c of conn.cubes) {
        const label = c.title ? `${c.name} — ${c.title}` : c.name
        lines.push(`- [\`cubes/${safeName}/${c.name}\`](cubes/${safeName}/${c.name}) ${label}`)
      }
      lines.push('')
    }

    if (conn.dashboards.length > 0) {
      lines.push('### Dashboards', '')
      for (const d of conn.dashboards) {
        lines.push(`- [\`dashboards/${safeName}/${d.name}\`](dashboards/${safeName}/${d.name})`)
      }
      lines.push('')
    }
  }

  lines.push('---', '*Managed by [Drizby](https://github.com/cliftonc/drizby)*', '')

  return lines.join('\n')
}

/** Compute the git blob SHA for a string (same hash git uses for blob objects). */
function gitBlobSha(content: string): string {
  const buf = Buffer.from(content, 'utf-8')
  const header = `blob ${buf.length}\0`
  return crypto.createHash('sha1').update(header).update(buf).digest('hex')
}

/** Managed path prefixes — files under these are fully replaced on each sync. */
const MANAGED_PREFIXES = ['schemas/', 'cubes/', 'dashboards/', 'README.md']

function isManagedPath(path: string): boolean {
  return MANAGED_PREFIXES.some(p => path === p || path.startsWith(p))
}

/**
 * Create a Git commit that fully replaces managed files (schemas/, cubes/, README.md)
 * while preserving any other files in the repo. Handles renames and deletes.
 */
async function createGitCommit(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  headSha: string,
  baseTreeSha: string,
  message: string,
  progress: SyncProgressFn = () => {}
): Promise<string> {
  // Get the current tree (recursive) to preserve non-managed files
  progress('Reading tree', 'Fetching current repo contents')
  const { data: currentTree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: baseTreeSha,
    recursive: 'true',
  })

  // Build a map of existing blob SHAs by path
  const existingShas = new Map<string, string>()
  const treeItems: Array<{
    path: string
    mode: '100644' | '100755' | '040000' | '160000' | '120000'
    type: 'blob' | 'tree' | 'commit'
    sha: string
  }> = []

  for (const item of currentTree.tree) {
    if (!item.path || !item.sha || item.type !== 'blob') continue
    if (isManagedPath(item.path)) {
      existingShas.set(item.path, item.sha)
    } else {
      // Keep non-managed files
      treeItems.push({
        path: item.path,
        mode: (item.mode ?? '100644') as any,
        type: 'blob',
        sha: item.sha,
      })
    }
  }

  // Add managed files — only upload if content changed
  let uploaded = 0
  let skipped = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const localSha = gitBlobSha(file.content)
    const remoteSha = existingShas.get(file.path)

    if (remoteSha && remoteSha === localSha) {
      // Unchanged — reuse existing blob
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: remoteSha })
      skipped++
      progress('Unchanged', `[${i + 1}/${files.length}] ${file.path}`)
    } else {
      progress('Uploading', `[${i + 1}/${files.length}] ${file.path}`)
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content, 'utf-8').toString('base64'),
        encoding: 'base64',
      })
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
      uploaded++
    }
  }

  if (uploaded === 0) {
    progress('No changes', 'All files are up to date')
    return headSha // Nothing to commit
  }

  progress('Creating tree', `${uploaded} changed, ${skipped} unchanged`)
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: treeItems,
  })

  progress('Creating commit', tree.sha.slice(0, 7))
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [headSha],
  })

  progress('Updating ref', `heads/${branch} → ${commit.sha.slice(0, 7)}`)
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.sha,
  })

  return commit.sha
}

export type SyncProgressFn = (step: string, detail?: string) => void

export interface SyncResult {
  success: boolean
  commitSha?: string
  error?: string
  filesCount: number
}

/**
 * Sync all schema files and cube definitions to GitHub.
 * Uses the Git Trees API for atomic commits.
 */
export async function syncToGitHub(
  db: DrizzleDatabase,
  onProgress?: SyncProgressFn
): Promise<SyncResult> {
  const progress = onProgress ?? (() => {})
  // Load sync config
  const [syncConf] = await (db as any)
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))
  if (!syncConf) throw new Error('No sync configuration found')

  const config = await getAppConfig(db)
  if (!config) throw new Error('GitHub App not configured')

  progress('Preparing sync', `${syncConf.repoOwner}/${syncConf.repoName}:${syncConf.branch}`)

  // Mark as in progress
  await (db as any)
    .update(githubSyncConfig)
    .set({ lastSyncStatus: 'in_progress', lastSyncError: null, updatedAt: new Date() })
    .where(eq(githubSyncConfig.id, syncConf.id))

  try {
    progress('Authenticating', 'Generating installation token')
    const octokit = await getInstallationOctokit(
      config.appId,
      config.privateKey,
      syncConf.installationId
    )

    const owner = syncConf.repoOwner
    const repo = syncConf.repoName
    const branch = syncConf.branch

    progress('Loading data', 'Fetching connections, schemas, and cubes')
    const allConnections = await (db as any)
      .select()
      .from(connections)
      .where(and(eq(connections.organisationId, 1), eq(connections.isActive, true)))

    const syncedConnections: Array<{
      name: string
      schemas: Array<{ name: string }>
      cubes: Array<{ name: string; title: string | null }>
      dashboards: Array<{ name: string }>
    }> = []

    const filesToSync: Array<{ path: string; content: string }> = []

    for (const conn of allConnections) {
      const safeName = sanitizeName(conn.name)

      const schemas = await (db as any)
        .select()
        .from(schemaFiles)
        .where(and(eq(schemaFiles.connectionId, conn.id), eq(schemaFiles.organisationId, 1)))

      const cubes = await (db as any)
        .select()
        .from(cubeDefinitions)
        .where(
          and(
            eq(cubeDefinitions.connectionId, conn.id),
            eq(cubeDefinitions.organisationId, 1),
            eq(cubeDefinitions.isActive, true)
          )
        )

      for (const s of schemas) {
        filesToSync.push({
          path: `schemas/${safeName}/${s.name}`,
          content: s.sourceCode,
        })
      }

      for (const c of cubes) {
        if (!c.sourceCode) continue
        filesToSync.push({
          path: `cubes/${safeName}/${c.name}`,
          content: c.sourceCode,
        })
      }

      // Dashboards for this connection
      const connDashboards = await (db as any)
        .select()
        .from(analyticsPages)
        .where(
          and(
            eq(analyticsPages.connectionId, conn.id),
            eq(analyticsPages.organisationId, 1),
            eq(analyticsPages.isActive, true)
          )
        )

      for (const d of connDashboards) {
        const dashName = sanitizeName(d.name)
        filesToSync.push({
          path: `dashboards/${safeName}/${dashName}.json`,
          content: JSON.stringify(d.config, null, 2),
        })
      }

      syncedConnections.push({
        name: conn.name,
        schemas: schemas.map((s: any) => ({ name: s.name })),
        cubes: cubes
          .filter((c: any) => c.sourceCode)
          .map((c: any) => ({ name: c.name, title: c.title })),
        dashboards: connDashboards.map((d: any) => ({ name: `${sanitizeName(d.name)}.json` })),
      })
    }

    // Also include dashboards not tied to a specific connection
    const unlinkedDashboards = await (db as any)
      .select()
      .from(analyticsPages)
      .where(and(eq(analyticsPages.organisationId, 1), eq(analyticsPages.isActive, true)))
    const linkedIds = new Set(syncedConnections.flatMap(c => c.dashboards.map((d: any) => d.name)))
    for (const d of unlinkedDashboards) {
      const dashName = `${sanitizeName(d.name)}.json`
      if (!d.connectionId && !linkedIds.has(dashName)) {
        filesToSync.push({
          path: `dashboards/_shared/${dashName}`,
          content: JSON.stringify(d.config, null, 2),
        })
      }
    }

    // Add README
    filesToSync.push({
      path: 'README.md',
      content: generateReadme(syncedConnections),
    })

    const schemaCount = filesToSync.filter(f => f.path.startsWith('schemas/')).length
    const cubeCount = filesToSync.filter(f => f.path.startsWith('cubes/')).length
    const dashCount = filesToSync.filter(f => f.path.startsWith('dashboards/')).length
    progress(
      'Files collected',
      `${schemaCount} schema(s), ${cubeCount} cube(s), ${dashCount} dashboard(s)`
    )
    const commitMessage = `Sync Drizby schemas, cubes, and dashboards\n\nFiles: ${schemaCount} schema(s), ${cubeCount} cube(s), ${dashCount} dashboard(s)\nSynced at: ${new Date().toISOString()}`

    progress('Checking branch', `heads/${branch}`)
    let headSha: string | null = null
    let baseTreeSha: string | undefined
    try {
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      })
      headSha = refData.object.sha

      const { data: commitData } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: headSha,
      })
      baseTreeSha = commitData.tree.sha
    } catch (err: any) {
      if (err.status !== 404 && err.status !== 409) {
        throw err
      }
    }

    let commitSha: string

    if (!headSha) {
      progress('Empty repository', 'Bootstrapping with initial commit')
      const readmeFile = filesToSync.find(f => f.path === 'README.md')!
      const { data: created } = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'README.md',
        message: 'Initial commit',
        content: Buffer.from(readmeFile.content, 'utf-8').toString('base64'),
        branch,
      })
      headSha = created.commit.sha!

      // Now the repo has a commit — get tree sha and add remaining files
      const { data: commitData } = await octokit.rest.git.getCommit({
        owner,
        repo,
        commit_sha: headSha,
      })
      baseTreeSha = commitData.tree.sha

      const remaining = filesToSync.filter(f => f.path !== 'README.md')
      if (remaining.length > 0) {
        commitSha = await createGitCommit(
          octokit,
          owner,
          repo,
          branch,
          remaining,
          headSha,
          baseTreeSha,
          commitMessage,
          progress
        )
      } else {
        commitSha = headSha
      }
    } else {
      // Normal case — repo has commits
      commitSha = await createGitCommit(
        octokit,
        owner,
        repo,
        branch,
        filesToSync,
        headSha,
        baseTreeSha!,
        commitMessage,
        progress
      )
    }

    progress('Done', `Commit ${commitSha.slice(0, 7)} pushed to ${owner}/${repo}:${branch}`)

    // Update sync config
    await (db as any)
      .update(githubSyncConfig)
      .set({
        lastSyncAt: new Date(),
        lastSyncStatus: 'success',
        lastSyncError: null,
        lastSyncCommitSha: commitSha,
        updatedAt: new Date(),
      })
      .where(eq(githubSyncConfig.id, syncConf.id))

    return {
      success: true,
      commitSha,
      filesCount: filesToSync.length,
    }
  } catch (err: any) {
    const errorMessage = err.message || 'Unknown error during sync'
    await (db as any)
      .update(githubSyncConfig)
      .set({
        lastSyncStatus: 'error',
        lastSyncError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(githubSyncConfig.id, syncConf.id))

    return {
      success: false,
      error: errorMessage,
      filesCount: 0,
    }
  }
}
