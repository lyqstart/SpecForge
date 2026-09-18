# SpecForge Product Specification

> Status: ACTIVE / AUTHORITATIVE
>
> Specification ID: SPS-1.0
>
> Effective date: 2026-09-18
>
> Authority registry: docs/product-specification/authority-registry.md
>
> Product owner: SpecForge 产品负责人
>
> Establishing baseline: main@5204a1611d9a1f02f96da637e6ec1c2acd35a8d0

## 0. 文档性质

本文件是 SpecForge 当前唯一产品规格，统一定义当前产品目标、边界、总体架构、核心治理模型、运行生命周期、持久化模型、OpenCode 集成、CLI、安装部署、发布治理和验收标准。

本文件吸收经产品负责人裁决的有效内容。旧 fused standard、v1.3、Kiro specs、design、implementation、README、代码和测试均不得与本文件并列成为产品权威。

本规格描述“产品现在应当是什么”。当前代码与本规格不一致时，差异属于 conformance gap，而不是新的产品需求来源。

---

# 1. 产品目标与边界

## 1.1 产品目标

SpecForge 是面向 AI 编程与规格驱动开发的治理运行时。它的目标不是单纯生成 Markdown，而是保证项目变更经过可追踪、可审计、可恢复的受控链路。

核心闭环为：

~~~text
User Request
  ↓
Work Item
  ↓
Impact / Classification
  ↓
Candidate
  ↓
Gate
  ↓
User Decision
  ↓
Merge
  ↓
Implementation Permission
  ↓
Implementation
  ↓
Verification / Evidence
  ↓
Close
~~~

必须满足：

- 正式 Project Spec 只能经受控 Candidate → Gate → Decision → Merge 更新。
- 代码写入只能在明确授权范围内发生。
- 工作流状态只能经 Runtime 受控状态入口推进。
- 证据、审计与 Trace 必须能够解释“为什么允许这次变化”。
- 失败、HardStop 和中断必须可诊断、可恢复，不能通过手改权威文件绕过。

## 1.2 当前产品范围

当前产品由以下能力组成。

### Runtime Core

- Daemon Core
- Workflow Runtime
- Permission / Write Guard control
- Configuration
- Observability contracts and diagnostics

### Product Governance

- Project Spec
- Work Item
- Classification / Impact Analysis
- Candidate
- Gate
- User Decision
- Merge
- Code Permission
- Changed Files Audit
- Verification / Evidence / Trace
- HardStop / controlled recovery
- Close Gate
- Persistent schema validation

### OpenCode Integration

- First-party Thin Plugin
- OpenCode Adapter as required target architecture

### User / Automation Interface

- CLI
- Daemon HTTP / SSE runtime contract

### Platform / Delivery

- Types / shared neutral contracts
- Host Profile
- Service Management
- Version Unification
- User-level Installer

### Release Governance

- Scope Gate
- release manifest / release precheck
- build/install-set verification

## 1.3 当前明确不属于产品范围

以下能力不得进入当前 release scope、installer、runtime registry、正式 exports 或验收要求，除非以后由产品负责人重新提升：

