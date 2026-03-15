/**
 * AES-256-GCM encryption for secrets at rest
 * Uses ENCRYPTION_SECRET env var to derive a 256-bit key via HKDF-SHA256
 */

import crypto from 'node:crypto'

const STATIC_SALT = Buffer.from('drizby-encryption-salt-v1', 'utf8')
const ENC_PREFIX = 'enc:'

let derivedKeyCache: Buffer | null = null
let derivedKeyCacheSecret: string | null = null

async function deriveKey(secret: string): Promise<Buffer> {
  if (derivedKeyCacheSecret === secret && derivedKeyCache) return derivedKeyCache

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: STATIC_SALT, info: new Uint8Array(0) },
    keyMaterial,
    256
  )

  derivedKeyCache = Buffer.from(bits)
  derivedKeyCacheSecret = secret
  return derivedKeyCache
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns `enc:<iv>:<ciphertext>:<authTag>` (all base64url).
 */
export async function encrypt(plaintext: string): Promise<string> {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET is not set')

  const key = await deriveKey(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${ENC_PREFIX}${iv.toString('base64url')}:${encrypted.toString('base64url')}:${authTag.toString('base64url')}`
}

/**
 * Decrypt an `enc:...` string back to plaintext.
 */
export async function decrypt(encrypted: string): Promise<string> {
  const secret = process.env.ENCRYPTION_SECRET
  if (!secret) throw new Error('ENCRYPTION_SECRET is not set')

  if (!encrypted.startsWith(ENC_PREFIX)) throw new Error('Not an encrypted value')

  const parts = encrypted.slice(ENC_PREFIX.length).split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')

  const [ivB64, ciphertextB64, authTagB64] = parts
  const key = await deriveKey(secret)
  const iv = Buffer.from(ivB64, 'base64url')
  const ciphertext = Buffer.from(ciphertextB64, 'base64url')
  const authTag = Buffer.from(authTagB64, 'base64url')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

/**
 * If the value starts with `enc:`, decrypt it; otherwise return as-is.
 * Supports migration from plaintext to encrypted values.
 */
export async function maybeDecrypt(value: string): Promise<string> {
  if (!value.startsWith(ENC_PREFIX)) return value
  return decrypt(value)
}

/**
 * If ENCRYPTION_SECRET is set, encrypt the value; otherwise return plaintext.
 * Graceful degradation for dev environments without encryption configured.
 */
export async function maybeEncrypt(value: string): Promise<string> {
  if (!process.env.ENCRYPTION_SECRET) return value
  return encrypt(value)
}
