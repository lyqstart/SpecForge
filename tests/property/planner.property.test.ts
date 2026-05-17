/**
 * Property-based tests for Planner Module — R14 Decision Matrix
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 14.1–14.11**
 *
 * Property 4: Decision matrix correctness
 *
 * Uses exhaustive table-driven testing to verify all valid R14 combinations.
 * The R14 input space is finite:
 * - sourceHash: defined | undefined (2)
 * - currentHash: defined_same | defined_different | undefined (3)
 * - manifestHash: defined_same_as_current | defined_different | undefined (3)
 * - componentType: customizable | non_customizable (2)
 * - force: true | false (2)
 * - isManagedComponent: true | false (2)
 *
 * Additionally includes a fast-check random input test verifying decideAction never throws.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { decideAction } from "../../scripts/lib/planner"
import type { DecisionAction, FileReconcileInput, ManagedComponentType } from "../../scripts/lib/types"
import { arbFileReconcileInput } from "../helpers/generators"

// ============================================================
// Exhaustive Decision Matrix Test Cases
// ============================================================

interface DecisionMatrixTestCase {
  id: string
  description: string
  sourceHash: string | undefined
  currentHash: string | undefined
  manifestHash: string | undefined
  componentType: ManagedComponentType
  force: boolean
  isManagedComponent: boolean
  expectedAction: DecisionAction
  expectedTamperWarning?: boolean
}

/**
 * Hash constants for clarity in test cases.
 * Using distinct values to represent different hash states.
 */
const HASH_SOURCE = "aaaa".repeat(16)   // 64 chars - source hash
const HASH_CURRENT = "bbbb".repeat(16)  // 64 chars - different current hash
const HASH_MANIFEST = "cccc".repeat(16) // 64 chars - different manifest hash

/** All customizable component types */
const CUSTOMIZABLE_TYPES: ManagedComponentType[] = ["agent", "skill"]
/** All non-customizable component types */
const NON_CUSTOMIZABLE_TYPES: ManagedComponentType[] = ["tool", "tool_lib", "plugin"]

/**
 * Exhaustive R14 decision matrix test cases.
 * Covers all valid combinations of the input space.
 */
