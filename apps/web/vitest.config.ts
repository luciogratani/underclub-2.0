import { defineConfig } from 'vitest/config'

// Server tests only: the UI is never collected.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
