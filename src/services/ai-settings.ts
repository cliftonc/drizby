/**
 * AI settings service
 * Reads AI provider config from the settings table and returns AgentConfig-compatible objects
 */

import { eq, and, inArray } from 'drizzle-orm'
import { settings } from '../../schema'
import type { DrizzleDatabase } from 'drizzle-cube/server'

const AI_KEYS = ['ai_provider', 'ai_api_key', 'ai_model', 'ai_base_url'] as const

export async function getAISettings(db: DrizzleDatabase) {
  const rows = await (db as any)
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(and(
      eq(settings.organisationId, 1),
      inArray(settings.key, [...AI_KEYS])
    ))

  const map = new Map(rows.map((r: any) => [r.key, r.value]))

  return {
    provider: (map.get('ai_provider') as 'anthropic' | 'openai' | 'google' | undefined),
    apiKey: map.get('ai_api_key') as string | undefined,
    model: map.get('ai_model') as string | undefined,
    baseUrl: map.get('ai_base_url') as string | undefined,
  }
}

export async function getAIAgentConfig(db: DrizzleDatabase) {
  const ai = await getAISettings(db)

  return {
    allowClientApiKey: true,
    maxTurns: 25,
    ...(ai.provider && { provider: ai.provider }),
    ...(ai.apiKey && { apiKey: ai.apiKey }),
    ...(ai.model && { model: ai.model }),
    ...(ai.baseUrl && { baseURL: ai.baseUrl }),
  }
}
