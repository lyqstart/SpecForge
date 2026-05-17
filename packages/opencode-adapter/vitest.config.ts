import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 5000,
    teardownTimeout: 3000,
    // 规则 T2/T4（进程隔离 + 防卡死兜底）：
    // - pool: 'forks' 让每个测试文件跑在独立子进程，单文件泄漏不会拖垮整个 `bun test`
    // - 框架级 testTimeout 触发后 vitest 会强杀 fork，给资源泄漏一个最后防线
    pool: 'forks',
    // 排查测试卡死：临时加 `bun test --reporter=hanging-process` 定位未关的句柄/timer
    // 不建议常驻（resource-intensive）；详见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md JS6
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts'],
    },
  },
});