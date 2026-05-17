import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { lintDocument } from "../../../.opencode/tools/lib/sf_doc_lint_core"
import { writeFile, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

describe("sf_doc_lint V6 architecture scope lists validation (2.4)", () => {
  const testDir = join(tmpdir(), `specforge-doc-lint-scope-${Date.now()}`)
  const workItemId = "WI-001"
  const specDir = join(testDir, "specforge", "specs", workItemId)

  beforeEach(async () => {
    await mkdir(specDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should pass V6 architecture scope lists validation in requirements (happy path)", async () => {
    const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界，以便在后续需求讨论中迅速拒绝超出范围的提案，避免范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力，并把每项写入"不做边界"章节：
   - LLM Provider 层。
   - IDE / 编辑器插件。
   - 多租户协作。
   - 云服务。
   - 自动化部署 DevOps。
   - LLM 评估 / 微调。

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   - Skill 是否被调用。
   - Workflow 是否按预期执行。
   - Workflow 执行结果偏离预期。

### REQ-25: V6.0 开发范围边界（P0 / P1 / P2）

**User Story:** 作为项目管理者，我希望 V6.0 的开发范围有明确的优先级边界，以便资源聚焦在 P0 必做项。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 P0 必做项列表，条目数 = 27。
2. THE Requirements_Document SHALL 列出 P1 次优先级项列表，条目数 = 15。
3. THE Requirements_Document SHALL 列出 P2 非空列表（条目数 > 0）。
4. THE Requirements_Document SHALL 规定 V6.0 release 分支（scopeTag == "p0"）项目不得依赖 P1 / P2 能力。

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

### REQ-27: V6.0 质量门槛

**User Story:** 作为发版负责人，我希望 V6.0 的发版标准可度量、可自动验证。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 把以下 6 条列为 V6.0 发版必过门槛：
   - 门槛 1：feature_spec workflow 端到端测试通过。
   - 门槛 2：北极星验证——10 类场景在 5 分钟内定位根因。
   - 门槛 3：崩溃恢复——10 次随机 kill 测试 0 数据丢失。
   - 门槛 4：Telegram 集成——OpenClaw 端到端完整 spec 创建和执行。
   - 门槛 5：性能——Daemon 启动时间小于 3 秒；事件记录开销小于 5 ms/event；standard 模式事件文件大小小于 1 GB/天。
   - 门槛 6：文档完整——架构文档 + 用户手册齐全。

### REQ-28: 平台与环境

**User Story:** 作为使用者，我希望 V6.0 的支持平台与最低 / 推荐硬件被明确声明，以便评估是否可用。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6.0 支持的操作系统：
   - Windows 10 或更高版本。
   - macOS 12 或更高版本。
   - Linux 主流发行版（Ubuntu / Debian / Fedora / Arch 等）。
2. THE Requirements_Document SHALL 声明 OpenCode 最低版本为发版时的最新版本（当前参考为 1.14.41 或更高）。
3. THE Requirements_Document SHALL 声明运行时：首选 Bun，其次 Node.js（LTS）。
4. THE Requirements_Document SHALL 声明最低硬件要求为：4 核 CPU、4 GB 内存、40 GB 硬盘。
5. THE Requirements_Document SHALL 声明推荐硬件为：8 核 CPU、16 GB 内存、200 GB 硬盘。

### REQ-29: 里程碑规划（M1–M9）

**User Story:** 作为项目管理者，我希望 V6.0 的交付节奏按照 9 个里程碑推进，每个里程碑有明确主题。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 列出 V6.0 的里程碑及其主题；基准里程碑为以下 9 个（M1–M9）：
   - M1：Daemon 骨架。
   - M2：身份与权限（Session Registry + Permission Engine）。
   - M3：可观测性基础（Event Bus + CAS + 三级模式 + 基础日志）。
   - M4：核心工作流（10 Agent + feature_spec + 4 Gate + Thin Plugin）。
   - M5：分析能力（sf-analyst + 基础 observability 查询）。
   - M6：崩溃恢复（WAL + 重连 + 一致性修复）。
   - M7：分发与迁移（npm 包 + 安装向导 + schema_version 框架）。
   - M8：Telegram 集成（CLI \`--json\` + webhook + OpenClaw 端到端）。
   - M9：北极星验证（10 类场景 5 分钟定位根因）。

### REQ-7: Permission Engine 三层权限

**User Story:** 作为安全决策者，我希望 V6 的权限体系分层清晰、不可被配置颠覆、每次决策可追溯。

#### Acceptance Criteria

1. THE Permission_Engine SHALL 实现三层权限模型：
   - 第一层：**硬规则（Agent Constitution 9 条底线）**，写死在代码里。
   - 第二层：**内置策略**，以配置文件形式随 SpecForge 发布，默认 agent role 权限（如 reviewer 只读）。
   - 第三层：**用户策略**，用户或项目自定义角色与规则。
8. THE Requirements_Document SHALL 在 Glossary 列出 Agent Constitution 的 9 条底线（或引用具体文档位置），覆盖至少包含"不得绕过 Gate"和"不得伪造验证"两项。
`
    await writeFile(join(specDir, "requirements.md"), content, "utf-8")

    const result = await lintDocument(workItemId, "requirements", testDir)

    // 输出所有错误以便调试
    if (result.issues.length > 0) {
      console.log("All issues:", JSON.stringify(result.issues, null, 2))
    }
    
    // 检查是否有范围列表相关的错误
    const scopeListsErrors = result.issues.filter(i => 
      i.errorCode === "v6_arch_missing_scope_lists"
    )
    expect(scopeListsErrors).toHaveLength(0)
  })

  it("should fail V6 architecture scope lists validation in requirements when P0 count wrong (failing fixture)", async () => {
    const content = `# 需求文档

## 简介

SpecForge V6 架构文档。

## 术语表

| 术语 | 定义 |
|------|------|
| Daemon | 独立长生命周期进程 |

## 需求

### REQ-2: V6 不做的边界

**User Story:** 作为 V6 开发成员，我希望 V6 明确列出"不做"的边界，以便在后续需求讨论中迅速拒绝超出范围的提案，避免范围蔓延。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明 V6 不做以下 6 项能力，并把每项写入"不做边界"章节：
   - LLM Provider 层。
   - IDE / 编辑器插件。
   - 多租户协作。
   - 云服务。
   - 自动化部署 DevOps。
   - LLM 评估 / 微调。

### REQ-3: 北极星目标

**User Story:** 作为产品负责人，我希望 V6 有一个可度量的北极星目标，以便版本质量门槛有明确的可验证入口。

#### Acceptance Criteria

1. THE Requirements_Document SHALL 声明北极星目标："5 分钟内从发生问题定位到根因"。
2. THE Requirements_Document SHALL 列出北极星目标必须覆盖的 10 类排障场景：
   - Gate 反复失败。
   - Agent 偏离 prompt。
   - Tool 调用错误。
   - 权限拒绝。
   - 升级 / 安装失败。
   - 状态机卡住。
   - 并发死锁。
   - Skill 是否被调用。
   - Workflow 是否按预期执行。
   - Workflow 执行结果偏离预期。

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
    await writeFile(join(specDir, "requirements.md"), content, "utf-8")

    const result = await lintDocument(workItemId, "requirements", testDir)

    // 检查是否有范围列表相关的错误
    const scopeListsErrors = result.issues.filter(i => 
      i.errorCode === "v6_arch_missing_scope_lists"
    )
    expect(scopeListsErrors.length).toBeGreaterThan(0)
  })
})