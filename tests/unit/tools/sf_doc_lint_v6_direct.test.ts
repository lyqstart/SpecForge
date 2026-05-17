import { describe, it, expect } from "vitest"
import { 
  checkV6ArchScopeLists,
  checkV6ArchAgentConstitution 
} from "../../../.opencode/tools/lib/sf_doc_lint_core"

describe("sf_doc_lint V6 architecture rules direct unit tests (Task 2.9)", () => {
  describe("2.4 v6_arch_scope_lists", () => {
    it("should pass V6 architecture scope lists validation in requirements (happy path)", () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为项目管理者，我希望 V6.0 的开发范围有明确的优先级边界，以便资源聚焦在 P0 必做项。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 P0 必做项列表，条目数 = 27。
2. THE Requirements_Document SHALL 列出 P1 次优先级项列表，条目数 = 15。
3. THE Requirements_Document SHALL 列出 P2 非空列表（条目数 > 0）。

P0 必做项（27 项）：
- 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。
- 核心能力（feature_spec workflow、bugfix workflow、design-first workflow、quick change workflow、ops task workflow、investigation workflow、refactor workflow，共 7 项）。
- 可观测性基础（Event Bus、CAS、三级模式、基础日志、sf-analyst 骨架，共 5 项）。
- 扩展机制骨架（Skill、Tool、Workflow、Gate、Config 扩展点，共 5 项）。

P1 次优先级项（15 项）：
- 多模态支持（图像、音频、视频）。
- 高级 observability（预测性分析、根因定位）。
- 自愈闭环（Diagnose → Plan → Execute → Verify）。
- 组合 Gate（compositeGate）。
- 插件沙箱（Plugin Permission Gate 运行时部分）。
- 国际化。
- Web UI。
- 多租户 / 云服务。
- Telegram 直接集成。
- V5→V6 数据迁移工具。
- 性能优化（事件压缩、索引）。
- 安全加固（审计日志、威胁检测）。
- 文档生成（API 文档、用户手册）。
- 社区贡献流程。
- 第三方集成（GitHub、GitLab、Jira）。

P2 非空列表：
- 实验性功能（AI 代码生成质量评估、多 LLM 路由、成本预测）。
- 长期研究项（形式化验证、自动 spec 生成）。
- 生态扩展（更多 IDE 插件、云服务部署模板）。
`

      const result = checkV6ArchScopeLists(content, "requirements.md", "requirements")
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail V6 architecture scope lists validation in requirements when P0 count wrong (failing fixture)", () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为项目管理者，我希望 V6.0 的开发范围有明确的优先级边界，以便资源聚焦在 P0 必做项。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 P0 必做项列表，条目数 = 27。
2. THE Requirements_Document SHALL 列出 P1 次优先级项列表，条目数 = 15。
3. THE Requirements_Document SHALL 列出 P2 非空列表（条目数 > 0）。

P0 必做项（27 项）：
- 基础设施（Daemon、通信、Session Registry、Permission、Adapter、Config、Directory、CLI、Recovery、Multi-project，共 10 项）。
- 核心能力（feature_spec workflow、bugfix workflow、design-first workflow、quick change workflow、ops task workflow、investigation workflow、refactor workflow，共 7 项）。
- 可观测性基础（Event Bus、CAS、三级模式、基础日志、sf-analyst 骨架，共 5 项）。
// Missing "扩展机制骨架" - only 22 items instead of 27
`

      const result = checkV6ArchScopeLists(content, "requirements.md", "requirements")
      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_scope_lists")).toBe(true)
    })
  })

  describe("2.8 v6_arch_agent_constitution", () => {
    it("should pass V6 architecture agent constitution validation in requirements (happy path)", () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |
| Agent Constitution | Agent 的 9 条底线硬规则（不得绕过 Gate、不得伪造验证等），不可被任何配置覆盖。 |

## 需求

### REQ-7: Permission Engine 三层权限

**User Story:** 作为安全决策者，我希望 V6 的权限体系分层清晰、不可被配置颠覆、每次决策可追溯。

#### Acceptance Criteria

1. THE Permission_Engine SHALL 实现三层权限模型：
   - 第一层：**硬规则（Agent Constitution 9 条底线）**，写死在代码里。
   - 第二层：**内置策略**，以配置文件形式随 SpecForge 发布，默认 agent role 权限（如 reviewer 只读）。
   - 第三层：**用户策略**，用户或项目自定义角色与规则。
2. THE Permission_Engine SHALL 由 Daemon 集中判定，OpenCode 原生 permission 作为兜底层存在。
3. THE Permission_Engine SHALL 对每一次决策（allow / deny）写入事件日志，日志条目必须包含 actor、action、resource、matched_rule、rule_layer、reason 六字段。
4. THE Permission_Engine SHALL 按以下顺序合并规则：
   - 硬规则永远胜过任何配置。
   - 更具体的规则胜过更一般的规则。
   - 同优先级下 deny 胜 allow。
5. IF 用户配置试图放宽硬规则（例如允许绕过 Gate），THEN THE Permission_Engine SHALL 拒绝加载该配置并在启动日志中报告冲突。
6. WHEN Daemon 启动且配置成功加载，THE Permission_Engine SHALL 在启动日志中报告所检测到的任何潜在硬规则冲突，即使配置未实际放宽硬规则也必须报告。
7. IF Permission_Engine 在启动完成后检测到新的硬规则冲突（例如配置热加载引入冲突），THEN THE Permission_Engine SHALL 报告该冲突但继续以已加载的问题配置运行，不触发停机。
8. THE Requirements_Document SHALL 在 Glossary 列出 Agent Constitution 的 9 条底线（或引用具体文档位置），覆盖至少包含"不得绕过 Gate"和"不得伪造验证"两项。
`

      const result = checkV6ArchAgentConstitution(content, "requirements.md", "requirements")
      expect(result.status).toBe("pass")
      expect(result.issues).toHaveLength(0)
    })

    it("should fail V6 architecture agent constitution validation in requirements when missing Agent Constitution in Glossary (failing fixture)", () => {
      const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |
// Missing Agent Constitution term

## 需求

### REQ-7: Permission Engine 三层权限

**User Story:** 作为安全决策者，我希望 V6 的权限体系分层清晰、不可被配置颠覆、每次决策可追溯。

#### Acceptance Criteria

1. THE Permission_Engine SHALL 实现三层权限模型：
   - 第一层：**硬规则（Agent Constitution 9 条底线）**，写死在代码里。
   - 第二层：**内置策略**，以配置文件形式随 SpecForge 发布，默认 agent role 权限（如 reviewer 只读）。
   - 第三层：**用户策略**，用户或项目自定义角色与规则。
2. THE Permission_Engine SHALL 由 Daemon 集中判定，OpenCode 原生 permission 作为兜底层存在。
3. THE Permission_Engine SHALL 对每一次决策（allow / deny）写入事件日志，日志条目必须包含 actor、action、resource、matched_rule、rule_layer、reason 六字段。
4. THE Permission_Engine SHALL 按以下顺序合并规则：
   - 硬规则永远胜过任何配置。
   - 更具体的规则胜过更一般的规则。
   - 同优先级下 deny 胜 allow。
5. IF 用户配置试图放宽硬规则（例如允许绕过 Gate），THEN THE Permission_Engine SHALL 拒绝加载该配置并在启动日志中报告冲突。
6. WHEN Daemon 启动且配置成功加载，THE Permission_Engine SHALL 在启动日志中报告所检测到的任何潜在硬规则冲突，即使配置未实际放宽硬规则也必须报告。
7. IF Permission_Engine 在启动完成后检测到新的硬规则冲突（例如配置热加载引入冲突），THEN THE Permission_Engine SHALL 报告该冲突但继续以已加载的问题配置运行，不触发停机。
8. THE Requirements_Document SHALL 在 Glossary 列出 Agent Constitution 的 9 条底线（或引用具体文档位置），覆盖至少包含"不得绕过 Gate"和"不得伪造验证"两项。
`

      const result = checkV6ArchAgentConstitution(content, "requirements.md", "requirements")
      expect(result.status).toBe("fail")
      const errorIssues = result.issues.filter(i => i.severity === "error")
      expect(errorIssues.length).toBeGreaterThan(0)
      expect(errorIssues.some(i => i.errorCode === "v6_arch_missing_agent_constitution")).toBe(true)
    })
  })
})