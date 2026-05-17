/**
 * Property-based tests for Executor Module
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 6.4, 8.3**
 *
 * Property 6: Conflict resolution follows force flag
 * Property 7: Non-managed file safety invariant
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import { executePlan } from "../../scripts/lib/executor"
import type {
  PlanEntry,
  ReconcilePlan,
  PlanSummary,
  PlanDiagnostics,
  ReconcileScope,
} from "../../scripts/lib/types"

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
 * Compute SHA-256 hash of content
 */
function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex")
}

/**
 * Create an empty ReconcilePlan with given entries
 */
function makePlan(entries: PlanEntry[]): ReconcilePlan {
  const summary: PlanSummary = {
    create: entries.filter((e) => e.action === "create").length,
    update: entries.filter((e) => e.action === "update").length,
    delete: entries.filter((e) => e.action === "delete").length,
    skip: entries.filter((e) => e.action === "skip").length,
    conflict: entries.filter((e) => e.action === "conflict").length,
  }
  const diagnostics: PlanDiagnostics = {
    allDecisions: [],
    ignored: [],
    noAction: [],
  }
  return { entries, summary, diagnostics }
}

/**
 * Read file content as string, returns null if file doesn't exist
 */
async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8")
  } catch {
    return null
  }
}

/**
 * Generator for random file content (non-empty)
 */
function arbFileContent(): fc.Arbitrary<string> {
  return fc.string({ minLength: 1, maxLength: 500 })
}

/**
 * Generator for a valid POSIX relative path with sf- prefix (managed file)
 */
function arbManagedRelativePath(): fc.Arbitrary<string> {
  const identifier = fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/)
  return fc.oneof(
    identifier.map((id) => `agents/sf-${id}.md`),
    identifier.map((id) => `tools/sf_${id}.ts`),
    identifier.map((id) => `plugins/sf_${id}.ts`)
  )
}

/**
 * Generator for a non-managed file path (no sf-/sf_ prefix, not in manifest)
 */
function arbNonManagedRelativePath(): fc.Arbitrary<string> {
  const identifier = fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/)
  return fc.oneof(
    identifier.map((id) => `agents/${id}.md`),
    identifier.map((id) => `tools/${id}.ts`),
    identifier.map((id) => `plugins/${id}.ts`),
    identifier.map((id) => `${id}.txt`),
    identifier.map((id) => `config/${id}.json`)
  )
}

// ============================================================
// Property Tests
// ============================================================

