# SpecForge Product Specification

> Status: ACTIVE / AUTHORITATIVE
>
> Specification ID: SPS-1.0
>
> Product release version: 1.0.19
>
> Product version epoch: 1
>
> Effective date: 2026-10-11
>
> Authority registry: docs/product-specification/authority-registry.md
>
> Product owner: SpecForge 产品负责人
>
> Initial establishing baseline: main@5204a1611d9a1f02f96da637e6ec1c2acd35a8d0

## 0. 文档性质

本文件是 SpecForge 当前唯一产品规格，统一定义当前产品目标、边界、总体架构、核心治理模型、运行生命周期、持久化模型、OpenCode 集成、CLI、安装部署、发布治理和验收标准。

本文件吸收经产品负责人裁决的有效内容。旧 fused standard、v1.3、Kiro specs、design、implementation、README、代码和测试均不得与本文件并列成为产品权威。

本规格描述“产品现在应当是什么”。当前代码与本规格不一致时，差异属于 conformance gap，而不是新的产品需求来源。

## 0.1 产品版本合同

1. 当前 SpecForge 开启独立的新产品版本纪元，首个正式产品版本为 `1.0.0`。这不是旧 V6 产品线的延续声明，也不承诺兼容旧版本。
2. 根 `package.json#version` 是产品版本的唯一实现身份；当前 workspace packages 采用固定版本策略，必须与根产品版本一致。
3. 新产品 Git Tag 固定使用 `specforge-v<semver>`。既有 `v*` Tag 是历史证据，必须保留，但不参与新纪元版本排序或当前产品身份判断。
4. 当前稳定 release identity 为 `specforge-current`。它标识当前发布通道，不等于产品 SemVer；发布清单中的产品版本必须来自根 `package.json#version`。
5. schemaVersion、HTTP/API 协议版本、事件格式版本、工作流格式版本和 SPS Specification ID 都是独立技术合同版本，不随产品版本机械重排。
6. 当前实现、发布脚本、安装器和面向用户的当前说明不得继续把 V6 或 V3.5 当作产品品牌。ADR、迁移脚本、Derived-From、旧测试与报告中的旧版本引用按历史证据保留。

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

事件归档不得丢弃重放所需的历史。由 WAL owner 轮转产生的 `events-*.jsonl.bak` 是同一追加历史的只读分段，必须与当前 `events.jsonl` 一起按完整顺序验证并重放，不是第二套状态源。不得按固定份数删除仍被重放依赖的段；缺段、重复、损坏或未知结构必须在状态、配置激活或后续事件写入前失败关闭。每次消费都执行结构检查，不能只在启动时校验。已有 checkpoint 或内存游标证明历史曾存在时，事件缺失不能被当作新项目；这些见证只用于拒绝不完整历史，不得用于补造事件。完整历史可以重建丢失或落后的投影。

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

Project Spec Core 的结构与版本必须保持原子一致：

- `spec_manifest.json.project_spec_version` 是当前 Project Spec Version 的权威值；Core 中任何复制该字段的结构化文件都必须在同一次 Atomic Spec Merge 中同步到相同值。
- `extension_registry.json` 存在时，其 `project_spec_version` 必须与 `spec_manifest.json` 完全一致；Post-Merge Gate、Formal Version Gate 与 Close Gate 必须失败关闭版本缺失或不一致，不能把成功的 merge report 当作一致性的替代证据。
- Architecture ID 必须使用 `ARCH-<DOMAIN>-<NNN>`，Data ID 必须使用 `DATA-<DOMAIN>-<NNN>`，Module Design ID 必须使用 `DD-<MODULE_CODE>-<NNN>`；其中 `<DOMAIN>` / `<MODULE_CODE>` 必须为 2 至 12 位、以大写字母开头且其余字符只允许大写字母或数字，`<NNN>` 为三位十进制序号。
- 一旦 Architecture、Data Model、Module Definition 或相应 Candidate 声明了正式治理对象，格式错误、对象缺失或治理闭包不完整必须失败关闭；不得因解析结果为空而降级到 compatibility mode。
- compatibility mode 只适用于尚未声明或合并正式 Architecture/Data/Module 治理对象的历史项目；它不能用于掩盖已存在但无法解析的正式规格。

## 4.4 Runtime location abstraction

Personal/local 模式默认将 Project Runtime 放在：

~~~text
<project>/.specforge/runtime/
~~~

集中式部署可以将同一 Project Runtime 合同放在：

~~~text
<OpenCode config>/sf-user/projects/<stable-project-key>/
~~~

`stable-project-key` 必须由目标平台上的规范化绝对项目路径确定；不同项目路径不得因短哈希碰撞共享 WAL 或状态。发现旧式短键目录但无法证明其归属时，必须停止自动读写与迁移，保留历史数据并要求受控恢复，不得静默建立第二个当前状态源。

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

