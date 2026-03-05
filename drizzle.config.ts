import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://dc_bi_user:dc_bi_pass123@localhost:54930/dc_bi_db'
  },
  verbose: true,
  strict: true
})
