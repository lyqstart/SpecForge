import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.property.test.ts"],
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
