/**
 * Settings API routes
 * Manages AI provider configuration
 */

import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { invalidateCubeAppCache } from '../../app'
import {
  analyticsPages,
  connections,
  contentGroupVisibility,
  cubeDefinitions,
  emailVerificationTokens,
  groupTypes,
  groups,
  magicLinkTokens,
  notebooks,
  oauthAccounts,
  passwordResetTokens,
  schemaFiles,
  settings,
  userGroups,
  userSessions,
  users,
} from '../../schema'
import { maybeDecrypt, maybeEncrypt } from '../auth/encryption'
import { guardPermission } from '../permissions/guard'
import { getAISettings } from '../services/ai-settings'
import { connectionManager } from '../services/connection-manager'
import { clearDemoData, seedDemoInternalData } from './seed-demo-config'

interface Variables {
  db: DrizzleDatabase
  auth?: { userId: number; user: any }
}

const app = new Hono<{ Variables: Variables }>()

// Admin-only guard
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Settings')
  if (denied) return denied
  await next()
})

// GET /api/settings/features — return server feature flags
app.get('/features', async c => {
  const db = c.get('db') as any
  const rows = await db.select().from(settings).where(eq(settings.organisationId, 1))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return c.json({
    mcpEnabled: map.mcp_enabled === 'true',
    appUrl: process.env.APP_URL || '',
    brandName: map.brand_name || '',
    brandLogoUrl: map.brand_logo_url || '',
  })
})

// PUT /api/settings/features — update server feature flags
app.put('/features', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { mcpEnabled, brandName, brandLogoUrl } = body as {
    mcpEnabled?: boolean
    brandName?: string
    brandLogoUrl?: string
  }

  const pairs: [string, string | undefined][] = [
    ['mcp_enabled', mcpEnabled !== undefined ? String(mcpEnabled) : undefined],
    ['brand_name', brandName],
    ['brand_logo_url', brandLogoUrl],
  ]

  for (const [key, value] of pairs) {
    if (value === undefined) continue

    if (value === '') {
      await db.delete(settings).where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
    } else {
      const existing = await db
        .select()
        .from(settings)
        .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value, updatedAt: new Date() })
          .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      } else {
        await db.insert(settings).values({ key, value, organisationId: 1 })
      }
    }
  }

  invalidateCubeAppCache()
  return c.json({ success: true })
})

// GET /api/settings/ai — return AI config with masked API key
app.get('/ai', async c => {
  const db = c.get('db') as any
  const ai = await getAISettings(db)

  return c.json({
    provider: ai.provider || '',
    model: ai.model || '',
    baseUrl: ai.baseUrl || '',
    hasApiKey: !!ai.apiKey,
    apiKeyHint: ai.apiKey ? `****${ai.apiKey.slice(-4)}` : '',
  })
})

// PUT /api/settings/ai — upsert AI config
app.put('/ai', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { provider, apiKey, model, baseUrl } = body as {
    provider?: string
    apiKey?: string
    model?: string
    baseUrl?: string
  }

  // Encrypt the API key before storing
  const encryptedApiKey = apiKey ? await maybeEncrypt(apiKey) : apiKey

  const pairs: [string, string | undefined][] = [
    ['ai_provider', provider],
    ['ai_api_key', encryptedApiKey],
    ['ai_model', model],
    ['ai_base_url', baseUrl],
  ]

  for (const [key, value] of pairs) {
    if (value === undefined) continue

    if (value === '') {
      // Delete the row
      await db.delete(settings).where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
    } else {
      // Upsert
      const existing = await db
        .select()
        .from(settings)
        .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value, updatedAt: new Date() })
          .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      } else {
        await db.insert(settings).values({
          key,
          value,
          organisationId: 1,
        })
      }
    }
  }

  invalidateCubeAppCache()

  return c.json({ success: true })
})

// GET /api/settings/oauth — return OAuth provider configs with masked secrets
app.get('/oauth', async c => {
  const db = c.get('db') as any

  // Read all settings at once
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(eq(settings.organisationId, 1))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const baseUrl = (process.env.APP_URL || 'http://localhost:3461').replace(/\/$/, '')

  async function providerConfig(provider: string, envPrefix: string) {
    const rawClientId = map[`oauth_${provider}_client_id`] || ''
    const rawClientSecret = map[`oauth_${provider}_client_secret`] || ''

    const clientId =
      (rawClientId ? await maybeDecrypt(rawClientId) : '') ||
      process.env[`${envPrefix}_CLIENT_ID`] ||
      ''
    const clientSecret =
      (rawClientSecret ? await maybeDecrypt(rawClientSecret) : '') ||
      process.env[`${envPrefix}_CLIENT_SECRET`] ||
      ''
    const enabled = map[`oauth_${provider}_enabled`] !== 'false' && !!clientId && !!clientSecret
    const redirectUri =
      process.env[`${envPrefix}_REDIRECT_URI`] || `${baseUrl}/api/auth/${provider}/callback`
    return {
      enabled,
      clientId,
      hasClientSecret: !!clientSecret,
      clientSecretHint: clientSecret ? `****${clientSecret.slice(-4)}` : '',
      redirectUri,
    }
  }

  return c.json({
    google: await providerConfig('google', 'GOOGLE'),
    github: await providerConfig('github', 'GITHUB'),
    gitlab: await providerConfig('gitlab', 'GITLAB'),
    microsoft: {
      ...(await providerConfig('microsoft', 'MICROSOFT')),
      tenantId: map.oauth_microsoft_tenant_id || process.env.MICROSOFT_TENANT_ID || 'common',
    },
    slack: await providerConfig('slack', 'SLACK'),
    magicLink: {
      enabled: map.magic_link_enabled === 'true',
    },
    password: {
      enabled: map.password_auth_enabled !== 'false',
    },
    autoAcceptEmailDomains: map.auto_accept_email_domains || '',
  })
})

