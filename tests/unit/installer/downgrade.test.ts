/**
 * Unit tests for scripts/lib/downgrade.ts — 降级门控
 *
 * Tests cover:
 * - checkDowngrade: semver comparison for downgrade detection (R15.1)
 * - evaluateDowngradeGate: gate decision logic (R15.2, R15.3)
 * - buildDowngradeResult: summary extraction from execution results (R15.5)
 */

import { describe, it, expect } from "bun:test"
import {
  checkDowngrade,
  evaluateDowngradeGate,
  buildDowngradeResult,
} from "../../../scripts/lib/downgrade"
import type { ReconcilePlan, ExecutionResult, ExecutedAction } from "../../../scripts/lib/types"

describe("checkDowngrade", () => {
  it("should detect downgrade when source < manifest (major)", () => {
    const result = checkDowngrade("2.0.0", "3.0.0")
    expect(result.isDowngrade).toBe(true)
    expect(result.previousVersion).toBe("3.0.0")
    expect(result.targetVersion).toBe("2.0.0")
  })

  it("should detect downgrade when source < manifest (minor)", () => {
    const result = checkDowngrade("3.4.0", "3.5.0")
    expect(result.isDowngrade).toBe(true)
    expect(result.previousVersion).toBe("3.5.0")
    expect(result.targetVersion).toBe("3.4.0")
  })

  it("should detect downgrade when source < manifest (patch)", () => {
    const result = checkDowngrade("3.5.1", "3.5.2")
    expect(result.isDowngrade).toBe(true)
    expect(result.previousVersion).toBe("3.5.2")
    expect(result.targetVersion).toBe("3.5.1")
  })

  it("should not detect downgrade when source == manifest", () => {
    const result = checkDowngrade("3.5.0", "3.5.0")
    expect(result.isDowngrade).toBe(false)
    expect(result.previousVersion).toBe("3.5.0")
    expect(result.targetVersion).toBe("3.5.0")
  })

  it("should not detect downgrade when source > manifest (upgrade)", () => {
    const result = checkDowngrade("4.0.0", "3.5.0")
    expect(result.isDowngrade).toBe(false)
    expect(result.previousVersion).toBe("3.5.0")
    expect(result.targetVersion).toBe("4.0.0")
  })

  it("should not detect downgrade when source > manifest (minor upgrade)", () => {
    const result = checkDowngrade("3.6.0", "3.5.0")
    expect(result.isDowngrade).toBe(false)
  })

  it("should not detect downgrade when source > manifest (patch upgrade)", () => {
    const result = checkDowngrade("3.5.1", "3.5.0")
    expect(result.isDowngrade).toBe(false)
  })

  it("should handle version with leading zeros gracefully", () => {
    const result = checkDowngrade("1.0.0", "2.0.0")
    expect(result.isDowngrade).toBe(true)
  })
})

describe("evaluateDowngradeGate", () => {
  describe("non-downgrade scenarios", () => {
    it("should allow when versions are equal", () => {
      const result = evaluateDowngradeGate("3.5.0", "3.5.0", false)
      expect(result.allowed).toBe(true)
      expect(result.isDowngrade).toBe(false)
    })

    it("should allow when upgrading", () => {
      const result = evaluateDowngradeGate("4.0.0", "3.5.0", false)
      expect(result.allowed).toBe(true)
      expect(result.isDowngrade).toBe(false)
    })

    it("should allow upgrade even without force", () => {
      const result = evaluateDowngradeGate("3.6.0", "3.5.0", false)
      expect(result.allowed).toBe(true)
      expect(result.isDowngrade).toBe(false)
    })
  })

  describe("downgrade + !force → stop (R15.2)", () => {
    it("should reject downgrade without force", () => {
      const result = evaluateDowngradeGate("3.4.0", "3.5.0", false)
      expect(result.allowed).toBe(false)
      expect(result.isDowngrade).toBe(true)
      if (!result.allowed) {
        expect(result.previousVersion).toBe("3.5.0")
        expect(result.targetVersion).toBe("3.4.0")
        expect(result.reason).toContain("Downgrade detected")
        expect(result.reason).toContain("--force")
      }
    })

    it("should reject major downgrade without force", () => {
      const result = evaluateDowngradeGate("2.0.0", "3.0.0", false)
      expect(result.allowed).toBe(false)
      expect(result.isDowngrade).toBe(true)
    })
  })

  describe("downgrade + force → allow (R15.3)", () => {
    it("should allow downgrade with force", () => {
      const result = evaluateDowngradeGate("3.4.0", "3.5.0", true)
      expect(result.allowed).toBe(true)
      expect(result.isDowngrade).toBe(true)
      if (result.allowed && result.isDowngrade) {
        expect(result.previousVersion).toBe("3.5.0")
        expect(result.targetVersion).toBe("3.4.0")
      }
    })

    it("should allow major downgrade with force", () => {
      const result = evaluateDowngradeGate("1.0.0", "3.5.0", true)
      expect(result.allowed).toBe(true)
      expect(result.isDowngrade).toBe(true)
    })
  })
})

