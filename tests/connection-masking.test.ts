import { describe, expect, it } from 'vitest'
import { maskConnectionString } from '../src/services/connection-masking'

describe('maskConnectionString', () => {
  it('masks password in postgres URL', () => {
    expect(maskConnectionString('postgresql://user:secret@host:5432/db', null)).toBe(
      'postgresql://user:••••••@host:5432/db'
    )
  })

  it('masks password in mysql URL', () => {
    const result = maskConnectionString('mysql://root:pass123@localhost:3306/mydb', null)
    expect(result).toContain('root')
    expect(result).toContain('localhost')
    expect(result).not.toContain('pass123')
  })

  it('leaves URL without password unchanged', () => {
    expect(maskConnectionString('postgresql://user@host:5432/db', null)).toBe(
      'postgresql://user@host:5432/db'
    )
  })

  it('leaves file paths unchanged', () => {
    expect(maskConnectionString('./data/demo.db', null)).toBe('./data/demo.db')
    expect(maskConnectionString('/absolute/path.db', null)).toBe('/absolute/path.db')
    expect(maskConnectionString('file:./data.db', null)).toBe('file:./data.db')
  })

  it('leaves simple path-like strings unchanged', () => {
    expect(maskConnectionString('data/demo.db', null)).toBe('data/demo.db')
  })

  it('masks secret fields in structured JSON using provider definition', () => {
    const json = JSON.stringify({ account: 'acme', password: 'secret', database: 'mydb' })
    const result = maskConnectionString(json, 'snowflake')
    const parsed = JSON.parse(result)
    expect(parsed.account).toBe('acme')
    expect(parsed.database).toBe('mydb')
    expect(parsed.password).toBe('••••••')
  })

  it('masks secret-looking keys in JSON when provider has no structuredFields', () => {
    const json = JSON.stringify({ host: 'x', password: 'secret', authToken: 'tok' })
    const result = maskConnectionString(json, null)
    const parsed = JSON.parse(result)
    expect(parsed.host).toBe('x')
    expect(parsed.password).toBe('••••••')
    expect(parsed.authToken).toBe('••••••')
  })

  it('returns empty string for empty input', () => {
    expect(maskConnectionString('', null)).toBe('')
  })

  it('handles URL with special characters in password via regex fallback', () => {
    const result = maskConnectionString('databend://user:p@ss@host:8000/db', null)
    expect(result).not.toContain('p@ss')
    expect(result).toContain('user')
    expect(result).toContain('host')
  })
})
