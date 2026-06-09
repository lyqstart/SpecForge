import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    },
    testTimeout: 10000,
    hookTimeout: 30000,
    teardownTimeout: 3000,
    // 规则 T2/T4（进程隔离 + 防卡死兜底）：见 docs/engineering-lessons/universal/async-resource-lifecycle.md
    pool: 'forks',
    // 排查测试卡死：临时加 `bun test --reporter=hanging-process` 定位未关的句柄/timer
    // 不建议常驻（resource-intensive）；详见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md JS6
    setupFiles: ['./tests/setup.ts'],
    // Vitest 4: poolOptions moved to top-level
    singleFork: true,
    isolate: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
});