describe("buildDowngradeResult", () => {
  function makePlan(entries: ReconcilePlan["entries"] = []): ReconcilePlan {
    return {
      entries,
      summary: { create: 0, update: 0, delete: 0, skip: 0, conflict: 0 },
      diagnostics: { allDecisions: [], ignored: [], noAction: [] },
    }
  }

  function makeExecutionResult(executed: ExecutedAction[] = []): ExecutionResult {
    return {
      success: true,
      executed,
      failed: null,
      warnings: [],
      pendingDeletes: [],
    }
  }

  it("should extract deletedFiles from execution result", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([
      { relativePath: "agents/sf-old.md", action: "delete" },
      { relativePath: "tools/sf_old_tool.ts", action: "delete" },
    ])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.deletedFiles).toEqual([
      "agents/sf-old.md",
      "tools/sf_old_tool.ts",
    ])
    expect(result.overwrittenFiles).toEqual([])
    expect(result.skippedConflicts).toEqual([])
  })

  it("should extract overwrittenFiles from create/update actions", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([
      { relativePath: "agents/sf-orchestrator.md", action: "update", resultHash: "abc123" },
      { relativePath: "tools/sf_new.ts", action: "create", resultHash: "def456" },
    ])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.overwrittenFiles).toEqual([
      "agents/sf-orchestrator.md",
      "tools/sf_new.ts",
    ])
    expect(result.deletedFiles).toEqual([])
    expect(result.skippedConflicts).toEqual([])
  })

  it("should extract skippedConflicts from conflict actions in executed", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([
      { relativePath: "agents/sf-custom.md", action: "conflict" },
      { relativePath: "skills/sf-workflow/SKILL.md", action: "conflict" },
    ])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.skippedConflicts).toEqual([
      "agents/sf-custom.md",
      "skills/sf-workflow/SKILL.md",
    ])
    expect(result.deletedFiles).toEqual([])
    expect(result.overwrittenFiles).toEqual([])
  })

  it("should handle mixed actions correctly", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([
      { relativePath: "agents/sf-orchestrator.md", action: "update", resultHash: "aaa" },
      { relativePath: "agents/sf-old.md", action: "delete" },
      { relativePath: "agents/sf-custom.md", action: "conflict" },
      { relativePath: "tools/sf_tool.ts", action: "skip" },
      { relativePath: "tools/sf_new.ts", action: "create", resultHash: "bbb" },
    ])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.previousVersion).toBe("3.5.0")
    expect(result.targetVersion).toBe("3.4.0")
    expect(result.deletedFiles).toEqual(["agents/sf-old.md"])
    expect(result.overwrittenFiles).toEqual([
      "agents/sf-orchestrator.md",
      "tools/sf_new.ts",
    ])
    expect(result.skippedConflicts).toEqual(["agents/sf-custom.md"])
  })

  it("should include opencodeBackupPath when provided (R15.4)", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([])

    const result = buildDowngradeResult(
      plan,
      execution,
      "3.5.0",
      "3.4.0",
      "/home/user/.config/opencode/.backup/opencode.json.20240101T120000Z"
    )

    expect(result.opencodeBackupPath).toBe(
      "/home/user/.config/opencode/.backup/opencode.json.20240101T120000Z"
    )
  })

  it("should have undefined opencodeBackupPath when not provided", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.opencodeBackupPath).toBeUndefined()
  })

  it("should set correct version fields", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([])

    const result = buildDowngradeResult(plan, execution, "4.0.0", "3.2.1")

    expect(result.previousVersion).toBe("4.0.0")
    expect(result.targetVersion).toBe("3.2.1")
  })

  it("should handle empty execution result", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.deletedFiles).toEqual([])
    expect(result.overwrittenFiles).toEqual([])
    expect(result.skippedConflicts).toEqual([])
  })

  it("should not include skip actions in any category", () => {
    const plan = makePlan()
    const execution = makeExecutionResult([
      { relativePath: "tools/sf_unchanged.ts", action: "skip" },
      { relativePath: "agents/sf-same.md", action: "skip" },
    ])

    const result = buildDowngradeResult(plan, execution, "3.5.0", "3.4.0")

    expect(result.deletedFiles).toEqual([])
    expect(result.overwrittenFiles).toEqual([])
    expect(result.skippedConflicts).toEqual([])
  })
})
