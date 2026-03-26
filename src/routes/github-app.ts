/**
 * GitHub App integration routes
 * Manages GitHub App configuration, installations, and schema/cube sync
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  analyticsPages,
  cubeDefinitions,
  githubAppConfig,
  githubInstallations,
  githubSyncConfig,
  schemaFiles,
} from '../../schema'
import { maybeEncrypt } from '../auth/encryption'
import { guardPermission } from '../permissions/guard'
import {
  createRepo,
  createTag,
  getAppConfig,
  getAppOctokit,
  listAppInstallations,
  listBranches,
  listInstallationRepos,
  listTags,
  restoreFromRef,
  saveInstallation,
  syncToGitHub,
} from '../services/github-app'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// Admin-only guard for all routes
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Settings')
  if (denied) return denied
  await next()
})

/** Resolve base URL for redirect URIs. */
function getBaseUrl(c: any): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '')
  }
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3461'
  const proto = c.req.header('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Mask a secret string, showing only the last 4 chars. */
function maskSecret(value: string): string {
  if (value.length <= 4) return '****'
  return `****${value.slice(-4)}`
}

// ============================================================================
// Config endpoints
// ============================================================================

// GET /api/github-app/config — return current config (masked secrets)
app.get('/config', async c => {
  const db = c.get('db') as any
  const config = await getAppConfig(db)

  if (!config) {
    return c.json({ configured: false, setupUrl: `${getBaseUrl(c)}/api/github-app/callback` })
  }

  return c.json({
    configured: true,
    appId: config.appId,
    appName: config.appName,
    appSlug: config.appSlug,
    clientId: config.clientId,
    hasPrivateKey: true,
    privateKeyHint: maskSecret(config.privateKey),
    hasClientSecret: true,
    clientSecretHint: maskSecret(config.clientSecret),
    hasWebhookSecret: !!config.webhookSecret,
    setupUrl: `${getBaseUrl(c)}/api/github-app/callback`,
  })
})

// PUT /api/github-app/config — save/update GitHub App credentials
app.put('/config', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { appId, appName, privateKey, clientId, clientSecret, webhookSecret } = body

  if (!appId || !privateKey || !clientId || !clientSecret) {
    return c.json(
      { error: 'Missing required fields: appId, privateKey, clientId, clientSecret' },
      422
    )
  }

  // Validate credentials by attempting to authenticate as the app
  try {
    const octokit = getAppOctokit(appId, privateKey)
    const { data: appData } = await octokit.rest.apps.getAuthenticated()
    const resolvedAppName = appName || appData?.name || appId
    const resolvedAppSlug = appData?.slug || null

    // Encrypt secrets before storing
    const encryptedPrivateKey = await maybeEncrypt(privateKey)
    const encryptedClientSecret = await maybeEncrypt(clientSecret)
    const encryptedWebhookSecret = webhookSecret ? await maybeEncrypt(webhookSecret) : null

    // Check if config already exists
    const [existing] = await db
      .select()
      .from(githubAppConfig)
      .where(eq(githubAppConfig.organisationId, 1))

    if (existing) {
      await db
        .update(githubAppConfig)
        .set({
          appId,
          appName: resolvedAppName,
          appSlug: resolvedAppSlug,
          privateKey: encryptedPrivateKey,
          clientId,
          clientSecret: encryptedClientSecret,
          webhookSecret: encryptedWebhookSecret,
          updatedAt: new Date(),
        })
        .where(eq(githubAppConfig.id, existing.id))
    } else {
      await db.insert(githubAppConfig).values({
        appId,
        appName: resolvedAppName,
        privateKey: encryptedPrivateKey,
        clientId,
        clientSecret: encryptedClientSecret,
        webhookSecret: encryptedWebhookSecret,
        organisationId: 1,
      })
    }

    return c.json({ success: true, appName: resolvedAppName })
  } catch (err: any) {
    if (err.status === 401) {
      return c.json(
        { error: 'Invalid GitHub App credentials. Check your App ID and private key.' },
        401
      )
    }
    return c.json({ error: err.message || 'Failed to validate GitHub App credentials' }, 400)
  }
})

// DELETE /api/github-app/config — remove config, installations, and sync config
app.delete('/config', async c => {
  const db = c.get('db') as any

  // Delete sync config first (no FK, manual cleanup)
  await db.delete(githubSyncConfig).where(eq(githubSyncConfig.organisationId, 1))

  // Delete installations (cascades from config FK)
  // Delete config
  await db.delete(githubAppConfig).where(eq(githubAppConfig.organisationId, 1))

  return c.json({ success: true })
})