运行时项目 JSON 的受控 producer 是 `sf_project_config`，owner 为 `sf-orchestrator`，提供 read（文档哈希及有效性，不返回原始值）、validate、update、restore。更新/恢复必须绑定当前文档原始字节 SHA-256，先校验四层合并，再原子替换；替换前不可变保存旧文档，以哈希指定恢复来源。活动任务期间仅允许写回与已接受配置内容身份一致的配置；缺失/损坏激活证据不得借恢复绕过。配置管理与 acceptance 使用同一项目串行边界，配置损坏时该管理入口仍可达，HardStop 边界不放宽。用户级凭据不由项目工具管理。所有自动请求归档与错误日志对配置工具只记录固定结构，不保存原始配置正文、任意字段名或解析片段。

配置 reload 不得使已经运行的 Work Item 在中途随机切换治理规则。Runtime 必须对活动 Work Item 使用稳定 configuration snapshot 或等价 activation boundary。

Daemon 的 ProjectManager 负责配置 acceptance：首次接入建立当前有效配置的激活边界，之后在项目 Runtime 目录保存 `configuration-activation.json`（schema `1.0`，仅配置内容 SHA-256，不保存凭据）。活动 Work Item 存在时，配置变化必须拒绝生效，恢复已接受的配置后可继续；Daemon 重启不得绕过该检查。没有活动 Work Item 时才可接受新配置。该首次接入记录不证明历史执行曾使用这份配置。CLI 服务设置也必须读取用户层；显式 CLI 参数优先。受信运行覆盖使用 `SPECFORGE_CONFIG_OVERRIDES` JSON 对象；缺失可选用户配置与配置损坏必须区分。

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

每一代 Candidate 的完整性合同如下：

1. `candidate_preparing → candidate_prepared` 是 Candidate seal 边界。Runtime 必须在首次写入冻结后 Manifest 之前读取当前 `.specforge/project/spec_manifest.json`，把其中 `project_spec_version` 写入 `candidate_manifest.base_spec_version`，并把该文件原始字节的 SHA-256 写入 `project_spec_precondition_sha256`；缺失、格式非法或读写失败必须在状态推进前失败关闭。
2. 每个 Gate Attempt 必须以不可覆盖证据封存本代 `candidate_manifest.json`、`candidates/**` 全部文件、`change_classification.md`、`impact_analysis.md` 和 `trigger_result.json` 的逐文件内容身份。Gate 自报 `input_files` 只能补充，不能缩小这一固定 seal 集。
3. `gate_summary.md` 只汇总生成它的当前 Gate Attempt；不得把旧阶段、旧代或未在本 Attempt 执行的历史 Gate 报告合并为当前通过结论。
4. User Decision Recorder 必须验证当前 seal 集与最近一次适用且通过的 Candidate Gate Attempt 快照一致，并从 Candidate Manifest 读取 `base_spec_version`；调用者不得提供或默认产品规格基线。Merge Runner 必须再次执行相同绑定校验，并验证 `base_spec_version` 与当前 Project Spec Version、`project_spec_precondition_sha256` 与当前 `spec_manifest.json` 原始字节哈希一致。
5. Requirements Gate 必须把 Requirements Candidate 中出现的正式 `REQ-*` 标识与正式需求章节一一对应；每个标识必须有唯一正文、可验证验收标准和非空语义内容。仅在摘要表、索引、Trace、Design 或 Tasks 中出现不能建立需求。
6. seal 后发现以上任一事实错误时，必须保留失败证据并经受控恢复回到 `candidate_preparing`，重新生成本代 Candidate、Gate 与显式批准；不得修改 sealed 文件、复用旧 Gate/审批，或运行调用者已知必败的 Gate 只为制造恢复状态。
7. Runtime 每次进入 `candidate_preparing` 时，必须读取 `trigger_result.impact_scope.planned_code_paths` 并生成 Work Item 根的 `implementation_baseline.json`。该文件是 Runtime-owned 当前实现快照，至少记录规范化 scope、每个匹配文件的相对路径、大小、SHA-256、总文件数与稳定 `snapshot_id`；Agent 不得写入或替代它。
8. Architecture、Design 与 Tasks Candidate 必须绑定同一 `implementation_baseline_id`。在 `candidate_preparing → candidate_prepared` 前，Runtime 必须复算基线并拒绝 snapshot 漂移；只要 planned scope 中有真实文件，Candidate basis 或专业 Candidate 中的 `all_files_new=true`、greenfield、新建文件、实现不存在等相反声明都必须失败关闭。修复必须更新真实 basis 与 Candidate，不得删除业务文件来迎合旧分析。
9. `implementation_baseline.json` 属于固定 Candidate seal 集，Gate Attempt、Decision 与 Merge 必须像其他 seal 输入一样验证其存在性与字节身份。基线不能替代 Agent 对真实代码、入口、调用链、行为与测试的阅读，只提供可复核的最低事实边界。
10. 当前代 Requirement 定义只允许 `REQ-<MODULE_CODE>-<NNN>` 三位序号；`REQ-N` 仅用于历史只读兼容。Requirements Gate 必须拒绝非规范位宽；Workflow Gate 必须枚举 Design、Tasks、Trace 和 Delta 中的每个规范形态 REQ token，并要求逐字解析到本代权威 Requirements 的唯一正文。不同位宽、短号、范围说明或“canonical 映射”不得视为相同 ID。
11. Candidate seal、冻结 Manifest 读取、兼容发现和所有 Gate 消费者必须使用同一个目标平台 resolved-path identity。Windows 上仅大小写不同但解析到同一文件的路径只能形成一个输入、一个哈希和一个定义 owner；POSIX 平台继续把大小写不同的路径视为不同身份。去重必须保留首个权威路径拼写，不得用删除文件、放宽重复定义 Gate 或忽略真实非规范引用来消除冲突。

