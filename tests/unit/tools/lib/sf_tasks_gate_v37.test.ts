/**
 * Unit tests for sf_tasks_gate V3.7 changes
 * Tests checkTasksGate() and crossValidateTask() behavior for typed verification_commands,
 * legacy format warnings, type key validation, and cross-validation scenarios.
 *
 * Requirements: REQ-3 AC-6, REQ-3 AC-7, REQ-3 AC-8, REQ-3 AC-9, REQ-3 AC-10
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkTasksGate, crossValidateTask } from "../../../../.opencode/tools/lib/sf_tasks_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// checkTasksGate — V3.7 integration tests with mock files
// ============================================================

describe("checkTasksGate - V3.7 verification strategy", () => {
  const testDir = join(tmpdir(), `specforge-tasks-gate-v37-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-V37-TG"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    // Disable KG to simplify tests
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  // Helper: write a minimal requirements.md with REQ sections
  async function writeRequirements(reqs: Array<{ id: string; strategy?: string }>) {
    const sections = reqs.map((r) => {
      const strategyLine = r.strategy
        ? `- **verification_strategy**: [${r.strategy}]`
        : ""
      return `### ${r.id} 某需求

**简介**: 需求描述

${strategyLine}
`
    }).join("\n")

    const content = `# 需求文档

## 简介

项目需求。

## 术语表

| 术语 | 定义 |
|------|------|
| REQ | 需求 |

## 需求

${sections}
`
    await writeFile(join(specDir, "requirements.md"), content, "utf-8")
  }

  // Helper: write a minimal design.md with optional CP sections
  async function writeDesign(cps?: Array<{ id: string; testFile?: string }>) {
    const cpSections = cps
      ? cps.map((cp) => {
          const testFileLine = cp.testFile ? `- **test_file**: ${cp.testFile}` : ""
          return `#### ${cp.id} 某属性
- **test_type**: property
${testFileLine}
- **property**: WHEN x THEN y
`
        }).join("\n")
      : ""

    const content = `# 设计文档

## 概述

基于需求 1。

## Correctness Properties

${cpSections}
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")
  }

  // ============================================================
  // Test 1: Valid typed format → pass (no blocking_issues)
  // ============================================================

  describe("valid typed format → pass", () => {
    it("should pass when typed verification_commands use valid type keys with proper refs", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "unit, property" },
      ])
      await writeDesign([{ id: "CP-1", testFile: "tests/property/foo.property.test.ts" }])

      const tasksContent = `# 任务列表

## Task 1: 实现功能

实现核心功能。

**refs**: [REQ-1, CP-1]

**verification_commands**:
- unit: \`npm run test:unit\`
- property: \`npm run test tests/property/foo.property.test.ts\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  // ============================================================
  // Test 2: Legacy format → pass + warning containing "旧格式"
  // ============================================================

  describe("legacy format → pass with warning", () => {
    it("should pass with a warning containing '旧格式' for legacy verification_commands", async () => {
      const tasksContent = `# 任务列表

## Task 1: 初始化项目

设置项目结构。

**verification_commands**:
- \`npm run build\`
- \`npm run test\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings.some((w) => w.includes("旧格式"))).toBe(true)
    })
  })

  // ============================================================
  // Test 3: Invalid type key `smoke:` → fail, blocking_issue contains "非法类型键" and "smoke"
  // ============================================================

  describe("invalid type key → fail", () => {
    it("should fail when verification_commands contains invalid type key 'smoke'", async () => {
      await writeRequirements([{ id: "REQ-1", strategy: "unit" }])

      const tasksContent = `# 任务列表

## Task 1: 测试任务

执行测试。

**refs**: [REQ-1]

**verification_commands**:
- smoke: \`npm run smoke\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues.some((i) => i.includes("非法类型键"))).toBe(true)
      expect(result.blocking_issues.some((i) => i.includes("smoke"))).toBe(true)
    })
  })

  // ============================================================
  // Test 4: Mixed format (typed + legacy tasks) → typed checked, legacy gets warning
  // ============================================================

  describe("mixed format → typed checked, legacy gets warning", () => {
    it("should check typed tasks and warn about legacy tasks in the same file", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "unit" },
      ])
      await writeDesign()

      const tasksContent = `# 任务列表

## Task 1: 类型化任务

实现功能。

**refs**: [REQ-1]

**verification_commands**:
- unit: \`npm run test:unit\`

## Task 2: 旧格式任务

旧格式验证。

**verification_commands**:
- \`npm run legacy-test\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      // Legacy task should produce a warning
      expect(result.warnings.some((w) => w.includes("旧格式"))).toBe(true)
      expect(result.warnings.some((w) => w.includes("Task 2"))).toBe(true)
    })
  })

  // ============================================================
  // Test 5: Typed task missing `refs` → fail, blocking_issue contains task_id
  // ============================================================

  describe("typed task missing refs → fail", () => {
    it("should fail when typed task has no refs field", async () => {
      await writeRequirements([{ id: "REQ-1", strategy: "unit" }])

      const tasksContent = `# 任务列表

## Task 1: 无引用任务

实现功能。

**verification_commands**:
- unit: \`npm run test:unit\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues.some((i) => i.includes("TASK-1"))).toBe(true)
    })
  })

  // ============================================================
  // Test 6: Typed task with property commands but no CP-N in refs → fail
  // ============================================================

  describe("property commands without CP-N ref → fail", () => {
    it("should fail when typed task has property commands but no CP-N in refs", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "unit, property" },
      ])

      const tasksContent = `# 任务列表

## Task 1: 属性测试任务

实现属性测试。

**refs**: [REQ-1]

**verification_commands**:
- unit: \`npm run test:unit\`
- property: \`npm run test:property\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      // Should mention property without CP-N traceability
      expect(result.blocking_issues.some((i) => i.includes("TASK-1"))).toBe(true)
      expect(result.blocking_issues.some((i) => i.includes("property"))).toBe(true)
      expect(result.blocking_issues.some((i) => i.includes("CP-N") || i.includes("CP"))).toBe(true)
    })
  })

  // ============================================================
  // Test 7: refs pointing to REQ with `verification_strategy: [property]` but typed commands missing `property` key → fail
  // ============================================================

  describe("missing required verification type → fail", () => {
    it("should fail when REQ requires property but task only has unit commands", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "property" },
      ])
      await writeDesign([{ id: "CP-1" }])

      const tasksContent = `# 任务列表

## Task 1: 不完整验证

只有 unit 测试。

**refs**: [REQ-1, CP-1]

**verification_commands**:
- unit: \`npm run test:unit\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(result.blocking_issues.some((i) => i.includes("property"))).toBe(true)
      expect(result.blocking_issues.some((i) => i.includes("TASK-1"))).toBe(true)
    })
  })

  // ============================================================
  // Test 8: refs pointing to REQ without verification_strategy → ignored (pass)
  // ============================================================

  describe("REQ without verification_strategy → ignored (pass)", () => {
    it("should pass when refs point to REQ that has no verification_strategy", async () => {
      // REQ-1 has no verification_strategy declared
      await writeRequirements([
        { id: "REQ-1" },
      ])
      await writeDesign([{ id: "CP-1" }])

      const tasksContent = `# 任务列表

## Task 1: 自由验证

任意验证方式。

**refs**: [REQ-1, CP-1]

**verification_commands**:
- unit: \`npm run test:unit\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  // ============================================================
  // Test 9: Multiple REQs with different strategies → union used as Declared_Required_Types
  // ============================================================

  describe("multiple REQs → union of strategies", () => {
    it("should use union of verification_strategies from multiple REQs", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "unit" },
        { id: "REQ-2", strategy: "integration" },
      ])
      await writeDesign([{ id: "CP-1" }])

      // Task only has unit — missing integration from REQ-2
      const tasksContent = `# 任务列表

## Task 1: 多需求任务

覆盖多个需求。

**refs**: [REQ-1, REQ-2, CP-1]

**verification_commands**:
- unit: \`npm run test:unit\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      // Should mention missing integration type
      expect(result.blocking_issues.some((i) => i.includes("integration"))).toBe(true)
    })

    it("should pass when task covers the union of all REQ strategies", async () => {
      await writeRequirements([
        { id: "REQ-1", strategy: "unit" },
        { id: "REQ-2", strategy: "integration" },
      ])
      await writeDesign([{ id: "CP-1" }])

      const tasksContent = `# 任务列表

## Task 1: 完整覆盖

覆盖所有需求策略。

**refs**: [REQ-1, REQ-2, CP-1]

**verification_commands**:
- unit: \`npm run test:unit\`
- integration: \`npm run test:integration\`
`
      await writeFile(join(specDir, "tasks.md"), tasksContent, "utf-8")

      const result = await checkTasksGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })
})

// ============================================================
// crossValidateTask — direct unit tests
// ============================================================

describe("crossValidateTask - direct unit tests", () => {
  const baseRequirements = `# 需求文档

## 简介

项目需求。

## 术语表

| 术语 | 定义 |
|------|------|
| REQ | 需求 |

## 需求

### REQ-1 某需求

**简介**: 需求描述

- **verification_strategy**: [unit, property]

### REQ-2 另一需求

**简介**: 另一需求描述

- **verification_strategy**: [integration]

### REQ-3 无策略需求

**简介**: 无策略
`

  const baseDesign = `# 设计文档

## Correctness Properties

#### CP-1 某属性
- **test_type**: property
- **test_file**: tests/property/foo.property.test.ts
`

  it("should return blocking issue when refs is empty", () => {
    const result = crossValidateTask(
      "TASK-1",
      { format: "typed", typedCommands: { unit: "npm test" }, refs: [] },
      baseRequirements,
      baseDesign
    )
    expect(result.blockingIssues.length).toBeGreaterThan(0)
    expect(result.blockingIssues[0]).toContain("TASK-1")
    expect(result.blockingIssues[0]).toContain("REQ refs")
  })

  it("should return blocking issue when refs is undefined", () => {
    const result = crossValidateTask(
      "TASK-1",
      { format: "typed", typedCommands: { unit: "npm test" } },
      baseRequirements,
      baseDesign
    )
    expect(result.blockingIssues.length).toBeGreaterThan(0)
    expect(result.blockingIssues[0]).toContain("TASK-1")
  })

  it("should pass when REQ has no verification_strategy (scenario B)", () => {
    const result = crossValidateTask(
      "TASK-1",
      { format: "typed", typedCommands: { unit: "npm test" }, refs: ["REQ-3", "CP-1"] },
      baseRequirements,
      baseDesign
    )
    // REQ-3 has no strategy → ignored, no coverage check needed
    expect(result.blockingIssues).toHaveLength(0)
  })

  it("should use union of strategies from multiple REQs (scenario C)", () => {
    const result = crossValidateTask(
      "TASK-1",
      {
        format: "typed",
        typedCommands: { unit: "npm test" },
        refs: ["REQ-1", "REQ-2", "CP-1"],
      },
      baseRequirements,
      baseDesign
    )
    // REQ-1 requires unit+property, REQ-2 requires integration
    // Task only has unit → missing property and integration
    expect(result.blockingIssues.length).toBeGreaterThan(0)
    expect(result.blockingIssues[0]).toContain("property")
  })

  it("should fail when property commands exist but no CP-N ref (scenario E)", () => {
    const result = crossValidateTask(
      "TASK-1",
      {
        format: "typed",
        typedCommands: { unit: "npm test", property: "npm run test:property" },
        refs: ["REQ-1"],
      },
      baseRequirements,
      baseDesign
    )
    expect(result.blockingIssues.some((i) => i.includes("property") && i.includes("CP-N"))).toBe(true)
  })

  it("should pass when all required types are covered and CP-N is present", () => {
    const result = crossValidateTask(
      "TASK-1",
      {
        format: "typed",
        typedCommands: {
          unit: "npm test:unit",
          property: "npm run test tests/property/foo.property.test.ts",
        },
        refs: ["REQ-1", "CP-1"],
      },
      baseRequirements,
      baseDesign
    )
    expect(result.blockingIssues).toHaveLength(0)
  })
})
