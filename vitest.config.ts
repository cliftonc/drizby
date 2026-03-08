import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    env: {
      SANDBOX_TIMEOUT_MS: '2000',
    },
  },
})
