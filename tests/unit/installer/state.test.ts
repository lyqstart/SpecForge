/**
 * Unit tests for scripts/lib/state.ts — buildCurrentState
 *
 * Validates:
 * - Valid Manifest + all files exist → correct entries with currentHash and manifestHash
 * - Valid Manifest + some files missing → currentHash = undefined, existsOnDisk = false
 * - null Manifest → filesystem-only scan (sf-/sf_ prefix detection)
 * - sf-/sf_ prefix detection in managed directories
 * - Non-managed files are excluded from entries
 * - pending_deletes rehydration logic integration
 *
 * Requirements: 6.1, 6.4, 5.5, 6.5
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import * as crypto from "node:crypto"

import { buildCurrentState } from "../../../scripts/lib/state"
import type { ValidatedManifest } from "../../../scripts/lib/manifest"
import type { UserLevelManifest } from "../../../scripts/lib/types"
import { createTempDir, cleanupTempDir } from "../../helpers/fixtures"

/**
 * Helper: compute SHA-256 of a string (matching how computeSHA256 reads file as Buffer)
 */
function sha256(content: string): string {
  return crypto.createHash("sha256").update(Buffer.from(content, "utf-8")).digest("hex")
}

/**
 * Helper: create a minimal ValidatedManifest
 */
function createValidatedManifest(
  files: Record<string, { sha256: string; size: number; type: "agent" | "tool" | "tool_lib" | "plugin" | "skill" }>,
  version = "3.5.0"
): ValidatedManifest {
  const data: UserLevelManifest = {
    schema_version: "1.0",
    shared_version: version,
    install_mode: "user_level",
    installed_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    managed_agents: [],
    managed_agent_hashes: {},
    files,
  }
  return { valid: true, data, entryWarnings: null }
}

