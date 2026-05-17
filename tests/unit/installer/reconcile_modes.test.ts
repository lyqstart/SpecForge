/**
 * Unit tests for Reconcile Engine — Mode-specific behavior
 *
 * Tests the four reconcile modes:
 * - full: Complete Reconcile (read Manifest + filesystem)
 * - fresh_install: Ignore existing state, treat CurrentState as empty
 * - repair_missing: Skip downgrade detection, skip opencode.json merge, only create actions
 * - repair_full: Skip downgrade detection, skip opencode.json merge, all actions
 *
 * Also tests degraded mode handling (R7.5): reconcile failure → no crash
 *
 * Validates Requirements: 7.1, 7.3, 7.4, 7.5, 8.8
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
import crypto from "node:crypto"

import { reconcile, type ReconcileMode, type ReconcileOptions } from "../../../scripts/lib/reconcile"
import type { DesiredStateProvider, DesiredState, DiscoveryResult } from "../../../scripts/lib/discovery"
import type { ReconcileScope, DesiredStateEntry } from "../../../scripts/lib/types"

// ============================================================
// Test Helpers
// ============================================================

/**
 * Create a mock DesiredStateProvider that returns a fixed DesiredState
 */
function createMockProvider(
  scope: ReconcileScope,
  entries: Map<string, DesiredStateEntry>,
  version = "3.6.0"
): DesiredStateProvider {
  return {
    scope,
    async buildDesiredState(): Promise<DiscoveryResult> {
      return {
        ok: true,
        state: { entries, version },
      }
    },
  }
}

/**
 * Create a mock provider that fails
 */
function createFailingProvider(scope: ReconcileScope): DesiredStateProvider {
  return {
    scope,
    async buildDesiredState(): Promise<DiscoveryResult> {
      return {
        ok: false,
        error: {
          code: "SOURCE_DIR_NOT_FOUND",
          path: "/nonexistent",
        },
      }
    },
  }
}

/**
 * Create a mock provider that throws
 */
function createThrowingProvider(scope: ReconcileScope): DesiredStateProvider {
  return {
    scope,
    async buildDesiredState(): Promise<DiscoveryResult> {
      throw new Error("Simulated provider crash")
    },
  }
}


/**
 * Write a source file to the source directory and return its SHA-256 hash
 */
async function writeSourceFile(
  sourceDir: string,
  relativePath: string,
  content: string
): Promise<string> {
  const fullPath = join(sourceDir, ...relativePath.split("/"))
  await mkdir(join(fullPath, ".."), { recursive: true })
  await writeFile(fullPath, content, "utf-8")
  // Compute SHA-256 using Node.js crypto
  return crypto.createHash("sha256").update(Buffer.from(content, "utf-8")).digest("hex")
}

/**
 * Write a valid Manifest to the target directory
 */
async function writeManifest(
  targetDir: string,
  version: string,
  files: Record<string, { sha256: string; size: number; type: string }>
): Promise<void> {
  const manifest = {
    schema_version: "1.0",
    shared_version: version,
    install_mode: "user_level",
    installed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    managed_agents: [],
    managed_agent_hashes: {},
    files,
  }
  const manifestPath = join(targetDir, "specforge-manifest.json")
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8")
}

/**
 * Build a simple DesiredState entries map from source files
 */
function buildEntries(
  files: Array<{ path: string; hash: string; size: number; type: DesiredStateEntry["componentType"] }>
): Map<string, DesiredStateEntry> {
  const entries = new Map<string, DesiredStateEntry>()
  for (const f of files) {
    entries.set(f.path, {
      relativePath: f.path,
      componentType: f.type,
      sourceHash: f.hash,
      size: f.size,
    })
  }
  return entries
}

// ============================================================
// Tests
// ============================================================