## 6.5 已合并无效 Project Spec 的补偿恢复

普通 `closed` 状态保持终态，普通状态入口不得从 `closed` 跳出。只有当同一 Work Item 的成功 Atomic Spec Merge 已进入正式 Project Spec，且 Runtime 能以当前 Project Spec、原 Candidate、原 User Decision、原 Merge Report 和原 Close 证据直接证明“当前正式规格仍由该次 Merge 产生并且规格本身无效”时，Close owner 才能执行专用补偿恢复。

专用恢复必须满足：

1. 只允许原 Work Item 的权威状态为 `closed`，原 Close Gate 与 Merge Report 均为成功，原 User Decision 仍能绑定原 Candidate；
2. 当前 `spec_manifest.last_merged_work_item` 与 Project Spec Version 必须仍对应原 Merge 结果；若后续 Work Item 已改变正式 Project Spec，恢复必须失败关闭；
3. 无效性必须来自当前正式 Project Spec 的共享正式校验，例如 Project Spec Core 版本不一致、已声明 Architecture/Data/Module ID 非法或治理闭包、Contract、Trace 不完整；实现证据或环境问题仍使用普通 `recover_invalid_closure`，不得混用；
4. 首次状态变化前，必须把旧代 Candidate、Candidate Manifest、Gate、User Decision、Merge、Verification、Formal Version、Close 及关联治理证据复制到不可变 generation archive，并生成逐文件路径、大小与 SHA-256 Manifest；
5. 旧 User Decision 必须在同一补偿事务中失效，代码权限继续保持撤销；归档或失效失败时不得推进状态；
6. 受控补偿事件只允许 `closed → candidate_preparing`，且不得把该边加入普通状态转移表；恢复记录必须绑定旧代证据 Manifest、无效性检查结果、原 Merge 版本和操作者明确确认；
7. 恢复后必须使用当前 Project Spec Version 重新生成 Candidate，重新执行适用 Gate，重新取得针对新 Candidate 的显式用户批准，再执行新的 Atomic Spec Merge、Verification / Formal Version 与 Close；原审批、原 Gate 和原 Merge 不得作为新代通过证据；
8. 必须复用原 Work Item，保留原状态事件、失败、HardStop、Merge 和 Close 历史；不得手改 `.specforge` 真相源、删除旧证据或创建替代 Work Item。

## 6.6 验证证据完整性与已关闭 Work Item 的普通补偿恢复

Verification Gate 与 Close Gate 必须使用同一证据完整性判据。报告及 Evidence Manifest 中声明的时间不得晚于 Runtime 执行时点；对已关闭 WI 的复核必须与原 StateManager Close 事件时间对照，不能以事后观察时间使原先的未来时间变为有效。`L5/manual_acceptance` 的通过结论必须指向独立、可读取、非符号链接的原始证据文件，登记其 SHA-256 并在 Gate 时复算；Verifier 可以通过受控 `sf_artifact_write(file_type=verification_evidence)` 以不可覆盖文件名保存原始文本记录或图片字节，Runtime 返回内容哈希与记录时间，再由 Evidence Manifest 引用。仅指向 `verification_report.md`、`evidence_manifest.json` 或自然语言自述不能证明实际浏览器操作或用户验收。机器测试与代码字节同一性不能替代原始人工验收事实。用户验收的归属必须与浏览器操作员的技术测试分开记录，不得把 Agent 自测写成用户原话。

