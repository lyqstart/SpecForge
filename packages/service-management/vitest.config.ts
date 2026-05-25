// 卡死时临时启用 `--reporter=hanging-process` 定位未关的句柄/timer
// 不建议常驻（resource-intensive）；详见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md JS6

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 3000,
    // 规则 T2/T4（进程隔离 + 防卡死兜底）：见 docs/engineering-lessons/universal/async-resource-lifecycle.md
    pool: 'forks',
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/property/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: ['src/**/*.d.ts'],
    },
  },
})