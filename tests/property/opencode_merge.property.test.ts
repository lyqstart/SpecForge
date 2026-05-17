/**
 * Property-based tests for OpenCode Merge Module
 *
 * **Validates: Requirements 9.2, 9.3, 12.1, 12.4, 12.6**
 *
 * Property 11: opencode.json merge preserves non-sf-* entries
 *
 * For any existing opencode.json containing arbitrary non-sf-* agent entries and other
 * configuration, after the merge operation, all non-sf-* entries SHALL remain unchanged
 * in content and structure, while sf-* entries SHALL reflect the current DesiredState agents.
 *
 * Property 12: Agent registration synchronization
 *
 * For any set of agent files in the DesiredState, the opencode.json SHALL contain exactly
 * one registration entry per discovered agent (with correct mode, model, prompt path, and
 * permissions), and agents removed from DesiredState SHALL have their entries removed from
 * opencode.json.
 */

import { describe, it, expect, afterEach } from "vitest"
import * as fc from "fast-check"
import { join } from "node:path"
import { writeFile, readFile, mkdir } from "node:fs/promises"
import { createTempDir, cleanupTempDir } from "../helpers/fixtures"
import {
  mergeOpenCodeJson,
  agentKeyFromPath,
  DEFAULT_MERGE_FIELD_POLICY,
} from "../../scripts/lib/opencode_merge"
import type { OpenCodeMergeOptions } from "../../scripts/lib/opencode_merge"
import type { DesiredStateEntry, AgentConfig } from "../../scripts/lib/types"

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
 * Write an opencode.json file to a temp directory.
 */
async function writeOpenCodeJson(targetDir: string, content: Record<string, unknown>): Promise<void> {
  await writeFile(join(targetDir, "opencode.json"), JSON.stringify(content, null, 2), "utf-8")
}

/**
 * Read and parse opencode.json from a directory.
 */
async function readOpenCodeJson(targetDir: string): Promise<Record<string, unknown>> {
  const content = await readFile(join(targetDir, "opencode.json"), "utf-8")
  return JSON.parse(content)
}

// ============================================================
// Generators
// ============================================================

/**
 * Generate a valid non-sf-* agent key (user-defined agent names).
 */
function arbNonSfAgentKey(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9-]{2,15}$/).filter((s) => !s.startsWith("sf-"))
}

/**
 * Generate a valid sf-* agent key.
 */
function arbSfAgentKey(): fc.Arbitrary<string> {
  return fc.stringMatching(/^[a-z][a-z0-9_]{2,12}$/).map((id) => `sf-${id}`)
}

/**
 * Generate a random agent config object (for non-sf-* entries).
 */
function arbUserAgentConfig(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    mode: fc.constantFrom("primary", "subagent", "custom"),
    model: fc.stringMatching(/^[a-z]+\/[a-z0-9-]{5,20}$/),
    prompt: fc.stringMatching(/^\.\/[a-z_/]{3,20}\.md$/),
    permission: fc.record({
      task: fc.constantFrom("allow", "deny", "ask"),
      edit: fc.constantFrom("allow", "deny", "ask"),
      bash: fc.constantFrom("allow", "deny", "ask"),
    }),
    // Users may have extra fields
    description: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  })
}

/**
 * Generate a valid AgentConfig for sf-* agents (source config).
 */
function arbAgentConfig(): fc.Arbitrary<AgentConfig> {
  return fc.record({
    mode: fc.constantFrom("primary", "subagent") as fc.Arbitrary<"primary" | "subagent">,
    model: fc.stringMatching(/^anthropic\/claude-[a-z0-9-]{5,20}$/),
    prompt: fc.stringMatching(/^\{file:\.\/agents\/sf-[a-z0-9_]{3,12}\.md\}$/),
    permission: fc.record({
      task: fc.constantFrom("allow", "deny"),
      edit: fc.constantFrom("allow", "deny", "ask"),
      bash: fc.constantFrom("allow", "deny", "ask"),
      skill: fc.constantFrom("allow", "deny", "ask"),
    }),
  })
}