// PUT /api/settings/oauth — upsert OAuth provider config
app.put('/oauth', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()

  // Helper to upsert settings key-value pairs
  async function upsertSetting(key: string, value: string | undefined) {
    if (value === undefined) return
    if (value === '') {
      await db.delete(settings).where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
    } else {
      const existing = await db
        .select()
        .from(settings)
        .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value, updatedAt: new Date() })
          .where(and(eq(settings.key, key), eq(settings.organisationId, 1)))
      } else {
        await db.insert(settings).values({ key, value, organisationId: 1 })
      }
    }
  }

  // Process each provider
  const providers = ['google', 'github', 'gitlab', 'microsoft', 'slack'] as const
  const envPrefixes: Record<string, string> = {
    google: 'GOOGLE',
    github: 'GITHUB',
    gitlab: 'GITLAB',
    microsoft: 'MICROSOFT',
    slack: 'SLACK',
  }

  for (const provider of providers) {
    const providerData = body[provider] as
      | {
          enabled?: boolean
          clientId?: string
          clientSecret?: string
          tenantId?: string
        }
      | undefined

    if (!providerData) continue

    // If enabling, validate credentials
    if (providerData.enabled === true) {
      const existingRows = await db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(eq(settings.organisationId, 1))
      const map: Record<string, string> = {}
      for (const r of existingRows) map[r.key] = r.value

      const prefix = envPrefixes[provider]
      const finalClientId =
        providerData.clientId ??
        map[`oauth_${provider}_client_id`] ??
        process.env[`${prefix}_CLIENT_ID`] ??
        ''
      const finalClientSecret =
        providerData.clientSecret !== undefined
          ? providerData.clientSecret
          : (map[`oauth_${provider}_client_secret`] ?? process.env[`${prefix}_CLIENT_SECRET`] ?? '')

      if (!finalClientId || !finalClientSecret) {
        return c.json(
          { error: `Client ID and Client Secret are required to enable ${provider} OAuth` },
          400
        )
      }
    }

    await upsertSetting(
      `oauth_${provider}_enabled`,
      providerData.enabled !== undefined ? String(providerData.enabled) : undefined
    )
    await upsertSetting(`oauth_${provider}_client_id`, providerData.clientId)
    // Encrypt the client secret before storing
    const encryptedSecret = providerData.clientSecret
      ? await maybeEncrypt(providerData.clientSecret)
      : providerData.clientSecret
    await upsertSetting(`oauth_${provider}_client_secret`, encryptedSecret)

    // Microsoft-specific: tenant ID
    if (provider === 'microsoft' && providerData.tenantId !== undefined) {
      await upsertSetting('oauth_microsoft_tenant_id', providerData.tenantId)
    }
  }

  // Magic link
  if (body.magicLink !== undefined) {
    const { enabled } = body.magicLink as { enabled?: boolean }
    if (enabled !== undefined) {
      await upsertSetting('magic_link_enabled', String(enabled))
    }
  }

  // Password auth
  if (body.password !== undefined) {
    const { enabled } = body.password as { enabled?: boolean }
    if (enabled !== undefined) {
      await upsertSetting('password_auth_enabled', String(enabled))
    }
  }

  // Auto-accept email domains
  if (body.autoAcceptEmailDomains !== undefined) {
    await upsertSetting('auto_accept_email_domains', body.autoAcceptEmailDomains as string)
  }

  invalidateCubeAppCache()
  return c.json({ success: true })
})

// POST /api/settings/reseed-demo — delete and recreate demo data only
app.post('/reseed-demo', async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any
  await seedDemoInternalData(db, auth?.userId)
  return c.json({ success: true, message: 'Demo data reseeded successfully.' })
})

// POST /api/settings/clear-demo — remove all demo data without reseeding
app.post('/clear-demo', async c => {
  const db = c.get('db') as any
  await clearDemoData(db)
  return c.json({ success: true, message: 'Demo data cleared.' })
})

// POST /api/settings/factory-reset — wipe all data, delete demo.sqlite, restart auto-seed on next boot
app.post('/factory-reset', async c => {
  const db = c.get('db') as any

  // Tear down all managed connections
  for (const id of connectionManager.getConnectionIds()) {
    await connectionManager.remove(id)
  }
  invalidateCubeAppCache()

  // Delete all rows from every table (order matters for FK constraints)
  await db.delete(emailVerificationTokens)
  await db.delete(magicLinkTokens)
  await db.delete(passwordResetTokens)
  await db.delete(userSessions)
  await db.delete(oauthAccounts)
  await db.delete(contentGroupVisibility)
  await db.delete(userGroups)
  await db.delete(groups)
  await db.delete(groupTypes)
  await db.delete(cubeDefinitions)
  await db.delete(schemaFiles)
  await db.delete(analyticsPages)
  await db.delete(notebooks)
  await db.delete(connections)
  await db.delete(settings)
  await db.delete(users)

  // Delete external data files (demo.sqlite etc.)
  const { readdirSync, unlinkSync } = await import('node:fs')
  const { join } = await import('node:path')
  try {
    const dataDir = 'data'
    for (const file of readdirSync(dataDir)) {
      if (file === 'drizby.sqlite' || file.startsWith('drizby.sqlite-')) continue
      try {
        unlinkSync(join(dataDir, file))
      } catch {}
    }
  } catch {}

  return c.json({
    success: true,
    message: 'Factory reset complete. Restart the server to re-seed demo data.',
  })
})

export default app
