/**
 * Unit tests for partial commit recovery integration in reconcile flow
 *
 * Task 17.3: Validates that recoverPartialCommit() is correctly integrated
 * into the reconcile flow (step 3).
 *
 * - When partial_commit.journal exists → recovery runs before DesiredState build
 * - Recovery writes Manifest from journal's manifest_payload
 * - Recovery deletes the journal file
 * - After recovery, normal reconcile flow continues
 * - When no journal exists → reconcile proceeds normally
 *
 * Validates Requirements: 4.3, 4.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"

import { reconcile, type ReconcileResult } from "../../../scripts/lib/reconcile"
import type { PartialCommitJournal } from "../../../scripts/lib/commit"
import type { DesiredStateProvider, DiscoveryResult, DesiredState } from "../../../scripts/lib/discovery"
import type { ReconcileScope, DesiredStateEntry } from "../../../scripts/lib/types"

// ============================================================
// Test Helpers
// ============================================================

function sha256(content: string): string {
  const hash = crypto.createHash("sha256")
  hash.update(content, "utf-8")
  return hash.digest("hex")
}

/**
 * A minimal DesiredStateProvider for testing that returns a fixed DesiredState.
 * Uses project_runtime scope to avoid lock acquisition in tests.
 */
class TestProvider implements DesiredStateProvider {
  scope: ReconcileScope
  private desiredState: DesiredState

  constructor(
    scope: ReconcileScope,
    entries?: Map<string, DesiredStateEntry>,
    version?: string
  ) {
    this.scope = scope
    this.desiredState = {
      entries: entries ?? new Map(),
      version: version ?? "3.6.0",
    }
  }

  async buildDesiredState(): Promise<DiscoveryResult> {
    return { ok: true, state: this.desiredState }
  }
}

/**
 * Create a valid partial_commit.journal file in the target directory
 */
async function writeJournal(
  targetDir: string,
  overrides?: Partial<PartialCommitJournal>
): Promise<PartialCommitJournal> {
  const journal: PartialCommitJournal = {
    schema_version: "1.0",
    run_id: "test-recovery-run-id",
    scope: "user_shared",
    created_at: "2024-06-15T12:00:00.000Z",
    phase_completed: "opencode_merge",
    manifest_payload: {
      shared_version: "3.5.0",
      files: {
        "agents/sf-orchestrator.md": {
          sha256: "a".repeat(64),
          size: 1024,
          type: "agent",
        },
        "tools/sf_state_read.ts": {
          sha256: "b".repeat(64),
          size: 2048,
          type: "tool",
        },
      },
      pending_deletes: [],
      managed_agents: ["sf-orchestrator"],
      managed_agent_hashes: { "sf-orchestrator": "a".repeat(64) },
    },
    ...overrides,
  }

  await writeFile(
    join(targetDir, "partial_commit.journal"),
    JSON.stringify(journal, null, 2)
  )

  return journal
}

// ============================================================
// Tests
// ============================================================