/**
 * Generate a random opencode.json with non-sf-* entries and other top-level config.
 */
function arbNonSfOpenCodeJson(): fc.Arbitrary<Record<string, unknown>> {
  const arbAgentMap = fc
    .array(fc.tuple(arbNonSfAgentKey(), arbUserAgentConfig()), { minLength: 0, maxLength: 5 })
    .map((pairs) => Object.fromEntries(pairs))

  const arbPluginArray = fc.array(
    fc.stringMatching(/^\.\/plugins\/[a-z_]{3,15}\.ts$/),
    { minLength: 0, maxLength: 3 }
  )

  return fc.record({
    $schema: fc.option(fc.constant("https://opencode.ai/schema.json"), { nil: undefined }),
    agent: arbAgentMap,
    plugin: arbPluginArray,
    // Extra top-level fields users might have
    theme: fc.option(fc.constantFrom("dark", "light"), { nil: undefined }),
    experimental: fc.option(fc.record({ feature_x: fc.boolean() }), { nil: undefined }),
  })
}

/**
 * Generate a set of DesiredStateEntry items for agents.
 */
function arbAgentDesiredEntries(): fc.Arbitrary<DesiredStateEntry[]> {
  return fc
    .array(arbSfAgentKey(), { minLength: 1, maxLength: 6 })
    .chain((keys) => {
      // Deduplicate keys
      const uniqueKeys = [...new Set(keys)]
      return fc.constant(
        uniqueKeys.map((key) => ({
          relativePath: `agents/${key}.md`,
          componentType: "agent" as const,
          sourceHash: "a".repeat(64), // placeholder hash
          size: 1024,
        }))
      )
    })
}

/**
 * Generate source config map matching a set of agent keys.
 */
function arbSourceConfigForKeys(keys: string[]): fc.Arbitrary<Record<string, AgentConfig>> {
  return fc
    .tuple(...keys.map(() => arbAgentConfig()))
    .map((configs) => {
      const result: Record<string, AgentConfig> = {}
      keys.forEach((key, i) => {
        result[key] = configs[i]
      })
      return result
    })
}

// ============================================================
// Property Tests
// ============================================================

