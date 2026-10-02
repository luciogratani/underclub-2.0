import { defineConfig } from 'vitest/config'

// Server tests and pure browser helpers (src/lib): components are never collected.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'src/lib/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
