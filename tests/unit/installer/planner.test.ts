/**
 * Unit tests for the Planner module (R14 decision matrix).
 *
 * Tests cover:
 * - Each R14 rule individually
 * - Force flag behavior
 * - PlanSummary accuracy
 * - Diagnostics output (ignore/none)
 * - Edge cases (empty states, mixed actions)
 */

import { describe, test, expect } from "bun:test"
import { generatePlan, decideAction, type PlannerOptions } from "../../../scripts/lib/planner"
import type { DesiredState } from "../../../scripts/lib/discovery"
import type { CurrentState } from "../../../scripts/lib/state"
import type { DesiredStateEntry, CurrentStateEntry, FileReconcileInput } from "../../../scripts/lib/types"

// ============================================================
// Helpers
// ============================================================

function makeDesiredState(entries: DesiredStateEntry[]): DesiredState {
  const map = new Map<string, DesiredStateEntry>()
  for (const e of entries) {
    map.set(e.relativePath, e)
  }
  return { entries: map, version: "1.0.0" }
}

function makeCurrentState(
  entries: CurrentStateEntry[],
  manifestValid = true,
  manifestVersion = "1.0.0",
): CurrentState {
  const map = new Map<string, CurrentStateEntry>()
  for (const e of entries) {
    map.set(e.relativePath, e)
  }
  return { entries: map, manifestValid, manifestVersion }
}

const defaultOptions: PlannerOptions = { force: false }
const forceOptions: PlannerOptions = { force: true }

// ============================================================
// R14.2: sourceHash defined, currentHash undefined → create
// ============================================================

describe("Planner — R14.2: create", () => {
  test("should create when source exists but target does not", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-test.md", componentType: "agent", sourceHash: "abc123", size: 100 },
    ])
    const current = makeCurrentState([])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("create")
    expect(plan.entries[0].relativePath).toBe("agents/sf-test.md")
    expect(plan.entries[0].sourceHash).toBe("abc123")
    expect(plan.summary.create).toBe(1)
  })
})

// ============================================================
// R14.3: sourceHash === currentHash → skip
// ============================================================