describe("buildCurrentState", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir("state-test-")
  })

  afterEach(async () => {
    await cleanupTempDir(tempDir)
  })

  describe("valid Manifest + all files exist", () => {
    it("should build entries with correct currentHash and manifestHash", async () => {
      // Create managed directories and files
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      const agentContent = "# SF Orchestrator Agent"
      await writeFile(join(agentsDir, "sf-orchestrator.md"), agentContent, "utf-8")

      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      const toolContent = "export const tool = true;"
      await writeFile(join(toolsDir, "sf_state_read.ts"), toolContent, "utf-8")

      const agentHash = sha256(agentContent)
      const toolHash = sha256(toolContent)

      const manifest = createValidatedManifest({
        "agents/sf-orchestrator.md": { sha256: agentHash, size: agentContent.length, type: "agent" },
        "tools/sf_state_read.ts": { sha256: toolHash, size: toolContent.length, type: "tool" },
      })

      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      expect(state.manifestValid).toBe(true)
      expect(state.manifestVersion).toBe("3.5.0")
      expect(state.entries.size).toBe(2)

      const agentEntry = state.entries.get("agents/sf-orchestrator.md")
      expect(agentEntry).toBeDefined()
      expect(agentEntry!.currentHash).toBe(agentHash)
      expect(agentEntry!.manifestHash).toBe(agentHash)
      expect(agentEntry!.componentType).toBe("agent")
      expect(agentEntry!.existsOnDisk).toBe(true)
      expect(agentEntry!.size).toBeGreaterThan(0)

      const toolEntry = state.entries.get("tools/sf_state_read.ts")
      expect(toolEntry).toBeDefined()
      expect(toolEntry!.currentHash).toBe(toolHash)
      expect(toolEntry!.manifestHash).toBe(toolHash)
      expect(toolEntry!.componentType).toBe("tool")
      expect(toolEntry!.existsOnDisk).toBe(true)
    })
  })

  describe("valid Manifest + some files missing", () => {
    it("should set currentHash = undefined and existsOnDisk = false for missing files", async () => {
      // Create only one of the two files listed in manifest
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      const agentContent = "# Agent"
      await writeFile(join(agentsDir, "sf-orchestrator.md"), agentContent, "utf-8")

      const agentHash = sha256(agentContent)
      const missingHash = "a".repeat(64) // fake hash for missing file

      const manifest = createValidatedManifest({
        "agents/sf-orchestrator.md": { sha256: agentHash, size: agentContent.length, type: "agent" },
        "tools/sf_missing_tool.ts": { sha256: missingHash, size: 100, type: "tool" },
      })

      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      expect(state.entries.size).toBe(2)

      // Existing file
      const agentEntry = state.entries.get("agents/sf-orchestrator.md")
      expect(agentEntry!.currentHash).toBe(agentHash)
      expect(agentEntry!.existsOnDisk).toBe(true)

      // Missing file
      const missingEntry = state.entries.get("tools/sf_missing_tool.ts")
      expect(missingEntry).toBeDefined()
      expect(missingEntry!.currentHash).toBeUndefined()
      expect(missingEntry!.manifestHash).toBe(missingHash)
      expect(missingEntry!.componentType).toBe("tool")
      expect(missingEntry!.existsOnDisk).toBe(false)
      expect(missingEntry!.size).toBe(0)
    })
  })

  describe("null Manifest (filesystem-only scan)", () => {
    it("should discover sf- prefixed files in agents/ directory", async () => {
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      const content = "# Agent file"
      await writeFile(join(agentsDir, "sf-executor.md"), content, "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.manifestValid).toBe(false)
      expect(state.manifestVersion).toBeUndefined()

      const entry = state.entries.get("agents/sf-executor.md")
      expect(entry).toBeDefined()
      expect(entry!.currentHash).toBe(sha256(content))
      expect(entry!.manifestHash).toBeUndefined()
      expect(entry!.componentType).toBe("agent")
      expect(entry!.existsOnDisk).toBe(true)
    })

    it("should discover sf_ prefixed files in tools/ directory", async () => {
      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      const content = "export const x = 1;"
      await writeFile(join(toolsDir, "sf_design_gate.ts"), content, "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      const entry = state.entries.get("tools/sf_design_gate.ts")
      expect(entry).toBeDefined()
      expect(entry!.currentHash).toBe(sha256(content))
      expect(entry!.manifestHash).toBeUndefined()
      expect(entry!.componentType).toBe("tool")
      expect(entry!.existsOnDisk).toBe(true)
    })

    it("should discover sf_ prefixed files in tools/lib/ directory", async () => {
      const libDir = join(tempDir, "tools", "lib")
      await mkdir(libDir, { recursive: true })
      const content = "export const helper = true;"
      await writeFile(join(libDir, "sf_gate_types.ts"), content, "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      const entry = state.entries.get("tools/lib/sf_gate_types.ts")
      expect(entry).toBeDefined()
      expect(entry!.currentHash).toBe(sha256(content))
      expect(entry!.componentType).toBe("tool_lib")
    })

    it("should discover sf_ prefixed files in plugins/ directory", async () => {
      const pluginsDir = join(tempDir, "plugins")
      await mkdir(pluginsDir, { recursive: true })
      const content = "export function init() {}"
      await writeFile(join(pluginsDir, "sf_specforge.ts"), content, "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      const entry = state.entries.get("plugins/sf_specforge.ts")
      expect(entry).toBeDefined()
      expect(entry!.componentType).toBe("plugin")
    })

    it("should discover SKILL.md in sf- prefixed skill directories", async () => {
      const skillDir = join(tempDir, "skills", "sf-workflow-feature-spec")
      await mkdir(skillDir, { recursive: true })
      const content = "# Feature Spec Skill"
      await writeFile(join(skillDir, "SKILL.md"), content, "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      const entry = state.entries.get("skills/sf-workflow-feature-spec/SKILL.md")
      expect(entry).toBeDefined()
      expect(entry!.currentHash).toBe(sha256(content))
      expect(entry!.componentType).toBe("skill")
    })

    it("should return empty entries when no managed directories exist", async () => {
      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.size).toBe(0)
      expect(state.manifestValid).toBe(false)
    })
  })

  describe("sf-/sf_ prefix detection", () => {
    it("should only include files with sf- prefix in agents/", async () => {
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      await writeFile(join(agentsDir, "sf-orchestrator.md"), "# managed", "utf-8")
      await writeFile(join(agentsDir, "custom-agent.md"), "# not managed", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("agents/sf-orchestrator.md")).toBe(true)
      expect(state.entries.has("agents/custom-agent.md")).toBe(false)
    })

    it("should only include files with sf_ prefix in tools/", async () => {
      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      await writeFile(join(toolsDir, "sf_state_read.ts"), "export const a = 1;", "utf-8")
      await writeFile(join(toolsDir, "my_custom_tool.ts"), "export const b = 2;", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("tools/sf_state_read.ts")).toBe(true)
      expect(state.entries.has("tools/my_custom_tool.ts")).toBe(false)
    })

    it("should only include files with sf_ prefix in plugins/", async () => {
      const pluginsDir = join(tempDir, "plugins")
      await mkdir(pluginsDir, { recursive: true })
      await writeFile(join(pluginsDir, "sf_specforge.ts"), "export const a = 1;", "utf-8")
      await writeFile(join(pluginsDir, "user_plugin.ts"), "export const b = 2;", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("plugins/sf_specforge.ts")).toBe(true)
      expect(state.entries.has("plugins/user_plugin.ts")).toBe(false)
    })

    it("should only scan sf- prefixed subdirectories in skills/", async () => {
      // sf- prefixed skill directory
      const sfSkillDir = join(tempDir, "skills", "sf-workflow-bugfix")
      await mkdir(sfSkillDir, { recursive: true })
      await writeFile(join(sfSkillDir, "SKILL.md"), "# SF Skill", "utf-8")

      // Non sf- prefixed skill directory
      const customSkillDir = join(tempDir, "skills", "my-custom-skill")
      await mkdir(customSkillDir, { recursive: true })
      await writeFile(join(customSkillDir, "SKILL.md"), "# Custom Skill", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("skills/sf-workflow-bugfix/SKILL.md")).toBe(true)
      expect(state.entries.has("skills/my-custom-skill/SKILL.md")).toBe(false)
    })

    it("should require correct file extension in managed directories", async () => {
      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      // .ts extension matches
      await writeFile(join(toolsDir, "sf_valid.ts"), "export const a = 1;", "utf-8")
      // .js extension does not match the scan rule
      await writeFile(join(toolsDir, "sf_invalid.js"), "const b = 2;", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("tools/sf_valid.ts")).toBe(true)
      expect(state.entries.has("tools/sf_invalid.js")).toBe(false)
    })
  })

  describe("non-managed files excluded", () => {
    it("should not include files without sf-/sf_ prefix even in managed directories", async () => {
      const agentsDir = join(tempDir, "agents")
      const toolsDir = join(tempDir, "tools")
      const pluginsDir = join(tempDir, "plugins")
      await mkdir(agentsDir, { recursive: true })
      await mkdir(toolsDir, { recursive: true })
      await mkdir(pluginsDir, { recursive: true })

      // Non-managed files (no sf- or sf_ prefix)
      await writeFile(join(agentsDir, "my-agent.md"), "# custom", "utf-8")
      await writeFile(join(toolsDir, "custom_tool.ts"), "export const x = 1;", "utf-8")
      await writeFile(join(pluginsDir, "custom_plugin.ts"), "export const y = 2;", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.size).toBe(0)
    })

    it("should not include .gitkeep files", async () => {
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      await writeFile(join(agentsDir, ".gitkeep"), "", "utf-8")

      const state = await buildCurrentState({ targetDir: tempDir, manifest: null })

      expect(state.entries.has("agents/.gitkeep")).toBe(false)
    })
  })

  describe("Manifest + filesystem scan union", () => {
    it("should merge Manifest entries with filesystem-discovered files", async () => {
      // File in Manifest AND on disk
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      const agentContent = "# Agent"
      await writeFile(join(agentsDir, "sf-orchestrator.md"), agentContent, "utf-8")

      // File on disk but NOT in Manifest (discovered via scan)
      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      const toolContent = "export const x = 1;"
      await writeFile(join(toolsDir, "sf_new_tool.ts"), toolContent, "utf-8")

      const agentHash = sha256(agentContent)
      const manifest = createValidatedManifest({
        "agents/sf-orchestrator.md": { sha256: agentHash, size: agentContent.length, type: "agent" },
      })

      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      // Manifest entry
      const agentEntry = state.entries.get("agents/sf-orchestrator.md")
      expect(agentEntry).toBeDefined()
      expect(agentEntry!.manifestHash).toBe(agentHash)
      expect(agentEntry!.currentHash).toBe(agentHash)

      // Filesystem-discovered entry (not in Manifest)
      const toolEntry = state.entries.get("tools/sf_new_tool.ts")
      expect(toolEntry).toBeDefined()
      expect(toolEntry!.manifestHash).toBeUndefined()
      expect(toolEntry!.currentHash).toBe(sha256(toolContent))
      expect(toolEntry!.componentType).toBe("tool")
    })

    it("should prioritize Manifest data when file exists in both sources", async () => {
      // File exists in both Manifest and filesystem scan
      const agentsDir = join(tempDir, "agents")
      await mkdir(agentsDir, { recursive: true })
      const content = "# Agent content"
      await writeFile(join(agentsDir, "sf-executor.md"), content, "utf-8")

      const manifestHash = "b".repeat(64) // Different from actual hash (simulates update)
      const manifest = createValidatedManifest({
        "agents/sf-executor.md": { sha256: manifestHash, size: 100, type: "agent" },
      })

      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      // Should only have one entry (not duplicated)
      const entries = [...state.entries.values()].filter(
        e => e.relativePath === "agents/sf-executor.md"
      )
      expect(entries).toHaveLength(1)

      // Manifest data takes priority (manifestHash from Manifest)
      const entry = state.entries.get("agents/sf-executor.md")
      expect(entry!.manifestHash).toBe(manifestHash)
      // currentHash is computed from actual file
      expect(entry!.currentHash).toBe(sha256(content))
    })
  })

  describe("pending_deletes rehydration logic", () => {
    it("should inject pending_delete entries that still exist on disk into CurrentState", async () => {
      // Create a file that is in pending_deletes and still exists
      const toolsDir = join(tempDir, "tools")
      await mkdir(toolsDir, { recursive: true })
      const content = "export const old = true;"
      await writeFile(join(toolsDir, "sf_old_tool.ts"), content, "utf-8")

      const manifest = createValidatedManifest(
        { "agents/sf-orchestrator.md": { sha256: "a".repeat(64), size: 10, type: "agent" } },
        "3.5.0"
      )
      // Add pending_deletes to manifest data
      manifest.data.pending_deletes = [
        {
          relativePath: "tools/sf_old_tool.ts",
          failedAt: "2024-01-01T00:00:00.000Z",
          reason: "EACCES",
        },
      ]

      // Note: buildCurrentState itself doesn't directly handle pending_deletes
      // The rehydratePendingDeletes function is tested separately in state_pending_deletes.test.ts
      // This test verifies that buildCurrentState discovers the file via filesystem scan
      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      // The file should be discovered via filesystem scan since it's not in manifest.files
      const entry = state.entries.get("tools/sf_old_tool.ts")
      expect(entry).toBeDefined()
      expect(entry!.currentHash).toBe(sha256(content))
      expect(entry!.manifestHash).toBeUndefined() // Not in manifest.files
      expect(entry!.componentType).toBe("tool")
      expect(entry!.existsOnDisk).toBe(true)
    })

    it("should not include pending_delete entries that no longer exist on disk", async () => {
      const manifest = createValidatedManifest(
        { "agents/sf-orchestrator.md": { sha256: "a".repeat(64), size: 10, type: "agent" } },
        "3.5.0"
      )
      manifest.data.pending_deletes = [
        {
          relativePath: "tools/sf_deleted_tool.ts",
          failedAt: "2024-01-01T00:00:00.000Z",
          reason: "EACCES",
        },
      ]

      const state = await buildCurrentState({ targetDir: tempDir, manifest })

      // File doesn't exist on disk and isn't in manifest.files, so it won't appear
      expect(state.entries.has("tools/sf_deleted_tool.ts")).toBe(false)
    })
  })
})
