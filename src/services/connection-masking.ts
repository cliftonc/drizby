import { PROVIDERS } from './provider-registry'

const MASK = '••••••'
const SECRET_KEY_PATTERN = /password|secret|token|auth/i

/**
 * Mask sensitive parts of a connection string for safe display.
 * Passwords/secrets are replaced with •••••• — the full string never leaves the server.
 */
export function maskConnectionString(connectionString: string, provider: string | null): string {
  if (!connectionString) return ''

  // 1. Try structured JSON
  try {
    const parsed = JSON.parse(connectionString)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return maskStructured(parsed, provider)
    }
  } catch {
    // Not JSON — continue
  }

  // 2. File paths — no secrets to mask
  if (isFilePath(connectionString)) return connectionString

  // 3. URL-style connection string
  return maskUrl(connectionString)
}

function maskStructured(config: Record<string, unknown>, provider: string | null): string {
  const providerDef = provider ? PROVIDERS.find(p => p.id === provider) : null
  const secretKeys = new Set<string>()

  if (providerDef?.structuredFields) {
    for (const field of providerDef.structuredFields) {
      if (field.secret) secretKeys.add(field.key)
    }
  }

  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (secretKeys.has(key) || (secretKeys.size === 0 && SECRET_KEY_PATTERN.test(key))) {
      masked[key] = MASK
    } else {
      masked[key] = value
    }
  }
  return JSON.stringify(masked)
}

function isFilePath(s: string): boolean {
  if (s.startsWith('file:') || s.startsWith('./') || s.startsWith('/') || s.startsWith('~')) {
    return true
  }
  // No protocol and no @ sign — likely a file path (e.g. "data/demo.db")
  if (!s.includes('://') && !s.includes('@')) return true
  return false
}

function maskUrl(connectionString: string): string {
  // Use regex to replace the password portion in ://user:password@ patterns.
  // Avoids URL constructor which URL-encodes the mask characters (•→%E2%80%A2).
  return connectionString.replace(/(\/\/[^:]*:)([^@]+)(@)/, `$1${MASK}$3`)
}
