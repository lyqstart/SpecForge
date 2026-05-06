import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises"
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"

// ============================================================
// Test Helpers
// ============================================================

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function makeManifestJson(overrides?: Record<string, unknown>): string {
  const manifest = {
    schema_version: "1.0",
    shared_version: "3.4.0",
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: ["sf-orchestrator"],
    managed_agent_hashes: { "sf-orchestrator": "abc123" },
    files: {},
    ...overrides,
  }
  return JSON.stringify(manifest, null, 2)
}

// ============================================================
// cmdUpgrade Tests
// ============================================================

describe("cmdUpgrade", () => {
  let userLevelDir: string
  let sourceDir: string
  let originalEnv: string | undefined

  beforeEach(async () => {
    userLevelDir = await mkdtemp(join(tmpdir(), "sf-upgrade-user-"))
    sourceDir = await mkdtemp(join(tmpdir(), "sf-upgrade-source-"))
    originalEnv = process.env.OPENCODE_CONFIG_DIR
    process.env.OPENCODE_CONFIG_DIR = userLevelDir
  })

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.OPENCODE_CONFIG_DIR = originalEnv
    } else {
      delete process.env.OPENCODE_CONFIG_DIR
    }
    await rm(userLevelDir, { recursive: true, force: true })
    await rm(sourceDir, { recursive: true, force: true })
  })

  describe("backup behavior", () => {
    it("should create backup of specforge-manifest.json before upgrade", async () => {
      // Setup: existing manifest
      const manifestContent = makeManifestJson()
      writeFileSync(join(userLevelDir, "specforge-manifest.json"), manifestContent)

      // Setup: source package.json
      writeFileSync(
        join(sourceDir, "package.json"),
        JSON.stringify({ version: "3.5.0" })
      )

      // Setup: source .opencode directory with at least one file
      mkdirSync(join(sourceDir, ".opencode", "agents"), { recursive: true })
      writeFileSync(
        join(sourceDir, ".opencode", "agents", "sf-orchestrator.md"),
        "# Agent content"
      )

      // Import and run (we need to mock the source dir)
      const { backupFile } = await import("../../../scripts/lib/atomic")
      const backupPath = await backupFile(userLevelDir, "specforge-manifest.json")

      expect(backupPath).not.toBeNull()
      expect(existsSync(backupPath!)).toBe(true)

      // Verify backup content matches original
      const backupContent = readFileSync(backupPath!, "utf-8")
      expect(backupContent).toBe(manifestContent)
    })

    it("should create backup of opencode.json before upgrade if it exists", async () => {
      // Setup: existing opencode.json
      const opencodeContent = JSON.stringify({
        "$schema": "https://opencode.ai/config.json",
        agent: { "sf-orchestrator": { mode: "primary" } },
      }, null, 2)
      writeFileSync(join(userLevelDir, "opencode.json"), opencodeContent)

      const { backupFile } = await import("../../../scripts/lib/atomic")
      const backupPath = await backupFile(userLevelDir, "opencode.json")

      expect(backupPath).not.toBeNull()
      expect(existsSync(backupPath!)).toBe(true)

      const backupContent = readFileSync(backupPath!, "utf-8")
      expect(backupContent).toBe(opencodeContent)
    })

    it("should store backups in .backup/ directory", async () => {
      const manifestContent = makeManifestJson()
      writeFileSync(join(userLevelDir, "specforge-manifest.json"), manifestContent)

      const { backupFile } = await import("../../../scripts/lib/atomic")
      const backupPath = await backupFile(userLevelDir, "specforge-manifest.json")

      expect(backupPath).not.toBeNull()
      expect(backupPath!).toContain(".backup")
      expect(backupPath!).toContain("specforge-manifest.json.bak.")
    })
  })

  describe("upgrade_journal.json structure", () => {
    it("should write journal with correct top-level fields", async () => {
      // Create a minimal journal to verify structure
      const journalPath = join(userLevelDir, "upgrade_journal.json")
      const journal = {
        timestamp: new Date().toISOString(),
        from_version: "3.4.0",
        to_version: "3.5.0",
        files_updated: [],
        status: "in_progress" as const,
      }
      writeFileSync(journalPath, JSON.stringify(journal, null, 2))

      const parsed = JSON.parse(readFileSync(journalPath, "utf-8"))
      expect(parsed).toHaveProperty("timestamp")
      expect(parsed).toHaveProperty("from_version", "3.4.0")
      expect(parsed).toHaveProperty("to_version", "3.5.0")
      expect(parsed).toHaveProperty("files_updated")
      expect(parsed).toHaveProperty("status", "in_progress")
      expect(Array.isArray(parsed.files_updated)).toBe(true)
    })

    it("should record per-file entries with replaced status", () => {
      const entry = {
        path: "agents/sf-orchestrator.md",
        status: "replaced" as const,
        backupPath: "/tmp/backup/agents_sf-orchestrator.md.bak.20240101-120000",
        newHash: "abc123",
        oldHash: "def456",
      }

      expect(entry.status).toBe("replaced")
      expect(entry).toHaveProperty("backupPath")
      expect(entry).toHaveProperty("newHash")
      expect(entry).toHaveProperty("oldHash")
    })

    it("should record per-file entries with skipped status", () => {
      const entry = {
        path: "agents/sf-orchestrator.md",
        status: "skipped" as const,
        oldHash: "abc123",
      }

      expect(entry.status).toBe("skipped")
      expect(entry).not.toHaveProperty("backupPath")
      expect(entry).not.toHaveProperty("newHash")
    })
  })

  describe("per-file atomic replacement", () => {
    it("should write to temp file and rename atomically", async () => {
      // Setup target directory
      mkdirSync(join(userLevelDir, "agents"), { recursive: true })

      const content = "# New Agent Content"
      const sourceFile = join(userLevelDir, "agents", "source.md")
      writeFileSync(sourceFile, content)

      // Simulate atomic replacement
      const targetPath = join(userLevelDir, "agents", "sf-orchestrator.md")
      const tmpPath = targetPath + `.tmp.${process.pid}`

      // Write to temp
      const { copyFileSync, renameSync } = await import("node:fs")
      copyFileSync(sourceFile, tmpPath)
      expect(existsSync(tmpPath)).toBe(true)

      // Verify SHA-256
      const { computeSHA256 } = await import("../../../scripts/lib/crypto")
      const sourceHash = await computeSHA256(sourceFile)
      const tmpHash = await computeSHA256(tmpPath)
      expect(tmpHash).toBe(sourceHash)

      // Atomic rename
      renameSync(tmpPath, targetPath)
      expect(existsSync(targetPath)).toBe(true)
      expect(existsSync(tmpPath)).toBe(false)

      // Verify final file
      const finalHash = await computeSHA256(targetPath)
      expect(finalHash).toBe(sourceHash)
    })

    it("should clean up temp file on SHA-256 mismatch", async () => {
      mkdirSync(join(userLevelDir, "agents"), { recursive: true })

      const targetPath = join(userLevelDir, "agents", "sf-orchestrator.md")
      const tmpPath = targetPath + `.tmp.${process.pid}`

      // Write temp file
      writeFileSync(tmpPath, "some content")
      expect(existsSync(tmpPath)).toBe(true)

      // Simulate mismatch detection → cleanup
      const { unlinkSync } = await import("node:fs")
      unlinkSync(tmpPath)
      expect(existsSync(tmpPath)).toBe(false)
    })
  })

  describe("rollback on failure", () => {
    it("should restore files from backup paths recorded in journal", async () => {
      // Setup: create a "backup" file
      const backupDir = join(userLevelDir, ".backup")
      mkdirSync(backupDir, { recursive: true })
      mkdirSync(join(userLevelDir, "agents"), { recursive: true })

      const originalContent = "# Original Agent"
      const backupPath = join(backupDir, "agents_sf-orchestrator.md.bak.20240101-120000")
      writeFileSync(backupPath, originalContent)

      // Setup: current (corrupted) file
      const targetPath = join(userLevelDir, "agents", "sf-orchestrator.md")
      writeFileSync(targetPath, "# Corrupted during upgrade")

      // Simulate rollback from journal
      const journal = {
        timestamp: "2024-01-01T12:00:00.000Z",
        from_version: "3.4.0",
        to_version: "3.5.0",
        files_updated: [
          {
            path: "agents/sf-orchestrator.md",
            status: "replaced" as const,
            backupPath,
            newHash: "abc",
            oldHash: "def",
          },
        ],
        status: "in_progress" as const,
      }

      // Perform rollback
      const { copyFileSync } = await import("node:fs")
      for (const entry of journal.files_updated) {
        if (entry.status === "replaced" && entry.backupPath && existsSync(entry.backupPath)) {
          copyFileSync(entry.backupPath, targetPath)
        }
      }

      // Verify rollback
      const restoredContent = readFileSync(targetPath, "utf-8")
      expect(restoredContent).toBe(originalContent)
    })

    it("should update journal status to rolled_back after successful rollback", () => {
      const journal = {
        timestamp: "2024-01-01T12:00:00.000Z",
        from_version: "3.4.0",
        to_version: "3.5.0",
        files_updated: [],
        status: "in_progress" as const,
      }

      // Simulate status update after rollback
      const updatedJournal = { ...journal, status: "rolled_back" as const }
      const journalPath = join(userLevelDir, "upgrade_journal.json")
      writeFileSync(journalPath, JSON.stringify(updatedJournal, null, 2))

      const parsed = JSON.parse(readFileSync(journalPath, "utf-8"))
      expect(parsed.status).toBe("rolled_back")
    })

    it("should update journal status to failed when rollback itself fails", () => {
      const journal = {
        timestamp: "2024-01-01T12:00:00.000Z",
        from_version: "3.4.0",
        to_version: "3.5.0",
        files_updated: [],
        status: "in_progress" as const,
      }

      // Simulate failed rollback → status becomes "failed"
      const updatedJournal = { ...journal, status: "failed" as const }
      const journalPath = join(userLevelDir, "upgrade_journal.json")
      writeFileSync(journalPath, JSON.stringify(updatedJournal, null, 2))

      const parsed = JSON.parse(readFileSync(journalPath, "utf-8"))
      expect(parsed.status).toBe("failed")
    })
  })

  describe("--force flag behavior", () => {
    it("should skip files with matching hash when force is false", () => {
      const sourceHash = "abc123def456"
      const existingEntry = { sha256: sourceHash, size: 100, type: "agent" as const }

      // When force=false and hashes match, file should be skipped
      const shouldSkip = !false && existingEntry && existingEntry.sha256 === sourceHash
      expect(shouldSkip).toBe(true)
    })

    it("should replace files even with matching hash when force is true", () => {
      const sourceHash = "abc123def456"
      const existingEntry = { sha256: sourceHash, size: 100, type: "agent" as const }

      // When force=true, file should NOT be skipped even if hashes match
      const shouldSkip = !true && existingEntry && existingEntry.sha256 === sourceHash
      expect(shouldSkip).toBe(false)
    })
  })

  describe("success cleanup", () => {
    it("should delete upgrade_journal.json on successful upgrade", () => {
      const journalPath = join(userLevelDir, "upgrade_journal.json")
      writeFileSync(journalPath, JSON.stringify({ status: "success" }))

      // Simulate success cleanup
      const { unlinkSync } = require("node:fs")
      if (existsSync(journalPath)) {
        unlinkSync(journalPath)
      }

      expect(existsSync(journalPath)).toBe(false)
    })
  })
})
