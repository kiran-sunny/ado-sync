import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/cli.ts',
        'src/commands/**/*.ts',  // CLI commands are integration-tested separately
        'src/**/index.ts',       // Export barrel files
        'src/utils/colors.ts',   // Visual output helpers
        'src/utils/spinner.ts',  // Visual output helpers
        'src/utils/table.ts',    // Visual output helpers
        'src/types/work-item.ts', // Type definitions only
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    setupFiles: ['tests/setup.ts'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
