/**
 * Fixture-based unit tests for detectPropertyTestResultFromStdout
 * Tests the fast-check stdout fallback detection logic
 *
 * Validates: REQ-9 AC-10
 */
import { describe, it, expect } from "vitest"
import { detectPropertyTestResultFromStdout } from "../../../../.opencode/tools/lib/sf_verification_gate_core"

describe("detectPropertyTestResultFromStdout - fixture-based", () => {
  describe("fast-check pass patterns", () => {
    it("should detect '• 100 passed' as passed", () => {
      expect(detectPropertyTestResultFromStdout("• 100 passed")).toBe("passed")
    })

    it("should detect '42 tests passed' as passed", () => {
      expect(detectPropertyTestResultFromStdout("42 tests passed")).toBe("passed")
    })

    it("should detect 'all 50 tests passed' as passed", () => {
      expect(detectPropertyTestResultFromStdout("all 50 tests passed")).toBe("passed")
    })
  })

  describe("fast-check fail patterns", () => {
    it("should detect 'Counterexample found after 23 tests' as failed", () => {
      expect(detectPropertyTestResultFromStdout("Counterexample found after 23 tests")).toBe("failed")
    })

    it("should detect 'Property failed after 5 tests' as failed", () => {
      expect(detectPropertyTestResultFromStdout("Property failed after 5 tests")).toBe("failed")
    })

    it("should detect 'shrunk 3 time(s)' as failed", () => {
      expect(detectPropertyTestResultFromStdout("shrunk 3 time(s)")).toBe("failed")
    })

    it("should detect 'Counterexample found\\n  shrunk 2 time(s)' as failed", () => {
      expect(detectPropertyTestResultFromStdout("Counterexample found\n  shrunk 2 time(s)")).toBe("failed")
    })
  })

  describe("normal bun test output (not fast-check specific)", () => {
    it("should detect '5 pass\\n0 fail\\n5 expect() calls' as passed", () => {
      expect(detectPropertyTestResultFromStdout("5 pass\n0 fail\n5 expect() calls")).toBe("passed")
    })

    it("should detect '✓ test suite passed\\n10 tests passed' as passed", () => {
      expect(detectPropertyTestResultFromStdout("✓ test suite passed\n10 tests passed")).toBe("passed")
    })
  })

  describe("edge cases", () => {
    it("should return 'unknown' for empty string", () => {
      expect(detectPropertyTestResultFromStdout("")).toBe("unknown")
    })

    it("should return 'unknown' for 'running tests...' (no result indicators)", () => {
      expect(detectPropertyTestResultFromStdout("running tests...")).toBe("unknown")
    })

    it("should return 'unknown' for 'some random output without test results'", () => {
      expect(detectPropertyTestResultFromStdout("some random output without test results")).toBe("unknown")
    })
  })

  describe("priority: fail patterns take precedence over pass patterns", () => {
    it("should return 'failed' when both pass and fail patterns are present", () => {
      expect(detectPropertyTestResultFromStdout("100 tests passed\nCounterexample found")).toBe("failed")
    })
  })
})