当原 WI 已是 `closed`，而同一完整性判据或既有 Formal Version 判据直接证明原关闭所依赖的实现／验证证据无效时，Close owner 在用户明确确认后可以执行普通 `recover_invalid_closure`。恢复前必须以不可变 generation archive 保存将被覆盖的原 Verification、Evidence Manifest、Semantic Closure、Gate、Formal Version 与既有恢复记录，记录逐文件大小、SHA-256 和归档 Manifest 哈希；恢复记录绑定原 Close 证据、具体失败判据、原 StateManager Close 时点和归档身份。若原始 Close 事件之前的守护拒绝数大于原审计报告记录数，该原始时间线与字节身份可证明漏审；必须一并归档原 Changed Files Audit、Write Guard 和 resolution。仅缺新引入的绑定字段、事后新增拒绝或证据不可读取均不能单独证明原关闭无效。仅以受控补偿事件执行 `closed → implementation_ready`，代码权限保持撤销，保留原 Candidate、Merge、User Decision 与全部历史事件。恢复后由相应 owner 重新取证、生成验证报告与证据清单、刷新语义闭包、重跑 Verification/Formal Version Gate，再执行 Close。普通状态入口仍禁止从 `closed` 跳出；规格本身无效时必须使用 §6.5 的独立路径，不得混用。

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

当前发布的 OS service registration 仅支持 Linux `systemd --user`。Windows 当前只支持由 user/operator、SpecForge CLI 或受控部署进程直接启动独立 Daemon 进程，不提供 Windows 系统服务注册或开机自启动能力。NSSM 不属于当前产品、安装器、发布物或运行依赖；未来引入任何 Windows 服务宿主必须先取得新的产品负责人裁决。

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

HTTP 成功必须代表对应 owner 已完成真实操作：状态读取进入项目 StateManager，状态推进进入受控 Dispatcher，会话列表来自 SessionRegistry。缺失 owner、拒绝的状态推进及未实现的旧 event-query/CAS/escaped-write 路由不得返回成功或伪造事件 ID；旧路由明确返回 unavailable/unsupported。此要求不新增公开 CAS 或查询产品能力。

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
- Thin Plugin 必须在 OpenCode `tool.execute.before` 等待 Daemon 裁决；无法取得明确 allow 必须拒绝执行。原生 edit/write 的路径、操作及活动任务状态由 Daemon 校验，调用者不得自报受控 owner 角色。原生任意 shell、无法完整识别的 patch 和未知写工具必须转到受控工具，不能凭声明目标文件或命令文本猜测放行。
- changed_files_audit 必须证明最终变化不超范围。

Write Guard 是统一写入控制机制，不建立与 Permission Engine 并列的第二权限事实源。

当前 `sf_safe_bash` 采用受控只读执行范围：只允许由 Runtime 自身实现、完整解析的有限只读操作，不将调用者文本交给 Shell，不启动外部程序或子进程。脚本、解释器、构建、测试、任意可执行文件、复合命令、环境注入和 stdin 执行均必须在执行前明确拒绝；工作项活动状态、代码权限、报告目录例外、角色和历史授权不得解除这一限制。不能把未识别到写目标当作只读证明。

这是产品负责人选择的安全封堵范围，不声明当前仍具备通用脚本、构建或测试执行能力。验证工具不得绕到另一个本地执行器执行被拒绝命令，也不得把拒绝记录为测试通过。正常只读操作须提供真实读取结果、输出限制及明确失败；其支持语法由同一受控执行器定义并由部署消费者共享。未来恢复通用执行前，必须另行建立并验证隔离环境、子进程继承边界和受控结果交付。

原生工具写前检查必须识别全部正式受控入口，包括经独立 HTTP owner 执行的 `sf_project_init`；只能按精确注册名识别，不得放行任意 `sf_*` 名称。初始化仍由 Project Init owner 保证范围和幂等性。

原生 edit/write 的路径批准不能授权同一文件的其他硬链接名称。现有目标为普通文件但链接数不为一时，执行边界必须在宿主写入前拒绝并记录守护结果；符号链接和目录联接继续拒绝。普通单链接修改与新文件创建仍须通过原权限判断。此写前检查不声明操作系统级沙箱或与外部并发文件替换之间的原子隔离能力。

Changed Files Audit 必须绑定本次读取的 Write Guard、HardStop resolution 与 write authorization 原始证据身份；Verification 与 Close 复用同一新鲜度检查。审计后出现任何新记录或证据变化，旧 PASS 立即失效，必须重新审计并验证。尚未处理的拒绝应由审计 owner 建立可恢复 HardStop，经正式 resolution 后重新审计，保留原始拒绝与处置原因，不扩大代码权限。关闭流程不得改写历史守护日志的操作类型或计数来适配最终文件差异。历史无守护来源的报告可兼容；存在来源却未绑定的报告需重做。

版本控制模式属于 Code Permission 前置冻结事实：已有 Git 项目必须在实施前绑定可验证的分支与基线；非 Git 项目必须冻结为 `filesystem` 并以 filesystem baseline、Changed Files Audit 和 Formal Version 完成闭环。filesystem Formal Version 必须保存经审计的实现文件精确集合及其逐字节内容指纹，Close Gate 必须重新计算文件集合与内容指纹；新增、删除或内容变化均使既有 Formal Version 失效，不得仅凭路径范围、文件大小、mtime 或先前 Gate 状态关闭。实施开始后出现的 `git init` 不得反向改变该事实。历史 Work Item 若缺少冻结字段，只能在原 governance scope 与 filesystem baseline 的原始字节哈希、时间线以及当前无 HEAD/零跟踪文件仓库现场均可验证时，由受控 Code Permission 工具写入追加式恢复记录；Formal Version 必须重新验证该记录，任何源漂移、Git context、HEAD、tracked file 或仓库身份变化均使恢复失效。该恢复不产生 Git 分支、提交、合并或交付义务。

