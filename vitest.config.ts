import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.property.test.ts"],
    // 单测最多 15 秒，防止异步资源泄漏导致进程卡死
    testTimeout: 15000,
    hookTimeout: 5000,
    teardownTimeout: 3000,
    // 进程隔离：单文件资源泄漏不会拖垮整个 bun test（规则 T3）
    pool: "forks",
    coverage: {
      provider: "v8",
      include: [".opencode/tools/**/*.ts", ".opencode/plugins/**/*.ts"],
      exclude: ["node_modules", "dist", "tests"],
    },
  },
  resolve: {
    alias: {
      "@lib": ".opencode/tools/lib",
    },
  },
})
