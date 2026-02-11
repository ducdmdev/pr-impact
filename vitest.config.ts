import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/tools-core', 'packages/tools', 'packages/action'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/generated/**',
        '**/index.ts',
      ],
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
    },
  },
});
