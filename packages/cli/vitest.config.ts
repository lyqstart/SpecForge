// 排查卡死指引：如遇测试进程不退出，临时启用 `--reporter=hanging-process` 定位泄漏点
// 示例：bun test --reporter=hanging-process
// 注意：hanging-process reporter 资源开销大，不建议常驻，仅排查时使用

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 3000,
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