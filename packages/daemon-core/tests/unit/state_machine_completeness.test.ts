/**
 * ALL_STATES ↔ 转换表交叉一致性验证 (CP-5)
 *
 * 验证 ALL_STATES 数组与所有 8 种工作流转换表中引用的全部状态名完全一致
 * - 无遗漏：转换表中出现的每个状态都在 ALL_STATES 中
 * - 无多余：ALL_STATES 中的每个状态在至少一个转换表中被引用
 */

import { describe, it, expect } from "vitest"
import {
  ALL_STATES,
  getAllReferencedStates,
} from "../../src/tools/lib/state_machine"

describe("ALL_STATES completeness (CP-5)", () => {
  it("ALL_STATES covers all states referenced in transition tables", () => {
    const referenced = getAllReferencedStates()
    for (const state of referenced) {
      expect(ALL_STATES).toContain(state)
    }
  })

  it("ALL_STATES has no unused states", () => {
    const referenced = getAllReferencedStates()
    for (const state of ALL_STATES) {
      expect(referenced.has(state)).toBe(true)
    }
  })
})