describe("Planner — R14.3: skip", () => {
  test("should skip when source matches current", () => {
    const desired = makeDesiredState([
      { relativePath: "tools/sf_tool.ts", componentType: "tool", sourceHash: "same_hash", size: 200 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_tool.ts",
        currentHash: "same_hash",
        manifestHash: "same_hash",
        componentType: "tool",
        size: 200,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("skip")
    expect(plan.summary.skip).toBe(1)
  })
})

// ============================================================
// R14.9: sourceHash ≠ currentHash, manifestHash undefined → update
// (PRIORITY over R14.5/R14.6)
// ============================================================

describe("Planner — R14.9: update when manifestHash undefined", () => {
  test("should update customizable type without conflict when manifestHash is undefined", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-agent.md", componentType: "agent", sourceHash: "new_hash", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "agents/sf-agent.md",
        currentHash: "user_modified_hash",
        manifestHash: undefined,
        componentType: "agent",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].sourceHash).toBe("new_hash")
    // Should NOT be conflict even though it's a customizable type
    expect(plan.summary.conflict).toBe(0)
    expect(plan.summary.update).toBe(1)
  })

  test("should update non-customizable type without tamper warning when manifestHash is undefined", () => {
    const desired = makeDesiredState([
      { relativePath: "tools/sf_tool.ts", componentType: "tool", sourceHash: "new_hash", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_tool.ts",
        currentHash: "different_hash",
        manifestHash: undefined,
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    // R14.9 takes priority — no tamper warning
    expect(plan.entries[0].tamperWarning).toBeUndefined()
  })
})

// ============================================================
// R14.4: sourceHash ≠ currentHash, currentHash === manifestHash → update
// ============================================================

describe("Planner — R14.4: safe update", () => {
  test("should update when current matches manifest (user hasn't modified)", () => {
    const desired = makeDesiredState([
      { relativePath: "tools/sf_tool.ts", componentType: "tool", sourceHash: "new_source", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_tool.ts",
        currentHash: "old_deployed",
        manifestHash: "old_deployed",
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].sourceHash).toBe("new_source")
    expect(plan.summary.update).toBe(1)
  })
})

// ============================================================
// R14.5: all three differ, customizable type → conflict
// ============================================================

describe("Planner — R14.5: conflict for customizable types", () => {
  test("should conflict when all three hashes differ for agent", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-agent.md", componentType: "agent", sourceHash: "source_v2", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "agents/sf-agent.md",
        currentHash: "user_modified",
        manifestHash: "source_v1",
        componentType: "agent",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("conflict")
    expect(plan.entries[0].currentHash).toBe("user_modified")
    expect(plan.summary.conflict).toBe(1)
  })

  test("should conflict when all three hashes differ for skill", () => {
    const desired = makeDesiredState([
      { relativePath: "skills/my-skill/SKILL.md", componentType: "skill", sourceHash: "new_skill", size: 50 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "skills/my-skill/SKILL.md",
        currentHash: "user_skill",
        manifestHash: "old_skill",
        componentType: "skill",
        size: 50,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("conflict")
    expect(plan.summary.conflict).toBe(1)
  })
})

// ============================================================
// R14.6: all three differ, non-customizable type → update + tamper warning
// ============================================================

describe("Planner — R14.6: tamper warning for non-customizable types", () => {
  test("should update with tamper warning for tool type", () => {
    const desired = makeDesiredState([
      { relativePath: "tools/sf_tool.ts", componentType: "tool", sourceHash: "source_v2", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_tool.ts",
        currentHash: "tampered",
        manifestHash: "source_v1",
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].tamperWarning).toBe(true)
    expect(plan.summary.update).toBe(1)
  })

  test("should update with tamper warning for plugin type", () => {
    const desired = makeDesiredState([
      { relativePath: "plugins/sf_plugin.ts", componentType: "plugin", sourceHash: "new_plugin", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "plugins/sf_plugin.ts",
        currentHash: "tampered_plugin",
        manifestHash: "old_plugin",
        componentType: "plugin",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].tamperWarning).toBe(true)
  })

  test("should update with tamper warning for tool_lib type", () => {
    const desired = makeDesiredState([
      { relativePath: "tools/lib/sf_core.ts", componentType: "tool_lib", sourceHash: "new_lib", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/lib/sf_core.ts",
        currentHash: "tampered_lib",
        manifestHash: "old_lib",
        componentType: "tool_lib",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].tamperWarning).toBe(true)
  })
})

// ============================================================
// R14.7: sourceHash undefined, currentHash defined, managed → delete
// ============================================================

describe("Planner — R14.7: delete orphan", () => {
  test("should delete managed file not in desired state", () => {
    const desired = makeDesiredState([])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_old_tool.ts",
        currentHash: "orphan_hash",
        manifestHash: "orphan_hash",
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("delete")
    expect(plan.entries[0].relativePath).toBe("tools/sf_old_tool.ts")
    expect(plan.summary.delete).toBe(1)
  })
})

// ============================================================
// R14.8: sourceHash undefined, currentHash defined, non-managed → ignore
// ============================================================

describe("Planner — R14.8: ignore non-managed", () => {
  test("should ignore non-managed file not in desired state (via decideAction)", () => {
    // R14.8 is tested via decideAction directly because the state module
    // only includes managed files in CurrentState, so generatePlan cannot
    // produce this scenario in normal operation.
    const input: FileReconcileInput = {
      relativePath: "tools/user_custom_tool.ts",
      sourceHash: undefined,
      currentHash: "user_hash",
      manifestHash: undefined,
      componentType: "tool",
      isManagedComponent: false,
    }

    const decision = decideAction(input)

    expect(decision.decision).toBe("ignore")
    expect(decision.relativePath).toBe("tools/user_custom_tool.ts")
    expect(decision.reason).toContain("R14.8")
  })

  test("should delete managed file via R14.7 (not ignore) through generatePlan", () => {
    // In generatePlan, all CurrentState entries are managed, so R14.7 applies
    const desired = makeDesiredState([])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_old_tool.ts",
        currentHash: "orphan_hash",
        manifestHash: undefined,
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("delete")
  })
})

// ============================================================
// R14.10: sourceHash undefined, currentHash undefined, manifestHash defined → skip
// ============================================================

describe("Planner — R14.10: skip stale manifest entry", () => {
  test("should skip when only manifest entry exists (stale)", () => {
    const desired = makeDesiredState([])
    const current = makeCurrentState([
      {
        relativePath: "agents/sf-removed.md",
        currentHash: undefined,
        manifestHash: "stale_hash",
        componentType: "agent",
        size: 0,
        existsOnDisk: false,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("skip")
    expect(plan.entries[0].relativePath).toBe("agents/sf-removed.md")
    expect(plan.summary.skip).toBe(1)
  })
})

// ============================================================
// R14.11: all undefined → none (no action)
// ============================================================

describe("Planner — R14.11: no action", () => {
  test("should produce no action when all hashes are undefined", () => {
    const desired = makeDesiredState([])
    const current = makeCurrentState([
      {
        relativePath: "tools/phantom.ts",
        currentHash: undefined,
        manifestHash: undefined,
        componentType: "tool",
        size: 0,
        existsOnDisk: false,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    // none does NOT enter plan entries
    expect(plan.entries).toHaveLength(0)
    // But it should be in diagnostics
    expect(plan.diagnostics.noAction).toHaveLength(1)
    expect(plan.diagnostics.noAction[0].relativePath).toBe("tools/phantom.ts")
    expect(plan.diagnostics.noAction[0].decision).toBe("none")
  })
})

// ============================================================
// Force flag: resolve conflicts to updates
// ============================================================

describe("Planner — force flag", () => {
  test("should resolve conflict to update when force is true", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-agent.md", componentType: "agent", sourceHash: "source_v2", size: 100 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "agents/sf-agent.md",
        currentHash: "user_modified",
        manifestHash: "source_v1",
        componentType: "agent",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, forceOptions)

    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("update")
    expect(plan.entries[0].sourceHash).toBe("source_v2")
    expect(plan.summary.update).toBe(1)
    expect(plan.summary.conflict).toBe(0)
  })
})

// ============================================================
// Edge cases
// ============================================================

describe("Planner — edge cases", () => {
  test("empty DesiredState + empty CurrentState → empty plan", () => {
    const desired = makeDesiredState([])
    const current = makeCurrentState([])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(0)
    expect(plan.summary).toEqual({ create: 0, update: 0, delete: 0, skip: 0, conflict: 0 })
    expect(plan.diagnostics.allDecisions).toHaveLength(0)
  })

  test("all skip scenario (states fully aligned)", () => {
    const files = ["agents/sf-a.md", "tools/sf_b.ts", "plugins/sf_c.ts"]
    const desired = makeDesiredState(
      files.map((f) => ({
        relativePath: f,
        componentType: "tool" as const,
        sourceHash: "hash_" + f,
        size: 100,
      })),
    )
    const current = makeCurrentState(
      files.map((f) => ({
        relativePath: f,
        currentHash: "hash_" + f,
        manifestHash: "hash_" + f,
        componentType: "tool" as const,
        size: 100,
        existsOnDisk: true,
      })),
    )

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.entries).toHaveLength(3)
    expect(plan.entries.every((e) => e.action === "skip")).toBe(true)
    expect(plan.summary.skip).toBe(3)
  })

  test("mixed actions in single plan", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-new.md", componentType: "agent", sourceHash: "new_hash", size: 100 },
      { relativePath: "tools/sf_same.ts", componentType: "tool", sourceHash: "same_hash", size: 200 },
      { relativePath: "tools/sf_updated.ts", componentType: "tool", sourceHash: "updated_source", size: 150 },
    ])
    const current = makeCurrentState([
      {
        relativePath: "tools/sf_same.ts",
        currentHash: "same_hash",
        manifestHash: "same_hash",
        componentType: "tool",
        size: 200,
        existsOnDisk: true,
      },
      {
        relativePath: "tools/sf_updated.ts",
        currentHash: "old_deployed",
        manifestHash: "old_deployed",
        componentType: "tool",
        size: 150,
        existsOnDisk: true,
      },
      {
        relativePath: "tools/sf_orphan.ts",
        currentHash: "orphan_hash",
        manifestHash: "orphan_hash",
        componentType: "tool",
        size: 100,
        existsOnDisk: true,
      },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    expect(plan.summary.create).toBe(1)
    expect(plan.summary.skip).toBe(1)
    expect(plan.summary.update).toBe(1)
    expect(plan.summary.delete).toBe(1)
    expect(plan.entries).toHaveLength(4)
  })

  test("PlanSummary counts are accurate", () => {
    const desired = makeDesiredState([
      { relativePath: "a", componentType: "agent", sourceHash: "h1", size: 10 },
      { relativePath: "b", componentType: "agent", sourceHash: "h2", size: 10 },
      { relativePath: "c", componentType: "tool", sourceHash: "h3", size: 10 },
    ])
    const current = makeCurrentState([
      { relativePath: "b", currentHash: "h2", manifestHash: "h2", componentType: "agent", size: 10, existsOnDisk: true },
      { relativePath: "c", currentHash: "old_c", manifestHash: "old_c", componentType: "tool", size: 10, existsOnDisk: true },
      { relativePath: "d", currentHash: "orphan", manifestHash: "orphan", componentType: "tool", size: 10, existsOnDisk: true },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    // a: create (source exists, no current)
    // b: skip (source === current)
    // c: update (source ≠ current, current === manifest)
    // d: delete (no source, current exists, managed)
    expect(plan.summary).toEqual({ create: 1, update: 1, delete: 1, skip: 1, conflict: 0 })
  })

  test("diagnostics allDecisions includes all entries", () => {
    const desired = makeDesiredState([
      { relativePath: "agents/sf-a.md", componentType: "agent", sourceHash: "h1", size: 10 },
    ])
    const current = makeCurrentState([
      { relativePath: "phantom.ts", currentHash: undefined, manifestHash: undefined, componentType: "tool", size: 0, existsOnDisk: false },
    ])

    const plan = generatePlan(desired, current, defaultOptions)

    // 2 total decisions: create (a), none (phantom)
    expect(plan.diagnostics.allDecisions).toHaveLength(2)
    expect(plan.diagnostics.ignored).toHaveLength(0)
    expect(plan.diagnostics.noAction).toHaveLength(1)
    expect(plan.diagnostics.noAction[0].relativePath).toBe("phantom.ts")
    // Only create enters plan entries
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0].action).toBe("create")
  })

  test("decideAction produces ignore for non-managed files (R14.8 diagnostics)", () => {
    const input: FileReconcileInput = {
      relativePath: "tools/user_tool.ts",
      sourceHash: undefined,
      currentHash: "uh",
      manifestHash: undefined,
      componentType: "tool",
      isManagedComponent: false,
    }

    const decision = decideAction(input)
    expect(decision.decision).toBe("ignore")
  })
})