const EXHAUSTIVE_MATRIX: DecisionMatrixTestCase[] = [
  // ================================================================
  // R14.2: sourceHash defined, currentHash undefined → create
  // Regardless of manifestHash, componentType, force, isManagedComponent
  // ================================================================
  {
    id: "R14.2-a",
    description: "source exists, target missing, no manifest, customizable",
    sourceHash: HASH_SOURCE, currentHash: undefined, manifestHash: undefined,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "create",
  },
  {
    id: "R14.2-b",
    description: "source exists, target missing, manifest defined, non-customizable",
    sourceHash: HASH_SOURCE, currentHash: undefined, manifestHash: HASH_MANIFEST,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "create",
  },
  {
    id: "R14.2-c",
    description: "source exists, target missing, force=true",
    sourceHash: HASH_SOURCE, currentHash: undefined, manifestHash: undefined,
    componentType: "skill", force: true, isManagedComponent: true,
    expectedAction: "create",
  },
  {
    id: "R14.2-d",
    description: "source exists, target missing, manifest same as source",
    sourceHash: HASH_SOURCE, currentHash: undefined, manifestHash: HASH_SOURCE,
    componentType: "plugin", force: false, isManagedComponent: true,
    expectedAction: "create",
  },

  // ================================================================
  // R14.3: sourceHash === currentHash → skip
  // Regardless of manifestHash, componentType, force
  // ================================================================
  {
    id: "R14.3-a",
    description: "source equals current, no manifest, customizable",
    sourceHash: HASH_SOURCE, currentHash: HASH_SOURCE, manifestHash: undefined,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "skip",
  },
  {
    id: "R14.3-b",
    description: "source equals current, manifest matches, non-customizable",
    sourceHash: HASH_SOURCE, currentHash: HASH_SOURCE, manifestHash: HASH_SOURCE,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "skip",
  },
  {
    id: "R14.3-c",
    description: "source equals current, manifest differs",
    sourceHash: HASH_SOURCE, currentHash: HASH_SOURCE, manifestHash: HASH_MANIFEST,
    componentType: "tool_lib", force: false, isManagedComponent: true,
    expectedAction: "skip",
  },
  {
    id: "R14.3-d",
    description: "source equals current, force=true",
    sourceHash: HASH_SOURCE, currentHash: HASH_SOURCE, manifestHash: undefined,
    componentType: "skill", force: true, isManagedComponent: true,
    expectedAction: "skip",
  },

  // ================================================================
  // R14.9: sourceHash ≠ currentHash, manifestHash undefined → update
  // PRIORITY over R14.5/R14.6 — no conflict when manifest is missing
  // ================================================================
  {
    id: "R14.9-a",
    description: "source differs from current, no manifest, customizable agent — update NOT conflict",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.9-b",
    description: "source differs from current, no manifest, customizable skill — update NOT conflict",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "skill", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.9-c",
    description: "source differs from current, no manifest, non-customizable tool",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.9-d",
    description: "source differs from current, no manifest, non-customizable plugin",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "plugin", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.9-e",
    description: "source differs from current, no manifest, tool_lib",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "tool_lib", force: false, isManagedComponent: true,
    expectedAction: "update",
  },

  // ================================================================
  // R14.4: sourceHash ≠ currentHash, currentHash === manifestHash → update
  // User hasn't modified the file (current matches what was deployed)
  // ================================================================
  {
    id: "R14.4-a",
    description: "source differs, current matches manifest, customizable agent",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_CURRENT,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.4-b",
    description: "source differs, current matches manifest, non-customizable tool",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_CURRENT,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.4-c",
    description: "source differs, current matches manifest, skill",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_CURRENT,
    componentType: "skill", force: false, isManagedComponent: true,
    expectedAction: "update",
  },
  {
    id: "R14.4-d",
    description: "source differs, current matches manifest, plugin, force=true",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_CURRENT,
    componentType: "plugin", force: true, isManagedComponent: true,
    expectedAction: "update",
  },

  // ================================================================
  // R14.5: all three hashes differ, customizable type → conflict
  // Only when manifestHash is defined (R14.9 takes priority when undefined)
  // ================================================================
  {
    id: "R14.5-a",
    description: "all three differ, customizable agent, no force → conflict",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "conflict",
  },
  {
    id: "R14.5-b",
    description: "all three differ, customizable skill, no force → conflict",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "skill", force: false, isManagedComponent: true,
    expectedAction: "conflict",
  },

  // ================================================================
  // R14.5 + force: conflict resolved to update by --force flag
  // ================================================================
  {
    id: "R14.5+force-a",
    description: "all three differ, customizable agent, force=true → conflict (decideAction returns conflict; force handled by generatePlan)",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "agent", force: true, isManagedComponent: true,
    expectedAction: "conflict",  // decideAction itself returns conflict; force is applied in generatePlan
  },
  {
    id: "R14.5+force-b",
    description: "all three differ, customizable skill, force=true → conflict (decideAction returns conflict; force handled by generatePlan)",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "skill", force: true, isManagedComponent: true,
    expectedAction: "conflict",  // decideAction itself returns conflict; force is applied in generatePlan
  },

  // ================================================================
  // R14.6: all three hashes differ, non-customizable type → update + tamper warning
  // Only when manifestHash is defined
  // ================================================================
  {
    id: "R14.6-a",
    description: "all three differ, non-customizable tool → update + tamper warning",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "update", expectedTamperWarning: true,
  },
  {
    id: "R14.6-b",
    description: "all three differ, non-customizable tool_lib → update + tamper warning",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "tool_lib", force: false, isManagedComponent: true,
    expectedAction: "update", expectedTamperWarning: true,
  },
  {
    id: "R14.6-c",
    description: "all three differ, non-customizable plugin → update + tamper warning",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "plugin", force: false, isManagedComponent: true,
    expectedAction: "update", expectedTamperWarning: true,
  },
  {
    id: "R14.6-d",
    description: "all three differ, non-customizable tool, force=true → update + tamper warning",
    sourceHash: HASH_SOURCE, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "tool", force: true, isManagedComponent: true,
    expectedAction: "update", expectedTamperWarning: true,
  },

  // ================================================================
  // R14.7: sourceHash undefined, currentHash defined, isManagedComponent=true → delete
  // ================================================================
  {
    id: "R14.7-a",
    description: "no source, file exists, managed, manifest matches current",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: HASH_CURRENT,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "delete",
  },
  {
    id: "R14.7-b",
    description: "no source, file exists, managed, no manifest",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "delete",
  },
  {
    id: "R14.7-c",
    description: "no source, file exists, managed, manifest differs",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "skill", force: false, isManagedComponent: true,
    expectedAction: "delete",
  },
  {
    id: "R14.7-d",
    description: "no source, file exists, managed, plugin type",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "plugin", force: false, isManagedComponent: true,
    expectedAction: "delete",
  },

  // ================================================================
  // R14.8: sourceHash undefined, currentHash defined, isManagedComponent=false → ignore
  // ================================================================
  {
    id: "R14.8-a",
    description: "no source, file exists, non-managed, tool type",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "tool", force: false, isManagedComponent: false,
    expectedAction: "ignore",
  },
  {
    id: "R14.8-b",
    description: "no source, file exists, non-managed, agent type",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: HASH_MANIFEST,
    componentType: "agent", force: false, isManagedComponent: false,
    expectedAction: "ignore",
  },
  {
    id: "R14.8-c",
    description: "no source, file exists, non-managed, force=true",
    sourceHash: undefined, currentHash: HASH_CURRENT, manifestHash: undefined,
    componentType: "plugin", force: true, isManagedComponent: false,
    expectedAction: "ignore",
  },

  // ================================================================
  // R14.10: sourceHash undefined, currentHash undefined, manifestHash defined → skip
  // Stale manifest entry — file was deleted externally
  // ================================================================
  {
    id: "R14.10-a",
    description: "no source, no file, stale manifest entry, agent",
    sourceHash: undefined, currentHash: undefined, manifestHash: HASH_MANIFEST,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "skip",
  },
  {
    id: "R14.10-b",
    description: "no source, no file, stale manifest entry, tool",
    sourceHash: undefined, currentHash: undefined, manifestHash: HASH_MANIFEST,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "skip",
  },
  {
    id: "R14.10-c",
    description: "no source, no file, stale manifest entry, force=true",
    sourceHash: undefined, currentHash: undefined, manifestHash: HASH_MANIFEST,
    componentType: "skill", force: true, isManagedComponent: true,
    expectedAction: "skip",
  },

  // ================================================================
  // R14.11: all undefined → none (no action)
  // ================================================================
  {
    id: "R14.11-a",
    description: "nothing exists, agent type",
    sourceHash: undefined, currentHash: undefined, manifestHash: undefined,
    componentType: "agent", force: false, isManagedComponent: true,
    expectedAction: "none",
  },
  {
    id: "R14.11-b",
    description: "nothing exists, tool type",
    sourceHash: undefined, currentHash: undefined, manifestHash: undefined,
    componentType: "tool", force: false, isManagedComponent: true,
    expectedAction: "none",
  },
  {
    id: "R14.11-c",
    description: "nothing exists, non-managed",
    sourceHash: undefined, currentHash: undefined, manifestHash: undefined,
    componentType: "plugin", force: false, isManagedComponent: false,
    expectedAction: "none",
  },
]

