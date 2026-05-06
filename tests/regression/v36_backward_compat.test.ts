/**
 * 回归测试：V3.6 向后兼容性
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 12.7, 12.10
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  isValidTransition,
  getTransitionTable,
  VALID_TRANSITIONS,
  BUGFIX_SPEC_TRANSITIONS,
  DESIGN_FIRST_TRANSITIONS,
  QUICK_CHANGE_TRANSITIONS,
} from "../../.opencode/tools/lib/state_machine"
import { checkWorkflowGuards } from "../../.opencode/tools/lib/sf_state_transition_core"
import {
  isValidNodeType,
  isValidEdgeType,
} from "../../.opencode/tools/lib/sf_knowledge_graph_core"
import { checkRequirementsGate } from "../../.opencode/tools/lib/sf_requirements_gate_core"
import { checkDesignGate } from "../../.opencode/tools/lib/sf_design_gate_core"
import { checkVerificationGate } from "../../.opencode/tools/lib/sf_verification_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// 8.1: 现有 4 个工作流状态机不变
// ============================================================

describe("回归 8.1: 现有 4 个工作流状态机不变", () => {
  describe("feature_spec 流转表不变", () => {
    it("intake → requirements", () => {
      expect(isValidTransition("intake", "requirements", "feature_spec")).toBe(true)
    })
    it("requirements → requirements_gate", () => {
      expect(isValidTransition("requirements", "requirements_gate", "feature_spec")).toBe(true)
    })
    it("requirements_gate → design / requirements / blocked", () => {
      expect(isValidTransition("requirements_gate", "design", "feature_spec")).toBe(true)
      expect(isValidTransition("requirements_gate", "requirements", "feature_spec")).toBe(true)
      expect(isValidTransition("requirements_gate", "blocked", "feature_spec")).toBe(true)
    })
    it("development → review (not verification)", () => {
      expect(isValidTransition("development", "review", "feature_spec")).toBe(true)
      expect(isValidTransition("development", "verification", "feature_spec")).toBe(false)
    })
    it("verification_gate → completed / development / blocked", () => {
      expect(isValidTransition("verification_gate", "completed", "feature_spec")).toBe(true)
      expect(isValidTransition("verification_gate", "development", "feature_spec")).toBe(true)
      expect(isValidTransition("verification_gate", "blocked", "feature_spec")).toBe(true)
    })
    it("getTransitionTable returns VALID_TRANSITIONS", () => {
      expect(getTransitionTable("feature_spec")).toBe(VALID_TRANSITIONS)
    })
  })

  describe("bugfix_spec 流转表不变", () => {
    it("intake → bugfix_analysis", () => {
      expect(isValidTransition("intake", "bugfix_analysis", "bugfix_spec")).toBe(true)
    })
    it("bugfix_analysis → bugfix_gate", () => {
      expect(isValidTransition("bugfix_analysis", "bugfix_gate", "bugfix_spec")).toBe(true)
    })
    it("development → verification (no review)", () => {
      expect(isValidTransition("development", "verification", "bugfix_spec")).toBe(true)
      expect(isValidTransition("development", "review", "bugfix_spec")).toBe(false)
    })
    it("getTransitionTable returns BUGFIX_SPEC_TRANSITIONS", () => {
      expect(getTransitionTable("bugfix_spec")).toBe(BUGFIX_SPEC_TRANSITIONS)
    })
  })

  describe("feature_spec_design_first 流转表不变", () => {
    it("intake → design", () => {
      expect(isValidTransition("intake", "design", "feature_spec_design_first")).toBe(true)
    })
    it("design_gate → requirements / design / blocked", () => {
      expect(isValidTransition("design_gate", "requirements", "feature_spec_design_first")).toBe(true)
      expect(isValidTransition("design_gate", "design", "feature_spec_design_first")).toBe(true)
      expect(isValidTransition("design_gate", "blocked", "feature_spec_design_first")).toBe(true)
    })
    it("getTransitionTable returns DESIGN_FIRST_TRANSITIONS", () => {
      expect(getTransitionTable("feature_spec_design_first")).toBe(DESIGN_FIRST_TRANSITIONS)
    })
  })

  describe("quick_change 流转表不变", () => {
    it("intake → quick_tasks", () => {
      expect(isValidTransition("intake", "quick_tasks", "quick_change")).toBe(true)
    })
    it("quick_tasks → development", () => {
      expect(isValidTransition("quick_tasks", "development", "quick_change")).toBe(true)
    })
    it("getTransitionTable returns QUICK_CHANGE_TRANSITIONS", () => {
      expect(getTransitionTable("quick_change")).toBe(QUICK_CHANGE_TRANSITIONS)
    })
  })
})

// ============================================================
// 8.2: checkWorkflowGuards 对现有工作流无干扰
// ============================================================

describe("回归 8.2: checkWorkflowGuards 对现有工作流无干扰", () => {
  const existingWorkflows = [
    "feature_spec",
    "bugfix_spec",
    "feature_spec_design_first",
    "quick_change",
  ] as const

  for (const wf of existingWorkflows) {
    it(`${wf}: development 转换不受 risk_path 守卫影响`, () => {
      const workItem = {
        work_item_id: "WI-TEST",
        workflow_type: wf,
        current_state: "development",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        // 无 metadata.risk_path
      }
      const result = checkWorkflowGuards(wf, "development", "review", workItem)
      expect(result.allowed).toBe(true)
    })

    it(`${wf}: findings_report_gate → completed 不受 user_accepted 守卫影响`, () => {
      const workItem = {
        work_item_id: "WI-TEST",
        workflow_type: wf,
        current_state: "findings_report_gate",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      }
      const result = checkWorkflowGuards(wf, "findings_report_gate", "completed", workItem, {})
      expect(result.allowed).toBe(true)
    })
  }
})

// ============================================================
// 8.3: Gate 工具不传 mode 参数时行为与 V3.5 一致
// ============================================================

describe("回归 8.3: Gate 工具不传 mode 参数时行为与 V3.5 一致", () => {
  const testDir = join(tmpdir(), `sf-compat-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = "WI-COMPAT-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
    await mkdir(configDir, { recursive: true })
    await writeFile(
      join(configDir, "project.json"),
      JSON.stringify({ knowledge_graph_enabled: false }),
      "utf-8"
    )
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("sf_requirements_gate 不传 mode 时检查 requirements.md", async () => {
    const content = `# 需求文档

## 用户故事
作为用户，我希望能够登录。

## 验收标准
- 用户可以登录

## 术语表
| 术语 | 定义 |
|------|------|
| API | 接口 |

### 需求 1 登录功能
登录功能描述。
`
    await writeFile(join(specDir, "requirements.md"), content, "utf-8")
    const result = await checkRequirementsGate(workItemId, testDir)
    expect(result.status).toBe("pass")
  })

  it("sf_requirements_gate 不传 mode 时不检查 impact_analysis.md", async () => {
    // 只有 requirements.md，没有 impact_analysis.md
    const content = `# 需求文档

## 用户故事
作为用户，我希望能够登录。

## 验收标准
- 用户可以登录

## 术语表
| 术语 | 定义 |
|------|------|
| API | 接口 |

### 需求 1 登录功能
登录功能描述。
`
    await writeFile(join(specDir, "requirements.md"), content, "utf-8")
    // 不创建 impact_analysis.md
    const result = await checkRequirementsGate(workItemId, testDir)
    // 应该 pass（不检查 impact_analysis.md）
    expect(result.status).toBe("pass")
  })

  it("sf_design_gate 不传 mode 时检查 design.md", async () => {
    const content = `# 设计文档

## 3.1 架构设计
基于需求 1 的架构。
`
    await writeFile(join(specDir, "design.md"), content, "utf-8")
    const result = await checkDesignGate(workItemId, testDir)
    expect(result.status).toBe("pass")
  })

  it("sf_verification_gate 不传 mode 时检查 verification_report.md", async () => {
    const content = `# 验证报告

## 单元测试结果
All tests passed ✅

## 端到端测试结果
e2e tests: 3 passed, 0 failed ✅

## 总结
验证通过。
`
    await writeFile(join(specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(workItemId, testDir)
    expect(result.status).toBe("pass")
  })
})

// ============================================================
// 8.4: 现有 KG 类型不变
// ============================================================

describe("回归 8.4: 现有 KG NodeType/EdgeType 不变", () => {
  const existingNodeTypes = ["requirement", "design_decision", "task", "code_file"]
  const existingEdgeTypes = ["traces_to", "decomposes_to", "modifies", "implements"]

  for (const nodeType of existingNodeTypes) {
    it(`NodeType "${nodeType}" 仍然有效`, () => {
      expect(isValidNodeType(nodeType)).toBe(true)
    })
  }

  for (const edgeType of existingEdgeTypes) {
    it(`EdgeType "${edgeType}" 仍然有效`, () => {
      expect(isValidEdgeType(edgeType)).toBe(true)
    })
  }

  it("新增 NodeType 'refactor_target' 有效", () => {
    expect(isValidNodeType("refactor_target")).toBe(true)
  })

  it("新增 NodeType 'ops_action' 有效", () => {
    expect(isValidNodeType("ops_action")).toBe(true)
  })

  it("新增 EdgeType 'affects' 有效", () => {
    expect(isValidEdgeType("affects")).toBe(true)
  })

  it("无效类型仍然返回 false", () => {
    expect(isValidNodeType("nonexistent_type")).toBe(false)
    expect(isValidEdgeType("nonexistent_edge")).toBe(false)
  })
})

// ============================================================
// 8.5: investigation findings_report_gate 用户接受流程
// ============================================================

describe("回归 8.5: investigation findings_report_gate 用户接受流程", () => {
  it("user_accepted=true → 允许流转到 completed", () => {
    const workItem = {
      work_item_id: "WI-INV",
      workflow_type: "investigation",
      current_state: "findings_report_gate",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const result = checkWorkflowGuards(
      "investigation",
      "findings_report_gate",
      "completed",
      workItem,
      { user_accepted: true }
    )
    expect(result.allowed).toBe(true)
  })

  it("user_accepted 缺失 → 拒绝流转到 completed", () => {
    const workItem = {
      work_item_id: "WI-INV",
      workflow_type: "investigation",
      current_state: "findings_report_gate",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const result = checkWorkflowGuards(
      "investigation",
      "findings_report_gate",
      "completed",
      workItem,
      {}
    )
    expect(result.allowed).toBe(false)
  })

  it("findings_report_gate → research 不需要 user_accepted（用户要求补充）", () => {
    const workItem = {
      work_item_id: "WI-INV",
      workflow_type: "investigation",
      current_state: "findings_report_gate",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const result = checkWorkflowGuards(
      "investigation",
      "findings_report_gate",
      "research",
      workItem,
      {}
    )
    expect(result.allowed).toBe(true)
  })

  it("findings_report_gate → findings_report 不需要 user_accepted（Gate fail 修订）", () => {
    const workItem = {
      work_item_id: "WI-INV",
      workflow_type: "investigation",
      current_state: "findings_report_gate",
      created_at: "2025-01-01T00:00:00Z",
      updated_at: "2025-01-01T00:00:00Z",
    }
    const result = checkWorkflowGuards(
      "investigation",
      "findings_report_gate",
      "findings_report",
      workItem,
      {}
    )
    expect(result.allowed).toBe(true)
  })
})

// ============================================================
// 8.6: 现有 isValidTransition 默认工作流类型不变
// ============================================================

describe("回归 8.6: isValidTransition 默认工作流类型（feature_spec）不变", () => {
  it("不传 workflowType 时默认使用 feature_spec", () => {
    // feature_spec: intake → requirements
    expect(isValidTransition("intake", "requirements")).toBe(true)
    // feature_spec: intake → bugfix_analysis (invalid for feature_spec)
    expect(isValidTransition("intake", "bugfix_analysis")).toBe(false)
  })
})
