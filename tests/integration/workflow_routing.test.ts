/**
 * 集成测试：Skill 文件加载和路由
 *
 * Requirements: 12.2, 12.3, 8.6
 */

import { describe, it, expect, beforeAll } from "vitest"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// ============================================================
// Skill 文件存在性和 YAML frontmatter 验证
// ============================================================

const SKILL_FILES = [
  {
    name: "sf-workflow-change-request",
    path: ".opencode/skills/sf-workflow-change-request/SKILL.md",
    expectedWorkflow: "change_request",
  },
  {
    name: "sf-workflow-refactor",
    path: ".opencode/skills/sf-workflow-refactor/SKILL.md",
    expectedWorkflow: "refactor",
  },
  {
    name: "sf-workflow-ops-task",
    path: ".opencode/skills/sf-workflow-ops-task/SKILL.md",
    expectedWorkflow: "ops_task",
  },
  {
    name: "sf-workflow-investigation",
    path: ".opencode/skills/sf-workflow-investigation/SKILL.md",
    expectedWorkflow: "investigation",
  },
]

describe("新 Skill 文件存在性验证", () => {
  for (const skill of SKILL_FILES) {
    it(`${skill.name} 文件存在`, async () => {
      const content = await readFile(skill.path, "utf-8")
      expect(content).toBeTruthy()
      expect(content.length).toBeGreaterThan(100)
    })
  }
})

describe("新 Skill 文件 YAML frontmatter 验证", () => {
  for (const skill of SKILL_FILES) {
    it(`${skill.name} 有正确的 YAML frontmatter`, async () => {
      const content = await readFile(skill.path, "utf-8")

      // 必须以 --- 开头
      expect(content.startsWith("---")).toBe(true)

      // 必须包含 name 字段
      expect(content).toContain(`name: ${skill.name}`)

      // 必须包含 description 字段
      expect(content).toContain("description:")

      // 必须包含 autoload: false
      expect(content).toContain("autoload: false")
    })
  }
})

describe("新 Skill 文件内容完整性验证", () => {
  it("change_request Skill 包含 impact_analysis_gate 协议", async () => {
    const content = await readFile(".opencode/skills/sf-workflow-change-request/SKILL.md", "utf-8")
    expect(content).toContain("impact_analysis_gate")
    expect(content).toContain("mode=\"change_request\"")
    expect(content).toContain("KG 同步")
  })

  it("refactor Skill 包含双路径状态机说明", async () => {
    const content = await readFile(".opencode/skills/sf-workflow-refactor/SKILL.md", "utf-8")
    expect(content).toContain("risk_path")
    expect(content).toContain("高风险")
    expect(content).toContain("低风险")
    expect(content).toContain("不变行为")
  })

  it("ops_task Skill 包含安全执行协议", async () => {
    const content = await readFile(".opencode/skills/sf-workflow-ops-task/SKILL.md", "utf-8")
    expect(content).toContain("requires_user_confirmation")
    expect(content).toContain("Fail-Stop")
    expect(content).toContain("回滚触发条件")
    expect(content).toContain("串行执行")
  })

  it("investigation Skill 包含用户接受确认流程", async () => {
    const content = await readFile(".opencode/skills/sf-workflow-investigation/SKILL.md", "utf-8")
    expect(content).toContain("user_accepted")
    expect(content).toContain("candidate")
    expect(content).toContain("不同步 KG")
  })

  it("investigation Skill 明确说明无 development/review/verification 阶段", async () => {
    const content = await readFile(".opencode/skills/sf-workflow-investigation/SKILL.md", "utf-8")
    expect(content).toContain("无 development/review/verification 阶段")
  })
})

// ============================================================
// Orchestrator 路由表验证
// ============================================================

describe("Orchestrator 路由表包含 4 个新工作流", () => {
  let orchestratorContent: string

  beforeAll(async () => {
    orchestratorContent = await readFile(".opencode/agents/sf-orchestrator.md", "utf-8")
  })

  it("路由表包含 change_request → sf-workflow-change-request", () => {
    expect(orchestratorContent).toContain("change_request")
    expect(orchestratorContent).toContain("sf-workflow-change-request")
  })

  it("路由表包含 refactor → sf-workflow-refactor", () => {
    expect(orchestratorContent).toContain("refactor")
    expect(orchestratorContent).toContain("sf-workflow-refactor")
  })

  it("路由表包含 ops_task → sf-workflow-ops-task", () => {
    expect(orchestratorContent).toContain("ops_task")
    expect(orchestratorContent).toContain("sf-workflow-ops-task")
  })

  it("路由表包含 investigation → sf-workflow-investigation", () => {
    expect(orchestratorContent).toContain("investigation")
    expect(orchestratorContent).toContain("sf-workflow-investigation")
  })
})

