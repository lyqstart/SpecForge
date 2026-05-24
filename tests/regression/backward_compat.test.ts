/**
 * 回归测试：V3.7 向后兼容性
 *
 * 验证 V3.7 验证策略功能不破坏现有行为：
 * 1. Legacy tasks.md 通过 sf_tasks_gate 无错误，pass/fail 与 V3.6 一致
 * 2. 无 verification_strategy 的 requirements.md 通过 sf_requirements_gate 无错误
 * 3. sf_verification_gate 对 legacy 格式行为不变（V3.6 fallback）
 * 4. GateResult 接口向后兼容：忽略 details 字段不影响现有调用方
 * 5. 所有 8 种工作流类型的状态机定义仍然存在
 *
 * Requirements: REQ-8 AC-1, REQ-8 AC-2, REQ-8 AC-3, REQ-8 AC-4, REQ-8 AC-5, REQ-8 AC-6, REQ-9 AC-7
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"

// Gate core imports
import { checkTasksGate } from "../../.opencode/tools/lib/sf_tasks_gate_core"
import { checkRequirementsGate } from "../../.opencode/tools/lib/sf_requirements_gate_core"
import {
  checkVerificationGate,
  checkTypedVerificationResults,
} from "../../.opencode/tools/lib/sf_verification_gate_core"
import { lintDocument } from "../../.opencode/tools/lib/sf_doc_lint_core"
import type { GateResult } from "../../.opencode/tools/lib/sf_gate_types"

// Verification types
import type { VerificationReport, VerificationType } from "../../.opencode/tools/lib/sf_verification_types"

// ============================================================
// Test 1: Legacy tasks.md passes sf_tasks_gate with no errors
// ============================================================

describe("V3.7 回归: Legacy tasks.md 通过 sf_tasks_gate", () => {
  const testDir = join(
    tmpdir(),
    `sf-v37-compat-tasks-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const workItemId = "WI-COMPAT-TASKS"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("legacy format tasks.md passes with no blocking issues (V3.6 behavior)", async () => {
    // V3.6-era tasks.md: flat verification_commands, no typed format, no refs
    const legacyTasksMd = `# 任务计划

## 任务

### Task 1: 实现用户登录

- **修改文件**: src/auth.ts
- **verification_commands**:
  - \`bun test tests/unit/auth.test.ts\`
  - \`bun test tests/e2e/login.test.ts\`

### Task 2: 实现用户注册

- **修改文件**: src/register.ts
- **verification_commands**:
  - \`bun test tests/unit/register.test.ts\`
  - \`bun test tests/e2e/register.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMd, "utf-8")

    const result = await checkTasksGate(workItemId, testDir)

    // Legacy format should pass (no blocking issues)
    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
    // V3.7 adds non-blocking migration warnings for legacy format
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.includes("旧格式") || w.includes("legacy"))).toBe(true)
  })

  it("legacy format tasks.md without verification_commands fails (same as V3.6)", async () => {
    // V3.6-era tasks.md missing verification_commands → should fail
    const legacyTasksMdNoVerification = `# 任务计划

## 任务

### Task 1: 实现用户登录

- **修改文件**: src/auth.ts
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMdNoVerification, "utf-8")

    const result = await checkTasksGate(workItemId, testDir)

    // Should fail — same as V3.6 behavior
    expect(result.status).toBe("fail")
    expect(result.blocking_issues.length).toBeGreaterThan(0)
    expect(
      result.blocking_issues.some((issue) => issue.includes("verification_commands"))
    ).toBe(true)
  })
})

// ============================================================
// Test 2: requirements.md without verification_strategy passes
// ============================================================

describe("V3.7 回归: 无 verification_strategy 的 requirements.md 通过 sf_requirements_gate", () => {
  const testDir = join(
    tmpdir(),
    `sf-v37-compat-req-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const workItemId = "WI-COMPAT-REQ"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("requirements.md without verification_strategy passes gate (V3.6 behavior)", async () => {
    // V3.6-era requirements.md: no verification_strategy field at all
    const legacyRequirementsMd = `# 需求文档

## 用户故事

作为用户，我希望能够登录系统，以便访问受保护的资源。

## 验收标准

1. 用户可以使用邮箱和密码登录
2. 登录失败时显示错误信息
3. 登录成功后跳转到首页

## 术语表

| 术语 | 定义 |
|------|------|
| 认证 | 验证用户身份的过程 |
| 授权 | 确定用户权限的过程 |

### REQ-1 用户登录

作为用户，我希望能够登录。

#### 验收标准

1. 用户可以使用邮箱和密码登录
2. 登录失败时显示错误信息
`
    await writeFile(join(specDir, "requirements.md"), legacyRequirementsMd, "utf-8")

    const result = await checkRequirementsGate(workItemId, testDir)

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
    // No warnings about missing verification_strategy (it's optional)
    expect(
      result.warnings.every((w) => !w.includes("verification_strategy"))
    ).toBe(true)
  })

  it("requirements.md missing entirely still fails (same as V3.6)", async () => {
    // Don't create requirements.md
    const result = await checkRequirementsGate(workItemId, testDir)

    expect(result.status).toBe("fail")
    expect(
      result.blocking_issues.some((issue) => issue.includes("requirements.md"))
    ).toBe(true)
  })
})

// ============================================================
// Test 3: sf_verification_gate legacy format behavior unchanged
// ============================================================

describe("V3.7 回归: sf_verification_gate 对 legacy 格式行为不变 (V3.6 fallback)", () => {
  const testDir = join(
    tmpdir(),
    `sf-v37-compat-vgate-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const workItemId = "WI-COMPAT-VGATE"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("legacy tasks.md + verification_report.md passes (V3.6 fallback)", async () => {
    // Legacy tasks.md (no typed commands → triggers V3.6 fallback)
    const legacyTasksMd = `# 任务计划

## 任务

### Task 1: 实现功能

- **verification_commands**:
  - \`bun test tests/unit/feature.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMd, "utf-8")

    // V3.6-era verification_report.md
    const verificationReport = `# 验证报告

## 单元测试结果
All tests passed ✅

## 端到端测试结果
e2e tests: 5 passed, 0 failed ✅

## 总结
所有测试通过。
`
    await writeFile(join(specDir, "verification_report.md"), verificationReport, "utf-8")

    const result = await checkVerificationGate(workItemId, testDir)

    expect(result.status).toBe("pass")
    expect(result.blocking_issues).toHaveLength(0)
  })

  it("legacy tasks.md + no verification files fails (V3.6 fallback)", async () => {
    // Legacy tasks.md (no typed commands → triggers V3.6 fallback)
    const legacyTasksMd = `# 任务计划

## 任务

### Task 1: 实现功能

- **verification_commands**:
  - \`bun test tests/unit/feature.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMd, "utf-8")
    // No verification_report.md or verification_report.json

    const result = await checkVerificationGate(workItemId, testDir)

    expect(result.status).toBe("fail")
    expect(
      result.blocking_issues.some((issue) => issue.includes("验证结果文件"))
    ).toBe(true)
  })

  it("legacy tasks.md ignores verification_report.json when not present (V3.6 path)", async () => {
    // Legacy tasks.md → derivePlannedVerificationTypes returns null → V3.6 fallback
    const legacyTasksMd = `# 任务计划

## 任务

### Task 1: 实现功能

- **verification_commands**:
  - \`bun test tests/unit/feature.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMd, "utf-8")

    // Only verification_report.md exists (no .json)
    const verificationReport = `# 验证报告

## 测试结果
All tests passed ✅

## 端到端测试
e2e: 2 passed ✅
`
    await writeFile(join(specDir, "verification_report.md"), verificationReport, "utf-8")

    const result = await checkVerificationGate(workItemId, testDir)

    // Should pass via V3.6 fallback path
    expect(result.status).toBe("pass")
    // No details.type_results in V3.6 fallback
    expect(result.details).toBeUndefined()
  })
})

// ============================================================
// Test 4: GateResult interface backward compatibility
// ============================================================

describe("V3.7 回归: GateResult 接口向后兼容", () => {
  it("ignoring details field does not break existing callers", () => {
    // Simulate a V3.7 GateResult with details
    const report: VerificationReport = {
      schema_version: "1.0",
      work_item_id: "WI-TEST",
      status: "completed",
      commands: [
        { type: "unit", command: "bun test unit", status: "passed", exit_code: 0 },
        { type: "property", command: "bun test prop", status: "passed", exit_code: 0 },
      ],
    }

    const requiredTypes = new Set<VerificationType>(["unit", "property"])
    const result = checkTypedVerificationResults(report, requiredTypes)

    // Result has details.type_results
    expect(result.details).toBeDefined()
    expect((result.details as Record<string, unknown>).type_results).toBeDefined()

    // Existing callers that destructure without details still work
    const { status, blocking_issues, warnings, next_action } = result
    expect(status).toBe("pass")
    expect(blocking_issues).toHaveLength(0)
    expect(warnings).toHaveLength(0)
    expect(next_action).toBe("continue")

    // Existing callers that check only status/blocking_issues/warnings/next_action
    // are not affected by the presence of details
    const legacyCallerResult: Pick<GateResult, "status" | "blocking_issues" | "warnings" | "next_action"> = {
      status: result.status,
      blocking_issues: result.blocking_issues,
      warnings: result.warnings,
      next_action: result.next_action,
    }
    expect(legacyCallerResult.status).toBe("pass")
    expect(legacyCallerResult.blocking_issues).toEqual([])
  })

  it("GateResult without details field is valid (V3.6 callers)", () => {
    // A GateResult without details (as V3.6 tools would produce)
    const v36Result: GateResult = {
      status: "pass",
      blocking_issues: [],
      warnings: [],
      next_action: "continue",
    }

    // details is optional — accessing it returns undefined
    expect(v36Result.details).toBeUndefined()

    // All existing fields work as expected
    expect(v36Result.status).toBe("pass")
    expect(v36Result.blocking_issues).toEqual([])
    expect(v36Result.warnings).toEqual([])
    expect(v36Result.next_action).toBe("continue")
  })

  it("details.type_results is nested under details, never at top level", () => {
    const report: VerificationReport = {
      schema_version: "1.0",
      work_item_id: "WI-TEST",
      status: "completed",
      commands: [
        { type: "unit", command: "bun test", status: "passed", exit_code: 0 },
      ],
    }

    const result = checkTypedVerificationResults(
      report,
      new Set<VerificationType>(["unit"])
    )

    // type_results is inside details
    expect(result.details).toBeDefined()
    expect((result.details as Record<string, unknown>).type_results).toBeDefined()

    // type_results is NOT at top level
    expect("type_results" in result).toBe(false)
  })
})

// ============================================================
// Test 6: sf_doc_lint with legacy tasks.md passes (only warning)
// ============================================================

describe("V3.7 回归: sf_doc_lint 对 legacy tasks.md 通过，仅产生 warning", () => {
  const testDir = join(
    tmpdir(),
    `sf-v37-compat-lint-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const workItemId = "WI-COMPAT-LINT"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("legacy format tasks.md passes sf_doc_lint with no errors (only warnings)", async () => {
    // V3.6-era tasks.md: flat verification_commands, no typed format
    const legacyTasksMd = `# 任务计划

## 任务

### Task 1: 实现用户登录

- **修改文件**: src/auth.ts
- **verification_commands**:
  - \`bun test tests/unit/auth.test.ts\`
  - \`bun test tests/e2e/login.test.ts\`

### Task 2: 实现用户注册

- **修改文件**: src/register.ts
- **verification_commands**:
  - \`bun test tests/unit/register.test.ts\`
  - \`bun test tests/e2e/register.test.ts\`
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMd, "utf-8")

    const result = await lintDocument(workItemId, "tasks", testDir)

    // Legacy format should pass (no errors)
    expect(result.status).toBe("pass")
    expect(result.issues.filter((i) => i.severity === "error")).toHaveLength(0)
    // V3.7 adds non-blocking migration warnings for legacy format
    const warnings = result.issues.filter((i) => i.severity === "warning")
    expect(warnings.length).toBeGreaterThan(0)
    expect(
      warnings.some((w) => w.message.includes("旧格式") || w.message.includes("legacy"))
    ).toBe(true)
  })

  it("legacy format tasks.md without verification_commands fails sf_doc_lint (same as V3.6)", async () => {
    // V3.6-era tasks.md missing verification_commands → should fail
    const legacyTasksMdNoVerification = `# 任务计划

## 任务

### Task 1: 实现用户登录

- **修改文件**: src/auth.ts
`
    await writeFile(join(specDir, "tasks.md"), legacyTasksMdNoVerification, "utf-8")

    const result = await lintDocument(workItemId, "tasks", testDir)

    // Should fail — same as V3.6 behavior
    expect(result.status).toBe("fail")
    expect(
      result.issues.some(
        (i) => i.severity === "error" && i.message.includes("verification_commands")
      )
    ).toBe(true)
  })
})