## 9.3 HardStop

HardStop 是 recoverable safety latch，不是“任务永久结束”。

规则：

- 触发后危险动作及其依赖动作停止。
- 不允许绕过或手工删除锁存事实。
- 恢复必须记录 resolution evidence。
- 恢复后重新读取 authoritative state 并从合法 resume point 继续。
- 只有没有安全恢复路径时才进入 blocked。

## 9.4 Git 忽略、可再生产物与实施范围修订

Git ignore 决定、业务代码写权限和可再生产物排除是三个不同的治理事实，不得互相冒充：

- `git_ignore_decisions.json` 保存产品负责人或用户确认的 track / ignore 决定；`ignore` 决定必须由受控 Tool 同步应用到项目根 `.gitignore`，只记录决定但未生效不构成排除依据。
- `changed_files_audit` 只有在决定文件与根 `.gitignore` 均有当前哈希来源、目标路径属于已知可再生产物类别、Git 实际判定为 ignored 且文件未被跟踪时，才可把该路径从业务代码范围中排除。
- dependency lockfile 不默认等于业务代码，也不默认等于可丢弃缓存；必须显式选择 track，或显式选择 governed-ignore。普通源文件、配置和文档不能借 ignore 决定绕过 changed-files audit。
- 实施中发现新的业务代码路径时，必须通过 `code_permission extend` 在既有 Module / Design / Contract 治理范围内修订 allowed-write scope，并记录原因、增量文件和修订后的完整范围。新增 Module 或扩大上位治理范围仍须回到规格变更链，不能用 permission extension 绕过。
- 原 Work Item 因上述能力缺口进入 HardStop / blocked 后，修复能力并验证通过时必须恢复原 Work Item 和原证据链，不创建替代 Work Item，也不删除原始 blocked 记录。

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

部署边界：

- Thin Plugin 只安装在 `<OpenCode config>/plugins/sf_specforge.ts`，作为用户级全局插件被 OpenCode 发现。
- 项目初始化不得向 `<project>/.opencode/plugins/` 复制或生成 SpecForge Plugin，避免同一进程重复注册 hooks、事件或工具。
- 可测试的依赖注入实现位于 `<OpenCode config>/sf-user/lib/`；OpenCode 自动发现入口只能暴露一个唯一 Plugin 函数值。

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
- capability discovery 必须读取 OpenCode 已连接 provider 的实际模型字段；未知模型、服务不可用或响应不完整必须明确失败，不得根据模型名称编造上下文长度、视觉或工具能力。
- 必需 provider 身份、上下文、视觉和工具字段缺失或非法时继续失败关闭；接口未提供的可选能力必须明确为未知，不能把未知当成支持或不支持。中立能力合同以 `null` 表达未知；`streaming` 与 `jsonOutput` 分别描述流式输出和受约束 JSON 能力。普通文本包含 JSON 不证明受约束 JSON 支持。当前 `/provider` 未提供这两项时返回未知；只有明确证据才能返回布尔值。能力合并、查询、缓存和 HTTP 序列化必须保留此区别，新证据优先于旧缓存。`outputFormats` 是可选用的文本呈现/已证实格式列表，缺少 JSON 条目不等于证明模型不支持 JSON。
- OpenCode compatibility/version isolation

OpenCode-specific type 不得泄漏到 Daemon core contract、Project Spec 或 workflow state。

状态：

~~~text
ENABLED
~~~

Daemon production consumer、release `specforged` 部署链和 OpenCode 1.18.34 端到端验证已经完成；OpenCode Adapter 当前作为正式集成能力启用。

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

当前正式 CLI 只发布与现行 Daemon/部署合同一致的命令。依赖未注册 `/jobs`、`/api/specs`、`/api/webhooks` 或 `/api/plugins` 路由的历史命令组不得出现在正式解析器或帮助中；未来发布须先定义、实现并端到端验证完整 Daemon 合同。

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
- First-party Thin Plugin 只安装到 OpenCode config root 的 plugins 目录，不生成项目级副本。
- 将 SpecForge 私有用户级资产安装到 sf-user。
- 将 specforge-manifest.json 写在 OpenCode config root。
- 支持 install / upgrade / verify / uninstall 的清晰边界。
- 升级使用原子替换或等价不会留下半安装状态的机制。
- 不创建 ~/.specforge 当前运行树。
- 安装和升级成功回执必须显示 CLI 二进制目录，并判断当前 shell 能否直接解析 `specforge`；不可解析时必须给出可复制、幂等的一次性 PATH 配置命令。
- PATH 是用户拥有的环境状态，不属于文件安装事务；Installer 不得静默改写 PATH。用户明确执行配置命令后，正常操作入口必须是短命令 `specforge`，不得要求日常记忆绝对路径。