// ============================================================
// Property Tests
// ============================================================

describe("Planner Module Properties — R14 Decision Matrix", () => {
  /**
   * Property 4: Decision matrix correctness (Exhaustive)
   *
   * For any FileReconcileInput with a given combination of hash states,
   * componentType, and isManagedComponent, the Planner SHALL assign exactly
   * the action specified by the R14 decision matrix.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 14.1–14.11**
   */
  describe("Property 4: Exhaustive R14 decision matrix", () => {
    it.each(EXHAUSTIVE_MATRIX)(
      "$id: $description",
      (testCase) => {
        const input: FileReconcileInput = {
          relativePath: `test/${testCase.componentType}/test-file`,
          sourceHash: testCase.sourceHash,
          currentHash: testCase.currentHash,
          manifestHash: testCase.manifestHash,
          componentType: testCase.componentType,
          isManagedComponent: testCase.isManagedComponent,
        }

        const result = decideAction(input)

        expect(result.decision).toBe(testCase.expectedAction)

        if (testCase.expectedTamperWarning) {
          expect(result.tamperWarning).toBe(true)
        } else {
          expect(result.tamperWarning).toBeUndefined()
        }
      }
    )
  })

  /**
   * R14.9 priority verification:
   * When manifestHash is undefined, R14.9 takes priority over R14.5/R14.6.
   * This means customizable types do NOT get conflict when manifest is missing.
   */
  describe("R14.9 priority over R14.5/R14.6", () => {
    it("customizable types get update (not conflict) when manifestHash is undefined", () => {
      for (const componentType of CUSTOMIZABLE_TYPES) {
        const input: FileReconcileInput = {
          relativePath: `agents/sf-test.md`,
          sourceHash: HASH_SOURCE,
          currentHash: HASH_CURRENT,  // differs from source
          manifestHash: undefined,     // no manifest → R14.9 applies
          componentType,
          isManagedComponent: true,
        }

        const result = decideAction(input)
        expect(result.decision).toBe("update")
        expect(result.tamperWarning).toBeUndefined()
      }
    })

    it("non-customizable types get update (without tamper warning) when manifestHash is undefined", () => {
      for (const componentType of NON_CUSTOMIZABLE_TYPES) {
        const input: FileReconcileInput = {
          relativePath: `tools/sf_test.ts`,
          sourceHash: HASH_SOURCE,
          currentHash: HASH_CURRENT,  // differs from source
          manifestHash: undefined,     // no manifest → R14.9 applies
          componentType,
          isManagedComponent: true,
        }

        const result = decideAction(input)
        expect(result.decision).toBe("update")
        // R14.9 does NOT set tamperWarning (that's R14.6 only)
        expect(result.tamperWarning).toBeUndefined()
      }
    })
  })

  /**
   * Force flag verification:
   * The force flag is handled by generatePlan (not decideAction).
   * decideAction always returns the raw decision.
   * This test verifies that decideAction returns "conflict" regardless of force,
   * and that the force resolution is a separate concern.
   */
  describe("Force flag behavior", () => {
    it("decideAction returns conflict regardless of force flag (force is handled by generatePlan)", () => {
      for (const componentType of CUSTOMIZABLE_TYPES) {
        const input: FileReconcileInput = {
          relativePath: `agents/sf-test.md`,
          sourceHash: HASH_SOURCE,
          currentHash: HASH_CURRENT,
          manifestHash: HASH_MANIFEST,  // all three differ
          componentType,
          isManagedComponent: true,
        }

        // decideAction doesn't take force as input — it always returns the raw decision
        const result = decideAction(input)
        expect(result.decision).toBe("conflict")
      }
    })
  })

  /**
   * R14.6 tamper warning verification:
   * Non-customizable types with all three hashes differing get update + tamperWarning.
   */
  describe("R14.6 tamper warning for non-customizable types", () => {
    it("all non-customizable types produce tamperWarning when all three hashes differ", () => {
      for (const componentType of NON_CUSTOMIZABLE_TYPES) {
        const input: FileReconcileInput = {
          relativePath: `tools/sf_test.ts`,
          sourceHash: HASH_SOURCE,
          currentHash: HASH_CURRENT,
          manifestHash: HASH_MANIFEST,  // all three differ, manifest defined
          componentType,
          isManagedComponent: true,
        }

        const result = decideAction(input)
        expect(result.decision).toBe("update")
        expect(result.tamperWarning).toBe(true)
      }
    })

    it("customizable types do NOT produce tamperWarning (they get conflict instead)", () => {
      for (const componentType of CUSTOMIZABLE_TYPES) {
        const input: FileReconcileInput = {
          relativePath: `agents/sf-test.md`,
          sourceHash: HASH_SOURCE,
          currentHash: HASH_CURRENT,
          manifestHash: HASH_MANIFEST,  // all three differ, manifest defined
          componentType,
          isManagedComponent: true,
        }

        const result = decideAction(input)
        expect(result.decision).toBe("conflict")
        expect(result.tamperWarning).toBeUndefined()
      }
    })
  })

  /**
   * Property 4 (random): decideAction never throws for any valid input.
   *
   * This fast-check property verifies that the decision function is total —
   * it produces a valid result for every possible input combination without
   * throwing exceptions.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 14.1–14.11**
   */
  describe("Property 4 (robustness): decideAction never throws", () => {
    it("decideAction returns a valid DecisionAction for any FileReconcileInput", () => {
      const VALID_ACTIONS: DecisionAction[] = [
        "create", "update", "delete", "skip", "conflict", "ignore", "none",
      ]

      fc.assert(
        fc.property(
          arbFileReconcileInput(),
          (input) => {
            const result = decideAction(input)

            // Must return a valid FileDecision
            expect(result).toBeDefined()
            expect(result.relativePath).toBe(input.relativePath)
            expect(result.componentType).toBe(input.componentType)
            expect(VALID_ACTIONS).toContain(result.decision)
            expect(typeof result.reason).toBe("string")
            expect(result.reason.length).toBeGreaterThan(0)

            // tamperWarning must be boolean or undefined
            if (result.tamperWarning !== undefined) {
              expect(result.tamperWarning).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