describe("reconcile — partial commit recovery integration (Task 17.3)", () => {
  let sourceDir: string
  let targetDir: string

  beforeEach(async () => {
    sourceDir = await mkdtemp(join(tmpdir(), "reconcile-src-"))
    targetDir = await mkdtemp(join(tmpdir(), "reconcile-tgt-"))

    // Create minimal source structure for discovery to work
    await mkdir(join(sourceDir, "agents"), { recursive: true })
    await mkdir(join(sourceDir, "tools"), { recursive: true })
  })

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true })
    await rm(targetDir, { recursive: true, force: true })
  })

  it("should recover partial commit when journal exists before continuing reconcile", async () => {
    // Write a journal that simulates a crashed commit
    await writeJournal(targetDir)

    // Create source files matching the journal's manifest_payload
    const agentContent = "# SF Orchestrator Agent"
    const toolContent = "export function stateRead() {}"
    await writeFile(join(sourceDir, "agents", "sf-orchestrator.md"), agentContent)
    await writeFile(join(sourceDir, "tools", "sf_state_read.ts"), toolContent)

    // Build a provider with matching entries
    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-orchestrator.md",
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
      [
        "tools/sf_state_read.ts",
        {
          relativePath: "tools/sf_state_read.ts",
          componentType: "tool",
          sourceHash: sha256(toolContent),
          size: Buffer.byteLength(toolContent),
        },
      ],
    ])

    // Use project_runtime + repair_full to avoid lock and downgrade detection
    const provider = new TestProvider("project_runtime", entries)

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    // Recovery should have been performed
    expect(result.partialCommitRecovered).toBe(true)

    // Journal should be deleted after recovery
    expect(existsSync(join(targetDir, "partial_commit.journal"))).toBe(false)

    // Manifest should exist (written by recovery, then potentially updated by commit)
    expect(existsSync(join(targetDir, "specforge-manifest.json"))).toBe(true)
  })

  it("should set partialCommitRecovered=false when no journal exists", async () => {
    // No journal file — normal reconcile flow
    const agentContent = "# SF Orchestrator Agent"
    await writeFile(join(sourceDir, "agents", "sf-orchestrator.md"), agentContent)

    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-orchestrator.md",
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
    ])

    const provider = new TestProvider("project_runtime", entries)

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    expect(result.partialCommitRecovered).toBe(false)
  })

  it("should write Manifest from journal payload during recovery", async () => {
    // Write journal with specific manifest_payload
    await writeJournal(targetDir, {
      manifest_payload: {
        shared_version: "3.5.0",
        files: {
          "agents/sf-executor.md": {
            sha256: "c".repeat(64),
            size: 512,
            type: "agent",
          },
        },
        pending_deletes: [],
        managed_agents: ["sf-executor"],
        managed_agent_hashes: { "sf-executor": "c".repeat(64) },
      },
    })

    // Create a source file so discovery succeeds
    const agentContent = "# SF Executor"
    await writeFile(join(sourceDir, "agents", "sf-executor.md"), agentContent)

    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-executor.md",
        {
          relativePath: "agents/sf-executor.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
    ])

    const provider = new TestProvider("project_runtime", entries)

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    expect(result.partialCommitRecovered).toBe(true)

    // After recovery, the manifest should have been written by recovery first,
    // then the normal reconcile flow reads it and may update it.
    // The key point: recovery ensures Manifest is up-to-date before step 5 reads it.
    const manifestContent = await readFile(
      join(targetDir, "specforge-manifest.json"),
      "utf-8"
    )
    const manifest = JSON.parse(manifestContent)
    // The final manifest reflects the reconcile commit (step 10), not just recovery
    expect(manifest.shared_version).toBeDefined()
  })

  it("should handle corrupted journal gracefully and continue reconcile", async () => {
    // Write a corrupted journal
    await writeFile(
      join(targetDir, "partial_commit.journal"),
      "not valid JSON {{{{"
    )

    // Create source file
    const agentContent = "# Agent"
    await writeFile(join(sourceDir, "agents", "sf-orchestrator.md"), agentContent)

    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-orchestrator.md",
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
    ])

    const provider = new TestProvider("project_runtime", entries)

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    // Corrupted journal → recoverPartialCommit returns null → no recovery
    expect(result.partialCommitRecovered).toBe(false)

    // Corrupted journal should be cleaned up by recoverPartialCommit
    expect(existsSync(join(targetDir, "partial_commit.journal"))).toBe(false)

    // Reconcile should still succeed
    expect(result.success).toBe(true)
  })

  it("should recover journal then continue with normal reconcile creating new files", async () => {
    // Write journal for an older version
    await writeJournal(targetDir, {
      manifest_payload: {
        shared_version: "3.5.0",
        files: {
          "agents/sf-orchestrator.md": {
            sha256: "old_hash".padEnd(64, "0"),
            size: 100,
            type: "agent",
          },
        },
        pending_deletes: [],
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: { "sf-orchestrator": "old_hash".padEnd(64, "0") },
      },
    })

    // Source has a new file not in the journal's manifest
    const agentContent = "# SF Orchestrator v2"
    const toolContent = "export function newTool() {}"
    await writeFile(join(sourceDir, "agents", "sf-orchestrator.md"), agentContent)
    await writeFile(join(sourceDir, "tools", "sf_new_tool.ts"), toolContent)

    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-orchestrator.md",
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
      [
        "tools/sf_new_tool.ts",
        {
          relativePath: "tools/sf_new_tool.ts",
          componentType: "tool",
          sourceHash: sha256(toolContent),
          size: Buffer.byteLength(toolContent),
        },
      ],
    ])

    const provider = new TestProvider("project_runtime", entries)

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    // Recovery happened
    expect(result.partialCommitRecovered).toBe(true)

    // Normal reconcile continued and succeeded
    expect(result.success).toBe(true)

    // The new tool file should have been created by the reconcile
    expect(existsSync(join(targetDir, "tools", "sf_new_tool.ts"))).toBe(true)

    // The agent file should have been created/updated
    expect(existsSync(join(targetDir, "agents", "sf-orchestrator.md"))).toBe(true)
  })

  it("should recover partial commit in project_runtime scope", async () => {
    // Write journal with project_runtime scope
    await writeJournal(targetDir, {
      scope: "project_runtime",
      manifest_payload: {
        shared_version: "3.6.0",
        files: {
          "agents/sf-orchestrator.md": {
            sha256: "a".repeat(64),
            size: 1024,
            type: "agent",
          },
        },
        pending_deletes: [],
        managed_agents: ["sf-orchestrator"],
        managed_agent_hashes: { "sf-orchestrator": "a".repeat(64) },
      },
    })

    const agentContent = "# Agent"
    await writeFile(join(sourceDir, "agents", "sf-orchestrator.md"), agentContent)

    const entries = new Map<string, DesiredStateEntry>([
      [
        "agents/sf-orchestrator.md",
        {
          relativePath: "agents/sf-orchestrator.md",
          componentType: "agent",
          sourceHash: sha256(agentContent),
          size: Buffer.byteLength(agentContent),
        },
      ],
    ])

    const provider: DesiredStateProvider = {
      scope: "project_runtime",
      async buildDesiredState(): Promise<DiscoveryResult> {
        return {
          ok: true,
          state: { entries, version: "3.6.0" },
        }
      },
    }

    const result = await reconcile({
      sourceDir,
      targetDir,
      force: false,
      mode: "repair_full",
      scope: "project_runtime",
      provider,
    })

    // Recovery should have been performed regardless of scope
    expect(result.partialCommitRecovered).toBe(true)

    // Journal should be cleaned up
    expect(existsSync(join(targetDir, "partial_commit.journal"))).toBe(false)
  })
})
