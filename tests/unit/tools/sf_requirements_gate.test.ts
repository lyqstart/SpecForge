import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  checkRequirementsGate,
  checkBugfixGate,
  hasUserStories,
  hasAcceptanceCriteria,
  hasGlossary,
  hasCurrentBehavior,
  hasExpectedBehavior,
  hasUnchangedBehavior,
  hasRootCauseAnalysis,
} from "../../../.opencode/tools/lib/sf_requirements_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_requirements_gate", () => {
  const testDir = join(tmpdir(), `specforge-req-gate-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("gate pass", () => {
    it("should pass when all criteria are met (Chinese)", async () => {
      const content = `# 需求文档

## 用户故事

作为用户，我希望能够登录系统。

## 验收标准

- 用户可以使用邮箱登录
- 登录失败时显示错误信息

## 术语表

| 术语 | 定义 |
|------|------|
| API | 应用程序接口 |
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })

    it("should pass when all criteria are met (English)", async () => {
      const content = `# Requirements

## User Stories

As a user, I want to log in.

## Acceptance Criteria

- User can log in with email
- Error message shown on failure

## Glossary

| Term | Definition |
|------|-----------|
| API | Application Programming Interface |
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })
  })

  describe("gate fail", () => {
    it("should fail when requirements.md does not exist", async () => {
      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toContain("requirements.md not found")
      expect(result.next_action).toBe("revise")
    })

    it("should fail when missing user stories", async () => {
      const content = `# 需求文档

## 验收标准

- Some criteria

## 术语表

| 术语 | 定义 |
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
      expect(
        result.blocking_issues.some((i) => i.includes("用户故事"))
      ).toBe(true)
    })

    it("should fail when missing acceptance criteria", async () => {
      const content = `# 需求文档

## 用户故事

作为用户，我希望能够登录。

## 术语表

| 术语 | 定义 |
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("验收标准"))
      ).toBe(true)
    })

    it("should fail when missing glossary", async () => {
      const content = `# 需求文档

## 用户故事

作为用户，我希望能够登录。

## 验收标准

- 可以登录
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("术语表"))
      ).toBe(true)
    })

    it("should report all missing items at once", async () => {
      const content = `# 需求文档

Just some random content.
`
      await writeFile(join(specDir, "requirements.md"), content, "utf-8")

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toHaveLength(3)
    })
  })

  describe("helper: hasUserStories", () => {
    it("should detect '用户故事'", () => {
      expect(hasUserStories("## 用户故事\n\n作为用户")).toBe(true)
    })

    it("should detect 'User Story'", () => {
      expect(hasUserStories("## User Stories\n\nAs a user")).toBe(true)
    })

    it("should detect '作为'", () => {
      expect(hasUserStories("作为管理员，我希望...")).toBe(true)
    })

    it("should return false when none present", () => {
      expect(hasUserStories("Some random content")).toBe(false)
    })
  })

  describe("helper: hasAcceptanceCriteria", () => {
    it("should detect '验收标准'", () => {
      expect(hasAcceptanceCriteria("## 验收标准")).toBe(true)
    })

    it("should detect 'Acceptance Criteria'", () => {
      expect(hasAcceptanceCriteria("## Acceptance Criteria")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasAcceptanceCriteria("Some content")).toBe(false)
    })
  })

  describe("helper: hasGlossary", () => {
    it("should detect '术语表'", () => {
      expect(hasGlossary("## 术语表")).toBe(true)
    })

    it("should detect 'Glossary'", () => {
      expect(hasGlossary("## Glossary")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasGlossary("Some content")).toBe(false)
    })
  })

  describe("bugfix gate pass", () => {
    it("should pass when all bugfix sections are present (Chinese)", async () => {
      const content = `# Bugfix 分析

## 当前行为

系统返回 500 错误。

## 预期行为

系统应返回 200 成功。

## 不变行为

其他 API 端点不受影响。

## 根因分析

数据库连接池耗尽导致超时。
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await checkBugfixGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })

    it("should pass when all bugfix sections are present (English)", async () => {
      const content = `# Bugfix Analysis

## Current Behavior

System returns 500 error.

## Expected Behavior

System should return 200 success.

## Unchanged Behavior

Other API endpoints are not affected.

## Root Cause Analysis

Database connection pool exhaustion causes timeout.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await checkBugfixGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })
  })

  describe("bugfix gate fail", () => {
    it("should fail when bugfix.md does not exist", async () => {
      const result = await checkBugfixGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toContain("bugfix.md not found")
      expect(result.next_action).toBe("revise")
    })

    it("should fail when missing current behavior", async () => {
      const content = `# Bugfix

## 预期行为

Expected.

## 不变行为

Unchanged.

## 根因分析

Root cause.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await checkBugfixGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("当前行为"))
      ).toBe(true)
    })

    it("should fail when missing all sections", async () => {
      const content = `# Bugfix

Just some random content.
`
      await writeFile(join(specDir, "bugfix.md"), content, "utf-8")

      const result = await checkBugfixGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toHaveLength(4)
    })
  })

  describe("bugfix helper: hasCurrentBehavior", () => {
    it("should detect '当前行为'", () => {
      expect(hasCurrentBehavior("## 当前行为")).toBe(true)
    })

    it("should detect 'Current Behavior'", () => {
      expect(hasCurrentBehavior("## Current Behavior")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasCurrentBehavior("Some content")).toBe(false)
    })
  })

  describe("bugfix helper: hasExpectedBehavior", () => {
    it("should detect '预期行为'", () => {
      expect(hasExpectedBehavior("## 预期行为")).toBe(true)
    })

    it("should detect 'Expected Behavior'", () => {
      expect(hasExpectedBehavior("## Expected Behavior")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasExpectedBehavior("Some content")).toBe(false)
    })
  })

  describe("bugfix helper: hasUnchangedBehavior", () => {
    it("should detect '不变行为'", () => {
      expect(hasUnchangedBehavior("## 不变行为")).toBe(true)
    })

    it("should detect 'Unchanged Behavior'", () => {
      expect(hasUnchangedBehavior("## Unchanged Behavior")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasUnchangedBehavior("Some content")).toBe(false)
    })
  })

  describe("bugfix helper: hasRootCauseAnalysis", () => {
    it("should detect '根因分析'", () => {
      expect(hasRootCauseAnalysis("## 根因分析")).toBe(true)
    })

    it("should detect 'Root Cause Analysis'", () => {
      expect(hasRootCauseAnalysis("## Root Cause Analysis")).toBe(true)
    })

    it("should return false when not present", () => {
      expect(hasRootCauseAnalysis("Some content")).toBe(false)
    })
  })
})
