import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: [
        'extension/lib/**/*.ts',
        'extension/dashboard/src/stores/**/*.ts',
      ],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@lib': resolve(__dirname, 'extension/lib'),
      '@': resolve(__dirname, 'extension/dashboard/src'),
    },
  },
})
