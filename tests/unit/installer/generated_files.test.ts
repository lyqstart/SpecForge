/**
 * Unit tests for scripts/lib/generated_files.ts — Generated File Handler
 *
 * Tests the cleanup of:
 * - upgrade_journal.json (legacy installer artifact)
 * - partial_commit.journal (commit recovery artifact)
 *
 * Requirements: 11.5
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { generatedFileHandler } from "../../../scripts/lib/generated_files"

describe("GeneratedFileHandler", () => {
  let targetDir: string

  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), "sf-generated-files-test-"))
  })

  afterEach(() => {
    rmSync(targetDir, { recursive: true, force: true })
  })

  describe("checkForCleanup", () => {
    it("should return empty plan when no generated files exist", async () => {
      const plan = await generatedFileHandler.checkForCleanup(targetDir)
      expect(plan.filesToDelete).toHaveLength(0)
    })

    it("should detect upgrade_journal.json for cleanup", async () => {
      const journalPath = join(targetDir, "upgrade_journal.json")
      writeFileSync(journalPath, JSON.stringify({ status: "success" }))

      const plan = await generatedFileHandler.checkForCleanup(targetDir)

      expect(plan.filesToDelete).toHaveLength(1)
      expect(plan.filesToDelete[0].path).toBe(journalPath)
      expect(plan.filesToDelete[0].reason).toBe("upgrade_journal_stale")
    })

    it("should detect partial_commit.journal for cleanup", async () => {
      const journalPath = join(targetDir, "partial_commit.journal")
      writeFileSync(journalPath, JSON.stringify({ schema_version: "1.0" }))

      const plan = await generatedFileHandler.checkForCleanup(targetDir)

      expect(plan.filesToDelete).toHaveLength(1)
      expect(plan.filesToDelete[0].path).toBe(journalPath)
      expect(plan.filesToDelete[0].reason).toBe("partial_commit_recovered")
    })

    it("should detect both files when both exist", async () => {
      writeFileSync(join(targetDir, "upgrade_journal.json"), "{}")
      writeFileSync(join(targetDir, "partial_commit.journal"), "{}")

      const plan = await generatedFileHandler.checkForCleanup(targetDir)

      expect(plan.filesToDelete).toHaveLength(2)

      const reasons = plan.filesToDelete.map((f) => f.reason)
      expect(reasons).toContain("upgrade_journal_stale")
      expect(reasons).toContain("partial_commit_recovered")
    })

    it("should not include unrelated files in cleanup plan", async () => {
      // Create some unrelated files
      writeFileSync(join(targetDir, "specforge-manifest.json"), "{}")
      writeFileSync(join(targetDir, "opencode.json"), "{}")
      writeFileSync(join(targetDir, "some-other-file.json"), "{}")

      const plan = await generatedFileHandler.checkForCleanup(targetDir)
      expect(plan.filesToDelete).toHaveLength(0)
    })
  })

  describe("executeCleanup", () => {
    it("should delete files listed in the plan", async () => {
      const journalPath = join(targetDir, "upgrade_journal.json")
      writeFileSync(journalPath, "{}")

      const plan = {
        filesToDelete: [{ path: journalPath, reason: "upgrade_journal_stale" }],
      }

      await generatedFileHandler.executeCleanup(plan)

      expect(existsSync(journalPath)).toBe(false)
    })

    it("should delete multiple files", async () => {
      const upgradeJournal = join(targetDir, "upgrade_journal.json")
      const partialCommit = join(targetDir, "partial_commit.journal")
      writeFileSync(upgradeJournal, "{}")
      writeFileSync(partialCommit, "{}")

      const plan = {
        filesToDelete: [
          { path: upgradeJournal, reason: "upgrade_journal_stale" },
          { path: partialCommit, reason: "partial_commit_recovered" },
        ],
      }

      await generatedFileHandler.executeCleanup(plan)

      expect(existsSync(upgradeJournal)).toBe(false)
      expect(existsSync(partialCommit)).toBe(false)
    })

    it("should not throw when file does not exist (best-effort)", async () => {
      const nonExistentPath = join(targetDir, "does-not-exist.json")

      const plan = {
        filesToDelete: [{ path: nonExistentPath, reason: "upgrade_journal_stale" }],
      }

      // Should not throw
      await generatedFileHandler.executeCleanup(plan)
    })

    it("should handle empty plan gracefully", async () => {
      const plan = { filesToDelete: [] }

      // Should not throw
      await generatedFileHandler.executeCleanup(plan)
    })

    it("should continue deleting remaining files if one fails", async () => {
      const validPath = join(targetDir, "upgrade_journal.json")
      writeFileSync(validPath, "{}")

      // Use a path that will fail (directory instead of file won't cause issues
      // on most systems, so we use a non-existent nested path)
      const invalidPath = join(targetDir, "nonexistent-dir", "nested", "file.json")

      const plan = {
        filesToDelete: [
          { path: invalidPath, reason: "upgrade_journal_stale" },
          { path: validPath, reason: "upgrade_journal_stale" },
        ],
      }

      await generatedFileHandler.executeCleanup(plan)

      // The valid file should still be deleted despite the first one failing
      expect(existsSync(validPath)).toBe(false)
    })
  })

  describe("end-to-end: checkForCleanup → executeCleanup", () => {
    it("should detect and clean up upgrade_journal.json after successful reconcile", async () => {
      const journalPath = join(targetDir, "upgrade_journal.json")
      writeFileSync(journalPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        status: "in_progress",
      }))

      // Simulate post-reconcile cleanup flow
      const plan = await generatedFileHandler.checkForCleanup(targetDir)
      expect(plan.filesToDelete).toHaveLength(1)

      await generatedFileHandler.executeCleanup(plan)
      expect(existsSync(journalPath)).toBe(false)
    })

    it("should detect and clean up partial_commit.journal after recovery", async () => {
      const journalPath = join(targetDir, "partial_commit.journal")
      writeFileSync(journalPath, JSON.stringify({
        schema_version: "1.0",
        run_id: "test-uuid",
        scope: "user_shared",
        created_at: new Date().toISOString(),
        phase_completed: "opencode_merge",
        manifest_payload: {},
      }))

      const plan = await generatedFileHandler.checkForCleanup(targetDir)
      expect(plan.filesToDelete).toHaveLength(1)

      await generatedFileHandler.executeCleanup(plan)
      expect(existsSync(journalPath)).toBe(false)
    })
  })
})