## 12.2 安装完整性与版本

Installer Manifest 是已安装共享组件的正式安装清单。

verify 证明安装完整性；是否为最新版本必须通过显式版本/升级检查判断，不能混淆两者。

---

# 13. Service Management 与 Host Profile

## 13.1 Service Management

Service Management 负责部署层 Daemon/service lifecycle、health check、graceful shutdown 和必要的 reconnect policy。

它不得让 Thin Plugin 获得共享 Daemon lifecycle ownership。

当前 Service Management 的 OS service lifecycle 范围仅为 Linux `systemd --user`。Windows 上的直接 Daemon 进程启动不等同于 Windows 系统服务管理；当前产品不集成、下载、分发或要求 NSSM。

正式 CLI 生命周期入口为 `specforge daemon start --detach`、`specforge daemon status`、`specforge daemon restart` 和 `specforge daemon stop`。CLI 未进入 PATH 时，安装成功回执与派生安装文档负责提供一次性环境配置；Thin Plugin 仍不得代替 CLI 或 service manager 管理 Daemon。

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
- 配置日志只记录安全的结构信息；原始配置值、嵌套对象和可能包含输入片段的解析错误不得直接进入日志。
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
| @specforge/opencode-adapter | ENABLED | OpenCode isolation adapter |
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

## 18.1 Current Release Machine Projection

下列机器块是本 Product Specification 的 release-surface 投影。它与本文件属于同一权威源，不是独立 release scope 文档。

Scope Gate 只能从本块读取 current release classification，并将 source hash 绑定到本 Product Specification 当前字节。implementation matrix、Kiro、代码和测试不得成为替代 source。

