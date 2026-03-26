/**
 * Filename sanitization for schema files and cube definitions.
 * Ensures names are valid, URL-safe filenames with a .ts extension.
 */

/**
 * Sanitize a name into a valid filename with .ts extension.
 *
 * - Strips any existing extension, then re-adds .ts
 * - Lowercases
 * - Replaces spaces and invalid characters with hyphens
 * - Collapses consecutive hyphens
 * - Trims leading/trailing hyphens
 *
 * Examples:
 *   "Demo Cubes"     → "demo-cubes.ts"
 *   "orders"         → "orders.ts"
 *   "my schema.ts"   → "my-schema.ts"
 *   "  Fancy--Name!" → "fancy-name.ts"
 *   "orders.cube.ts" → "orders-cube.ts"
 */
export function sanitizeFileName(name: string): string {
  // Strip .ts extension if present (handle multiple dots)
  let stem = name.replace(/\.ts$/i, '')

  // Replace dots with hyphens (e.g. "orders.cube" → "orders-cube")
  stem = stem.replace(/\./g, '-')

  // Lowercase, replace non-alphanumeric (except hyphens/underscores) with hyphens
  stem = stem
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-') // collapse multiple hyphens
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens

  if (!stem) {
    stem = 'untitled'
  }

  return `${stem}.ts`
}
