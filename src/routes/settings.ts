/**
 * Settings API routes
 * Manages AI provider configuration
 */

import crypto from 'node:crypto'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, count, eq } from 'drizzle-orm'
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
  scimTokens,
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

// GET /api/settings/features — readable by all authenticated users
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

// Admin-only guard for all remaining settings routes
app.use('*', async (c, next) => {
  const denied = guardPermission(c, 'manage', 'Settings')
  if (denied) return denied
  await next()
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
    saml: {
      enabled: map.saml_enabled === 'true',
      idpMetadataUrl: map.saml_idp_metadata_url
        ? await maybeDecrypt(map.saml_idp_metadata_url)
        : '',
      hasIdpMetadataXml: !!(map.saml_idp_metadata_xml
        ? await maybeDecrypt(map.saml_idp_metadata_xml)
        : ''),
      spEntityId: map.saml_sp_entity_id || `${baseUrl}/api/auth/saml/metadata`,
      hasCertificate: !!(map.saml_certificate ? await maybeDecrypt(map.saml_certificate) : ''),
      certificateHint: map.saml_certificate
        ? `****${(await maybeDecrypt(map.saml_certificate)).slice(-20)}`
        : '',
      attributeMapping: map.saml_attribute_mapping
        ? JSON.parse(map.saml_attribute_mapping)
        : { email: 'email', name: 'name', groups: 'groups' },
      metadataUrl: `${baseUrl}/api/auth/saml/metadata`,
      callbackUrl: `${baseUrl}/api/auth/saml/callback`,
    },
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

  // SAML
  if (body.saml !== undefined) {
    const saml = body.saml as {
      enabled?: boolean
      idpMetadataUrl?: string
      idpMetadataXml?: string
      spEntityId?: string
      certificate?: string
      attributeMapping?: { email?: string; name?: string; groups?: string }
    }

    await upsertSetting(
      'saml_enabled',
      saml.enabled !== undefined ? String(saml.enabled) : undefined
    )
    await upsertSetting(
      'saml_idp_metadata_url',
      saml.idpMetadataUrl !== undefined
        ? saml.idpMetadataUrl
          ? await maybeEncrypt(saml.idpMetadataUrl)
          : ''
        : undefined
    )
    await upsertSetting(
      'saml_idp_metadata_xml',
      saml.idpMetadataXml !== undefined
        ? saml.idpMetadataXml
          ? await maybeEncrypt(saml.idpMetadataXml)
          : ''
        : undefined
    )
    await upsertSetting('saml_sp_entity_id', saml.spEntityId)
    await upsertSetting(
      'saml_certificate',
      saml.certificate !== undefined
        ? saml.certificate
          ? await maybeEncrypt(saml.certificate)
          : ''
        : undefined
    )
    if (saml.attributeMapping !== undefined) {
      await upsertSetting('saml_attribute_mapping', JSON.stringify(saml.attributeMapping))
    }
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
  await db.delete(scimTokens)
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

// ---------------------------------------------------------------------------
// SCIM token management
// ---------------------------------------------------------------------------

// GET /api/settings/scim — SCIM config and token list
app.get('/scim', async c => {
  const db = c.get('db') as any

  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(eq(settings.organisationId, 1)))
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const tokens = await db
    .select({
      id: scimTokens.id,
      name: scimTokens.name,
      createdAt: scimTokens.createdAt,
      lastUsedAt: scimTokens.lastUsedAt,
    })
    .from(scimTokens)
    .where(eq(scimTokens.organisationId, 1))

  const [{ value: provisionedCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.organisationId, 1), eq(users.scimProvisioned, true)))

  const baseUrl = (process.env.APP_URL || 'http://localhost:3461').replace(/\/$/, '')

  return c.json({
    enabled: map.scim_enabled === 'true',
    endpointUrl: `${baseUrl}/scim/v2`,
    tokens,
    provisionedUserCount: provisionedCount,
  })
})

// PUT /api/settings/scim — enable/disable SCIM
app.put('/scim', async c => {
  const db = c.get('db') as any
  const body = await c.req.json()
  const { enabled } = body as { enabled?: boolean }

  if (enabled !== undefined) {
    const existing = await db
      .select()
      .from(settings)
      .where(and(eq(settings.key, 'scim_enabled'), eq(settings.organisationId, 1)))
    if (existing.length > 0) {
      await db
        .update(settings)
        .set({ value: String(enabled), updatedAt: new Date() })
        .where(and(eq(settings.key, 'scim_enabled'), eq(settings.organisationId, 1)))
    } else {
      await db
        .insert(settings)
        .values({ key: 'scim_enabled', value: String(enabled), organisationId: 1 })
    }
  }

  return c.json({ success: true })
})

// POST /api/settings/scim/tokens — generate a new SCIM token
app.post('/scim/tokens', async c => {
  const db = c.get('db') as any
  const auth = c.get('auth') as any
  const body = await c.req.json()
  const { name } = body as { name: string }

  if (!name) return c.json({ error: 'Token name is required' }, 400)

  // Generate a random token
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const tokenId = crypto.randomBytes(16).toString('hex')

  await db.insert(scimTokens).values({
    id: tokenId,
    name,
    tokenHash,
    createdBy: auth?.userId,
    organisationId: 1,
  })

  // Return the raw token — this is the only time it's visible
  return c.json(
    {
      id: tokenId,
      name,
      token: rawToken,
      createdAt: new Date().toISOString(),
    },
    201
  )
})

// DELETE /api/settings/scim/tokens/:id — revoke a SCIM token
app.delete('/scim/tokens/:id', async c => {
  const db = c.get('db') as any
  const tokenId = c.req.param('id')

  await db
    .delete(scimTokens)
    .where(and(eq(scimTokens.id, tokenId), eq(scimTokens.organisationId, 1)))

  return c.json({ success: true })
})

export default app
