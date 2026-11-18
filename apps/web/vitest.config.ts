import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuses vite.config.ts (aliases, root = src) and adds the test runner setup.
export default mergeConfig(
  viteConfig({ mode: 'test' }),
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./test/setup.ts'],
      include: ['**/*.{test,spec}.{ts,tsx}'],
      css: false,
      coverage: {
        provider: 'v8',
        reportsDirectory: '../coverage',
        include: ['app/**/*.{ts,tsx}'],
      },
    },
  }),
);