describe("reconcile — mode-specific behavior", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "reconcile-src-"))
    targetDir = await mkdtemp(join(tmpdir(), "reconcile-tgt-"))
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  // ============================================================
  // Mode: full
  // ============================================================

  describe("mode: full", () => {
    it("reads Manifest and filesystem to build CurrentState", async () => {
      // Setup: write a source file
      const content = "# Agent file"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Write an existing file in target with same content (should skip)
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-test.md"), content, "utf-8")

      // Write manifest recording this file
      await writeManifest(targetDir, "3.6.0", {
        "agents/sf-test.md": { sha256: hash, size: content.length, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries),
      })

      expect(result.success).toBe(true)
      // File already matches → should be skip
      expect(result.plan.summary.skip).toBe(1)
      expect(result.plan.summary.create).toBe(0)
    })

    it("creates missing files when Manifest is absent", async () => {
      const content = "# New agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-new.md", content)

      const entries = buildEntries([
        { path: "agents/sf-new.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries),
      })

      expect(result.success).toBe(true)
      expect(result.plan.summary.create).toBe(1)

      // Verify file was created
      const targetFile = join(targetDir, "agents", "sf-new.md")
      expect(existsSync(targetFile)).toBe(true)
      const written = await readFile(targetFile, "utf-8")
      expect(written).toBe(content)
    })

    it("detects downgrade and stops without --force", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Manifest says version 4.0.0, source is 3.6.0 → downgrade
      await writeManifest(targetDir, "4.0.0", {
        "agents/sf-test.md": { sha256: hash, size: content.length, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries, "3.6.0"),
      })

      expect(result.success).toBe(false)
      expect(result.downgradeDetected).toBe(true)
      expect(result.error).toContain("Downgrade detected")
    })

    it("allows downgrade with --force", async () => {
      const content = "# Agent v3"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Write existing file with different content
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-test.md"), "# Agent v4", "utf-8")

      // Manifest says version 4.0.0
      const oldHash = crypto.createHash("sha256").update(Buffer.from("# Agent v4", "utf-8")).digest("hex")
      await writeManifest(targetDir, "4.0.0", {
        "agents/sf-test.md": { sha256: oldHash, size: 10, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: true,
        mode: "full",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries, "3.6.0"),
      })

      expect(result.success).toBe(true)
      expect(result.downgradeDetected).toBe(true)
      expect(result.downgradeResult).toBeDefined()
      expect(result.downgradeResult!.previousVersion).toBe("4.0.0")
      expect(result.downgradeResult!.targetVersion).toBe("3.6.0")
    })
  })

  // ============================================================
  // Mode: fresh_install
  // ============================================================

  describe("mode: fresh_install", () => {
    it("treats CurrentState as empty — all files get create action", async () => {
      const content1 = "# Agent 1"
      const hash1 = await writeSourceFile(sourceDir, "agents/sf-one.md", content1)
      const content2 = "export const tool = {}"
      const hash2 = await writeSourceFile(sourceDir, "tools/sf_tool.ts", content2)

      // Even if files exist in target, fresh_install ignores them
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-one.md"), "old content", "utf-8")

      const entries = buildEntries([
        { path: "agents/sf-one.md", hash: hash1, size: content1.length, type: "agent" },
        { path: "tools/sf_tool.ts", hash: hash2, size: content2.length, type: "tool" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "fresh_install",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries),
      })

      expect(result.success).toBe(true)
      // All files should be create (CurrentState is empty)
      expect(result.plan.summary.create).toBe(2)
      expect(result.plan.summary.update).toBe(0)
      expect(result.plan.summary.delete).toBe(0)
      expect(result.plan.summary.skip).toBe(0)
    })

    it("ignores existing Manifest (does not read it)", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Write a manifest with higher version — should NOT trigger downgrade
      await writeManifest(targetDir, "99.0.0", {
        "agents/sf-test.md": { sha256: hash, size: content.length, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "fresh_install",
        scope: "user_shared",
        provider: createMockProvider("user_shared", entries, "3.6.0"),
      })

      // Should succeed — no downgrade detection in fresh_install
      expect(result.success).toBe(true)
      expect(result.downgradeDetected).toBe(false)
      // All files are create since CurrentState is empty
      expect(result.plan.summary.create).toBe(1)
    })
  })

  // ============================================================
  // Mode: repair_missing
  // ============================================================

  describe("mode: repair_missing", () => {
    it("only executes create actions (filters out update/delete)", async () => {
      const content1 = "# Agent 1"
      const hash1 = await writeSourceFile(sourceDir, "agents/sf-one.md", content1)
      const content2 = "# Agent 2 updated"
      const hash2 = await writeSourceFile(sourceDir, "agents/sf-two.md", content2)

      // sf-two.md exists with different content → would normally be update
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-two.md"), "# Agent 2 old", "utf-8")

      // Manifest records sf-two.md with old hash
      const oldHash = crypto.createHash("sha256").update(Buffer.from("# Agent 2 old", "utf-8")).digest("hex")
      await writeManifest(targetDir, "3.6.0", {
        "agents/sf-two.md": { sha256: oldHash, size: 14, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-one.md", hash: hash1, size: content1.length, type: "agent" },
        { path: "agents/sf-two.md", hash: hash2, size: content2.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_missing",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
      })

      expect(result.success).toBe(true)
      // Only create actions should be in the plan
      expect(result.plan.summary.create).toBe(1) // sf-one.md (missing)
      expect(result.plan.summary.update).toBe(0) // sf-two.md filtered out
      expect(result.plan.summary.delete).toBe(0)

      // Verify sf-one.md was created
      expect(existsSync(join(targetDir, "agents", "sf-one.md"))).toBe(true)
    })

    it("skips downgrade detection", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Manifest has higher version — should NOT trigger downgrade in repair_missing
      await writeManifest(targetDir, "99.0.0", {})

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_missing",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries, "3.6.0"),
      })

      expect(result.success).toBe(true)
      expect(result.downgradeDetected).toBe(false)
    })

    it("skips opencode.json merge (scope is project_runtime)", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      // Even if mergeOptions are provided, they should be ignored
      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_missing",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
        mergeOptions: {
          sourceConfig: {},
          preserveUserOverrides: true,
          backupBeforeDowngrade: false,
        },
      })

      expect(result.success).toBe(true)
      // No opencode.json should be created
      expect(existsSync(join(targetDir, "opencode.json"))).toBe(false)
    })
  })

  // ============================================================
  // Mode: repair_full
  // ============================================================

  describe("mode: repair_full", () => {
    it("executes create/update/delete actions", async () => {
      const content1 = "# Agent 1"
      const hash1 = await writeSourceFile(sourceDir, "agents/sf-one.md", content1)
      const content2 = "# Agent 2 updated"
      const hash2 = await writeSourceFile(sourceDir, "agents/sf-two.md", content2)

      // sf-two.md exists with different content → update
      await mkdir(join(targetDir, "agents"), { recursive: true })
      await writeFile(join(targetDir, "agents", "sf-two.md"), "# Agent 2 old", "utf-8")

      // sf-orphan.md exists but not in desired → delete
      await writeFile(join(targetDir, "agents", "sf-orphan.md"), "# Orphan", "utf-8")

      // Manifest records sf-two.md and sf-orphan.md
      const oldHash = crypto.createHash("sha256").update(Buffer.from("# Agent 2 old", "utf-8")).digest("hex")
      const orphanHash = crypto.createHash("sha256").update(Buffer.from("# Orphan", "utf-8")).digest("hex")
      await writeManifest(targetDir, "3.6.0", {
        "agents/sf-two.md": { sha256: oldHash, size: 14, type: "agent" },
        "agents/sf-orphan.md": { sha256: orphanHash, size: 8, type: "agent" },
      })

      const entries = buildEntries([
        { path: "agents/sf-one.md", hash: hash1, size: content1.length, type: "agent" },
        { path: "agents/sf-two.md", hash: hash2, size: content2.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_full",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
      })

      expect(result.success).toBe(true)
      expect(result.plan.summary.create).toBe(1) // sf-one.md
      expect(result.plan.summary.update).toBe(1) // sf-two.md
      expect(result.plan.summary.delete).toBe(1) // sf-orphan.md

      // Verify files
      expect(existsSync(join(targetDir, "agents", "sf-one.md"))).toBe(true)
      const updatedContent = await readFile(join(targetDir, "agents", "sf-two.md"), "utf-8")
      expect(updatedContent).toBe(content2)
      expect(existsSync(join(targetDir, "agents", "sf-orphan.md"))).toBe(false)
    })

    it("skips downgrade detection", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      // Manifest has higher version — should NOT trigger downgrade in repair_full
      await writeManifest(targetDir, "99.0.0", {})

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_full",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries, "3.6.0"),
      })

      expect(result.success).toBe(true)
      expect(result.downgradeDetected).toBe(false)
    })

    it("skips opencode.json merge", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "repair_full",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
      })

      expect(result.success).toBe(true)
      // No opencode.json should be created
      expect(existsSync(join(targetDir, "opencode.json"))).toBe(false)
    })
  })

  // ============================================================
  // Degraded mode handling (R7.5)
  // ============================================================

  describe("degraded mode handling (R7.5)", () => {
    it("returns failure result when provider throws — does not crash", async () => {
      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "project_runtime",
        provider: createThrowingProvider("project_runtime"),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Simulated provider crash")
    })

    it("returns failure result when discovery fails", async () => {
      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "project_runtime",
        provider: createFailingProvider("project_runtime"),
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Discovery failed")
    })

    it("returns failure result when target directory is not writable", async () => {
      const nonexistentTarget = join(tmpdir(), "nonexistent-" + Date.now())

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash: "a".repeat(64), size: 10, type: "agent" },
      ])

      const result = await reconcile({
        sourceDir,
        targetDir: nonexistentTarget,
        force: false,
        mode: "full",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
      })

      expect(result.success).toBe(false)
      expect(result.targetPreflightPassed).toBe(false)
    })
  })

  // ============================================================
  // Scope isolation
  // ============================================================

  describe("scope isolation", () => {
    it("project_runtime scope does not acquire lock", async () => {
      const content = "# Agent"
      const hash = await writeSourceFile(sourceDir, "agents/sf-test.md", content)

      const entries = buildEntries([
        { path: "agents/sf-test.md", hash, size: content.length, type: "agent" },
      ])

      // Should succeed without lock file being created
      const result = await reconcile({
        sourceDir,
        targetDir,
        force: false,
        mode: "full",
        scope: "project_runtime",
        provider: createMockProvider("project_runtime", entries),
      })

      expect(result.success).toBe(true)
      // No lock file should exist
      expect(existsSync(join(targetDir, ".specforge.lock"))).toBe(false)
    })
  })
})
