import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 3000,
    // 规则 T2/T4（进程隔离 + 防卡死兜底）：见 docs/engineering-lessons/universal/async-resource-lifecycle.md
    // 必须使用 'forks' 而不是 'threads' 来防止资源泄漏导致整个测试套件卡死
    pool: 'forks',
    // 排查测试卡死：临时加 `bun test --reporter=hanging-process` 定位未关的句柄/timer
    // 不建议常驻（resource-intensive）；详见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md JS6
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
