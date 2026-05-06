/**
 * Property-based tests for KG type extensibility
 *
 * **Validates: Requirements 9.7, 9.8**
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  isValidNodeType,
  isValidEdgeType,
  type NodeType,
  type EdgeType,
} from "../../.opencode/tools/lib/sf_knowledge_graph_core"

// ============================================================
// Constants
// ============================================================

/** All valid node types including V3.6 additions */
const ALL_NODE_TYPES: NodeType[] = [
  "requirement",
  "design_decision",
  "task",
  "code_file",
  "refactor_target",
  "ops_action",
]

/** Original node types (pre-V3.6) */
const ORIGINAL_NODE_TYPES: NodeType[] = [
  "requirement",
  "design_decision",
  "task",
  "code_file",
]

/** V3.6 new node types */
const NEW_NODE_TYPES: NodeType[] = [
  "refactor_target",
  "ops_action",
]

/** All valid edge types including V3.6 additions */
const ALL_EDGE_TYPES: EdgeType[] = [
  "traces_to",
  "decomposes_to",
  "modifies",
  "implements",
  "affects",
]

/** Original edge types (pre-V3.6) */
const ORIGINAL_EDGE_TYPES: EdgeType[] = [
  "traces_to",
  "decomposes_to",
  "modifies",
  "implements",
]

/** V3.6 new edge types */
const NEW_EDGE_TYPES: EdgeType[] = [
  "affects",
]

// ============================================================
// Arbitraries
// ============================================================

const arbValidNodeType = fc.constantFrom(...ALL_NODE_TYPES)
const arbValidEdgeType = fc.constantFrom(...ALL_EDGE_TYPES)

/** Generate strings that are NOT valid node types */
const arbInvalidNodeType = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => !ALL_NODE_TYPES.includes(s as NodeType))

/** Generate strings that are NOT valid edge types */
const arbInvalidEdgeType = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => !ALL_EDGE_TYPES.includes(s as EdgeType))

// ============================================================
// Property 11: KG type extensibility
// ============================================================

describe("Property 11: KG type extensibility", () => {
  /**
   * **Validates: Requirements 9.7, 9.8**
   *
   * - New NodeType values ("refactor_target", "ops_action") pass isValidNodeType validation
   * - New EdgeType value ("affects") passes isValidEdgeType validation
   * - Existing types still pass validation (backward compatible)
   * - Invalid types still fail validation
   */

  it("new NodeType values pass isValidNodeType validation", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NEW_NODE_TYPES),
        (nodeType) => {
          expect(isValidNodeType(nodeType)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("new EdgeType value passes isValidEdgeType validation", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NEW_EDGE_TYPES),
        (edgeType) => {
          expect(isValidEdgeType(edgeType)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("existing NodeType values still pass validation (backward compatible)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ORIGINAL_NODE_TYPES),
        (nodeType) => {
          expect(isValidNodeType(nodeType)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("existing EdgeType values still pass validation (backward compatible)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ORIGINAL_EDGE_TYPES),
        (edgeType) => {
          expect(isValidEdgeType(edgeType)).toBe(true)
        }
      ),
      { numRuns: 50 }
    )
  })

  it("all valid NodeType values pass isValidNodeType", () => {
    fc.assert(
      fc.property(
        arbValidNodeType,
        (nodeType) => {
          expect(isValidNodeType(nodeType)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("all valid EdgeType values pass isValidEdgeType", () => {
    fc.assert(
      fc.property(
        arbValidEdgeType,
        (edgeType) => {
          expect(isValidEdgeType(edgeType)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("invalid NodeType values fail isValidNodeType", () => {
    fc.assert(
      fc.property(
        arbInvalidNodeType,
        (invalidType) => {
          expect(isValidNodeType(invalidType)).toBe(false)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("invalid EdgeType values fail isValidEdgeType", () => {
    fc.assert(
      fc.property(
        arbInvalidEdgeType,
        (invalidType) => {
          expect(isValidEdgeType(invalidType)).toBe(false)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("isValidNodeType is a total function (never throws for any string input)", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const result = isValidNodeType(input)
          expect(typeof result).toBe("boolean")
        }
      ),
      { numRuns: 1000 }
    )
  })

  it("isValidEdgeType is a total function (never throws for any string input)", () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const result = isValidEdgeType(input)
          expect(typeof result).toBe("boolean")
        }
      ),
      { numRuns: 1000 }
    )
  })
})
