/**
 * Unit tests for scripts/lib/executor.ts — 原子动作执行器（create/update/delete/conflict）
 *
 * Validates:
 * - executeCreateOrUpdate reads source and writes atomically to target
 * - Target directory is created recursively (R4.4)
 * - SHA-256 verification via atomicWrite (R4.1, R4.2)
 * - Failure throws error (R4.3 stop-on-failure semantics)
 * - executeDelete removes orphan files, returns PendingDeleteEntry on failure (R6.5)
 * - executeConflict skips with warning when !force (R3.2), overwrites when force (R3.3)
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.3, 6.5, 3.1, 3.2, 3.3
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import { executeCreateOrUpdate, executeDelete, executeConflict } from "../../../scripts/lib/executor"
import type { PlanEntry } from "../../../scripts/lib/types"

function sha256(content: string | Buffer): string {
  const hash = crypto.createHash("sha256")
  if (typeof content === "string") {
    hash.update(content, "utf-8")
  } else {
    hash.update(content)
  }
  return hash.digest("hex")
}

describe("executeCreateOrUpdate", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "executor-src-"))
    targetDir = await mkdtemp(join(tmpdir(), "executor-tgt-"))
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  describe("create action", () => {
    it("should read source file and write to target atomically", async () => {
      const content = "hello world"
      const contentHash = sha256(content)

      // Create source file
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-test.md"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "agents/sf-test.md",
        action: "create",
        componentType: "agent",
        reason: "new file",
        sourceHash: contentHash,
      }

      const result = await executeCreateOrUpdate(entry, sourceDir, targetDir)

      expect(result.relativePath).toBe("agents/sf-test.md")
      expect(result.action).toBe("create")
      expect(result.resultHash).toBe(contentHash)

      // Verify file was written to target
      const written = await readFile(join(targetDir, "agents", "sf-test.md"), "utf-8")
      expect(written).toBe(content)
    })

    it("should create nested target directories recursively (R4.4)", async () => {
      const content = "nested content"
      const contentHash = sha256(content)

      // Create deeply nested source file
      await mkdir(join(sourceDir, "tools", "lib"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "lib", "sf_helper.ts"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "tools/lib/sf_helper.ts",
        action: "create",
        componentType: "tool_lib",
        reason: "new file",
        sourceHash: contentHash,
      }

      const result = await executeCreateOrUpdate(entry, sourceDir, targetDir)

      expect(result.resultHash).toBe(contentHash)

      const written = await readFile(join(targetDir, "tools", "lib", "sf_helper.ts"), "utf-8")
      expect(written).toBe(content)
    })

    it("should handle binary file content", async () => {
      const content = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
      const contentHash = sha256(content)

      await mkdir(join(sourceDir, "plugins"), { recursive: true })
      await writeFile(join(sourceDir, "plugins", "sf_plugin.ts"), content)

      const entry: PlanEntry = {
        relativePath: "plugins/sf_plugin.ts",
        action: "create",
        componentType: "plugin",
        reason: "new file",
        sourceHash: contentHash,
      }

      const result = await executeCreateOrUpdate(entry, sourceDir, targetDir)

      expect(result.resultHash).toBe(contentHash)

      const written = await readFile(join(targetDir, "plugins", "sf_plugin.ts"))
      expect(Buffer.compare(written, content)).toBe(0)
    })
  })

  describe("update action", () => {
    it("should overwrite existing target file with source content", async () => {
      const oldContent = "old content"
      const newContent = "new content"
      const newHash = sha256(newContent)

      // Create source file with new content
      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "sf_tool.ts"), newContent, "utf-8")

      // Create existing target file with old content
      await mkdir(join(targetDir, "tools"), { recursive: true })
      await writeFile(join(targetDir, "tools", "sf_tool.ts"), oldContent, "utf-8")

      const entry: PlanEntry = {
        relativePath: "tools/sf_tool.ts",
        action: "update",
        componentType: "tool",
        reason: "content changed",
        sourceHash: newHash,
      }

      const result = await executeCreateOrUpdate(entry, sourceDir, targetDir)

      expect(result.relativePath).toBe("tools/sf_tool.ts")
      expect(result.action).toBe("update")
      expect(result.resultHash).toBe(newHash)

      const written = await readFile(join(targetDir, "tools", "sf_tool.ts"), "utf-8")
      expect(written).toBe(newContent)
    })
  })

  describe("failure handling (R4.3)", () => {
    it("should throw when source file does not exist", async () => {
      const entry: PlanEntry = {
        relativePath: "agents/nonexistent.md",
        action: "create",
        componentType: "agent",
        reason: "new file",
        sourceHash: "abc123",
      }

      await expect(
        executeCreateOrUpdate(entry, sourceDir, targetDir)
      ).rejects.toThrow(/Failed to read source file/)
    })

    it("should throw when source hash does not match file content (R4.2)", async () => {
      const content = "actual content"
      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-test.md"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "agents/sf-test.md",
        action: "create",
        componentType: "agent",
        reason: "new file",
        sourceHash: wrongHash,
      }

      await expect(
        executeCreateOrUpdate(entry, sourceDir, targetDir)
      ).rejects.toThrow(/Failed to write/)
    })

    it("should not leave partial file on hash mismatch failure", async () => {
      const content = "actual content"
      const wrongHash = "1111111111111111111111111111111111111111111111111111111111111111"

      await mkdir(join(sourceDir, "tools"), { recursive: true })
      await writeFile(join(sourceDir, "tools", "sf_tool.ts"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "tools/sf_tool.ts",
        action: "create",
        componentType: "tool",
        reason: "new file",
        sourceHash: wrongHash,
      }

      try {
        await executeCreateOrUpdate(entry, sourceDir, targetDir)
      } catch {
        // expected
      }

      // Target file should not exist
      await expect(
        readFile(join(targetDir, "tools", "sf_tool.ts"))
      ).rejects.toThrow()
    })

    it("should include file path in error message", async () => {
      const entry: PlanEntry = {
        relativePath: "skills/my-skill/SKILL.md",
        action: "create",
        componentType: "skill",
        reason: "new file",
        sourceHash: "abc",
      }

      await expect(
        executeCreateOrUpdate(entry, sourceDir, targetDir)
      ).rejects.toThrow("skills/my-skill/SKILL.md")
    })
  })

  describe("POSIX path handling", () => {
    it("should handle POSIX relative paths correctly on any OS", async () => {
      const content = "skill content"
      const contentHash = sha256(content)

      // Create nested source structure
      await mkdir(join(sourceDir, "skills", "my-skill"), { recursive: true })
      await writeFile(join(sourceDir, "skills", "my-skill", "SKILL.md"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "skills/my-skill/SKILL.md",
        action: "create",
        componentType: "skill",
        reason: "new file",
        sourceHash: contentHash,
      }

      const result = await executeCreateOrUpdate(entry, sourceDir, targetDir)

      expect(result.resultHash).toBe(contentHash)

      const written = await readFile(
        join(targetDir, "skills", "my-skill", "SKILL.md"),
        "utf-8"
      )
      expect(written).toBe(content)
    })
  })
})

describe("executeDelete", () => {
  let targetDir: string

  beforeEach(async () => {
    targetDir = await mkdtemp(join(tmpdir(), "executor-del-"))
  })

  afterEach(async () => {
    await rm(targetDir, { recursive: true, force: true })
  })

  it("should delete an existing file and return success", async () => {
    // Create target file to delete
    await mkdir(join(targetDir, "tools"), { recursive: true })
    await writeFile(join(targetDir, "tools", "sf_old_tool.ts"), "old content", "utf-8")

    const entry: PlanEntry = {
      relativePath: "tools/sf_old_tool.ts",
      action: "delete",
      componentType: "tool",
      reason: "orphan file",
    }

    const result = await executeDelete(entry, targetDir)

    expect(result.success).toBe(true)
    expect(existsSync(join(targetDir, "tools", "sf_old_tool.ts"))).toBe(false)
  })

  it("should return PendingDeleteEntry when file does not exist (non-fatal)", async () => {
    const entry: PlanEntry = {
      relativePath: "agents/sf-nonexistent.md",
      action: "delete",
      componentType: "agent",
      reason: "orphan file",
    }

    const result = await executeDelete(entry, targetDir)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.pendingDelete.relativePath).toBe("agents/sf-nonexistent.md")
      expect(result.pendingDelete.reason).toBeTruthy()
      expect(result.pendingDelete.failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })

  it("should handle nested path deletion", async () => {
    await mkdir(join(targetDir, "skills", "old-skill"), { recursive: true })
    await writeFile(join(targetDir, "skills", "old-skill", "SKILL.md"), "old skill", "utf-8")

    const entry: PlanEntry = {
      relativePath: "skills/old-skill/SKILL.md",
      action: "delete",
      componentType: "skill",
      reason: "orphan file",
    }

    const result = await executeDelete(entry, targetDir)

    expect(result.success).toBe(true)
    expect(existsSync(join(targetDir, "skills", "old-skill", "SKILL.md"))).toBe(false)
  })

  it("should include ISO8601 timestamp in PendingDeleteEntry on failure", async () => {
    const entry: PlanEntry = {
      relativePath: "tools/sf_missing.ts",
      action: "delete",
      componentType: "tool",
      reason: "orphan",
    }

    const before = new Date().toISOString()
    const result = await executeDelete(entry, targetDir)
    const after = new Date().toISOString()

    expect(result.success).toBe(false)
    if (!result.success) {
      // Verify failedAt is a valid ISO8601 timestamp within the test window
      const failedAt = new Date(result.pendingDelete.failedAt)
      expect(failedAt.getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())
      expect(failedAt.getTime()).toBeLessThanOrEqual(new Date(after).getTime())
    }
  })
})

describe("executeConflict", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "executor-conflict-src-"))
    targetDir = await mkdtemp(join(tmpdir(), "executor-conflict-tgt-"))
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  describe("force=false (R3.2: skip and warn)", () => {
    it("should skip the file and return a warning", async () => {
      const entry: PlanEntry = {
        relativePath: "agents/sf-orchestrator.md",
        action: "conflict",
        componentType: "agent",
        reason: "user customized",
        sourceHash: "abc123",
        currentHash: "def456",
      }

      const result = await executeConflict(entry, sourceDir, targetDir, false)

      expect("skipped" in result && result.skipped).toBe(true)
      if ("skipped" in result) {
        expect(result.warning.relativePath).toBe("agents/sf-orchestrator.md")
        expect(result.warning.message).toContain("customized by user")
        expect(result.warning.message).toContain("--force")
        expect(result.warning.code).toBe("tamper_or_corruption")
      }
    })

    it("should not modify the target file when skipping", async () => {
      const userContent = "user customized content"

      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-test.md"), userContent, "utf-8")

      const entry: PlanEntry = {
        relativePath: "agents/sf-test.md",
        action: "conflict",
        componentType: "agent",
        reason: "user customized",
        sourceHash: "abc123",
        currentHash: sha256(userContent),
      }

      await executeConflict(entry, sourceDir, targetDir, false)

      // File should remain unchanged
      const content = await readFile(join(targetDir, "agents", "sf-test.md"), "utf-8")
      expect(content).toBe(userContent)
    })
  })

  describe("force=true (R3.3: overwrite)", () => {
    it("should overwrite target file with source content", async () => {
      const sourceContent = "new source content"
      const sourceHash = sha256(sourceContent)
      const userContent = "user modified content"

      // Create source file
      await mkdir(join(sourceDir, "agents"), { recursive: true })
      await writeFile(join(sourceDir, "agents", "sf-test.md"), sourceContent, "utf-8")

      // Create target file with user modifications
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-test.md"), userContent, "utf-8")

      const entry: PlanEntry = {
        relativePath: "agents/sf-test.md",
        action: "conflict",
        componentType: "agent",
        reason: "user customized",
        sourceHash: sourceHash,
        currentHash: sha256(userContent),
      }

      const result = await executeConflict(entry, sourceDir, targetDir, true)

      // Should return ExecutedAction (not skipped)
      expect("skipped" in result).toBe(false)
      if (!("skipped" in result)) {
        expect(result.relativePath).toBe("agents/sf-test.md")
        expect(result.action).toBe("conflict")
        expect(result.resultHash).toBe(sourceHash)
      }

      // Verify file was overwritten
      const written = await readFile(join(targetDir, "agents", "sf-test.md"), "utf-8")
      expect(written).toBe(sourceContent)
    })

    it("should throw when source file does not exist", async () => {
      const entry: PlanEntry = {
        relativePath: "agents/sf-missing.md",
        action: "conflict",
        componentType: "agent",
        reason: "user customized",
        sourceHash: "abc123",
      }

      await expect(
        executeConflict(entry, sourceDir, targetDir, true)
      ).rejects.toThrow(/Failed to read source file/)
    })

    it("should throw when source hash does not match", async () => {
      const content = "actual content"
      const wrongHash = "0000000000000000000000000000000000000000000000000000000000000000"

      await mkdir(join(sourceDir, "skills", "my-skill"), { recursive: true })
      await writeFile(join(sourceDir, "skills", "my-skill", "SKILL.md"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "skills/my-skill/SKILL.md",
        action: "conflict",
        componentType: "skill",
        reason: "user customized",
        sourceHash: wrongHash,
      }

      await expect(
        executeConflict(entry, sourceDir, targetDir, true)
      ).rejects.toThrow(/Failed to write/)
    })

    it("should create target directory if it does not exist", async () => {
      const content = "new skill content"
      const contentHash = sha256(content)

      await mkdir(join(sourceDir, "skills", "new-skill"), { recursive: true })
      await writeFile(join(sourceDir, "skills", "new-skill", "SKILL.md"), content, "utf-8")

      const entry: PlanEntry = {
        relativePath: "skills/new-skill/SKILL.md",
        action: "conflict",
        componentType: "skill",
        reason: "user customized",
        sourceHash: contentHash,
      }

      const result = await executeConflict(entry, sourceDir, targetDir, true)

      expect("skipped" in result).toBe(false)
      if (!("skipped" in result)) {
        expect(result.resultHash).toBe(contentHash)
      }

      const written = await readFile(join(targetDir, "skills", "new-skill", "SKILL.md"), "utf-8")
      expect(written).toBe(content)
    })
  })
})
