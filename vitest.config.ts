import { defineConfig } from 'vitest/config';

// Unit tests run in plain node against main-process logic and shared types.
// No Electron here — anything needing the real app belongs in e2e/ (Playwright).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    reporters: 'default',
    testTimeout: 10_000,
  },
});
