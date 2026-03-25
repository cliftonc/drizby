/**
 * Magic link authentication
 * HMAC-SHA256 signed email tokens with 15min expiry
 */

import crypto from 'node:crypto'
import type { DrizzleDatabase } from 'drizzle-cube/server'
import { and, eq } from 'drizzle-orm'
import { magicLinkTokens, users } from '../../schema'

const MAGIC_LINK_EXPIRY_MINUTES = 15

export function getMagicLinkSecret(): string {
  const secret = process.env.MAGIC_LINK_SECRET || process.env.ENCRYPTION_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[FATAL] Neither MAGIC_LINK_SECRET nor ENCRYPTION_SECRET is set. The server cannot send magic links in production without a stable secret. Set the MAGIC_LINK_SECRET environment variable.'
      )
    }
    return 'drizby-magic-link-default-secret'
  }
  return secret
}

export async function createSignedToken(email: string, secret: string): Promise<string> {
  const timestamp = Date.now()
  const expiry = timestamp + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000

  const payload = JSON.stringify({ email, timestamp, expiry })

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const payloadB64 = Buffer.from(payload).toString('base64url')
  const signatureB64 = Buffer.from(new Uint8Array(signature)).toString('base64url')

  return `${payloadB64}.${signatureB64}`
}

export async function verifySignedToken(
  token: string,
  secret: string
): Promise<{ email: string; expiry: number } | null> {
  try {
    const [payloadB64, signatureB64] = token.split('.')
    if (!payloadB64 || !signatureB64) return null

    const payload = Buffer.from(payloadB64, 'base64url').toString()
    const signature = Buffer.from(signatureB64, 'base64url')

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const isValid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payload))
    if (!isValid) return null

    const data = JSON.parse(payload)
    if (Date.now() > data.expiry) return null

    return data
  } catch {
    return null
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function storeMagicLinkToken(
  db: DrizzleDatabase,
  email: string,
  signedToken: string
): Promise<void> {
  const d = db as any
  const hashedId = hashToken(signedToken)

  // Find existing user
  const [existingUser] = await d.select().from(users).where(eq(users.email, email))

  // Delete any existing magic link tokens for this email
  await d.delete(magicLinkTokens).where(eq(magicLinkTokens.email, email))

  // Store new token
  await d.insert(magicLinkTokens).values({
    id: hashedId,
    email,
    userId: existingUser?.id ?? null,
    expiresAt: new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000),
  })
}

export type MagicLinkVerifyResult =
  | { success: true; userId: number; email: string; isNewUser: boolean }
  | { success: false; reason: 'expired' | 'invalid' | 'already_used' }

export async function verifyAndConsumeMagicLink(
  db: DrizzleDatabase,
  signedToken: string,
  secret: string
): Promise<MagicLinkVerifyResult> {
  const tokenData = await verifySignedToken(signedToken, secret)
  if (!tokenData) {
    // Check if expired vs invalid
    try {
      const [payloadB64] = signedToken.split('.')
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
        if (payload.expiry && Date.now() > payload.expiry) {
          return { success: false, reason: 'expired' }
        }
      }
    } catch {}
    return { success: false, reason: 'invalid' }
  }

  const d = db as any
  const hashedId = hashToken(signedToken)

  // Atomically delete to prevent double-use
  const result = await d
    .delete(magicLinkTokens)
    .where(and(eq(magicLinkTokens.id, hashedId), eq(magicLinkTokens.email, tokenData.email)))
    .returning()

  if (result.length === 0) {
    return { success: false, reason: 'already_used' }
  }

  // Find or create user
  const [existingUser] = await d.select().from(users).where(eq(users.email, tokenData.email))

  if (existingUser) {
    return { success: true, userId: existingUser.id, email: tokenData.email, isNewUser: false }
  }

  // Create new user
  const { count } = await import('drizzle-orm')
  const { getAutoAcceptDomains, isEmailAutoAccepted } = await import('../services/oauth-settings')
  const [{ value: userCount }] = await d.select({ value: count() }).from(users)
  let role = 'user'
  if (userCount === 0) {
    role = 'admin'
  } else {
    const autoAcceptDomains = await getAutoAcceptDomains(db)
    if (isEmailAutoAccepted(tokenData.email, autoAcceptDomains)) {
      role = 'member'
    }
  }
  const [newUser] = await d
    .insert(users)
    .values({
      email: tokenData.email,
      username: tokenData.email.split('@')[0],
      name: tokenData.email.split('@')[0],
      role,
      organisationId: 1,
    })
    .returning()

  return { success: true, userId: newUser.id, email: tokenData.email, isNewUser: true }
}