<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:START -->
```json
{
  "schemaVersion": "1.0",
  "releaseId": "specforge-current",
  "complete": true,
  "itemGroups": [
    {
      "ids": [
        "@specforge/daemon-core",
        "@specforge/cli",
        "@specforge/workflow-runtime",
        "@specforge/permission-engine",
        "@specforge/observability",
        "@specforge/opencode-adapter"
      ],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": [
        "package_export",
        "clean_build",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "@specforge/types",
        "@specforge/configuration",
        "@specforge/service-management",
        "@specforge/host-profile",
        "@specforge/version-unification",
        "@specforge/scope-gate"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "package_export",
        "clean_build",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "@specforge/plugin-loader",
        "@specforge/self-healing",
        "@specforge/multimodal"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "runtime:specforged",
        "runtime:specforge",
        "plugin:sf_specforge"
      ],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": [
        "clean_build",
        "installer_asset",
        "release_manifest",
        "runtime_entry"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "release:installer",
        "release:release-manifest"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "clean_build",
        "release_manifest",
        "runtime_entry"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "runtime:current-config"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "runtime:handshake"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "runtime_entry"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "workflow:feature_spec"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "dynamic_registry",
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "workflow:architecture_change",
        "workflow:bugfix_spec",
        "workflow:change_request",
        "workflow:contract_change",
        "workflow:feature_spec_design_first",
        "workflow:investigation",
        "workflow:ops_task",
        "workflow:quick_change",
        "workflow:refactor",
        "workflow:spec_migration"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "agent:sf-orchestrator",
        "agent:sf-requirements",
        "agent:sf-design",
        "agent:sf-task-planner",
        "agent:sf-executor",
        "agent:sf-debugger",
        "agent:sf-reviewer",
        "agent:sf-verifier",
        "agent:sf-knowledge",
        "agent:sf-analyst"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "dynamic_registry",
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "agent-template:_AGENT_BASE"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "agent:sf-investigator",
        "agent:sf-evidence-collector",
        "agent:sf-extension"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "skill:sf-intake",
        "skill:sf-workflow-feature-spec",
        "skill:superpowers-brainstorming",
        "skill:superpowers-writing-plans",
        "skill:superpowers-systematic-debugging",
        "skill:superpowers-code-review",
        "skill:superpowers-verification-before-completion",
        "skill:superpowers-knowledge-extraction"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "dynamic_registry",
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "skill:sf-workflow-architecture-change",
        "skill:sf-workflow-bugfix-spec",
        "skill:sf-workflow-change-request",
        "skill:sf-workflow-contract-change",
        "skill:sf-workflow-design-first",
        "skill:sf-workflow-investigation",
        "skill:sf-workflow-ops-task",
        "skill:sf-workflow-quick-change",
        "skill:sf-workflow-refactor",
        "skill:sf-workflow-spec-migration",
        "skill:superpowers-subagent-driven-development",
        "skill:superpowers-tdd",
        "skill:superpowers-engineering-lessons"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_artifact_write",
        "tool:sf_batch_verify",
        "tool:sf_changed_files_audit",
        "tool:sf_close_gate",
        "tool:sf_code_permission",
        "tool:sf_contract_register",
        "tool:sf_design_gate",
        "tool:sf_doc_lint",
        "tool:sf_doctor",
        "tool:sf_gate_run",
        "tool:sf_hard_stop_resolve",
        "tool:sf_knowledge_base",
        "tool:sf_merge_run",
        "tool:sf_project_init",
        "tool:sf_project_config",
        "tool:sf_requirements_gate",
        "tool:sf_safe_bash",
        "tool:sf_semantic_closure_run",
        "tool:sf_state_read",
        "tool:sf_state_transition",
        "tool:sf_tasks_gate",
        "tool:sf_trace_matrix",
        "tool:sf_user_decision_record",
        "tool:sf_verification_gate"
      ],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": [
        "dynamic_registry",
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_git_agent_lock_acquire",
        "tool:sf_git_agent_lock_release",
        "tool:sf_git_auth_profile_config",
        "tool:sf_git_branch_plan",
        "tool:sf_git_branch_create",
        "tool:sf_git_checkpoint_commit",
        "tool:sf_git_ignore_analyze",
        "tool:sf_git_ignore_decision_record",
        "tool:sf_git_merge_plan",
        "tool:sf_git_merge_run",
        "tool:sf_git_post_merge_verify",
        "tool:sf_git_preflight",
        "tool:sf_git_push_branch",
        "tool:sf_git_release_tag_plan",
        "tool:sf_git_release_tag_create",
        "tool:sf_git_remote_config",
        "tool:sf_git_remote_probe"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "dynamic_registry",
        "installer_asset",
        "release_manifest"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_work_item_create",
        "tool:sf_rollback",
        "tool:sf_handoff",
        "tool:sf_verification"
      ],
      "classification": "CURRENT_RELEASE_CORE",
      "requiredSurfaces": [
        "dynamic_registry",
        "clean_build"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_context_build",
        "tool:sf_continuity",
        "tool:sf_cost_report",
        "tool:sf_knowledge_graph",
        "tool:sf_knowledge_query"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_spec_migration",
        "tool:sf_v11_spec_migration",
        "tool:sf_work_item_repair_closure"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_git_pr_plan",
        "tool:sf_git_stacked_branch_plan",
        "tool:sf_git_worktree_plan",
        "tool:sf_git_worktree_create"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_git_project_adopt"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_git_changed_files_audit",
        "tool:sf_write_guard_preflight"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "tool:sf_v11_work_item_create",
        "tool:sf_v11_gate_run",
        "tool:sf_v11_merge",
        "tool:sf_v11_decision",
        "tool:sf_v11_code_permission",
        "tool:sf_v11_rollback",
        "tool:sf_v11_handoff",
        "tool:sf_v11_verification",
        "tool:sf_v11_semantic_closure_run"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "plugin-loader:static-check"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "plugin-loader:runtime-registry",
        "plugin-loader:hot-reload",
        "plugin-loader:sandbox-ipc",
        "plugin-loader:process-manager"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "self-healing:diagnose"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "self-healing:propose",
        "self-healing:approve",
        "self-healing:apply",
        "self-healing:verify"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "multimodal:text-input",
        "multimodal:nontext-rejection"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "multimodal:ocr",
        "multimodal:parser",
        "multimodal:transcription"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "@specforge/migration",
        "migration:current-schema"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "migration:legacy-discovery",
        "migration:legacy-heuristic"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "scope-gate:release-validator"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "package_export",
        "clean_build"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "scope-gate:runtime-feature-flags"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "thin-plugin:event-reporting",
        "thin-plugin:recovery-display"
      ],
      "classification": "CURRENT_RELEASE_SUPPORTING",
      "requiredSurfaces": [
        "installer_asset",
        "release_manifest",
        "runtime_entry"
      ],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "thin-plugin:daemon-start"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "thin-plugin:local-writeguard",
        "thin-plugin:shadow-state",
        "thin-plugin:business-state"
      ],
      "classification": "BUILT_NOT_ENABLED",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "legacy:daemon-project-auto-detection",
        "legacy:cli-legacy-paths",
        "legacy:setup-compatibility-cleanup",
        "legacy:version-manifest-adapter",
        "legacy:migration-project-discovery"
      ],
      "classification": "LEGACY_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    },
    {
      "ids": [
        "history:error-ledger",
        "history:gate-attempts",
        "history:audit",
        "history:reports"
      ],
      "classification": "HISTORICAL_EVIDENCE_ONLY",
      "requiredSurfaces": [],
      "dependencies": [],
      "authoritySources": [
        "docs/product-specification/specforge-product-specification.md"
      ]
    }
  ]
}
```
<!-- SPECFORGE_RELEASE_AUTHORITY_ITEMS:END -->

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

# 20. Conformance Gap 管理规则