// ============================================================================
// Installation callback + listing
// ============================================================================

// GET /api/github-app/callback — handle redirect after GitHub App installation
app.get('/callback', async c => {
  const db = c.get('db') as any
  const installationId = c.req.query('installation_id')

  if (!installationId) {
    return c.redirect('/settings/github-app?error=missing_installation_id')
  }

  const config = await getAppConfig(db)
  if (!config) {
    return c.redirect('/settings/github-app?error=not_configured')
  }

  try {
    // Fetch installation details from GitHub
    const octokit = getAppOctokit(config.appId, config.privateKey)
    const { data: installation } = await octokit.rest.apps.getInstallation({
      installation_id: Number(installationId),
    })

    const account = installation.account as { login?: string; type?: string; name?: string } | null
    await saveInstallation(
      db,
      config.id,
      installation.id,
      account?.login ?? account?.name ?? 'unknown',
      account?.type ?? 'Unknown'
    )

    return c.redirect('/settings/github-app?installed=true')
  } catch (err: any) {
    console.error('[github-app] callback error:', err.message)
    return c.redirect('/settings/github-app?error=installation_failed')
  }
})

// GET /api/github-app/installations — list stored installations
app.get('/installations', async c => {
  const db = c.get('db') as any

  const config = await getAppConfig(db)
  if (!config) {
    return c.json({ installations: [] })
  }

  // Return stored installations, but also refresh from GitHub
  try {
    const remoteInstallations = await listAppInstallations(db)

    // Backfill appSlug if missing (for configs created before slug support)
    if (!config.appSlug && remoteInstallations.length > 0 && remoteInstallations[0].appSlug) {
      await db
        .update(githubAppConfig)
        .set({ appSlug: remoteInstallations[0].appSlug, updatedAt: new Date() })
        .where(eq(githubAppConfig.id, config.id))
    }

    // Sync: save any new installations
    for (const inst of remoteInstallations) {
      await saveInstallation(db, config.id, inst.id, inst.account.login, inst.account.type)
    }

    const stored = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.organisationId, 1))

    return c.json({
      installations: stored.map((inst: any) => ({
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
      })),
      appName: config.appName,
    })
  } catch (_err: any) {
    // If GitHub is unreachable, return stored installations
    const stored = await db
      .select()
      .from(githubInstallations)
      .where(eq(githubInstallations.organisationId, 1))

    return c.json({
      installations: stored.map((inst: any) => ({
        id: inst.id,
        installationId: inst.installationId,
        accountLogin: inst.accountLogin,
        accountType: inst.accountType,
      })),
      appName: config.appName,
      warning: 'Could not refresh installations from GitHub',
    })
  }
})

// ============================================================================
// Repository + branch operations
// ============================================================================

// GET /api/github-app/installations/:id/repos — list repos for an installation
app.get('/installations/:id/repos', async c => {
  const db = c.get('db') as any
  const installationId = Number(c.req.param('id'))

  try {
    const repos = await listInstallationRepos(db, installationId)
    return c.json({ repos })
  } catch (err: any) {
    return c.json({ error: err.message }, 400)
  }
})

// POST /api/github-app/installations/:id/repos — create a new repo
app.post('/installations/:id/repos', async c => {
  const db = c.get('db') as any
  const installationId = Number(c.req.param('id'))
  const body = await c.req.json()
  const { org, name, isPrivate } = body

  if (!org || !name) {
    return c.json({ error: 'Missing required fields: org, name' }, 422)
  }

  try {
    const repo = await createRepo(db, installationId, org, name, isPrivate ?? true)
    return c.json({ repo })
  } catch (err: any) {
    return c.json({ error: err.message }, 400)
  }
})

// GET /api/github-app/installations/:id/repos/:owner/:repo/branches
app.get('/installations/:id/repos/:owner/:repo/branches', async c => {
  const db = c.get('db') as any
  const installationId = Number(c.req.param('id'))
  const owner = c.req.param('owner')
  const repo = c.req.param('repo')

  try {
    const branches = await listBranches(db, installationId, owner, repo)
    return c.json({ branches })
  } catch (err: any) {
    return c.json({ error: err.message }, 400)
  }
})

// ============================================================================
// Sync config + push
// ============================================================================

