/**
 * 单元测试：Gate 模式分发（mode 参数）
 *
 * Requirements: 12.4, 12.8, 11.1, 11.2, 11.4, 11.6
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { checkRequirementsGate } from "../../../../.opencode/tools/lib/sf_requirements_gate_core"
import { checkDesignGate } from "../../../../.opencode/tools/lib/sf_design_gate_core"
import { checkVerificationGate } from "../../../../.opencode/tools/lib/sf_verification_gate_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

// ============================================================
// Test Setup Helpers
// ============================================================

function makeTestEnv(suffix: string) {
  const testDir = join(tmpdir(), `sf-gate-mode-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const workItemId = `WI-MODE-${suffix.toUpperCase()}`
  const specDir = join(testDir, "specforge", "specs", workItemId)
  const configDir = join(testDir, "specforge", "config")

  return { testDir, workItemId, specDir, configDir }
}

async function setupDirs(testDir: string, specDir: string, configDir: string) {
  await mkdir(specDir, { recursive: true })
  await mkdir(configDir, { recursive: true })
  // Disable KG to avoid side effects in mode tests
  await writeFile(
    join(configDir, "project.json"),
    JSON.stringify({ knowledge_graph_enabled: false }),
    "utf-8"
  )
}

// ============================================================
// sf_requirements_gate — mode="change_request"
// ============================================================

describe("sf_requirements_gate — mode='change_request'", () => {
  const env = makeTestEnv("req-cr")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when impact_analysis.md has all required sections with valid risk level", async () => {
    const content = `# 影响分析

## 变更范围
修改用户登录模块，新增 OAuth 支持。

## 风险评估
中

## 回归测试范围
- 登录功能测试
- 用户认证测试

## KG 关联
- requirement:REQ-001
`
    await writeFile(join(env.specDir, "impact_analysis.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("pass")
  })

  it("fails when impact_analysis.md is missing required sections", async () => {
    const content = `# 影响分析

## 变更范围
修改用户登录模块。
`
    await writeFile(join(env.specDir, "impact_analysis.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("fail")
    expect(result.blocking_issues.length).toBeGreaterThan(0)
  })

  it("fails when impact_analysis.md does not exist", async () => {
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("fail")
    expect(result.blocking_issues.some(i => i.includes("impact_analysis.md"))).toBe(true)
  })

  it("fails when risk level is invalid (not 高/中/低)", async () => {
    const content = `# 影响分析

## 变更范围
修改用户登录模块。

## 风险评估
unknown_risk_level

## 回归测试范围
测试范围

## KG 关联
关联节点
`
    await writeFile(join(env.specDir, "impact_analysis.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_requirements_gate — mode="refactor"
// ============================================================

describe("sf_requirements_gate — mode='refactor'", () => {
  const env = makeTestEnv("req-ref")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when refactor_analysis.md has all required sections", async () => {
    const content = `# 重构分析

## 代码问题识别
UserService 类过于庞大，违反单一职责原则。

## 重构目标
将 UserService 拆分为 UserAuthService 和 UserProfileService。

## 不变行为声明
- 所有现有 API 接口保持不变
- 现有测试全部通过

## 风险评估
低
`
    await writeFile(join(env.specDir, "refactor_analysis.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "refactor" })
    expect(result.status).toBe("pass")
  })

  it("fails when 不变行为声明 section is empty", async () => {
    const content = `# 重构分析

## 代码问题识别
代码问题

## 重构目标
重构目标

## 不变行为声明

## 风险评估
低
`
    await writeFile(join(env.specDir, "refactor_analysis.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "refactor" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_requirements_gate — mode="investigation"
// ============================================================

describe("sf_requirements_gate — mode='investigation'", () => {
  const env = makeTestEnv("req-inv")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when investigation_plan.md has all required sections", async () => {
    const content = `# 调查计划

## 调查目标
评估 GraphQL 替代 REST API 的可行性。

## 调查范围
包含：性能对比、开发体验、生态系统
不包含：具体迁移成本

## 调查方法
阅读官方文档，运行基准测试，参考社区实践。

## 预期产出格式
技术对比矩阵 + 推荐方案
`
    await writeFile(join(env.specDir, "investigation_plan.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "investigation" })
    expect(result.status).toBe("pass")
  })

  it("fails when investigation_plan.md is missing sections", async () => {
    const content = `# 调查计划

## 调查目标
评估 GraphQL。
`
    await writeFile(join(env.specDir, "investigation_plan.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir, { mode: "investigation" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_requirements_gate — unknown mode
// ============================================================

describe("sf_requirements_gate — unknown mode", () => {
  const env = makeTestEnv("req-unk")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("returns fail with warning for unknown mode", async () => {
    const result = await checkRequirementsGate(env.workItemId, env.testDir, {
      mode: "nonexistent_mode" as never,
    })
    expect(result.status).toBe("fail")
    expect(result.warnings.some(w => w.includes("nonexistent_mode"))).toBe(true)
  })
})

// ============================================================
// sf_design_gate — mode="ops_task"
// ============================================================

describe("sf_design_gate — mode='ops_task'", () => {
  const env = makeTestEnv("des-ops")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when ops_plan.md has all required sections including rollback", async () => {
    const content = `# 运维计划

## 操作目标
部署新版本到生产环境。

## 前置条件
- 数据库备份已完成

## 操作步骤
1. 停止服务：systemctl stop app
2. 更新代码：git pull origin main

## 回滚方案
1. 回滚步骤一：systemctl start app
2. 回滚步骤二：git checkout HEAD~1

## 回滚触发条件
服务健康检查连续 3 次失败时触发回滚。

## 风险评估
中等风险，影响范围有限。

## 影响范围
生产环境所有用户，预计影响时间 5 分钟。
`
    await writeFile(join(env.specDir, "ops_plan.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir, "feature_spec", { mode: "ops_task" })
    expect(result.status).toBe("pass")
  })

  it("fails when ops_plan.md is missing rollback plan", async () => {
    const content = `# 运维计划

## 操作目标
部署新版本。

## 前置条件
备份完成。

## 操作步骤
1. 停止服务
2. 更新代码

## 回滚触发条件
服务失败时触发。

## 风险评估
低风险。

## 影响范围
生产环境。
`
    await writeFile(join(env.specDir, "ops_plan.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir, "feature_spec", { mode: "ops_task" })
    expect(result.status).toBe("fail")
    // Missing section: 回滚方案
    expect(result.blocking_issues.some(i => i.includes("回滚方案"))).toBe(true)
  })

  it("fails when ops_plan.md is missing rollback trigger conditions", async () => {
    const content = `# 运维计划

## 操作目标
部署。

## 前置条件
备份。

## 操作步骤
1. 停止服务

## 回滚方案
1. 启动服务

## 风险评估
低风险。

## 影响范围
生产。
`
    await writeFile(join(env.specDir, "ops_plan.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir, "feature_spec", { mode: "ops_task" })
    expect(result.status).toBe("fail")
    // Missing section: 回滚触发条件
    expect(result.blocking_issues.some(i => i.includes("回滚触发条件"))).toBe(true)
  })
})

// ============================================================
// sf_design_gate — mode="investigation"
// ============================================================

describe("sf_design_gate — mode='investigation'", () => {
  const env = makeTestEnv("des-inv")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when findings_report.md has all required sections", async () => {
    const content = `# 调查报告

## 调查结论
GraphQL 在复杂查询场景下性能优于 REST，推荐采用。

## 数据和证据
基准测试结果：GraphQL 响应时间减少 30%，吞吐量提升 25%。GitHub stars 50k+，社区活跃。

## 建议
1. 在新模块中优先使用 GraphQL
2. 现有 REST API 保持不变，逐步迁移

## 限制
测试样本量有限（仅 100 次请求），未考虑学习成本。
`
    await writeFile(join(env.specDir, "findings_report.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir, "feature_spec", { mode: "investigation" })
    expect(result.status).toBe("pass")
  })

  it("fails when findings_report.md has empty sections", async () => {
    const content = `# 调查报告

## 调查结论

## 数据和证据
有数据

## 建议
有建议

## 限制
有限制
`
    await writeFile(join(env.specDir, "findings_report.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir, "feature_spec", { mode: "investigation" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_verification_gate — mode="refactor"
// ============================================================

describe("sf_verification_gate — mode='refactor'", () => {
  const env = makeTestEnv("ver-ref")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when verification report shows all tests pass and quality improved", async () => {
    const content = `# 验证报告

## 测试结果
所有现有测试通过：100/100 PASS ✅

## 代码质量改善
圈复杂度从 15 降低到 8，代码行数减少 20%。

## 总结
重构验证通过，行为不变性已确认。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "refactor" })
    expect(result.status).toBe("pass")
  })

  it("fails when existing tests are not all passing", async () => {
    const content = `# 验证报告

## 测试结果
测试结果：95/100 PASS，5 FAILED ❌

## 代码质量改善
质量有所改善。

## 总结
部分测试失败。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "refactor" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_verification_gate — mode="ops_task"
// ============================================================

describe("sf_verification_gate — mode='ops_task'", () => {
  const env = makeTestEnv("ver-ops")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when operation results match expected results", async () => {
    const content = `# 验证报告

## 操作结果
所有操作步骤执行成功，服务正常运行，HTTP 200。

## 预期结果对比
所有步骤结果与 ops_plan.md 预期完全一致，验证通过。

## 总结
运维操作验证通过。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "ops_task" })
    expect(result.status).toBe("pass")
  })

  it("fails when operation results do not match expected", async () => {
    const content = `# 验证报告

## 操作结果
步骤 2 执行异常。

## 预期结果对比
步骤 2 结果不匹配：预期服务启动，实际服务未响应，存在不一致。

## 总结
验证失败。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "ops_task" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// sf_verification_gate — mode="change_request"
// ============================================================

describe("sf_verification_gate — mode='change_request'", () => {
  const env = makeTestEnv("ver-cr")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("passes when regression tests cover affected areas", async () => {
    const content = `# 验证报告

## 回归测试覆盖
受影响区域的回归测试全部通过：
- 用户登录模块：5/5 PASS ✅
- OAuth 集成：3/3 PASS ✅

## 受影响区域验证
所有受影响区域均已验证，无遗漏。

## 总结
变更请求验证通过，回归测试覆盖完整。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("pass")
  })

  it("fails when regression test coverage is insufficient", async () => {
    const content = `# 验证报告

## 总结
验证失败，回归测试覆盖不足。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir, { mode: "change_request" })
    expect(result.status).toBe("fail")
  })
})

// ============================================================
// Backward compatibility: no mode = V3.5 behavior
// ============================================================

describe("Backward compatibility — no mode parameter", () => {
  const env = makeTestEnv("compat")

  beforeEach(async () => {
    await setupDirs(env.testDir, env.specDir, env.configDir)
  })

  afterEach(async () => {
    await rm(env.testDir, { recursive: true, force: true })
  })

  it("sf_requirements_gate without mode uses default requirements.md check", async () => {
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
    await writeFile(join(env.specDir, "requirements.md"), content, "utf-8")
    const result = await checkRequirementsGate(env.workItemId, env.testDir)
    expect(result.status).toBe("pass")
  })

  it("sf_design_gate without mode uses default design.md check", async () => {
    const content = `# 设计文档

## 3.1 架构设计
基于需求 1 的架构。
`
    await writeFile(join(env.specDir, "design.md"), content, "utf-8")
    const result = await checkDesignGate(env.workItemId, env.testDir)
    expect(result.status).toBe("pass")
  })

  it("sf_verification_gate without mode uses default verification check", async () => {
    const content = `# 验证报告

## 单元测试结果
All tests passed ✅

## 端到端测试结果
e2e tests: 5 passed, 0 failed ✅

## 总结
验证通过。
`
    await writeFile(join(env.specDir, "verification_report.md"), content, "utf-8")
    const result = await checkVerificationGate(env.workItemId, env.testDir)
    expect(result.status).toBe("pass")
  })
})
