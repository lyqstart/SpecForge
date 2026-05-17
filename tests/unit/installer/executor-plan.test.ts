/**
 * Unit tests for executePlan() in scripts/lib/executor.ts
 *
 * Validates:
 * - Iterates through plan entries in order
 * - create/update: calls executeCreateOrUpdate, stops on failure (R4.3)
 * - delete: calls executeDelete, continues on failure (R6.5)
 * - conflict + force: overwrites file
 * - conflict + !force: skips with warning
 * - skip: records as executed with no file changes
 * - Returns correct ExecutionResult structure
 *
 * Requirements: 4.3, 4.5, 6.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import { executePlan } from "../../../scripts/lib/executor"
import type { PlanEntry, ReconcilePlan, PlanDiagnostics } from "../../../scripts/lib/types"

function sha256(content: string | Buffer): string {
  const hash = crypto.createHash("sha256")
  if (typeof content === "string") {
    hash.update(content, "utf-8")
  } else {
    hash.update(content)
  }
  return hash.digest("hex")
}

function makePlan(entries: PlanEntry[]): ReconcilePlan {
  const diagnostics: PlanDiagnostics = {
    allDecisions: [],
    ignored: [],
    noAction: [],
  }
  return {
    entries,
    summary: {
      create: entries.filter((e) => e.action === "create").length,
      update: entries.filter((e) => e.action === "update").length,
      delete: entries.filter((e) => e.action === "delete").length,
      skip: entries.filter((e) => e.action === "skip").length,
      conflict: entries.filter((e) => e.action === "conflict").length,
    },
    diagnostics,
  }
}

describe("executePlan", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "execplan-src-"))
    targetDir = await mkdtemp(join(tmpdir(), "execplan-tgt-"))
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  describe("empty plan", () => {
    it("should return success with empty arrays for an empty plan", async () => {
      const plan = makePlan([])
      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toEqual([])
      expect(result.failed).toBeNull()
      expect(result.warnings).toEqual([])
      expect(result.pendingDeletes).toEqual([])
    })
  })

  describe("create and update actions", () => {
    it("should execute create actions successfully", async () => {
      const content = "new file content"
      const contentHash = sha256(content)

      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-test.md"), content, "utf-8")

      const plan = makePlan([
        {
          relativePath: "agents/sf-test.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: contentHash,
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("agents/sf-test.md")
      expect(result.executed[0].action).toBe("create")
      expect(result.executed[0].resultHash).toBe(contentHash)
      expect(result.failed).toBeNull()
    })

    it("should execute update actions successfully", async () => {
      const newContent = "updated content"
      const newHash = sha256(newContent)

      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "sf_tool.ts"), newContent, "utf-8")

      // Create existing target file
      await mkdir(join(targetDir, "tools"), { recursive: true })
      await writeFile(join(targetDir, "tools", "sf_tool.ts"), "old content", "utf-8")

      const plan = makePlan([
        {
          relativePath: "tools/sf_tool.ts",
          action: "update",
          componentType: "tool",
          reason: "content changed",
          sourceHash: newHash,
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].action).toBe("update")
      expect(result.executed[0].resultHash).toBe(newHash)
    })

    it("should STOP on create/update failure and record FailedAction (R4.3)", async () => {
      const content1 = "file 1"
      const hash1 = sha256(content1)

      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-first.md"), content1, "utf-8")

      // Second file does NOT exist in source — will cause failure
      const plan = makePlan([
        {
          relativePath: "agents/sf-first.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: hash1,
        },
        {
          relativePath: "agents/sf-missing.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: "abc123",
        },
        {
          relativePath: "agents/sf-third.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: "def456",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(false)
      // First file should have been executed successfully
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("agents/sf-first.md")
      // Second file should be the failed action
      expect(result.failed).not.toBeNull()
      expect(result.failed!.relativePath).toBe("agents/sf-missing.md")
      expect(result.failed!.action).toBe("create")
      expect(result.failed!.error).toContain("Failed to read source file")
      // Third file should NOT have been executed (stopped)
    })
  })

  describe("delete actions (R6.5)", () => {
    it("should execute delete actions successfully", async () => {
      // Create file to delete
      await mkdir(join(targetDir, "tools"), { recursive: true })
      await writeFile(join(targetDir, "tools", "sf_old.ts"), "old content", "utf-8")

      const plan = makePlan([
        {
          relativePath: "tools/sf_old.ts",
          action: "delete",
          componentType: "tool",
          reason: "orphan file",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("tools/sf_old.ts")
      expect(result.executed[0].action).toBe("delete")
      expect(result.pendingDeletes).toHaveLength(0)
    })

    it("should continue on delete failure and add to pendingDeletes (R6.5)", async () => {
      const content = "still here"
      const contentHash = sha256(content)

      // Create source for the create action that follows
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-new.md"), content, "utf-8")

      // File to delete does NOT exist — will fail
      const plan = makePlan([
        {
          relativePath: "tools/sf_nonexistent.ts",
          action: "delete",
          componentType: "tool",
          reason: "orphan file",
        },
        {
          relativePath: "agents/sf-new.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: contentHash,
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      // Should still succeed overall — delete failure is non-fatal
      expect(result.success).toBe(true)
      expect(result.failed).toBeNull()
      // The create action after the failed delete should have executed
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("agents/sf-new.md")
      expect(result.executed[0].action).toBe("create")
      // Failed delete should be in pendingDeletes
      expect(result.pendingDeletes).toHaveLength(1)
      expect(result.pendingDeletes[0].relativePath).toBe("tools/sf_nonexistent.ts")
      // Warning should be emitted
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].code).toBe("orphan_delete_failed")
    })
  })

  describe("conflict actions", () => {
    it("should skip conflict when force=false and emit warning", async () => {
      // Create existing target file (user customized)
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-custom.md"), "user content", "utf-8")

      const plan = makePlan([
        {
          relativePath: "agents/sf-custom.md",
          action: "conflict",
          componentType: "agent",
          reason: "user customized",
          sourceHash: sha256("source content"),
          currentHash: sha256("user content"),
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("agents/sf-custom.md")
      expect(result.executed[0].action).toBe("conflict")
      // Warning should be emitted
      expect(result.warnings.some((w) => w.relativePath === "agents/sf-custom.md")).toBe(true)

      // File should NOT have been modified
      const fileContent = await readFile(join(targetDir, "agents", "sf-custom.md"), "utf-8")
      expect(fileContent).toBe("user content")
    })

    it("should overwrite conflict when force=true", async () => {
      const sourceContent = "source version"
      const sourceHash = sha256(sourceContent)

      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-custom.md"), sourceContent, "utf-8")

      // Create existing target file (user customized)
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-custom.md"), "user content", "utf-8")

      const plan = makePlan([
        {
          relativePath: "agents/sf-custom.md",
          action: "conflict",
          componentType: "agent",
          reason: "user customized",
          sourceHash,
          currentHash: sha256("user content"),
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: true,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].resultHash).toBe(sourceHash)

      // File should have been overwritten
      const fileContent = await readFile(join(targetDir, "agents", "sf-custom.md"), "utf-8")
      expect(fileContent).toBe(sourceContent)
    })

    it("should STOP on conflict force=true write failure", async () => {
      // Source file does NOT exist — force overwrite will fail
      const plan = makePlan([
        {
          relativePath: "agents/sf-missing.md",
          action: "conflict",
          componentType: "agent",
          reason: "user customized",
          sourceHash: "abc123",
          currentHash: "def456",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: true,
        scope: "user_shared",
      })

      expect(result.success).toBe(false)
      expect(result.failed).not.toBeNull()
      expect(result.failed!.relativePath).toBe("agents/sf-missing.md")
      expect(result.failed!.action).toBe("conflict")
    })
  })

  describe("skip actions", () => {
    it("should record skip actions as executed with no file changes", async () => {
      const plan = makePlan([
        {
          relativePath: "tools/sf_unchanged.ts",
          action: "skip",
          componentType: "tool",
          reason: "no changes",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(1)
      expect(result.executed[0].relativePath).toBe("tools/sf_unchanged.ts")
      expect(result.executed[0].action).toBe("skip")
      expect(result.executed[0].resultHash).toBeUndefined()
    })
  })

  describe("tamper warnings", () => {
    it("should emit tamper warning for entries with tamperWarning flag", async () => {
      const content = "updated content"
      const contentHash = sha256(content)

      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "sf_tool.ts"), content, "utf-8")

      const plan = makePlan([
        {
          relativePath: "tools/sf_tool.ts",
          action: "update",
          componentType: "tool",
          reason: "tamper detected",
          sourceHash: contentHash,
          tamperWarning: true,
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0].code).toBe("tamper_or_corruption")
      expect(result.warnings[0].relativePath).toBe("tools/sf_tool.ts")
    })
  })

  describe("mixed plan execution order", () => {
    it("should execute entries in order and handle mixed actions", async () => {
      const createContent = "new agent"
      const createHash = sha256(createContent)
      const updateContent = "updated tool"
      const updateHash = sha256(updateContent)

      // Setup source files
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-new.md"), createContent, "utf-8")
      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "sf_tool.ts"), updateContent, "utf-8")

      // Setup target files
      await mkdir(join(targetDir, "tools"), { recursive: true })
      await writeFile(join(targetDir, "tools", "sf_tool.ts"), "old tool", "utf-8")
      await writeFile(join(targetDir, "tools", "sf_orphan.ts"), "orphan", "utf-8")

      const plan = makePlan([
        {
          relativePath: "agents/sf-new.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: createHash,
        },
        {
          relativePath: "tools/sf_tool.ts",
          action: "update",
          componentType: "tool",
          reason: "content changed",
          sourceHash: updateHash,
        },
        {
          relativePath: "tools/sf_orphan.ts",
          action: "delete",
          componentType: "tool",
          reason: "orphan file",
        },
        {
          relativePath: "plugins/sf_plugin.ts",
          action: "skip",
          componentType: "plugin",
          reason: "no changes",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(true)
      expect(result.executed).toHaveLength(4)
      expect(result.executed[0].action).toBe("create")
      expect(result.executed[1].action).toBe("update")
      expect(result.executed[2].action).toBe("delete")
      expect(result.executed[3].action).toBe("skip")
      expect(result.failed).toBeNull()
      expect(result.pendingDeletes).toHaveLength(0)
    })

    it("should preserve already-executed actions when stopping on failure", async () => {
      const content1 = "file 1"
      const hash1 = sha256(content1)

      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-first.md"), content1, "utf-8")

      // Create file to delete successfully
      await mkdir(join(targetDir, "tools"), { recursive: true })
      await writeFile(join(targetDir, "tools", "sf_old.ts"), "old", "utf-8")

      const plan = makePlan([
        {
          relativePath: "agents/sf-first.md",
          action: "create",
          componentType: "agent",
          reason: "new file",
          sourceHash: hash1,
        },
        {
          relativePath: "tools/sf_old.ts",
          action: "delete",
          componentType: "tool",
          reason: "orphan",
        },
        {
          relativePath: "tools/sf_missing.ts",
          action: "update",
          componentType: "tool",
          reason: "content changed",
          sourceHash: "nonexistent",
        },
      ])

      const result = await executePlan(plan, {
        sourceDir,
        targetDir,
        force: false,
        scope: "user_shared",
      })

      expect(result.success).toBe(false)
      // First two actions should have executed
      expect(result.executed).toHaveLength(2)
      expect(result.executed[0].relativePath).toBe("agents/sf-first.md")
      expect(result.executed[1].relativePath).toBe("tools/sf_old.ts")
      // Third action should be the failure
      expect(result.failed!.relativePath).toBe("tools/sf_missing.ts")
    })
  })
})