describe("Executor Module Properties", () => {
  // Property 6: Conflict resolution follows force flag
  //
  // For any plan containing conflict entries:
  // - When force=false: conflicted files remain unchanged on disk
  // - When force=true: conflicted files are overwritten with source content
  //   (matching sourceHash)
  //
  // Validates: Requirements 3.1, 3.2, 3.3, 8.3
  it("Property 6: Conflict resolution follows force flag", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.tuple(arbManagedRelativePath(), arbFileContent(), arbFileContent()),
          { minLength: 1, maxLength: 5 }
        ),
        async (fileSpecs) => {
          // Deduplicate by path
          const seen = new Set<string>()
          const uniqueSpecs = fileSpecs.filter(([path]) => {
            if (seen.has(path)) return false
            seen.add(path)
            return true
          })

          // Setup temp directories
          const sourceDir = await createTempDir("executor-prop6-src-")
          const targetDir = await createTempDir("executor-prop6-tgt-")
          tempDirs.push(sourceDir, targetDir)

          // Create source files (new version) and target files (user-modified version)
          const conflictEntries: PlanEntry[] = []
          const originalTargetContents: Map<string, string> = new Map()

          for (const [relativePath, sourceContent, targetContent] of uniqueSpecs) {
            // Ensure source and target content are different
            const actualTargetContent =
              sourceContent === targetContent
                ? targetContent + "_modified"
                : targetContent

            // Write source file
            const sourceFilePath = join(sourceDir, ...relativePath.split("/"))
            await mkdir(join(sourceDir, ...relativePath.split("/").slice(0, -1)), {
              recursive: true,
            })
            await writeFile(sourceFilePath, sourceContent, "utf-8")

            // Write target file (simulating user modification)
            const targetFilePath = join(targetDir, ...relativePath.split("/"))
            await mkdir(join(targetDir, ...relativePath.split("/").slice(0, -1)), {
              recursive: true,
            })
            await writeFile(targetFilePath, actualTargetContent, "utf-8")

            originalTargetContents.set(relativePath, actualTargetContent)

            const sourceHash = sha256(sourceContent)

            conflictEntries.push({
              relativePath,
              action: "conflict",
              componentType: "agent",
              reason: "User customization detected",
              sourceHash,
              currentHash: sha256(actualTargetContent),
            })
          }

          // --- Test with force=false ---
          const planNoForce = makePlan([...conflictEntries])
          const resultNoForce = await executePlan(planNoForce, {
            sourceDir,
            targetDir,
            force: false,
            scope: "user_shared" as ReconcileScope,
          })

          // Execution should succeed (conflicts are skipped, not failures)
          expect(resultNoForce.success).toBe(true)

          // Verify: all conflict files remain unchanged when !force
          for (const [relativePath, originalContent] of originalTargetContents) {
            const targetFilePath = join(targetDir, ...relativePath.split("/"))
            const currentContent = await readFileContent(targetFilePath)
            expect(currentContent).toBe(originalContent)
          }

          // Verify: warnings are emitted for skipped conflicts
          expect(resultNoForce.warnings.length).toBeGreaterThanOrEqual(
            conflictEntries.length
          )

          // --- Test with force=true ---
          const planForce = makePlan([...conflictEntries])
          const resultForce = await executePlan(planForce, {
            sourceDir,
            targetDir,
            force: true,
            scope: "user_shared" as ReconcileScope,
          })

          // Execution should succeed
          expect(resultForce.success).toBe(true)

          // Verify: all conflict files are overwritten with source content
          for (const entry of conflictEntries) {
            const targetFilePath = join(
              targetDir,
              ...entry.relativePath.split("/")
            )
            const currentContent = await readFile(targetFilePath)
            const currentHash = sha256(currentContent)
            // After force overwrite, file hash should match sourceHash
            expect(currentHash).toBe(entry.sourceHash)
          }
        }
      ),
      { numRuns: 15 }
    )
  })

  // Property 7: Non-managed file safety invariant
  //
  // For any target directory containing non-managed files (without sf-/sf_ prefix
  // and not in the Manifest), executing a reconcile plan with create/update/delete
  // actions SHALL NOT modify, delete, or alter any non-managed file.
  //
  // Validates: Requirements 3.5, 6.4
  it("Property 7: Non-managed file safety invariant", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Non-managed files to place in target
        fc.array(
          fc.tuple(arbNonManagedRelativePath(), arbFileContent()),
          { minLength: 1, maxLength: 5 }
        ),
        // Managed files for the plan (create/update/delete actions)
        fc.array(
          fc.tuple(arbManagedRelativePath(), arbFileContent()),
          { minLength: 1, maxLength: 5 }
        ),
        async (nonManagedSpecs, managedSpecs) => {
          // Deduplicate paths
          const allPaths = new Set<string>()
          const uniqueNonManaged = nonManagedSpecs.filter(([path]) => {
            if (allPaths.has(path)) return false
            allPaths.add(path)
            return true
          })
          const uniqueManaged = managedSpecs.filter(([path]) => {
            if (allPaths.has(path)) return false
            allPaths.add(path)
            return true
          })

          if (uniqueNonManaged.length === 0) return // Need at least one non-managed file

          // Setup temp directories
          const sourceDir = await createTempDir("executor-prop7-src-")
          const targetDir = await createTempDir("executor-prop7-tgt-")
          tempDirs.push(sourceDir, targetDir)

          // Record non-managed file content and hashes before execution
          const nonManagedSnapshot: Map<string, string> = new Map()

          for (const [relativePath, content] of uniqueNonManaged) {
            const targetFilePath = join(targetDir, ...relativePath.split("/"))
            await mkdir(join(targetDir, ...relativePath.split("/").slice(0, -1)), {
              recursive: true,
            })
            await writeFile(targetFilePath, content, "utf-8")
            nonManagedSnapshot.set(relativePath, sha256(content))
          }

          // Build a plan with create and update actions for managed files
          const planEntries: PlanEntry[] = []

          for (const [relativePath, content] of uniqueManaged) {
            // Write source file
            const sourceFilePath = join(sourceDir, ...relativePath.split("/"))
            await mkdir(join(sourceDir, ...relativePath.split("/").slice(0, -1)), {
              recursive: true,
            })
            await writeFile(sourceFilePath, content, "utf-8")

            const sourceHash = sha256(content)

            planEntries.push({
              relativePath,
              action: "create",
              componentType: "tool",
              reason: "New file",
              sourceHash,
            })
          }

          // Also add a delete action for a managed file that exists in target
          const deleteRelPath = "tools/sf_to_delete.ts"
          const deleteContent = "// to be deleted"
          const deleteTargetPath = join(targetDir, "tools", "sf_to_delete.ts")
          await mkdir(join(targetDir, "tools"), { recursive: true })
          await writeFile(deleteTargetPath, deleteContent, "utf-8")
          planEntries.push({
            relativePath: deleteRelPath,
            action: "delete",
            componentType: "tool",
            reason: "Orphan file",
          })

          const plan = makePlan(planEntries)

          // Execute the plan
          const result = await executePlan(plan, {
            sourceDir,
            targetDir,
            force: false,
            scope: "user_shared" as ReconcileScope,
          })

          expect(result.success).toBe(true)

          // Verify: ALL non-managed files remain unchanged
          for (const [relativePath, originalHash] of nonManagedSnapshot) {
            const targetFilePath = join(targetDir, ...relativePath.split("/"))
            const currentContent = await readFile(targetFilePath)
            const currentHash = sha256(currentContent)
            expect(currentHash).toBe(originalHash)
          }
        }
      ),
      { numRuns: 15 }
    )
  })
})
