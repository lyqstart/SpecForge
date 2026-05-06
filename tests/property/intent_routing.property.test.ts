/**
 * Property-based tests for intent classification priority
 *
 * **Validates: Requirements 6.1, 6.6**
 *
 * Tests the intent classification priority ordering defined in sf-orchestrator.md:
 * 1. bugfix_spec  — explicit error descriptions
 * 2. investigation — research/analysis only
 * 3. ops_task     — deploy/ops operations
 * 4. change_request — modify existing functionality
 * 5. refactor     — structural improvement without behavior change
 * 6. other        — existing routing (feature_spec, quick_change, etc.)
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"

// ============================================================
// Intent Classification Logic (mirrors sf-orchestrator.md)
// ============================================================

type IntentType =
  | "bugfix_spec"
  | "investigation"
  | "ops_task"
  | "change_request"
  | "refactor"
  | "feature_spec"
  | "quick_change"
  | "ambiguous"

interface IntentResult {
  type: "resolved" | "ambiguous"
  intent?: IntentType
  candidates?: IntentType[]
}

const INTENT_KEYWORDS: Record<string, string[]> = {
  bugfix_spec: ["bug", "错误", "崩溃", "修复", "fix", "crash", "broken", "坏了", "不工作", "报错", "异常"],
  investigation: ["调查", "研究", "分析", "investigate", "research", "技术选型", "性能分析", "可行性", "评估方案", "对比"],
  ops_task: ["部署", "配置", "运维", "deploy", "infrastructure", "ops", "迁移", "migration", "上线", "发布", "rollback", "回滚"],
  change_request: ["变更", "修改已有", "改现有功能", "change request", "CR", "变更请求", "调整现有", "修改已有逻辑"],
  refactor: ["重构", "refactor", "代码整理", "技术债务", "代码质量", "代码坏味道", "提取方法", "不改变行为"],
  feature_spec: ["新功能", "添加", "实现", "创建", "开发", "feature", "add", "implement", "create", "build", "构建", "新增"],
  quick_change: ["改一下", "调整", "修改配置", "更新文案", "小改动", "quick fix", "tweak"],
}

const PRIORITY_ORDER: IntentType[] = [
  "bugfix_spec",
  "investigation",
  "ops_task",
  "change_request",
  "refactor",
  "feature_spec",
  "quick_change",
]

const DISAMBIGUATION_THRESHOLD = 1

/**
 * Simplified intent classifier that mirrors the orchestrator's logic
 */
function classifyIntent(input: string): IntentResult {
  const lowerInput = input.toLowerCase()
  const scores: Record<string, number> = {}

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        score++
      }
    }
    if (score > 0) {
      scores[intent] = score
    }
  }

  if (Object.keys(scores).length === 0) {
    return { type: "resolved", intent: "feature_spec" } // fallback
  }

  // Sort by priority order (lower index = higher priority), then by score
  const sortedIntents = PRIORITY_ORDER.filter((i) => scores[i] !== undefined).sort((a, b) => {
    const priorityA = PRIORITY_ORDER.indexOf(a)
    const priorityB = PRIORITY_ORDER.indexOf(b)
    if (priorityA !== priorityB) return priorityA - priorityB
    return (scores[b] || 0) - (scores[a] || 0)
  })

  if (sortedIntents.length === 0) {
    return { type: "resolved", intent: "feature_spec" }
  }

  const topIntent = sortedIntents[0]
  const secondIntent = sortedIntents[1]

  // Check for ambiguity
  if (secondIntent !== undefined) {
    const topScore = scores[topIntent] || 0
    const secondScore = scores[secondIntent] || 0
    const priorityGap = PRIORITY_ORDER.indexOf(secondIntent) - PRIORITY_ORDER.indexOf(topIntent)

    // Ambiguous if same priority level AND score gap is small
    if (priorityGap === 0 && Math.abs(topScore - secondScore) < DISAMBIGUATION_THRESHOLD) {
      return {
        type: "ambiguous",
        candidates: sortedIntents.slice(0, 3) as IntentType[],
      }
    }
  }

  return { type: "resolved", intent: topIntent as IntentType }
}

// ============================================================
// Arbitraries
// ============================================================

const arbBugfixKeyword = fc.constantFrom(
  "bug", "fix", "crash", "broken", "报错", "异常", "崩溃"
)
const arbInvestigationKeyword = fc.constantFrom(
  "调查", "研究", "investigate", "research", "技术选型", "可行性"
)
const arbOpsKeyword = fc.constantFrom(
  "部署", "deploy", "运维", "ops", "迁移", "migration", "上线"
)
const arbChangeRequestKeyword = fc.constantFrom(
  "变更", "修改已有", "change request", "CR", "变更请求"
)
const arbRefactorKeyword = fc.constantFrom(
  "重构", "refactor", "代码整理", "技术债务", "不改变行为"
)
const arbFeatureKeyword = fc.constantFrom(
  "新功能", "添加", "实现", "feature", "implement", "build", "新增"
)