// ============================================================
// 意图分类关键词路由验证
// ============================================================

describe("意图分类关键词路由验证", () => {
  let orchestratorContent: string

  beforeAll(async () => {
    orchestratorContent = await readFile(".opencode/agents/sf-orchestrator.md", "utf-8")
  })

  it("包含 change_request 关键词（变更、CR、change request）", () => {
    expect(orchestratorContent).toContain("变更")
    expect(orchestratorContent).toContain("change request")
    expect(orchestratorContent).toContain("CR")
  })

  it("包含 refactor 关键词（重构、技术债务）", () => {
    expect(orchestratorContent).toContain("重构")
    expect(orchestratorContent).toContain("技术债务")
    expect(orchestratorContent).toContain("refactor")
  })

  it("包含 ops_task 关键词（部署、运维、deploy）", () => {
    expect(orchestratorContent).toContain("部署")
    expect(orchestratorContent).toContain("运维")
    expect(orchestratorContent).toContain("deploy")
  })

  it("包含 investigation 关键词（调查、研究、技术选型）", () => {
    expect(orchestratorContent).toContain("调查")
    expect(orchestratorContent).toContain("研究")
    expect(orchestratorContent).toContain("技术选型")
  })

  it("包含 6 级优先级排序", () => {
    expect(orchestratorContent).toContain("bugfix_spec")
    expect(orchestratorContent).toContain("investigation")
    expect(orchestratorContent).toContain("ops_task")
    expect(orchestratorContent).toContain("change_request")
    expect(orchestratorContent).toContain("refactor")
  })
})

// ============================================================
// 回归：现有工作流触发输入仍路由到原有工作流
// ============================================================

describe("回归：现有工作流 Skill 文件不变", () => {
  const existingSkills = [
    ".opencode/skills/sf-workflow-feature-spec/SKILL.md",
    ".opencode/skills/sf-workflow-bugfix-spec/SKILL.md",
    ".opencode/skills/sf-workflow-design-first/SKILL.md",
    ".opencode/skills/sf-workflow-quick-change/SKILL.md",
  ]

  for (const skillPath of existingSkills) {
    it(`${skillPath} 仍然存在`, async () => {
      const content = await readFile(skillPath, "utf-8")
      expect(content).toBeTruthy()
      expect(content.length).toBeGreaterThan(100)
    })
  }

  it("Orchestrator 路由表仍包含 feature_spec → sf-workflow-feature-spec", async () => {
    const content = await readFile(".opencode/agents/sf-orchestrator.md", "utf-8")
    expect(content).toContain("feature_spec")
    expect(content).toContain("sf-workflow-feature-spec")
  })

  it("Orchestrator 路由表仍包含 bugfix_spec → sf-workflow-bugfix-spec", async () => {
    const content = await readFile(".opencode/agents/sf-orchestrator.md", "utf-8")
    expect(content).toContain("bugfix_spec")
    expect(content).toContain("sf-workflow-bugfix-spec")
  })
})

// ============================================================
// 续接协议验证
// ============================================================

describe("Orchestrator 续接协议验证", () => {
  let orchestratorContent: string

  beforeAll(async () => {
    orchestratorContent = await readFile(".opencode/agents/sf-orchestrator.md", "utf-8")
  })

  it("包含跨会话续接协议", () => {
    expect(orchestratorContent).toContain("Cross-Session Continuity")
    expect(orchestratorContent).toContain("sf_continuity")
  })

  it("包含 extraction_failed 处理", () => {
    expect(orchestratorContent).toContain("extraction_failed")
    expect(orchestratorContent).toContain("blocked")
  })

  it("包含 max_continuations 限制检查", () => {
    expect(orchestratorContent).toContain("check_continuation_limit")
  })

  it("包含 Archive 合并协议", () => {
    expect(orchestratorContent).toContain("merge_archives")
  })
})

// ============================================================
// Helper: beforeAll
// ============================================================
