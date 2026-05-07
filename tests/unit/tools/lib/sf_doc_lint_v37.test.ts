/**
 * sf_doc_lint V3.7 变更单元测试
 *
 * 测试 sf_doc_lint_core 对 typed verification_commands 的检查行为：
 * - 合法 typed 格式 → pass（无错误）
 * - Legacy 格式 → pass + 警告（与 sf_tasks_gate 一致）
 * - 非法类型键（如 `smoke:`）→ error
 * - 检测到 `invalidTypedKeys` → 每个非法键报 error
 * - 存在 `manual_verification_checks` 字段 → pass（无错误）
 * - 空 `verification_commands` → error
 *
 * 需求：REQ-9 AC-9
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { lintDocument } from "../../../../.opencode/tools/lib/sf_doc_lint_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_doc_lint V3.7 — typed verification_commands", () => {
  const testDir = join(tmpdir(), `specforge-doc-lint-v37-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-V37"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("合法 typed 格式 → pass（无错误）", () => {
    it("should pass with valid typed verification_commands using single commands", async () => {
      const content = `# 任务列表

## Task 1: 实现核心功能

描述内容。

- **verification_commands**:
  - unit: \`bun test tests/unit/core.test.ts\`
  - property: \`bun test tests/property/core.property.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
    })

    it("should pass with valid typed verification_commands using multi-line commands", async () => {
      const content = `# 任务列表

## Task 1: 集成测试

描述内容。

- **verification_commands**:
  - integration:
    - \`bun test tests/integration/flow_a.test.ts\`
    - \`bun test tests/integration/flow_b.test.ts\`
  - e2e: \`bun test tests/e2e/full.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
    })

    it("should pass with all 5 valid verification types", async () => {
      const content = `# 任务列表

## Task 1: 全类型验证

描述内容。

- **verification_commands**:
  - unit: \`bun test tests/unit/a.test.ts\`
  - property: \`bun test tests/property/a.property.test.ts\`
  - integration: \`bun test tests/integration/a.test.ts\`
  - e2e: \`bun test tests/e2e/a.test.ts\`
  - regression: \`bun test tests/regression/a.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
    })
  })

  describe("Legacy 格式 → pass + 警告", () => {
    it("should pass with legacy format but produce a migration warning", async () => {
      const content = `# 任务列表

## Task 1: 旧格式任务

描述内容。

- **verification_commands**:
  - \`bun test tests/unit/foo.test.ts\`
  - \`bun test tests/integration/bar.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
      const warnings = result.issues.filter((i) => i.severity === "warning")
      expect(warnings.length).toBeGreaterThanOrEqual(1)
      expect(warnings.some((w) => w.message.includes("旧格式") || w.message.includes("迁移"))).toBe(true)
    })

    it("should not fail with legacy format — pass/fail semantics unchanged from V3.6", async () => {
      const content = `# 任务列表

## Task 1: Legacy 任务

描述内容。

- **verification_commands**:
  - \`npm run test\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
    })
  })

  describe("非法类型键 → error", () => {
    it("should fail when typed verification_commands contains illegal type key 'smoke'", async () => {
      const content = `# 任务列表

## Task 1: 非法键任务

描述内容。

- **verification_commands**:
  - smoke: \`bun test tests/smoke/a.test.ts\`
  - unit: \`bun test tests/unit/a.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.message.includes("smoke"))).toBe(true)
      expect(errors.some((e) => e.message.includes("非法类型键"))).toBe(true)
    })

    it("should fail when typed verification_commands contains illegal type key 'performance'", async () => {
      const content = `# 任务列表

## Task 1: 性能测试

描述内容。

- **verification_commands**:
  - performance: \`bun test tests/perf/a.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.message.includes("performance"))).toBe(true)
    })
  })

  describe("invalidTypedKeys → 每个非法键报 error", () => {
    it("should report an error for each invalid typed key", async () => {
      const content = `# 任务列表

## Task 1: 多个非法键

描述内容。

- **verification_commands**:
  - smoke: \`bun test tests/smoke/a.test.ts\`
  - load: \`bun test tests/load/a.test.ts\`
  - unit: \`bun test tests/unit/a.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      const errors = result.issues.filter((i) => i.severity === "error")
      // Should have at least 2 errors — one for 'smoke' and one for 'load'
      expect(errors.length).toBeGreaterThanOrEqual(2)
      expect(errors.some((e) => e.message.includes("smoke"))).toBe(true)
      expect(errors.some((e) => e.message.includes("load"))).toBe(true)
    })

    it("should not escape to legacy format when illegal keys are detected", async () => {
      // Even with illegal keys, the format should be detected as "typed" (not legacy)
      // and errors should be reported for the illegal keys
      const content = `# 任务列表

## Task 1: 全非法键

描述内容。

- **verification_commands**:
  - smoke: \`bun test tests/smoke/a.test.ts\`
  - acceptance: \`bun test tests/acceptance/a.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors.length).toBeGreaterThanOrEqual(2)
      // Should NOT produce a legacy migration warning since it's detected as typed
      const legacyWarnings = result.issues.filter(
        (i) => i.severity === "warning" && i.message.includes("旧格式")
      )
      expect(legacyWarnings).toHaveLength(0)
    })
  })

  describe("manual_verification_checks 字段 → pass（无错误）", () => {
    it("should pass when manual_verification_checks is present with valid string list", async () => {
      const content = `# 任务列表

## Task 1: 含人工检查

描述内容。

- **verification_commands**:
  - unit: \`bun test tests/unit/a.test.ts\`
- **manual_verification_checks**:
  - \`确认 src/parser.ts 文件已创建\`
  - \`检查日志输出格式正确\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
    })

    it("should pass when manual_verification_checks coexists with legacy verification_commands", async () => {
      const content = `# 任务列表

## Task 1: Legacy + manual checks

描述内容。

- **verification_commands**:
  - \`bun test tests/unit/a.test.ts\`
- **manual_verification_checks**:
  - \`确认文件已创建\`
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("pass")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors).toHaveLength(0)
    })
  })

  describe("空 verification_commands → error", () => {
    it("should fail when task has no verification_commands field at all", async () => {
      const content = `# 任务列表

## Task 1: 无验证命令

描述内容，这个任务缺少必要的验证字段。
`
      await writeFile(join(specDir, "tasks.md"), content, "utf-8")

      const result = await lintDocument(workItemId, "tasks", testDir)

      expect(result.status).toBe("fail")
      const errors = result.issues.filter((i) => i.severity === "error")
      expect(errors.length).toBeGreaterThanOrEqual(1)
      expect(errors.some((e) => e.message.includes("verification_commands"))).toBe(true)
    })
  })
})
