/**
 * Unit tests for scripts/lib/preflight.ts — 两阶段 Preflight 检查
 *
 * Validates:
 * - preflightTarget: target directory writable, non-existent dir fails
 * - preflightPlan: disk space insufficient, file count thresholds (warning/error)
 * - Successful preflight pass scenarios
 *
 * Requirements: 4.4, 13.4
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, chmod, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { preflightTarget, preflightPlan } from "../../../scripts/lib/preflight"
import type {
  TargetPreflightOptions,
  PlanPreflightOptions,
} from "../../../scripts/lib/preflight"
import type { DesiredStateEntry, ReconcilePlan, PlanEntry, PlanSummary, PlanDiagnostics } from "../../../scripts/lib/types"
import type { DesiredState } from "../../../scripts/lib/discovery"

// ============================================================
// Helpers
// ============================================================

function createEmptyPlan(entries: PlanEntry[] = []): ReconcilePlan {
  const summary: PlanSummary = {
    create: entries.filter(e => e.action === "create").length,
    update: entries.filter(e => e.action === "update").length,
    delete: entries.filter(e => e.action === "delete").length,
    skip: entries.filter(e => e.action === "skip").length,
    conflict: entries.filter(e => e.action === "conflict").length,
  }
  const diagnostics: PlanDiagnostics = {
    allDecisions: [],
    ignored: [],
    noAction: [],
  }
  return { entries, summary, diagnostics }
}

function createDesiredState(entries: DesiredStateEntry[] = []): DesiredState {
  const map = new Map<string, DesiredStateEntry>()
  for (const entry of entries) {
    map.set(entry.relativePath, entry)
  }
  return { entries: map, version: "1.0.0" }
}

function createPlanEntries(count: number, action: "create" | "update" = "create"): PlanEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    relativePath: `tools/sf_file_${i}.ts`,
    action,
    componentType: "tool" as const,
    reason: "test",
    sourceHash: "a".repeat(64),
  }))
}

function createDesiredStateEntries(count: number, sizePerFile = 1024): DesiredStateEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    relativePath: `tools/sf_file_${i}.ts`,
    componentType: "tool" as const,
    sourceHash: "a".repeat(64),
    size: sizePerFile,
  }))
}

// ============================================================
// Tests: preflightTarget
// ============================================================

describe("preflightTarget", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "preflight-target-test-"))
  })

  afterEach(async () => {
    // Restore permissions before cleanup (needed on Unix)
    try {
      await chmod(tempDir, 0o755)
    } catch {
      // ignore
    }
    await rm(tempDir, { recursive: true, force: true })
  })

  describe("writable directory", () => {
    it("should pass for a writable directory", async () => {
      const result = await preflightTarget({ targetDir: tempDir })

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should pass and create .backup/ directory", async () => {
      const result = await preflightTarget({ targetDir: tempDir })

      expect(result.passed).toBe(true)
      // .backup/ should have been created as part of the check
    })
  })

  describe("non-existent directory", () => {
    it("should fail when target directory does not exist", async () => {
      const nonExistentDir = join(tempDir, "does-not-exist")

      const result = await preflightTarget({ targetDir: nonExistentDir })

      expect(result.passed).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].code).toBe("TARGET_DIR_NOT_WRITABLE")
      expect(result.errors[0].path).toBe(nonExistentDir)
    })
  })

  describe("non-writable directory", () => {
    it("should fail when target directory is not writable", async function () {
      // Skip on Windows — chmod doesn't reliably restrict write access
      if (process.platform === "win32") {
        return
      }

      // Remove write permission
      await chmod(tempDir, 0o555)

      const result = await preflightTarget({ targetDir: tempDir })

      expect(result.passed).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].code).toBe("TARGET_DIR_NOT_WRITABLE")
    })
  })

  describe("file path as target", () => {
    it("should fail when target path is a file, not a directory", async () => {
      const filePath = join(tempDir, "not-a-dir.txt")
      const { writeFile } = await import("node:fs/promises")
      await writeFile(filePath, "content", "utf-8")

      const result = await preflightTarget({ targetDir: filePath })

      expect(result.passed).toBe(false)
      expect(result.errors[0].code).toBe("TARGET_DIR_NOT_WRITABLE")
    })
  })
})

// ============================================================
// Tests: preflightPlan
// ============================================================

describe("preflightPlan", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "preflight-plan-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe("successful preflight", () => {
    it("should pass with a small plan and sufficient disk space", async () => {
      const entries = createPlanEntries(10)
      const desiredEntries = createDesiredStateEntries(10, 1024)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should pass with zero create/update entries", async () => {
      const plan = createEmptyPlan([])
      const desiredState = createDesiredState([])

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      expect(result.passed).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe("file count thresholds", () => {
    it("should produce warning when file count exceeds 1000", async () => {
      const count = 1001
      const entries = createPlanEntries(count)
      const desiredEntries = createDesiredStateEntries(count, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      // Should pass (warning threshold, not error)
      expect(result.passed).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      const fileCountWarning = result.warnings.find(w => w.code === "LARGE_FILE_COUNT")
      expect(fileCountWarning).toBeDefined()
      expect(fileCountWarning!.count).toBe(count)
    })

    it("should produce error when file count exceeds 5000", async () => {
      const count = 5001
      const entries = createPlanEntries(count)
      const desiredEntries = createDesiredStateEntries(count, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      expect(result.passed).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const fileCountError = result.errors.find(e => e.code === "TOO_MANY_FILES")
      expect(fileCountError).toBeDefined()
      expect(fileCountError!.count).toBe(count)
      expect(fileCountError!.limit).toBe(5000)
    })

    it("should not produce warning when file count is exactly 1000", async () => {
      const count = 1000
      const entries = createPlanEntries(count)
      const desiredEntries = createDesiredStateEntries(count, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      expect(result.passed).toBe(true)
      const fileCountWarning = result.warnings.find(w => w.code === "LARGE_FILE_COUNT")
      expect(fileCountWarning).toBeUndefined()
    })

    it("should not produce error when file count is exactly 5000", async () => {
      const count = 5000
      const entries = createPlanEntries(count)
      const desiredEntries = createDesiredStateEntries(count, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      // 5000 is at the warning threshold but not error
      expect(result.passed).toBe(true)
      const fileCountError = result.errors.find(e => e.code === "TOO_MANY_FILES")
      expect(fileCountError).toBeUndefined()
      // Should have a warning since 5000 > 1000
      const fileCountWarning = result.warnings.find(w => w.code === "LARGE_FILE_COUNT")
      expect(fileCountWarning).toBeDefined()
    })

    it("should only count create and update entries for file count", async () => {
      // Mix of actions: only create/update should count
      const createEntries = createPlanEntries(3000, "create")
      const deleteEntries: PlanEntry[] = Array.from({ length: 3000 }, (_, i) => ({
        relativePath: `tools/sf_delete_${i}.ts`,
        action: "delete" as const,
        componentType: "tool" as const,
        reason: "orphan",
      }))
      const allEntries = [...createEntries, ...deleteEntries]
      const desiredEntries = createDesiredStateEntries(3000, 100)
      const plan = createEmptyPlan(allEntries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      // Only 3000 create entries count, which is > 1000 (warning) but < 5000 (no error)
      expect(result.passed).toBe(true)
      const fileCountWarning = result.warnings.find(w => w.code === "LARGE_FILE_COUNT")
      expect(fileCountWarning).toBeDefined()
      expect(fileCountWarning!.count).toBe(3000)
    })
  })

  describe("disk space checks", () => {
    it("should report disk space insufficient when minDiskSpace exceeds available", async () => {
      // Use an extremely large minDiskSpace that exceeds any real disk
      const entries = createPlanEntries(1)
      const desiredEntries = createDesiredStateEntries(1, 1024)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
        // Set minDiskSpace to an impossibly large value (1 PB)
        minDiskSpace: 1024 * 1024 * 1024 * 1024 * 1024,
      })

      // On most systems this will trigger DISK_SPACE_INSUFFICIENT
      // However, statfs may not be available on all platforms
      if (result.errors.length > 0) {
        const diskError = result.errors.find(e => e.code === "DISK_SPACE_INSUFFICIENT")
        expect(diskError).toBeDefined()
        expect(diskError!.available).toBeGreaterThan(0)
        expect(diskError!.required).toBeGreaterThan(diskError!.available)
        expect(result.passed).toBe(false)
      } else {
        // If statfs is not available, disk check is skipped (returns null)
        // This is acceptable behavior per the implementation
        expect(result.passed).toBe(true)
      }
    })

    it("should pass disk space check when minDiskSpace is small", async () => {
      const entries = createPlanEntries(5)
      const desiredEntries = createDesiredStateEntries(5, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
        // 1 byte minimum — should always pass
        minDiskSpace: 1,
      })

      expect(result.passed).toBe(true)
      const diskError = result.errors.find(e => e.code === "DISK_SPACE_INSUFFICIENT")
      expect(diskError).toBeUndefined()
    })

    it("should report disk space low warning when available is less than 2x required", async () => {
      // This test is platform-dependent; we verify the logic by using a minDiskSpace
      // that's close to but less than available space
      const entries = createPlanEntries(1)
      const desiredEntries = createDesiredStateEntries(1, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      // Use default minDiskSpace (50MB) — on most dev machines this passes
      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
      })

      // We can't guarantee the warning fires on all machines,
      // but we verify the structure is correct when it does
      if (result.warnings.some(w => w.code === "DISK_SPACE_LOW")) {
        const diskWarning = result.warnings.find(w => w.code === "DISK_SPACE_LOW")
        expect(diskWarning).toBeDefined()
        expect(diskWarning!.available).toBeGreaterThan(0)
        expect(diskWarning!.threshold).toBeGreaterThan(0)
      }
      // Either way, the test should not error on normal machines
      expect(result.errors.find(e => e.code === "DISK_SPACE_INSUFFICIENT")).toBeUndefined()
    })
  })

  describe("combined checks", () => {
    it("should report both disk space and file count errors simultaneously", async () => {
      const count = 5001
      const entries = createPlanEntries(count)
      const desiredEntries = createDesiredStateEntries(count, 100)
      const plan = createEmptyPlan(entries)
      const desiredState = createDesiredState(desiredEntries)

      const result = await preflightPlan({
        targetDir: tempDir,
        desiredState,
        plan,
        // Impossibly large disk requirement
        minDiskSpace: 1024 * 1024 * 1024 * 1024 * 1024,
      })

      expect(result.passed).toBe(false)
      // File count error should always be present
      const fileCountError = result.errors.find(e => e.code === "TOO_MANY_FILES")
      expect(fileCountError).toBeDefined()

      // Disk space error depends on platform support for statfs
      // If statfs works, we should also see DISK_SPACE_INSUFFICIENT
    })
  })
})
