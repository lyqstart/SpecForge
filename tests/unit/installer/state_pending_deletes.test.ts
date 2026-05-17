/**
 * Unit tests for scripts/lib/state.ts — rehydratePendingDeletes
 *
 * Validates:
 * - File still exists → injected into CurrentState as managed orphan candidate
 *   (currentHash computed, manifestHash=undefined, isManagedComponent implied)
 * - File no longer exists → marked as resolved for removal from pending_deletes
 * - Component type inference from path
 * - Empty pending_deletes array → empty results
 *
 * Requirements: 5.5, 6.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import * as crypto from "node:crypto"
import * as stateModule from "../../../scripts/lib/state"
import type { PendingDeleteEntry } from "../../../scripts/lib/types"

const { rehydratePendingDeletes, inferComponentTypeFromPath } = stateModule

describe("rehydratePendingDeletes", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "state-pending-test-"))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it("should return empty results for empty pending_deletes array", async () => {
    const result = await rehydratePendingDeletes(tempDir, [])

    expect(result.activeEntries).toEqual([])
    expect(result.resolvedEntries).toEqual([])
  })

  it("should mark file as active when it still exists on disk", async () => {
    // Create a file that simulates a pending delete that still exists
    const agentsDir = join(tempDir, "agents")
    await mkdir(agentsDir, { recursive: true })
    const filePath = join(agentsDir, "sf-old-agent.md")
    const content = "# Old Agent\nThis should be deleted"
    await writeFile(filePath, content, "utf-8")

    const expectedHash = crypto
      .createHash("sha256")
      .update(Buffer.from(content, "utf-8"))
      .digest("hex")

    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "agents/sf-old-agent.md",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EACCES: permission denied",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries).toHaveLength(1)
    expect(result.resolvedEntries).toHaveLength(0)

    const active = result.activeEntries[0]
    expect(active.relativePath).toBe("agents/sf-old-agent.md")
    expect(active.currentHash).toBe(expectedHash)
    expect(active.manifestHash).toBeUndefined() // Critical: undefined for Planner R14.7
    expect(active.componentType).toBe("agent")
    expect(active.existsOnDisk).toBe(true)
    expect(active.size).toBeGreaterThan(0)
  })

  it("should mark file as resolved when it no longer exists on disk", async () => {
    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "tools/sf_old_tool.ts",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EBUSY: resource busy",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries).toHaveLength(0)
    expect(result.resolvedEntries).toHaveLength(1)
    expect(result.resolvedEntries[0]).toEqual(pendingDeletes[0])
  })

  it("should handle mixed scenario: some files exist, some don't", async () => {
    // Create one file that exists
    const toolsDir = join(tempDir, "tools")
    await mkdir(toolsDir, { recursive: true })
    const existingFile = join(toolsDir, "sf_existing.ts")
    await writeFile(existingFile, "export const x = 1;", "utf-8")

    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "tools/sf_existing.ts",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EACCES",
      },
      {
        relativePath: "tools/sf_gone.ts",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EBUSY",
      },
      {
        relativePath: "plugins/sf_old_plugin.ts",
        failedAt: "2024-01-02T00:00:00.000Z",
        reason: "EPERM",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries).toHaveLength(1)
    expect(result.activeEntries[0].relativePath).toBe("tools/sf_existing.ts")
    expect(result.activeEntries[0].manifestHash).toBeUndefined()
    expect(result.activeEntries[0].componentType).toBe("tool")

    expect(result.resolvedEntries).toHaveLength(2)
    expect(result.resolvedEntries[0].relativePath).toBe("tools/sf_gone.ts")
    expect(result.resolvedEntries[1].relativePath).toBe("plugins/sf_old_plugin.ts")
  })

  it("should compute correct currentHash for existing file", async () => {
    const pluginsDir = join(tempDir, "plugins")
    await mkdir(pluginsDir, { recursive: true })
    const filePath = join(pluginsDir, "sf_test_plugin.ts")
    const content = "export function init() { return true; }"
    await writeFile(filePath, content, "utf-8")

    const expectedHash = crypto
      .createHash("sha256")
      .update(Buffer.from(content, "utf-8"))
      .digest("hex")

    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "plugins/sf_test_plugin.ts",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EACCES",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries[0].currentHash).toBe(expectedHash)
  })

  it("should handle tools/lib/ path correctly", async () => {
    const libDir = join(tempDir, "tools", "lib")
    await mkdir(libDir, { recursive: true })
    const filePath = join(libDir, "sf_helper.ts")
    await writeFile(filePath, "export const helper = true;", "utf-8")

    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "tools/lib/sf_helper.ts",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EACCES",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries).toHaveLength(1)
    expect(result.activeEntries[0].componentType).toBe("tool_lib")
  })

  it("should handle skills/ path correctly", async () => {
    const skillDir = join(tempDir, "skills", "sf-old-skill")
    await mkdir(skillDir, { recursive: true })
    const filePath = join(skillDir, "SKILL.md")
    await writeFile(filePath, "# Old Skill", "utf-8")

    const pendingDeletes: PendingDeleteEntry[] = [
      {
        relativePath: "skills/sf-old-skill/SKILL.md",
        failedAt: "2024-01-01T00:00:00.000Z",
        reason: "EACCES",
      },
    ]

    const result = await rehydratePendingDeletes(tempDir, pendingDeletes)

    expect(result.activeEntries).toHaveLength(1)
    expect(result.activeEntries[0].componentType).toBe("skill")
  })
})

describe("inferComponentTypeFromPath", () => {
  it("should infer 'agent' for agents/ paths", () => {
    expect(inferComponentTypeFromPath("agents/sf-orchestrator.md")).toBe("agent")
    expect(inferComponentTypeFromPath("agents/sf-executor.md")).toBe("agent")
  })

  it("should infer 'tool_lib' for tools/lib/ paths", () => {
    expect(inferComponentTypeFromPath("tools/lib/sf_helper.ts")).toBe("tool_lib")
    expect(inferComponentTypeFromPath("tools/lib/sf_gate_types.ts")).toBe("tool_lib")
  })

  it("should infer 'tool' for tools/ top-level paths", () => {
    expect(inferComponentTypeFromPath("tools/sf_state_read.ts")).toBe("tool")
    expect(inferComponentTypeFromPath("tools/sf_design_gate.ts")).toBe("tool")
  })

  it("should infer 'plugin' for plugins/ paths", () => {
    expect(inferComponentTypeFromPath("plugins/sf_specforge.ts")).toBe("plugin")
  })

  it("should infer 'skill' for skills/ paths", () => {
    expect(inferComponentTypeFromPath("skills/superpowers-brainstorming/SKILL.md")).toBe("skill")
    expect(inferComponentTypeFromPath("skills/sf-workflow-feature-spec/SKILL.md")).toBe("skill")
  })

  it("should handle backslash paths (Windows)", () => {
    expect(inferComponentTypeFromPath("agents\\sf-orchestrator.md")).toBe("agent")
    expect(inferComponentTypeFromPath("tools\\lib\\sf_helper.ts")).toBe("tool_lib")
  })

  it("should default to 'tool' for unknown paths", () => {
    expect(inferComponentTypeFromPath("unknown/file.ts")).toBe("tool")
  })
})
