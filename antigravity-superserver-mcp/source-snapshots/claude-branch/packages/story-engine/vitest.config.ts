import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec,parallel-tests}.ts'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      'shared-types-snapshot': resolve(__dirname, '../shared-types/src/index.ts'),
    },
  },
});