- Migration product module
- OpenClaw integration
- Multimodal
- Self-Healing
- third-party Plugin Loader / runtime plugin ecosystem
- full v1.3 multi-view Project Spec
- project/views/**
- ADR Detail files under project/decisions/**
- ATAM / DDD / SRE / service catalog / architecture evolution specialist views

未来设计保存在 docs/roadmap/future-capability-registry.md。

---

# 2. 总体架构

## 2.1 运行拓扑

当前目标拓扑为：

~~~text
                    ┌─────────────────────┐
                    │       User          │
                    └──────────┬──────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
            OpenCode                        CLI
                 │                           │
          First-party Thin Plugin            │
                 │                           │
                 └──── HTTP/SSE + Auth ─────┘
                               │
                         ┌─────▼─────┐
                         │  Daemon   │
                         └─────┬─────┘
             ┌─────────────────┼──────────────────┐
             │                 │                  │
      Workflow Runtime   Permission/Guard   Configuration/
             │                 │            Observability
             └─────────────────┼──────────────────┘
                               │
                     neutral LLM Kernel contract
                               │
                       OpenCode Adapter
                               │
                            OpenCode
~~~

Scope Gate 位于发布/构建治理链，不位于业务 Runtime 主链。

## 2.2 依赖方向

必须遵守：

- Daemon 是 Runtime Host、网络/API 边界、project context owner 和状态持久化 owner。
- Workflow Runtime 负责 workflow 定义、工作流编排和 Gate/阶段语义，不拥有 Daemon 进程、网络或持久化路径。
- Workflow Runtime 不得反向依赖 Daemon 的具体实现。
- Permission Engine 负责授权/拒绝决策；Daemon / Tool boundary 负责执行和 fail-closed enforcement。
- Write Guard 是统一写入控制机制，不建立第二套权限事实源。
- Observability 不得拥有第二套 workflow state WAL。
- OpenCode-specific 概念只能在 Thin Plugin / OpenCode Adapter 边界存在，不得泄漏为 Project Spec 或 Runtime state 的核心概念。
- Scope Gate 不定义业务产品范围，只验证已经批准的 release set。

---

# 3. 产品权威与项目事实模型

## 3.1 仓库级产品权威

仓库级产品需求和架构权威仅为本 Product Specification。

代码、测试和报告只能证明实现情况，不能反向改变产品范围。

## 3.2 被管理项目的长期规格权威

每个被 SpecForge 管理的项目，其长期正式规格位于：

~~~text
<project>/.specforge/project/
~~~

Work Item 是变化事务，不是长期 Project Spec 的第二事实源。

## 3.3 Runtime 状态权威

每个 Project Context 的 workflow state 使用 event-sourced 模型：

~~~text
events.jsonl
  ↓ replay
StateManager in-memory state
  ↓ checkpoint/projection
state.json
~~~

规范：

- events.jsonl 是持久化状态事实源。
- StateManager 内存状态是运行期间的 authoritative live state。
- state.json 是可重建 checkpoint / projection，不是独立事实源。
- work_item.json 是 metadata，不保存 authoritative workflow state。
- gate_summary、user_decision、merge_report、verification_report、close report 是阶段证据，不是状态事实源。
- 不再存在 runtime/wal.jsonl 作为第二事件文件名。
- Daemon-global workflow state 已废止；状态必须绑定真实 Project Context。

---

# 4. 文件与目录模型

## 4.1 OpenCode 配置根

OpenCode 配置根解析顺序：

1. OPENCODE_CONFIG_DIR
2. XDG_CONFIG_HOME/opencode
3. <home>/.config/opencode

正式用户级模型：

~~~text
<OpenCode config>/
├── specforge-manifest.json
├── daemon.json
├── agents/                 # SpecForge 管理的具体 agent 文件与其他 OpenCode 内容共存
├── tools/                  # SpecForge 管理的具体 tool 文件与其他 OpenCode 内容共存
├── plugins/                # First-party Thin Plugin
├── skills/                 # SpecForge skills
└── sf-user/
    ├── config/
    │   └── config.json
    ├── runtime/
    │   ├── handshake.json
    │   └── daemon.lock
    ├── projects/
    ├── logs/
    ├── bin/
    ├── lib/
    ├── backups/
    ├── templates/
    └── host-profile.json
~~~

规则：

- 当前代码不得在 ~/.specforge 创建、修改或追加任何文件。
- ~/.specforge 不是当前 runtime、installer、CLI、Host Profile 或 handshake 根。
- specforge-manifest.json 位于 OpenCode config 根，不位于 sf-user。
- daemon.json 位于 OpenCode config 根。
- 用户级目录只承载用户/部署资产，不成为 Project Spec 权威。

## 4.2 项目级 .specforge

当前逻辑结构：

~~~text
<project>/.specforge/
├── config/
│   └── project.json
├── project/
│   ├── spec_manifest.json
│   ├── extension_registry.json
│   ├── requirements_index.md
│   ├── design_index.md
│   ├── architecture.md
│   ├── glossary.md
│   ├── decisions.md
│   ├── trace_matrix.md
│   └── modules/
│       └── <MODULE_CODE>/
│           ├── module.json
│           ├── requirements.md
│           ├── design.md
│           └── trace.md
├── work-items/
│   └── <WI-ID>/
└── runtime/                 # personal/local deployment default
    ├── events.jsonl
    ├── state.json
    ├── checkpoints/
    ├── sessions/
    └── logs/
~~~

辅助项目上下文文件可以位于 config/，但只有被正式 Contract 声明的文件才能成为强制项；代码常量、README 或旧模板不得单独把辅助文件升级为产品必需文件。

## 4.3 Project Spec Core

当前 Core 文件只有：

- spec_manifest.json
- extension_registry.json
- requirements_index.md
- design_index.md
- architecture.md
- glossary.md
- decisions.md
- trace_matrix.md
- modules/<MODULE_CODE>/{module.json,requirements.md,design.md,trace.md}

当前不要求：

- domain_model.md
- context_map.md
- crosscutting_concepts.md
- architecture_risks.md
- project/decisions/ADR-*.md
- project/views/**

这些如果未来启用，必须经 Future Capability promotion 重新进入产品规格。

## 4.4 Runtime location abstraction

Personal/local 模式默认将 Project Runtime 放在：

~~~text
<project>/.specforge/runtime/
~~~

集中式部署可以将同一 Project Runtime 合同放在：

~~~text
<OpenCode config>/sf-user/projects/<stable-project-key>/
~~~

无论物理位置如何，逻辑文件名和状态语义相同：

- events.jsonl
- state.json
- sessions/
- checkpoints/logs as applicable

物理部署模式不得产生两个同时可写的项目状态事实源。

---

# 5. Configuration Model

## 5.1 四层配置

当前配置模型按优先级从低到高为：

~~~text
builtin
→ user
→ project
→ runtime (CLI/env)
~~~

路径：

- builtin：代码默认值
- user：<OpenCode config>/sf-user/config/config.json
- project：<project>/.specforge/config/project.json
- runtime：CLI 参数和环境变量

要求：

- 同样输入必须得到确定性相同的合并结果。
- 普通标量由高优先级覆盖低优先级。
- object 深度合并。
- array 替换，不隐式拼接。
- project layer 不得定义敏感凭据字段。
- 敏感字段只能来自受信用户级或 runtime 输入。
- Daemon 对配置完成 validation / acceptance 后配置才生效。
- 不允许通过 legacy config path discovery 构造第二套配置来源。

## 5.2 活动 Work Item 配置稳定性

配置 reload 不得使已经运行的 Work Item 在中途随机切换治理规则。Runtime 必须对活动 Work Item 使用稳定 configuration snapshot 或等价 activation boundary。

---

# 6. Work Item 与治理生命周期

## 6.1 Work Item

任何会改变以下事实的业务请求必须进入 Work Item：

- Project Spec
- 业务代码
- 测试资产
- 部署/运行资产
- 治理决定
- 受治理的项目事实

纯知识咨询或只读状态查询不要求创建业务 Work Item。

## 6.2 生命周期状态

当前正式状态枚举：

~~~text
created
intake_ready
impact_analyzing
impact_analyzed
workflow_selected
candidate_preparing
candidate_prepared
gates_running
gates_failed
approval_required
approved
merge_ready
merging
merged
post_merge_verified
implementation_ready
implementation_running
implementation_done
verification_running
verification_done
closed
blocked
rejected
superseded
~~~

禁止通过自由文本状态、work_item.json.status 或手工 JSON 编辑推进状态。

## 6.3 Work Item transaction artifacts

Work Item 至少能承载：

- work_item.json metadata
- original intake
- change classification
- impact analysis / trigger result
- Candidate artifacts
- candidate_manifest
- Gate artifacts / gate_summary
- user_decision
- merge_report
- implementation permission/audit facts
- verification_report
- evidence_manifest
- Trace delta
- HardStop / recovery evidence where triggered

Candidate 必须留在当前 Work Item 的 candidates/**，不能直接写入 Project Spec 作为“草稿”。

## 6.4 Project Spec merge

Project Spec 更新只能通过：

~~~text
Candidate
→ consistency / required gates
→ real user decision when required
→ Merge Runner
→ Project Spec
→ project_spec_version increment
~~~

不得由 Agent、CLI、脚本或普通文件写入工具直接编辑正式 Project Spec 以绕过链路。

---

# 7. Daemon

## 7.1 角色

Daemon 是独立共享治理服务，负责：

- Runtime process host
- HTTP API / SSE boundary
- authentication and client discovery
- Project Context registration
- Tool dispatch
- StateManager
- persistence coordination
- enforcement integration
- workflow/permission/config/observability component composition

## 7.2 生命周期

Daemon 生命周期属于部署层。

允许的 lifecycle owner：

- user/operator
- SpecForge CLI
- OS/service manager
- controlled deployment process

Thin Plugin 和 OpenCode Adapter 不得：

- auto-start Daemon
- auto-stop Daemon
- auto-restart Daemon
- kill/replace Daemon because of version mismatch

一个 Daemon 可以服务多个 OpenCode 实例和 Project Context。

## 7.3 连接发现

Daemon 启动成功后在：

~~~text
<OpenCode config>/sf-user/runtime/handshake.json
~~~

写入连接发现信息，至少承载连接所需 endpoint/process/authentication facts。

当前本机通信采用 loopback HTTP，事件流使用 SSE；客户端必须通过受控 authentication 访问。

如果 Daemon 不可用：

- Thin Plugin 必须报告连接失败。
- 治理写操作必须 fail closed。
- 不得自动退化为“无 Daemon 治理”。

---

# 8. Workflow Runtime

Workflow Runtime 负责：

- workflow identity / route
- phase orchestration
- workflow-specific prerequisites
- Gate orchestration
- transition intent and allowed workflow progression

Workflow Runtime 不负责：

- Daemon process lifecycle
- HTTP server
- client discovery
- project runtime physical path ownership
- independent workflow-state persistence

Workflow Runtime 必须通过中立 Contract 使用 State/Tool capability，不得依赖 Daemon 私有实现形成反向依赖。

---

# 9. Permission, Write Guard 与 HardStop

## 9.1 Permission

Permission Engine 是权限决策边界。它输出 allow/deny 及可审计理由，不直接成为文件系统第二执行层。

Daemon / Tool Handler / native write boundary 对 Permission 决策执行 fail-closed enforcement。

## 9.2 Code Permission 与 Write Guard

Implementation 必须有明确的 allowed-write scope。

Write Guard 必须覆盖真实写入口，并保证：

- 未授权文件拒绝写入。
- 治理真相源不能由普通 executor 直接写。
- shell/safe-bash 等替代路径不能绕过 Write Guard。
- changed_files_audit 必须证明最终变化不超范围。

Write Guard 是统一写入控制机制，不建立与 Permission Engine 并列的第二权限事实源。

## 9.3 HardStop

HardStop 是 recoverable safety latch，不是“任务永久结束”。

规则：

- 触发后危险动作及其依赖动作停止。
- 不允许绕过或手工删除锁存事实。
- 恢复必须记录 resolution evidence。
- 恢复后重新读取 authoritative state 并从合法 resume point 继续。
- 只有没有安全恢复路径时才进入 blocked。

---

# 10. OpenCode Integration

## 10.1 First-party Thin Plugin

Thin Plugin 是 OpenCode 侧第一方连接组件，只负责：

- 连接已运行 Daemon
- 注册/关联 Project Context
- 转发所需 OpenCode runtime events/context
- 调用 Daemon 治理 Tool/API
- 报告 Daemon connection failure

Thin Plugin 不等于第三方 Plugin Loader。

## 10.2 OpenCode Adapter

OpenCode Adapter 是当前目标架构中唯一 OpenCode-specific LLM Kernel adapter。

依赖方向：

~~~text
Daemon
→ neutral LLM Kernel contract
→ OpenCode Adapter
→ OpenCode
~~~

职责包括：

- spawn/manage OpenCode-side agent/session operations required by Runtime
- session translation
- prompt delivery
- event subscription/translation
- capability discovery
- OpenCode compatibility/version isolation

OpenCode-specific type 不得泄漏到 Daemon core contract、Project Spec 或 workflow state。

状态：

~~~text
REQUIRED_NOT_YET_ENABLED
~~~

在 Daemon 存在真实生产 consumer、部署链和端到端验证前，不得宣称该能力已启用。

OpenCode Adapter 同样不得管理 Daemon 生命周期。

---

# 11. CLI

CLI 是 Daemon 的客户端和部署运维入口，不是独立治理 Runtime。

CLI 可以承担：

- human-readable command surface
- machine-readable JSON surface
- Daemon status/start/stop 等由部署层授权的 lifecycle command
- health/doctor/diagnostic command
- workflow/project operations through Daemon contract

CLI 不得：

- 自建第二套 workflow state
- 绕过 Daemon 直接推进治理状态
- 直接写 Project Spec 权威文件
- 把 ~/.specforge 重新设为当前 user-level root

npm global installation 可以作为开发或未来分发技术选择，但不是当前产品部署合同。

---

# 12. Installer / Distribution

## 12.1 正式安装模型

当前正式部署方式是 SpecForge user-level installer。

Installer 必须：

- 使用 release manifest 定义唯一安装集合。
- 验证 source/install bytes 和哈希。
- 将 OpenCode 侧资产安装到 OpenCode config root 的对应 agents/tools/plugins/skills 位置。
- 将 SpecForge 私有用户级资产安装到 sf-user。
- 将 specforge-manifest.json 写在 OpenCode config root。
- 支持 install / upgrade / verify / uninstall 的清晰边界。
- 升级使用原子替换或等价不会留下半安装状态的机制。
- 不创建 ~/.specforge 当前运行树。

## 12.2 安装完整性与版本

Installer Manifest 是已安装共享组件的正式安装清单。

verify 证明安装完整性；是否为最新版本必须通过显式版本/升级检查判断，不能混淆两者。

---

# 13. Service Management 与 Host Profile

## 13.1 Service Management

Service Management 负责部署层 Daemon/service lifecycle、health check、graceful shutdown 和必要的 reconnect policy。

它不得让 Thin Plugin 获得共享 Daemon lifecycle ownership。

## 13.2 Host Profile

Host Profile 只记录当前机器/运行环境能力，位置：

~~~text
<OpenCode config>/sf-user/host-profile.json
~~~

Host Profile 不是 Project Spec，也不承载 workflow state。

---

# 14. Observability

Observability 为 Runtime 提供中立事件、日志、诊断和策略 Contract。

必须保证：

- workflow authoritative events.jsonl 由 StateManager/Daemon owner 管理。
- Observability 不建立第二套 authoritative workflow WAL。
- 日志和诊断可以引用状态事实，但不能通过日志内容反向推进状态。
- sensitive token/credential 不得写入普通日志。
- Gate、Permission、HardStop、Tool 和 lifecycle 重要拒绝应有可审计事件。

---

# 15. Persistent Schema Validation

当前产品保留 schema validation，但不保留 Migration 产品模块。

规则：

- 每类持久化文件必须有明确 owner。
- owner 必须声明或引用当前支持的 schema/validator。
- 已存在文件在首次读取/写入前应执行适当 precheck。
- corrupt、unknown 或 unsupported schema 必须 fail closed，并给出可诊断错误。
- 不允许为了“自动兼容”静默改写未知旧格式。
- schema validation contract 可以由中立 foundation 或各 file owner 共享实现，但不得因为复用代码而恢复 Migration 产品责任。
- 将来确需数据转换时，按 Future Capability Registry 重新立项。

---

# 16. Version Unification

Version Unification 当前只负责仓库/运行 artifact 的 code version 单一读取与必要的一致性检查。

它不负责：

- Project schema migration
- installer manifest ownership
- release scope ownership
- legacy data compatibility chain

Installer manifest 由 Installer owner 管理；release set 由 Release Governance 管理。

---

# 17. Release Governance / Scope Gate

Scope Gate 属于 Release / Build Governance，不属于业务 Runtime。

职责：

- 验证批准的 current release set。
- 检查 package exports、clean build、release manifest、installer set 和禁止能力是否越界。
- 作为 release precheck 的组成部分。

Scope Gate 不得：

- 读取 .kiro 作为产品范围 authority。
- 自己定义哪些产品模块应当存在。
- 作为 runtime feature flag / business scope registry。

Release precheck 的产品范围输入必须来自本 Product Specification / Authority Registry 的结构化 release mapping，而不是旧 V6 Kiro 文件。

---

# 18. 当前模块状态

| Component | Current product status | Role |
|---|---|---|
| @specforge/daemon-core | CURRENT_CORE | Runtime host / state / API / tool dispatch |
| @specforge/workflow-runtime | CURRENT_CORE | Workflow orchestration |
| @specforge/permission-engine | CURRENT_CORE | Permission decisions / write policy decisions |
| @specforge/configuration | CURRENT_SUPPORTING | Deterministic configuration |
| @specforge/observability | CURRENT_SUPPORTING | Neutral diagnostics / event contracts |
| @specforge/opencode-adapter | REQUIRED_NOT_YET_ENABLED | OpenCode isolation adapter |
| @specforge/cli | CURRENT_CLIENT | User/machine client and deployment operations |
| @specforge/types | CURRENT_FOUNDATION | Neutral shared types/path contracts |
| @specforge/host-profile | CURRENT_FOUNDATION | Host capability facts |
| @specforge/service-management | CURRENT_SUPPORTING | Deployment lifecycle / health |
| @specforge/version-unification | CURRENT_SUPPORTING | Code version truth |
| @specforge/scope-gate | RELEASE_GOVERNANCE | Build/release boundary validation |
| First-party Thin Plugin | CURRENT_INTEGRATION | OpenCode → Daemon connection bridge |
| User-level Installer | CURRENT_DELIVERY | Official installation/upgrade surface |
| @specforge/migration | REMOVE_CURRENT | Not a current product module |
| @specforge/multimodal | REMOVE_CURRENT / FUTURE | Future capability only |
| @specforge/self-healing | REMOVE_CURRENT / FUTURE | Future capability only |
| @specforge/plugin-loader | REMOVE_CURRENT / FUTURE | Future third-party extension capability |
| OpenClaw | FUTURE | External integration candidate |

Package existence does not override this status table.

---

# 19. 当前产品验收标准

SpecForge 要被声明为符合 SPS-1.0，至少必须满足：

1. Authority Registry 只指向一份 Product Specification，不再存在并列产品 authority。
2. release precheck、Scope Gate 和 architecture-governance tests 不再把 .kiro V6 requirements/design 当作产品 authority。
3. 当前运行代码对 ~/.specforge 的写入为零。
4. user-level Manifest 位于 OpenCode config root；私有数据位于 sf-user。
5. Thin Plugin 不启动、停止或重启 Daemon。
6. Daemon 可作为独立共享服务运行，客户端连接失败时治理写入 fail closed。
7. Project workflow state 可以从 events.jsonl 重放重建；state.json 只是 checkpoint/projection。
8. 不再存在 runtime/wal.jsonl 当前合同或生产 consumer。
9. Project Spec 初始化只创建当前 Core 文件；不会默认创建 D09 暂缓的 multi-view/ADR Detail 文件。
10. Project Spec 修改必须通过 Candidate/Gate/Decision/Merge 受控链路。
11. Work Item authoritative state 不保存在 work_item.json。
12. Write Guard / code permission 覆盖真实写入口，越权写入可审计并拒绝。
13. Migration 模块退出当前 release surface；仍有效 schema validation 已迁移到中立/owner contract。
14. Multimodal、Self-Healing、third-party Plugin Loader、OpenClaw 不出现在 current release 正向运行/安装集合。
15. OpenCode Adapter 存在真实 Daemon production consumer 和端到端验证后，方可从 REQUIRED_NOT_YET_ENABLED 升为 ENABLED。
16. Version Unification 不再承担 Migration、release scope 或 installer ownership。
17. Installer 只安装 release manifest 批准的物理集合，并支持可验证的 install/upgrade/verify/uninstall。
18. Scope Gate 只验证 release/build，不作为业务 Runtime。
19. 代码、README、错误提示、帮助文本、模板、测试和安装资产与当前路径和 lifecycle 模型一致。
20. Future Capability Registry 中的内容不会仅因“文档存在”进入当前验收范围。

---

# 20. 建立本规格时已知的 Conformance Gaps

以下是 SPS-1.0 建立时的已知实现差距，不改变产品裁决：

- CG-001：packages/types/src/user-level-paths.ts 仍把 ~/.specforge 定义为 current user root，并使用 daemon.sock.json。
- CG-002：部分 Thin Plugin / thin-client / CLI / service-management 代码仍读取 ~/.specforge。
- CG-003：当前 Thin Plugin 仍包含自动 spawn Daemon 行为。
- CG-004：packages/types/src/directory-layout.ts 仍定义 runtime/wal.jsonl。
- CG-005：directory-layout.ts 已提前加入 domain_model/context_map/crosscutting/architecture_risks/decisionsRoot 等 D09 deferred paths。
- CG-006：Migration package 仍存在，且 daemon-core/configuration/observability/workflow-runtime 仍复用其中 schema descriptor/precheck infrastructure。
- CG-007：Multimodal、Self-Healing、Plugin Loader 源码/package 仍存在，需从 current release surface 收敛。
- CG-008：OpenCode Adapter package 存在但尚无已确认的 Daemon production instantiation/caller。
- CG-009：Distribution Kiro spec 仍描述 npm global + specforge init + ~/.specforge。
- CG-010：release precheck、Scope Gate 及部分测试仍消费 V6 Kiro authority path。
- CG-011：fused_standard.md 和 v1.3 文档仍包含旧的 final/standard authority 自述，需要降级标识。
- CG-012：Workflow Runtime 与 Daemon 的部分依赖/测试结构仍需消除概念或构建反向依赖。
- CG-013：Permission/Write Guard enforcement 仍分散在多处 handler，需要收敛到统一 decision + enforcement boundary。
- CG-014：用户级 handshake 文件名和路径的旧 daemon.sock.json 消费者尚未统一到 sf-user/runtime/handshake.json。

这些 gap 的后续修改属于“使实现符合产品规格”，不需要重新开启产品范围裁决，除非实际实施发现新的产品级冲突。

---

# 21. Future Capability Promotion

Future Capability Registry 中任何条目进入当前产品必须重新执行：

~~~text
fresh evidence / architecture review
→ explicit product-owner promotion
→ update SPS
→ optional ADR
→ implementation plan
→ tasks
→ verification
→ release mapping update
~~~

不得直接从旧 Kiro、v1.3 或历史代码恢复功能。

---

# Appendix A — 已吸收的产品裁决

SPS-1.0 已吸收 Authority Model Recovery 阶段的 PO-001、D01—D09。完整裁决登记见 authority-registry.md。

本 Appendix 只用于可追溯，不建立第二套规则。