// GET /api/github-app/sync — get current sync config + status
app.get('/sync', async c => {
  const db = c.get('db') as any

  const [syncConf] = await db
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))

  if (!syncConf) {
    return c.json({ configured: false })
  }

  // Check if any files have been updated since last sync
  let hasPendingChanges = !syncConf.lastSyncAt
  if (syncConf.lastSyncAt) {
    const [schemaMax] = await db.select({ latest: max(schemaFiles.updatedAt) }).from(schemaFiles)
    const [cubeMax] = await db
      .select({ latest: max(cubeDefinitions.updatedAt) })
      .from(cubeDefinitions)
    const [dashMax] = await db
      .select({ latest: max(analyticsPages.updatedAt) })
      .from(analyticsPages)
    const lastSync = syncConf.lastSyncAt.getTime()
    if (
      (schemaMax?.latest && new Date(schemaMax.latest).getTime() > lastSync) ||
      (cubeMax?.latest && new Date(cubeMax.latest).getTime() > lastSync) ||
      (dashMax?.latest && new Date(dashMax.latest).getTime() > lastSync)
    ) {
      hasPendingChanges = true
    }
  }

  // Get latest tag (best-effort, don't block on failure)
  let latestTag: string | null = null
  try {
    const tags = await listTags(db)
    if (tags.length > 0) latestTag = tags[0].name
  } catch {
    // Ignore — tag listing may fail if no tags exist
  }

  return c.json({
    configured: true,
    id: syncConf.id,
    installationId: syncConf.installationId,
    repoOwner: syncConf.repoOwner,
    repoName: syncConf.repoName,
    branch: syncConf.branch,
    lastSyncAt: syncConf.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: syncConf.lastSyncStatus,
    lastSyncError: syncConf.lastSyncError,
    lastSyncCommitSha: syncConf.lastSyncCommitSha,
    hasPendingChanges,
    latestTag,
  })
})

// PUT /api/github-app/sync — create or update sync config
app.put('/sync', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { installationId, repoOwner, repoName, branch } = body

  if (!installationId || !repoOwner || !repoName) {
    return c.json({ error: 'Missing required fields: installationId, repoOwner, repoName' }, 422)
  }

  // Check if sync config already exists
  const [existing] = await db
    .select()
    .from(githubSyncConfig)
    .where(eq(githubSyncConfig.organisationId, 1))

  if (existing) {
    await db
      .update(githubSyncConfig)
      .set({
        installationId,
        repoOwner,
        repoName,
        branch: branch || 'main',
        updatedAt: new Date(),
      })
      .where(eq(githubSyncConfig.id, existing.id))
  } else {
    await db.insert(githubSyncConfig).values({
      installationId,
      repoOwner,
      repoName,
      branch: branch || 'main',
      organisationId: 1,
    })
  }

  return c.json({ success: true })
})

// DELETE /api/github-app/sync — remove sync config
app.delete('/sync', async c => {
  const db = c.get('db') as any
  await db.delete(githubSyncConfig).where(eq(githubSyncConfig.organisationId, 1))
  return c.json({ success: true })
})

// POST /api/github-app/sync/push — trigger manual sync via SSE
app.post('/sync/push', async c => {
  const db = c.get('db') as any

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const result = await syncToGitHub(db, (step, detail) => {
          send('progress', { step, detail })
        })

        if (result.success) {
          send('complete', {
            commitSha: result.commitSha,
            filesCount: result.filesCount,
          })
        } else {
          send('error', { message: result.error })
        }
      } catch (err: any) {
        send('error', { message: err.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

// ============================================================================
// Tags
// ============================================================================

// GET /api/github-app/sync/tags — list tags
app.get('/sync/tags', async c => {
  const db = c.get('db') as any
  try {
    const tags = await listTags(db)
    return c.json({ tags })
  } catch (err: any) {
    return c.json({ error: err.message }, 400)
  }
})

// POST /api/github-app/sync/tags — create a new tag
app.post('/sync/tags', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { version } = body

  if (!version) {
    return c.json({ error: 'Missing required field: version' }, 422)
  }

  // Basic semver validation
  const semverish = version.replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+/.test(semverish)) {
    return c.json({ error: 'Version must be semver format (e.g., 1.0.0 or v1.0.0)' }, 422)
  }

  try {
    const tag = await createTag(db, version)
    return c.json({ tag })
  } catch (err: any) {
    return c.json({ error: err.message }, 400)
  }
})

// ============================================================================
// Restore
// ============================================================================

// POST /api/github-app/sync/restore — restore from a tag via SSE
app.post('/sync/restore', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { ref } = body

  if (!ref) {
    return c.json({ error: 'Missing required field: ref' }, 422)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const result = await restoreFromRef(db, ref, (step, detail) => {
          send('progress', { step, detail })
        })
        send('complete', { ...result })
      } catch (err: any) {
        send('error', { message: err.message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

export default app