// ============================================================
// Property 9: Intent classification priority correctness
// ============================================================

describe("Property 9: Intent classification priority correctness", () => {
  /**
   * **Validates: Requirements 6.1, 6.6**
   *
   * For inputs matching multiple workflows, returns highest-priority intent
   * or ambiguous when scores are close.
   */

  it("bugfix keywords always win over investigation keywords (priority 1 > 2)", () => {
    fc.assert(
      fc.property(
        arbBugfixKeyword,
        arbInvestigationKeyword,
        (bugfixKw, investigationKw) => {
          const input = `${bugfixKw} ${investigationKw} 问题`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("bugfix_spec")
          } else {
            // Ambiguous is acceptable when scores are very close
            expect(result.candidates).toContain("bugfix_spec")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("bugfix keywords always win over ops keywords (priority 1 > 3)", () => {
    fc.assert(
      fc.property(
        arbBugfixKeyword,
        arbOpsKeyword,
        (bugfixKw, opsKw) => {
          const input = `${bugfixKw} ${opsKw}`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("bugfix_spec")
          } else {
            expect(result.candidates).toContain("bugfix_spec")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("investigation keywords win over ops keywords (priority 2 > 3)", () => {
    fc.assert(
      fc.property(
        arbInvestigationKeyword,
        arbOpsKeyword,
        (investigationKw, opsKw) => {
          const input = `${investigationKw} ${opsKw}`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("investigation")
          } else {
            expect(result.candidates).toContain("investigation")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("ops keywords win over change_request keywords (priority 3 > 4)", () => {
    fc.assert(
      fc.property(
        arbOpsKeyword,
        arbChangeRequestKeyword,
        (opsKw, changeKw) => {
          const input = `${opsKw} ${changeKw}`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("ops_task")
          } else {
            expect(result.candidates).toContain("ops_task")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("change_request keywords win over refactor keywords (priority 4 > 5)", () => {
    fc.assert(
      fc.property(
        arbChangeRequestKeyword,
        arbRefactorKeyword,
        (changeKw, refactorKw) => {
          const input = `${changeKw} ${refactorKw}`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("change_request")
          } else {
            expect(result.candidates).toContain("change_request")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("refactor keywords win over feature keywords (priority 5 > 6)", () => {
    fc.assert(
      fc.property(
        arbRefactorKeyword,
        arbFeatureKeyword,
        (refactorKw, featureKw) => {
          const input = `${refactorKw} ${featureKw}`
          const result = classifyIntent(input)

          if (result.type === "resolved") {
            expect(result.intent).toBe("refactor")
          } else {
            expect(result.candidates).toContain("refactor")
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it("single bugfix keyword resolves to bugfix_spec", () => {
    fc.assert(
      fc.property(arbBugfixKeyword, (kw) => {
        const result = classifyIntent(`系统出现了 ${kw}`)
        if (result.type === "resolved") {
          expect(result.intent).toBe("bugfix_spec")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("single investigation keyword resolves to investigation", () => {
    fc.assert(
      fc.property(arbInvestigationKeyword, (kw) => {
        const result = classifyIntent(`需要 ${kw} 一下`)
        if (result.type === "resolved") {
          expect(result.intent).toBe("investigation")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("single ops keyword resolves to ops_task", () => {
    fc.assert(
      fc.property(arbOpsKeyword, (kw) => {
        const result = classifyIntent(`需要 ${kw} 服务`)
        if (result.type === "resolved") {
          expect(result.intent).toBe("ops_task")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("single change_request keyword resolves to change_request", () => {
    fc.assert(
      fc.property(arbChangeRequestKeyword, (kw) => {
        const result = classifyIntent(`提交一个 ${kw}`)
        if (result.type === "resolved") {
          expect(result.intent).toBe("change_request")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("single refactor keyword resolves to refactor", () => {
    fc.assert(
      fc.property(arbRefactorKeyword, (kw) => {
        const result = classifyIntent(`需要 ${kw} 代码`)
        if (result.type === "resolved") {
          expect(result.intent).toBe("refactor")
        }
      }),
      { numRuns: 100 }
    )
  })

  it("ambiguous result always includes at least 2 candidates", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (input) => {
          const result = classifyIntent(input)
          if (result.type === "ambiguous") {
            expect(result.candidates).toBeDefined()
            expect(result.candidates!.length).toBeGreaterThanOrEqual(2)
          }
        }
      ),
      { numRuns: 500 }
    )
  })

  it("resolved result always has a valid intent", () => {
    const validIntents: IntentType[] = [
      "bugfix_spec", "investigation", "ops_task", "change_request",
      "refactor", "feature_spec", "quick_change",
    ]

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (input) => {
          const result = classifyIntent(input)
          if (result.type === "resolved") {
            expect(validIntents).toContain(result.intent)
          }
        }
      ),
      { numRuns: 500 }
    )
  })
})