describe("OpenCode Merge Properties", () => {
  // ============================================================
  // Property 11: opencode.json merge preserves non-sf-* entries
  // ============================================================

  describe("Property 11: opencode.json merge preserves non-sf-* entries", () => {
    it("Property 11a: non-sf-* agent entries remain unchanged after merge", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbNonSfOpenCodeJson(),
          arbAgentDesiredEntries(),
          async (existingConfig, agentEntries) => {
            const targetDir = await createTempDir("merge-prop11a-")
            tempDirs.push(targetDir)

            // Write existing opencode.json with non-sf-* entries
            await writeOpenCodeJson(targetDir, existingConfig)

            // Build agent keys and source config
            const agentKeys = agentEntries.map((e) => agentKeyFromPath(e.relativePath))
            const sourceConfig: Record<string, AgentConfig> = {}
            for (const key of agentKeys) {
              sourceConfig[key] = {
                mode: "subagent",
                model: "anthropic/claude-sonnet-4-20250514",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig,
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            // Read the merged file
            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, unknown>

            // Verify all non-sf-* agent entries are preserved unchanged
            const originalAgents = (existingConfig.agent || {}) as Record<string, unknown>
            for (const [key, value] of Object.entries(originalAgents)) {
              if (!key.startsWith("sf-")) {
                expect(mergedAgents[key]).toEqual(value)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("Property 11b: top-level non-agent config fields remain unchanged after merge", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbNonSfOpenCodeJson(),
          arbAgentDesiredEntries(),
          async (existingConfig, agentEntries) => {
            const targetDir = await createTempDir("merge-prop11b-")
            tempDirs.push(targetDir)

            await writeOpenCodeJson(targetDir, existingConfig)

            const agentKeys = agentEntries.map((e) => agentKeyFromPath(e.relativePath))
            const sourceConfig: Record<string, AgentConfig> = {}
            for (const key of agentKeys) {
              sourceConfig[key] = {
                mode: "subagent",
                model: "anthropic/claude-sonnet-4-20250514",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig,
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)

            // Verify top-level fields other than 'agent' and 'plugin' are preserved
            for (const [key, value] of Object.entries(existingConfig)) {
              if (key === "agent" || key === "plugin") continue
              expect(merged[key]).toEqual(value)
            }

            // Verify $schema is preserved if it existed
            if (existingConfig.$schema) {
              expect(merged.$schema).toBe(existingConfig.$schema)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("Property 11c: sf-* entries reflect current DesiredState after merge", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbNonSfOpenCodeJson(),
          arbAgentDesiredEntries(),
          async (existingConfig, agentEntries) => {
            const targetDir = await createTempDir("merge-prop11c-")
            tempDirs.push(targetDir)

            await writeOpenCodeJson(targetDir, existingConfig)

            const agentKeys = agentEntries.map((e) => agentKeyFromPath(e.relativePath))
            const sourceConfig: Record<string, AgentConfig> = {}
            for (const key of agentKeys) {
              sourceConfig[key] = {
                mode: "subagent",
                model: "anthropic/claude-sonnet-4-20250514",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig,
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, unknown>

            // Every desired sf-* agent should be present
            for (const key of agentKeys) {
              expect(mergedAgents[key]).toBeDefined()
            }

            // No sf-* agents that aren't in DesiredState should remain
            const desiredKeySet = new Set(agentKeys)
            for (const key of Object.keys(mergedAgents)) {
              if (key.startsWith("sf-")) {
                expect(desiredKeySet.has(key)).toBe(true)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })

  // ============================================================
  // Property 12: Agent registration synchronization
  // ============================================================

  describe("Property 12: Agent registration synchronization", () => {
    it("Property 12a: each discovered agent has exactly one registration entry", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAgentDesiredEntries(),
          async (agentEntries) => {
            const targetDir = await createTempDir("merge-prop12a-")
            tempDirs.push(targetDir)

            // Start with empty opencode.json
            await writeOpenCodeJson(targetDir, { agent: {} })

            const agentKeys = agentEntries.map((e) => agentKeyFromPath(e.relativePath))
            const sourceConfig: Record<string, AgentConfig> = {}
            for (const key of agentKeys) {
              sourceConfig[key] = {
                mode: "subagent",
                model: "anthropic/claude-sonnet-4-20250514",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig,
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, unknown>

            // Each agent key should appear exactly once
            for (const key of agentKeys) {
              expect(mergedAgents[key]).toBeDefined()
              // Verify it's an object (single entry, not duplicated)
              expect(typeof mergedAgents[key]).toBe("object")
              expect(mergedAgents[key]).not.toBeNull()
            }

            // Count sf-* entries should equal desired agent count
            const sfEntries = Object.keys(mergedAgents).filter((k) => k.startsWith("sf-"))
            expect(sfEntries.length).toBe(agentKeys.length)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("Property 12b: removed agents have their entries deleted", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbAgentDesiredEntries(),
          fc.array(arbSfAgentKey(), { minLength: 1, maxLength: 4 }),
          async (desiredEntries, extraExistingKeys) => {
            const targetDir = await createTempDir("merge-prop12b-")
            tempDirs.push(targetDir)

            // Create existing opencode.json with some sf-* agents that are NOT in desired state
            const desiredKeys = new Set(desiredEntries.map((e) => agentKeyFromPath(e.relativePath)))
            const removedKeys = [...new Set(extraExistingKeys)].filter((k) => !desiredKeys.has(k))

            const existingAgents: Record<string, unknown> = {}
            for (const key of removedKeys) {
              existingAgents[key] = {
                mode: "subagent",
                model: "anthropic/claude-old-model",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            await writeOpenCodeJson(targetDir, { agent: existingAgents })

            const sourceConfig: Record<string, AgentConfig> = {}
            for (const key of desiredKeys) {
              sourceConfig[key] = {
                mode: "subagent",
                model: "anthropic/claude-sonnet-4-20250514",
                prompt: `{file:./agents/${key}.md}`,
                permission: { task: "deny", edit: "ask", bash: "ask", skill: "ask" },
              }
            }

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: desiredEntries,
              sourceConfig,
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, unknown>

            // Removed agents should NOT be present
            for (const key of removedKeys) {
              expect(mergedAgents[key]).toBeUndefined()
            }

            // Desired agents should be present
            for (const key of desiredKeys) {
              expect(mergedAgents[key]).toBeDefined()
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("Property 12c: MergeFieldPolicy correctly preserves user-overridable fields", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSfAgentKey(),
          arbAgentConfig(),
          fc.stringMatching(/^anthropic\/claude-[a-z0-9-]{5,15}$/),
          async (agentKey, sourceConf, userModel) => {
            const targetDir = await createTempDir("merge-prop12c-")
            tempDirs.push(targetDir)

            // Existing opencode.json has the agent with a user-modified model
            const existingAgentConf = {
              ...sourceConf,
              model: userModel, // User has overridden the model
            }
            await writeOpenCodeJson(targetDir, { agent: { [agentKey]: existingAgentConf } })

            // Source config has a different model
            const newSourceConf: AgentConfig = {
              ...sourceConf,
              model: "anthropic/claude-new-default-model",
              prompt: `{file:./agents/${agentKey}.md}`,
            }

            const agentEntries: DesiredStateEntry[] = [
              {
                relativePath: `agents/${agentKey}.md`,
                componentType: "agent",
                sourceHash: "b".repeat(64),
                size: 2048,
              },
            ]

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig: { [agentKey]: newSourceConf },
              preserveUserOverrides: true,
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, Record<string, unknown>>
            const mergedConf = mergedAgents[agentKey]

            // User-overridable fields (model) should be preserved when different from source
            if (userModel !== newSourceConf.model) {
              expect(mergedConf.model).toBe(userModel)
              expect(result.userOverridesPreserved).toContain(agentKey)
            }

            // Installer-managed fields should use source values
            for (const field of DEFAULT_MERGE_FIELD_POLICY.installerManaged) {
              expect(mergedConf[field]).toEqual(
                (newSourceConf as unknown as Record<string, unknown>)[field]
              )
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it("Property 12d: MergeFieldPolicy overwrites all fields when preserveUserOverrides=false", async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSfAgentKey(),
          arbAgentConfig(),
          arbAgentConfig(),
          async (agentKey, existingConf, sourceConf) => {
            const targetDir = await createTempDir("merge-prop12d-")
            tempDirs.push(targetDir)

            // Existing opencode.json has the agent with user modifications
            await writeOpenCodeJson(targetDir, { agent: { [agentKey]: existingConf } })

            const agentEntries: DesiredStateEntry[] = [
              {
                relativePath: `agents/${agentKey}.md`,
                componentType: "agent",
                sourceHash: "c".repeat(64),
                size: 2048,
              },
            ]

            const options: OpenCodeMergeOptions = {
              targetDir,
              agents: agentEntries,
              sourceConfig: { [agentKey]: sourceConf },
              preserveUserOverrides: false, // Force overwrite all
              backupBeforeDowngrade: false,
            }

            const result = await mergeOpenCodeJson(options)
            expect(result.success).toBe(true)

            const merged = await readOpenCodeJson(targetDir)
            const mergedAgents = merged.agent as Record<string, Record<string, unknown>>
            const mergedConf = mergedAgents[agentKey]

            // All fields should match source config (complete overwrite)
            expect(mergedConf.mode).toBe(sourceConf.mode)
            expect(mergedConf.model).toBe(sourceConf.model)
            expect(mergedConf.prompt).toBe(sourceConf.prompt)
            expect(mergedConf.permission).toEqual(sourceConf.permission)
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
