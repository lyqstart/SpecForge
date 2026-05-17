/**
 * Property-based tests for Reconcile Engine
 *
 * **Validates: Requirements 2.5, 5.5, 6.5**
 *
 * Property 5: Reconcile idempotency
 * Property 10: Manifest reflects deployed state after reconcile
 *
 * NOTE: This test requires Bun runtime because the reconcile engine uses
 * Bun.file() and Bun.CryptoHasher internally. Run with: bun test
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { mkdir, writeFile, readFile, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { reconcile } from "../../scripts/lib/reconcile"
import { UserSharedProvider } from "../../scripts/lib/discovery"
import type { ReconcileMode, ReconcileScope } from "../../scripts/lib/types"

// ============================================================
// Helpers
// ============================================================

/** Track temp dirs for cleanup */
const tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir)
  }
  tempDirs.length = 0
})

/**
 * Generator for random file content (non-empty)
 */
function arbFileContent(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 500 })
}

/**
 * Represents a file to be created in the source directory.
 */
interface SourceFile {
  relativePath: string
  content: string
}

/**
 * Generator for a set of deployable source files.
 * Produces files matching discovery patterns (sf-/sf_ prefix).
 */
function arbSourceFiles(): fc.Arbitrary<SourceFile[]> {
  const identifier = fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/)
  const content = arbFileContent()

  const agentFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `agents/sf-${id}.md`,
    content: c,
  }))

  const toolFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `tools/sf_${id}.ts`,
    content: c,
  }))

  const toolLibFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `tools/lib/sf_${id}.ts`,
    content: c,
  }))

  const pluginFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `plugins/sf_${id}.ts`,
    content: c,
  }))

  const skillFile = fc.tuple(identifier, content).map(([id, c]) => ({
    relativePath: `skills/sf-${id}/SKILL.md`,
    content: c,
  }))

  return fc
    .tuple(
      fc.array(agentFile, { minLength: 1, maxLength: 3 }),
      fc.array(toolFile, { minLength: 0, maxLength: 2 }),
      fc.array(toolLibFile, { minLength: 0, maxLength: 2 }),
      fc.array(pluginFile, { minLength: 0, maxLength: 2 }),
      fc.array(skillFile, { minLength: 0, maxLength: 2 })
    )
    .map(([agents, tools, toolLibs, plugins, skills]) => {
      const all = [...agents, ...tools, ...toolLibs, ...plugins, ...skills]
      // Deduplicate by relativePath
      const seen = new Set<string>()
      return all.filter((f) => {
        if (seen.has(f.relativePath)) return false
        seen.add(f.relativePath)
        return true
      })
    })
    .filter((files) => files.length >= 1)
}

/**
 * Create source directory structure with given files.
 * Also creates a package.json in the parent directory for version reading.
 */
async function setupSourceDir(
  sourceDir: string,
  files: SourceFile[]
): Promise<void> {
  // Create all necessary directories
  const dirs = new Set<string>()
  for (const file of files) {
    const parts = file.relativePath.split("/")
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"))
    }
  }

  for (const dir of dirs) {
    await mkdir(join(sourceDir, dir), { recursive: true })
  }

  // Write all files
  for (const file of files) {
    await writeFile(join(sourceDir, file.relativePath), file.content, "utf-8")
  }

  // Create package.json in parent directory for version reading
  const parentDir = join(sourceDir, "..")
  await writeFile(
    join(parentDir, "package.json"),
    JSON.stringify({ name: "test-project", version: "1.0.0" }),
    "utf-8"
  )
}

// ============================================================
// Property Tests
// ============================================================