Conformance Gap 是“当前实现或派生消费者尚未符合本规格”的工程事实，不是产品需求，也不是本规格的稳定组成部分。

1. 活动 Gap、当前阶段和下一合法动作只记录在 `docs/project-status.md`。
2. 已解决 Gap 的时间线、证据和详细实现说明进入 Git 与 `docs/archive/**`，不得长期堆积在 Product Specification 中。
3. 修复已由本规格明确决定的 Gap 不需要重新开启产品范围裁决；只有发现新的产品级冲突时才返回产品负责人。
4. 代码、README、帮助文本、生成文档和测试均是消费者；任何一项与本规格不一致，都必须作为 Gap 处理。

SPS-1.0 建立阶段 CG-001—CG-014 的完整关闭记录保存在 `docs/archive/product-specification/sps-1.0-conformance-gap-history-20261011.md`。

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

# 22. 仓库权威与跨会话连续性

以下规则是产品负责人对产品开发权威链和持续维护方式的正式裁决：

1. `AGENTS.md` 是新 AI 会话进入 SpecForge 仓库的稳定入口；它必须要求在分析、修改或验证前运行只读 `scripts/project-session-bootstrap.mjs`。
2. `docs/project-status.md` 是唯一当前执行状态文件，只保存当前目标、阶段、阻塞、下一合法动作和验证要求；不得保存会自引用失效的 commit/HEAD 值。
3. Product Specification 与 Authority Registry 是产品决定的唯一入口；状态文件、实现、测试、聊天或历史文档不得创造产品需求。
4. `docs/design/SpecForge架构一致性治理最终实施方案.md` 是精简的当前从属技术治理合同，必须服从本规格和 Authority Registry；2026-10-06 前的完整实施方案原样保存在 `docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md`，仅作历史证据。
5. 旧规格、旧设计、旧标准、实施记录、报告与审计统一保存在 `docs/archive/**`；历史证据不得删除，也不得因为仍被测试读取而恢复为当前权威。
6. 仓库根不得存在 `.kiro/**`。旧 Kiro 内容统一保存在 `docs/archive/kiro/**`；只有已经明确合并进本规格、登记合同或当前实现的内容才可继续约束产品。
7. 新会话恢复器必须核验本地/远端 Git 基线、必需文件、唯一状态块、并行状态文件、根 `.kiro` 缺失及工作树变化，并在证据不足或冲突时 fail closed。
8. 产品负责人裁决（AR-DEC-05，2026-10-03）：SpecForge 开发只有两种外部执行模式——`CODEX_DIRECT`（Codex 同时负责规划、执行与验证）与 `WORKBUDDY_COORDINATED`（Codex=Planner/Auditor，WorkBuddy=Executor/Evidence Producer，用户=消息转交与产品决策）。执行与证据规则的唯一依据是 `docs/rule/specforge-execution-mode-and-evidence-protocol.md`（执行与证据规则，不是产品规格）；该协议规定新会话恢复链（AGENTS.md → bootstrap → REQUIRED_RULES → EXECUTION_MODE → RUN_ID/EVIDENCE_ROOT → LAST_EXECUTION_CHECKPOINT → NEXT_LEGAL_ACTION → STOP_CONDITION）、模式切换纪律（最新明确用户指令可切换；无明确切换时继承 project-status；阶段中途不得静默切换）与证据要求（RUN_ID、EVIDENCE_ROOT、命令四件套、真实 UTC 时间、数字退出码、observer effects、manifest 自校验、强制停点）。WORKBUDDY_COORDINATED 模式下，WorkBuddy 自述不能替代 Codex 独立审核。`docs/project-status.md` 以 `PROJECT_STATUS_SCHEMA=2` 表达当前模式、角色、RUN_ID、EVIDENCE_ROOT 与停点，并由 Bootstrap 校验。

9. 产品负责人裁决（AR-DEC-06，2026-10-05）：活动经验规则与历史账本分离。`docs/rule/specforge-active-development-rules.md` 是新会话必须完整读取的当前活动开发规则（经验规则唯一当前载体）；`docs/rule/specforge-development-error-ledger-and-experience.md` 保留为历史错误、审计与经验演化证据，不再要求每会话全文读取。新会话读取活动规则后，必须按任务关键词、涉及模块和适用 EXP 对历史账本执行定向检索，并输出 `HISTORICAL_LEDGER_SEARCH`（命中清单或 NONE_WITH_JUSTIFICATION）。新的历史错误继续追加到账本；需要长期执行的新规则必须同时进入活动规则文件。Bootstrap 的 REQUIRED_RULES 引用活动规则文件，不得重新引入历史账本全文读取要求。

---

# Appendix A — 已吸收的产品裁决

SPS-1.0 已吸收 Authority Model Recovery 阶段的 PO-001、D01—D09 与 AR-DEC-01—AR-DEC-06。完整裁决登记见 authority-registry.md。

本 Appendix 只用于可追溯，不建立第二套规则。
