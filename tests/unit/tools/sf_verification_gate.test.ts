import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  checkVerificationGate,
  findVerificationFiles,
  checkTestResults,
  hasE2ETestResults,
} from "../../../.opencode/tools/lib/sf_verification_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_verification_gate", () => {
  const testDir = join(tmpdir(), `specforge-verify-gate-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("gate pass", () => {
    it("should pass when verification_report.md exists with passing results and e2e evidence", async () => {
      const content = `# Verification Report

## Test Results

All tests passed successfully.

✅ Unit tests: 42 passed
✅ Integration tests: 8 passed
✅ E2E tests: 5 passed
`
      await writeFile(
        join(specDir, "verification_report.md"),
        content,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
      expect(result.next_action).toBe("continue")
    })

    it("should pass when test_results file exists with passing results and e2e evidence", async () => {
      const content = `Tests: 10 passed, 0 failed
All tests passed.
E2E functional test suite: 3 passed
`
      await writeFile(join(specDir, "test_results.txt"), content, "utf-8")

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })

  describe("gate fail", () => {
    it("should fail when no verification files exist", async () => {
      // Only create a random file that's not a verification file
      await writeFile(join(specDir, "design.md"), "# Design", "utf-8")

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues[0]).toContain("未找到验证结果文件")
      expect(result.next_action).toBe("revise")
    })

    it("should fail when verification report shows failures", async () => {
      const content = `# Verification Report

## Test Results

Tests failed:
- Unit test: auth.test.ts FAILED
- Error: Expected 200 but got 401
`
      await writeFile(
        join(specDir, "verification_report.md"),
        content,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(result.blocking_issues.length).toBeGreaterThan(0)
    })

    it("should return blocked when spec directory does not exist", async () => {
      await rm(specDir, { recursive: true, force: true })

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("blocked")
      expect(result.blocking_issues).toContain("Spec directory not found")
      expect(result.next_action).toBe("ask_user")
    })
  })

  describe("gate with warnings", () => {
    it("should pass with warning when report has both pass and fail indicators but has e2e", async () => {
      const content = `# Verification Report

## Test Results

Tests completed:
- 8 tests passed
- 1 test failed (flaky, re-run passed)

Overall: All tests passed on retry.

## 端到端测试

E2E tests all passed.
`
      await writeFile(
        join(specDir, "verification_report.md"),
        content,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.warnings.length).toBeGreaterThan(0)
    })
  })

  describe("helper: findVerificationFiles", () => {
    it("should find verification_report.md", () => {
      const files = findVerificationFiles([
        "design.md",
        "verification_report.md",
        "tasks.md",
      ])
      expect(files).toEqual(["verification_report.md"])
    })

    it("should find test_results files", () => {
      const files = findVerificationFiles([
        "design.md",
        "test_results.txt",
        "tasks.md",
      ])
      expect(files).toEqual(["test_results.txt"])
    })

    it("should find test_output files", () => {
      const files = findVerificationFiles([
        "test_output.log",
        "design.md",
      ])
      expect(files).toEqual(["test_output.log"])
    })

    it("should return empty array when no verification files", () => {
      const files = findVerificationFiles([
        "design.md",
        "requirements.md",
        "tasks.md",
      ])
      expect(files).toEqual([])
    })
  })

  describe("helper: checkTestResults", () => {
    it("should detect failure when only fail indicators present", () => {
      const result = checkTestResults(
        "Tests FAILED\nError: assertion failed",
        "report.md"
      )
      expect(result.failed).toBe(true)
    })

    it("should detect pass when only pass indicators present", () => {
      const result = checkTestResults(
        "All tests passed successfully ✅",
        "report.md"
      )
      expect(result.failed).toBe(false)
    })

    it("should not fail when both pass and fail indicators present", () => {
      const result = checkTestResults(
        "1 failed initially, but all tests passed on retry",
        "report.md"
      )
      expect(result.failed).toBe(false)
      expect(result.warning).toBeDefined()
    })

    it("should not fail when no clear indicators", () => {
      const result = checkTestResults(
        "Some inconclusive content",
        "report.md"
      )
      expect(result.failed).toBe(false)
      expect(result.warning).toBeDefined()
    })
  })

  describe("helper: hasE2ETestResults", () => {
    it("should detect '端到端'", () => {
      expect(hasE2ETestResults("端到端测试通过")).toBe(true)
    })

    it("should detect 'e2e'", () => {
      expect(hasE2ETestResults("E2E tests passed")).toBe(true)
    })

    it("should detect 'end-to-end'", () => {
      expect(hasE2ETestResults("end-to-end tests passed")).toBe(true)
    })

    it("should detect 'end_to_end'", () => {
      expect(hasE2ETestResults("end_to_end tests passed")).toBe(true)
    })

    it("should detect '功能测试'", () => {
      expect(hasE2ETestResults("功能测试全部通过")).toBe(true)
    })

    it("should detect 'functional test'", () => {
      expect(hasE2ETestResults("functional test suite passed")).toBe(true)
    })

    it("should return false when no e2e keywords present", () => {
      expect(hasE2ETestResults("Unit tests: 10 passed")).toBe(false)
    })
  })

  describe("e2e gate check", () => {
    it("should fail when verification report has no e2e evidence", async () => {
      const content = `# Verification Report

## Test Results

All tests passed successfully.

✅ Unit tests: 42 passed
✅ Integration tests: 8 passed
`
      await writeFile(
        join(specDir, "verification_report.md"),
        content,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("fail")
      expect(
        result.blocking_issues.some((i) => i.includes("端到端测试结果"))
      ).toBe(true)
    })

    it("should pass when verification report includes e2e evidence (Chinese)", async () => {
      const content = `# Verification Report

## Test Results

All tests passed successfully.

✅ Unit tests: 42 passed
✅ 端到端测试: 5 passed
`
      await writeFile(
        join(specDir, "verification_report.md"),
        content,
        "utf-8"
      )

      const result = await checkVerificationGate(workItemId, testDir)

      expect(result.status).toBe("pass")
      expect(result.blocking_issues).toHaveLength(0)
    })
  })
})