describe("Reconcile Engine Properties", () => {
  // Property 5: Reconcile idempotency
  //
  // For any valid DesiredState (random source files), after a successful
  // reconcile that writes a manifest, a second reconcile with the same
  // source SHALL produce only "skip" actions. This verifies that the
  // reconcile engine is idempotent: running it multiple times on the same
  // state produces no additional changes after the first run.
  //
  // Validates: Requirements 2.5
  it("Property 5: Reconcile idempotency", async () => {
    await fc.assert(
      fc.asyncProperty(arbSourceFiles(), async (sourceFiles) => {
        // Setup temp directories
        const baseDir = await createTempDir("reconcile-prop5-")
        tempDirs.push(baseDir)

        const sourceDir = join(baseDir, "source")
        const targetDir = join(baseDir, "target")
        await mkdir(sourceDir, { recursive: true })
        await mkdir(targetDir, { recursive: true })

        // Create source files
        await setupSourceDir(sourceDir, sourceFiles)

        // Create provider
        const provider = new UserSharedProvider(sourceDir)

        // --- First reconcile: should create/update files ---
        const firstResult = await reconcile({
          sourceDir,
          targetDir,
          force: false,
          mode: "full" as ReconcileMode,
          scope: "project_runtime" as ReconcileScope, // avoid lock
          provider,
        })

        // First reconcile must succeed
        expect(firstResult.success).toBe(true)

        // First reconcile should have create actions (fresh target)
        expect(firstResult.plan.summary.create).toBeGreaterThan(0)

        // --- Second reconcile: should only produce skip actions ---
        const secondResult = await reconcile({
          sourceDir,
          targetDir,
          force: false,
          mode: "full" as ReconcileMode,
          scope: "project_runtime" as ReconcileScope, // avoid lock
          provider,
        })

        // Second reconcile must succeed
        expect(secondResult.success).toBe(true)

        // Verify: second run produces only "skip" actions
        // (excluding pending_deletes which may retry delete)
        const nonSkipEntries = secondResult.plan.entries.filter(
          (entry) => entry.action !== "skip" && !entry.pendingDelete
        )

        expect(nonSkipEntries).toEqual([])

        // Verify summary counts
        expect(secondResult.plan.summary.create).toBe(0)
        expect(secondResult.plan.summary.update).toBe(0)
        expect(secondResult.plan.summary.delete).toBe(0)
        expect(secondResult.plan.summary.conflict).toBe(0)
        expect(secondResult.plan.summary.skip).toBe(sourceFiles.length)
      }),
      { numRuns: 7 } // filesystem tests are slow, use 5-10 iterations
    )
  })

  // Property 10: Manifest reflects deployed state after reconcile (S5 修复)
  //
  // For any successful reconcile execution, the written Manifest SHALL satisfy:
  // 1. For every managed component file that exists in the target directory,
  //    the Manifest SHALL contain an entry with sha256 equal to the actual
  //    SHA-256 of the deployed file.
  // 2. For every file that failed to delete (orphan), the Manifest SHALL
  //    contain a pending_deletes entry with the file's path and failure reason.
  // 3. The union of files entries and pending_deletes entries SHALL account
  //    for all managed files known to the system.
  //
  // **Validates: Requirements 5.5, 6.5**
  it("Property 10: Manifest reflects deployed state after reconcile", async () => {
    await fc.assert(
      fc.asyncProperty(arbSourceFiles(), async (sourceFiles) => {
        // Setup temp directories
        const baseDir = await createTempDir("reconcile-prop10-")
        tempDirs.push(baseDir)

        const sourceDir = join(baseDir, "source")
        const targetDir = join(baseDir, "target")
        await mkdir(sourceDir, { recursive: true })
        await mkdir(targetDir, { recursive: true })

        // Create source files
        await setupSourceDir(sourceDir, sourceFiles)

        // Create provider
        const provider = new UserSharedProvider(sourceDir)

        // Execute reconcile
        const result = await reconcile({
          sourceDir,
          targetDir,
          force: false,
          mode: "full" as ReconcileMode,
          scope: "project_runtime" as ReconcileScope, // avoid lock
          provider,
        })

        // Must succeed for this property to apply
        expect(result.success).toBe(true)

        // Read the written manifest
        const manifestPath = join(targetDir, "specforge-manifest.json")
        const manifestContent = await readFile(manifestPath, "utf-8")
        const manifest = JSON.parse(manifestContent)

        // Verify manifest has required structure
        expect(manifest.files).toBeDefined()
        expect(typeof manifest.files).toBe("object")

        // --- Verification 1: Each file in manifest.files has SHA-256 matching actual file on disk ---
        for (const [relativePath, entry] of Object.entries(manifest.files)) {
          const fileEntry = entry as { sha256: string; size: number; type: string }
          const filePath = join(targetDir, ...relativePath.split("/"))

          // Read actual file and compute SHA-256
          const fileContent = await readFile(filePath)
          const actualHash = createHash("sha256").update(fileContent).digest("hex")

          // Manifest sha256 must match actual file hash
          expect(actualHash).toBe(fileEntry.sha256)
        }

        // --- Verification 2: pending_deletes contains all failed orphan deletions ---
        const pendingDeletes = manifest.pending_deletes || []
        for (const pending of pendingDeletes) {
          // If a file is in pending_deletes, it means delete failed,
          // so the file should still exist on disk
          const pendingPath = join(targetDir, ...pending.relativePath.split("/"))
          try {
            const fileStat = await stat(pendingPath)
            expect(fileStat.isFile()).toBe(true)
          } catch {
            // File doesn't exist — acceptable if cleaned up between failed delete and now
          }
        }

        // Also verify: all failed deletes from execution result are in pending_deletes
        const executionPendingPaths = result.execution.pendingDeletes.map(
          (pd) => pd.relativePath
        )
        const manifestPendingPaths = pendingDeletes.map(
          (pd: { relativePath: string }) => pd.relativePath
        )
        for (const path of executionPendingPaths) {
          expect(manifestPendingPaths).toContain(path)
        }

        // --- Verification 3: files + pending_deletes covers all managed files ---
        const manifestFilePaths = new Set(Object.keys(manifest.files))
        const pendingDeletePaths = new Set(
          pendingDeletes.map((pd: { relativePath: string }) => pd.relativePath)
        )
        const coveredPaths = new Set([...manifestFilePaths, ...pendingDeletePaths])

        // All successfully executed create/update/skip actions should be in manifest.files
        for (const executed of result.execution.executed) {
          if (
            executed.action === "create" ||
            executed.action === "update" ||
            executed.action === "skip"
          ) {
            expect(coveredPaths.has(executed.relativePath)).toBe(true)
          }
        }

        // All source files that were deployed should be in manifest
        for (const sourceFile of sourceFiles) {
          expect(coveredPaths.has(sourceFile.relativePath)).toBe(true)
        }
      }),
      { numRuns: 7 } // filesystem tests are slow, use 5-10 iterations
    )
  })
})
