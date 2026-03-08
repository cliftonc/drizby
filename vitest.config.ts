import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: {
      SANDBOX_TIMEOUT_MS: '2000',
    },
  },
})
