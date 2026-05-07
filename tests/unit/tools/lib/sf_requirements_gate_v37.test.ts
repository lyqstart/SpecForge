/**
 * Unit tests for sf_requirements_gate V3.7 verification_strategy validation
 *
 * Validates: REQ-9 AC-4
 *
 * Tests the V3.7 changes to sf_requirements_gate that validate
 * verification_strategy fields in requirements.md:
 * - Legal values (single type, multiple types, all 5 types) → pass
 * - Illegal values (typos like `fast-check`, unknown types) → fail
 * - Empty list `[]` → fail
 * - Format errors (`unit property` without separator) → fail
 * - Duplicate values `[unit, unit]` → pass + warning (deduplicated)
 * - Mixed case (`Unit`, `PROPERTY`) → pass, normalized to lowercase
 * - No verification_strategy declared → pass
 * - requirements.md missing → fail with clear reason
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkRequirementsGate } from "../../../../.opencode/tools/lib/sf_requirements_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_requirements_gate - V3.7 verification_strategy validation", () => {
  const testDir = join(
    tmpdir(),
    `specforge-req-gate-v37-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const workItemId = "WI-V37-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  /**
   * Helper: creates a valid requirements.md with the given verification_strategy
   * field injected into a REQ section.
   */
  function makeRequirements(strategyField?: string): string {
    const strategyLine = strategyField
      ? `\n- **verification_strategy**: ${strategyField}\n`
      : ""

    return `# 需求文档

## 用户故事

作为用户，我希望能够登录系统。

## 验收标准

- 用户可以使用邮箱登录

## 术语表

| 术语 | 定义 |
|------|------|
| API | 应用程序接口 |

### REQ-1 登录功能

#### 验收标准

1. 用户可以登录
${strategyLine}
`
  }

  describe("legal values → pass", () => {
    it("should pass with a single type: [unit]", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[unit]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with multiple types: [unit, property]", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[unit, property]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with all 5 types: [unit, property, integration, e2e, regression]", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[unit, property, integration, e2e, regression]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with comma-separated format without brackets: unit, property", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("unit, property"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with a single type without brackets: unit", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("unit"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("illegal values → fail", () => {
    it("should fail with typo: fast-check", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[fast-check]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("fast-check"))
      ).toBe(true)
    })

    it("should fail with unknown type: smoke", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[smoke]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("smoke"))
      ).toBe(true)
    })

    it("should fail with mix of valid and invalid types", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[unit, fast-check, property]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("fast-check"))
      ).toBe(true)
    })
  })

  describe("empty list → fail", () => {
    it("should fail with empty brackets: []", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("空列表"))
      ).toBe(true)
    })
  })

  describe("format errors → fail", () => {
    it("should fail with space-separated values without separator: unit property", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("unit property"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("格式错误"))
      ).toBe(true)
    })
  })

  describe("duplicate values → pass + warning (deduplicated)", () => {
    it("should pass with duplicates [unit, unit] and produce warning", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[unit, unit]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(
        result.warnings.some((w) => w.includes("重复"))
      ).toBe(true)
    })

    it("should pass with duplicates [property, unit, property] and produce warning", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[property, unit, property]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(
        result.warnings.some((w) => w.includes("重复"))
      ).toBe(true)
    })
  })

  describe("mixed case → pass, normalized to lowercase", () => {
    it("should pass with mixed case: Unit", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[Unit]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with uppercase: PROPERTY", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[PROPERTY]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })

    it("should pass with various mixed cases: [Unit, PROPERTY, Integration]", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements("[Unit, PROPERTY, Integration]"),
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("no verification_strategy declared → pass", () => {
    it("should pass when no verification_strategy field exists", async () => {
      await writeFile(
        join(specDir, "requirements.md"),
        makeRequirements(), // no strategy field
        "utf-8"
      )

      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("requirements.md missing → fail with clear reason", () => {
    it("should fail when requirements.md does not exist", async () => {
      // Don't create requirements.md
      const result = await checkRequirementsGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues).toContain("requirements.md not found")
      expect(result.next_action).toBe("revise")
    })
  })
})
