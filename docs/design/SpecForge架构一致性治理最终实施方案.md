# SpecForge 架构一致性治理最终实施方案

## 1. 文档定位、权威边界与设计原则

### 1.1 文档状态

- **设计状态**：Accepted / AUTHORITATIVE
- **产品实施状态**：动态状态不在本文件固化；以 `docs/implementation/architecture-consistency/current-handoff.md` 的当前执行状态和正式 Git / immutable evidence 为准。
- **决策记录**：[`ADR-007-architecture-consistency-governance.md`](../adr/ADR-007-architecture-consistency-governance.md)、[`ADR-008-new-project-governance-bootstrap.md`](../adr/ADR-008-new-project-governance-bootstrap.md)
- **权威性**：AUTHORITATIVE；唯一当前权威源定义见 1.2。
- **取代**：`docs/archive/SpecForge治理架构完整修改方案-已取代.md`
- **动态验证证据**：测试数量、commit、当前 Stage、Blocker、最新验证结果和实施进度属于运行事实，只进入 `current-handoff.md`、标准执行回执、Git 或 immutable evidence；不得复制到本权威文件形成会过期的“当前事实”。
- **产品完成边界**：第 10 章 Phase 1—12 是首次实现本治理能力的一次性产品实施路线；首次宣布完成前必须通过 Phase 11 真实全新项目端到端验收，并在 Phase 12 固化最终 Hard Enforcement。旧项目迁移不是当前版本交付目标。

> 本文件只保存稳定目标架构、稳定治理契约、实施路线定义和验收标准，不保存会随开发推进变化的测试计数、HEAD、当前缺陷或“尚未完成”状态。

> 状态：AUTHORITATIVE（唯一当前权威源）
>
> 本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。
> 其他设计草案、专项说明、实施报告、交接文件和决策记录，只保存历史背景、实施证据或决策原因，不得作为并列设计权威。
> 任何其他文件与本文件冲突时，以本文件为准。任何新的架构或契约决策，必须先修订本文件，再修改实现。
### 1.2 唯一权威源

**GOV-AUTH-001：** SpecForge 架构一致性治理和契约治理只保留一个当前权威源：

```text
docs/design/SpecForge架构一致性治理最终实施方案.md
```

以下文件均为非权威历史或专项资料：

```text
docs/design/semantic-closure-contract-governance.md
docs/design/contract-model-followups-implementation-report.md
docs/design/contract-model-followups-handoff.md
docs/design/specforge-design-governance-contract-model.md
```

它们可以记录专项细节、实施事实、交接事项、备选方案和决策原因，但不能覆盖本文件。

架构或契约决策可以通过多个 ADR 或专题文件记录原因，但决策文件必须：

1. 引用本文件中的稳定规则 ID；
2. 说明决策日期、备选方案、选择原因和影响范围；
3. 说明替代了哪些旧规则；
4. 不复制形成第二套当前规则；
5. 最终把有效结论同步回本文件。

### 1.3 文件作用范围与两种开发模式

**GOV-ROLE-001：** 本文件是开发 SpecForge 产品中“架构一致性治理与契约治理能力”的设计依据，不是业务项目运行时直接读取或人工执行的项目治理手册。

本文件中的有效规则最终必须落实到：

```text
SpecForge 程序
Tool
Skill
Agent 说明
Gate
Runtime 状态约束
项目初始化模板
正式治理文件结构
自动化测试
```

完成后的业务项目直接遵守 SpecForge 已实现的程序性治理，以及该业务项目自己的 Architecture、Data Model、Module Design、Contract、Trace、Work Item 和 Task；业务项目不以读取本文件作为治理成立条件。

必须严格区分：

```text
开发 SpecForge 产品时怎样工作
≠
完成后的 SpecForge 怎样治理业务项目
≠
本次产品能力按哪些 Phase 实施和验收
```

#### 1.3.1 模式 A：SpecForge 自身开发

**GOV-MODE-001：** SpecForge 自身修改必须遵守本文件的架构一致性与契约治理要求。

**GOV-SELF-001：** SpecForge 自身由 ChatGPT 或其他直接开发工具修改，不运行 SpecForge 自己的 Work Item、Workflow、Candidate、Gate、User Decision、Merge Runner、Code Permission 或 Close 流程，不采用“SpecForge 使用 SpecForge 治理自己”的自治理模式。

模式 A 必须执行：

```text
人工架构一致性治理
+ 契约治理
+ 修改范围治理
+ 普通软件工程验证
```

模式 A 中源代码可能暂时处于未完成的中间状态；中间状态只能用于产品开发和验证，不能被描述为完成后的业务项目治理规则，也不能作为正式产品完成依据。

#### 1.3.2 模式 B：完成后的 SpecForge 治理其他项目

完成后的 SpecForge 必须通过已经实现到程序、Tool、Skill、Agent、Gate 和 Runtime 中的能力，强制业务项目执行第 3.1 节定义的 **Canonical Product Lifecycle**。

本节只定义运行模式边界，不复制生命周期步骤：

```text
模式 B
→ 业务项目进入第 3.1 Canonical Product Lifecycle
→ 各阶段分别消费第 4—9 章的唯一规范
→ 第 12 章按同一组 Rule ID / Gate / Evidence 验收
```

业务项目不直接读取本文件；OpenCode、Agent、Runtime、Gate 和 Write Guard 必须把本文件定义的架构一致性原则转化为可执行、可验证、失败关闭的产品行为。
### 1.4 文档导航与内容唯一归属

| 治理主题 | 唯一规范位置 |
|---|---|
| 文档身份、权威边界、开发模式、设计原则 | 第 1 章 |
| SpecForge 自身开发、Stage、Bootstrap、交付、Recovery | 第 2 章 |
| 完成后的产品治理对象、Canonical Product Lifecycle 与总体架构 | 第 3 章 |
| Requirement / Impact / Classification / Workflow | 第 4 章 |
| Candidate 与正式 Spec 生产 | 第 5 章 |
| Contract / Trace | 第 6 章 |
| Gate / Fast Path | 第 7 章 |
| Code Permission → Implementation → Verification → Release | 第 8 章 |
| 新项目首次 WI 与后续 WI | 第 9 章 |
| SpecForge 产品 Phase 1-12 实施路线（只引用正式规则，不重复定义） | 第 10 章 |
| 实施映射（不是任务 write scope） | 第 11 章 |
| 验收矩阵与最终完成标准 | 第 12 章 |
| 新会话固定启动提示词 | 附录 A |
| 稳定 Rule ID 导航 | 附录 B |

固定说明：

```text
APPROVED_DEDUP_SCOPE=D1,D2,D3,D4,D5,D6,D7,D8,D9,D10,D11,D12,D13,D14,D15,D16,D17,D18,D19
RULE_ID_DEFINITION_SET_PRESERVED=YES
D15_D19_FINAL_CONTENT_CLOSURE=DEDUP_SCOPE|IMPLEMENTATION_MAPPING|POST_SPEC_MERGE_TERM|PROJECT_CONTRACT_PRODUCER|ATOMIC_SPEC_MERGE_PRODUCER
章节号 = 人工阅读导航
Rule ID = 机器稳定契约
```

### 1.5 总体设计原则

整个实施过程中坚持以下原则：

```text
能复用现有能力，就不新增能力。

能扩展现有 Gate，就不新增 Gate。

除 Formal Version Gate 外，不增加新的 Gate。

不增加新的 Workflow。

不增加新的 Agent。

不增加新的治理层。

不把数据库机械拆成 Module 私有设计。

不让 Agent 手工维护能够机器推导的索引。

不让 Agent 决定机器能够确定的 Module / Trace / Candidate 路径。

不因为 Fast Path 而跳过 Architecture / Data / Contract 一致性。

不允许 Implementation 反过来修改已经批准的治理范围。

不为了形式制造无意义的 Candidate 或 Trace。

Requirement 现有治理继续保留。

越简单，越稳定。
```

补充固定原则：

```text
不增加 Project Spec Readiness Gate。
不增加 CI。
```

<!-- SPECFORGE_AUTHORITY_PROTOCOL:START -->

## 2. SpecForge 自身开发与执行治理协议

### 2.1 新会话的远程权威入口

**GOV-REMOTE-001：** ChatGPT 不依赖跨会话记忆，也不把仓库根目录 `AGENTS.md` 当作当然入口。每次新的 SpecForge 自身开发会话，用户必须在提示词中明确要求 ChatGPT 从 GitHub 远程仓库读取本文件。

开始工作前必须记录：

```text
Repository URL
Remote branch
Remote HEAD commit SHA
Authority file path
Authority file所在 commit SHA
Local branch（如使用本地证据）
Local HEAD（如使用本地证据）
Working tree status（如使用本地证据）
```

远程文件、本地文件或用户上传副本不一致时，必须先报告差异并确定本次基线，禁止混用不同版本规则。

**GOV-STAGE-AUTHORITY-BOOTSTRAP-001：** 新会话必须先建立不可由 branch 页面缓存替代的 Authority Bootstrap Root of Trust；未固定 live `AUTHORITY_HEAD` 前，不得把 branch URL、`raw/.../main/...`、搜索索引、compare 页面或“某 commit 可访问”当作当前 authority。

固定启动顺序：

```text
BOOTSTRAP COORDINATES FROM USER PROMPT
→ RESOLVE LIVE AUTHORITY BRANCH REF
→ FIX AUTHORITY_HEAD
→ READ AUTHORITY BY EXACT COMMIT REF
→ VALIDATE UNIQUE AUTHORITY MARKER
→ AUTHORITY_BOOTSTRAP_ACCEPTED=YES
→ GOVERNANCE PRECONCLUSION
→ canonical Stage Input
→ Recovery Acceptance
```

Bootstrap Coordinates 是固定入口坐标，不属于从仓库推导的动态事实：

```text
AUTHORITY_BOOTSTRAP_REMOTE_URL=https://github.com/lyqstart/SpecForge.git
AUTHORITY_BOOTSTRAP_BRANCH=main
AUTHORITY_BOOTSTRAP_PATH=docs/design/SpecForge架构一致性治理最终实施方案.md
```

当前 branch ref 的可接受来源：

```text
AUTHORITY_HEAD_SOURCE=
STRUCTURED_GIT_LS_REMOTE
| GITHUB_REF_API_LIVE
| USER_BOOTSTRAP_GIT_LS_REMOTE
```

以下只能作为辅助或 last-known 线索，不能单独把当前 `AUTHORITY_HEAD` 提升为 confirmed：

```text
LAST_COMPLETE_RECEIPT
WEB_AUXILIARY
BRANCH_HTML_VIEW
BRANCH_RAW_CONTENT
SEARCH_INDEX
COMPARE_VIEW
COMMIT_REACHABLE
```

Authority Bootstrap 必须输出：

```text
AUTHORITY_BOOTSTRAP_REMOTE_URL=
AUTHORITY_BOOTSTRAP_BRANCH=
AUTHORITY_BOOTSTRAP_PATH=
AUTHORITY_HEAD_SOURCE=
AUTHORITY_HEAD=
AUTHORITY_EXACT_CONTENT_REF=
AUTHORITY_UNIQUE_MARKER_AUDIT=PASS|FAIL
AUTHORITY_BOOTSTRAP_EVIDENCE=
AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=
AUTHORITY_BOOTSTRAP_VALIDATOR_ID=
AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES|NO
AUTHORITY_BOOTSTRAP_ACCEPTED=YES|NO
```

固定规则：

1. `AUTHORITY_HEAD_SOURCE` 只有 `STRUCTURED_GIT_LS_REMOTE`、`GITHUB_REF_API_LIVE` 或 `USER_BOOTSTRAP_GIT_LS_REMOTE` 才允许作为 live branch-ref 真相源。
2. `LAST_COMPLETE_RECEIPT` 只能提供 `LAST_CONFIRMED_AUTHORITY_HEAD` 和跨会话线索；即使上一轮 `PUSH_SUCCEEDED=YES`，新会话仍不得把旧 receipt 直接表述成“当前 live remote HEAD”。它可以先用 exact commit 读取最后确认规则，但任何有副作用动作前必须重新取得 live branch ref。
3. `BRANCH_RAW_CONTENT`（包括 `raw.githubusercontent.com/.../main/...`）只能在 `AUTHORITY_HEAD` 已经由 live branch-ref 固定后用于辅助比较；它不能决定 `AUTHORITY_HEAD`。
4. 固定 `AUTHORITY_HEAD` 后，authority 正文必须从 exact commit 引用读取：
   `https://raw.githubusercontent.com/lyqstart/SpecForge/<AUTHORITY_HEAD>/docs/design/SpecForge架构一致性治理最终实施方案.md`。
   禁止先读取 `.../main/...` 再从正文或网页推断 HEAD。
5. exact commit authority 必须包含且只包含一个唯一权威标记：
   `本文件是 SpecForge 架构一致性治理（包括契约治理）的唯一当前权威源。`
   唯一标记验证失败时 `AUTHORITY_BOOTSTRAP_ACCEPTED=NO`。
6. `AUTHORITY_COMMIT` 与 `AUTHORITY_HEAD` 是不同事实：`AUTHORITY_HEAD` 是 authority branch 当前 ref；`AUTHORITY_COMMIT` 是 authority 文件最近一次变更 commit。只有当结构化 Git / commit-path evidence 证明二者相同时才能写成相等，禁止因为 authority 内容来自 exact HEAD 就自动推断二者相同。
7. 如果当前会话工具无法取得 live Git ref，必须 `AUTHORITY_BOOTSTRAP_ACCEPTED=NO` 并 Fail Closed；不得退回网页缓存继续 Recovery。唯一允许的下一动作是取得 branch ref 的只读 Bootstrap Evidence。
8. 只读 Bootstrap Evidence 的最小允许动作是 `git ls-remote <REMOTE_URL> refs/heads/<AUTHORITY_BRANCH>`。该动作不得读写 SpecForge Work Item、不得触发 Gate/User Decision/Merge/Code Permission/Verification/Close，不得修改仓库。
9. 如果上一轮存在 ZIP+CMD 但用户没有提供完整标准执行回执，必须把 `MISSING_LAST_EXECUTION_RECEIPT` 列入 Bootstrap/Recovery evidence gap；不得假装“上一轮没有执行回执”。用户明确说明上一轮没有 ZIP+CMD 时，receipt 才允许为 `NONE`。
10. Authority Bootstrap Validator 必须遵守 `GOV-STAGE-VALIDATOR-001`。阻断依据必须是 structured ref、exact commit content、稳定 marker/schema；网页抓取时间、搜索排序和自然语言摘要不得作为阻断性真相源。
11. 只有 `AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES`、`AUTHORITY_UNIQUE_MARKER_AUDIT=PASS` 且 `AUTHORITY_HEAD_SOURCE` 属于允许的 live source 时，才能 `AUTHORITY_BOOTSTRAP_ACCEPTED=YES`。
12. `AUTHORITY_BOOTSTRAP_ACCEPTED != YES` 时，不得输出“已按当前远程 authority 完成恢复”、不得把 handoff 状态提升为 authoritative fact、不得进入常规 Recovery Acceptance；只能取得缺失的 live branch-ref evidence。

**GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001：** Authority Bootstrap 失败路径本身也是必须验收的治理成果；`AUTHORITY_BOOTSTRAP_ACCEPTED=NO` 不等于可以省略 Bootstrap 字段、读取 handoff 或直接交付未经 Artifact Acceptance 的取证包。

当 live branch ref 无法取得、live source 返回错误或 Bootstrap 其他前置条件不成立时，必须完整输出：

> 失败机器字段与字段顺序以本节 `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001` 的固定失败模板为唯一 canonical schema；本规则只定义失败语义、访问边界和接受条件。

固定规则：

1. Bootstrap 失败不允许缩写字段；`AUTHORITY_HEAD=INSUFFICIENT_EVIDENCE` 时，`AUTHORITY_EXACT_CONTENT_REF` 和 `AUTHORITY_UNIQUE_MARKER_AUDIT` 必须明确写 `NOT_APPLICABLE_NO_LIVE_HEAD` / `NOT_RUN_NO_EXACT_COMMIT`，不能直接省略。
2. `AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES` 只表示“验证器正确证明 Bootstrap 当前失败”；它不把 `AUTHORITY_BOOTSTRAP_ACCEPTED` 提升为 `YES`。
3. `AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=PASS` 的必要条件是：本次 Bootstrap 尚未接受期间，没有读取 `current-handoff`、Work Item、immutable evidence、Stage Input、Recovery Acceptance 或任何 WI 生命周期事实。只允许读取用户提示词中的 Bootstrap Coordinates、上一轮完整 receipt（仅作 last-confirmed continuity）和取得 live branch ref 所必需的证据。
4. `AUTHORITY_BOOTSTRAP_ACCEPTED=NO` 时禁止进入 PRECONCLUSION、Stage Input、Recovery Acceptance；也禁止提前把 handoff 中的 `WORK_BRANCH`、WI state、attempt、operation boundary 当作本轮恢复材料，即使标记为 pending claim 也不允许在 Bootstrap 失败阶段读取。
5. Bootstrap 失败后唯一合法下一动作固定为 `AUTHORITY_BOOTSTRAP_NEXT_ACTION=ACQUIRE_LIVE_BRANCH_REF_ONLY`。
6. 若需要用户本地取证，只允许生成一个“Bootstrap live-ref evidence”只读交付包。该包只允许：
   - 执行 `git ls-remote <REMOTE_URL> refs/heads/<AUTHORITY_BRANCH>`；
   - 输出 stdout / exit code / exact ref；
   - 不读取或修改任何 SpecForge / Validation 仓库文件；
   - 不调用任何 Work Item / Workflow / Gate / User Decision / Merge / Code Permission / Verification / Close。
7. 上述只读取证包仍是 Artifact；发布给用户前必须完整通过 `GOV-STAGE-ARTIFACT-VERIFY-001` 与 `GOV-STAGE-VALIDATOR-001`，至少输出：
> Bootstrap evidence Artifact Acceptance 字段以 `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001` 的固定 Artifact Acceptance 模板为唯一 canonical schema。
8. `POST_BUILD_VERIFY=PASS`、`ZIP reopen PASS`、`NO_PYC_CACHE=PASS` 或类似局部检查不能替代完整 Artifact Acceptance。
9. 只有取证包已经 `ARTIFACT_ACCEPTED=YES` 时，才允许：
   `AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=YES` 并向用户发布 ZIP+CMD。
10. `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES` 仅在以下全部成立时允许：
   - 本规则全部失败字段完整；
   - `AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES`；
   - `AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=PASS`；
   - `AUTHORITY_BOOTSTRAP_NEXT_ACTION=ACQUIRE_LIVE_BRANCH_REF_ONLY`；
   - 若已生成取证包，则该包 `ARTIFACT_ACCEPTED=YES`。
11. `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED != YES` 时不得发布取证 ZIP+CMD；先修正 Bootstrap Failure Acceptance 本身。
12. 用户返回结构化 `git ls-remote` 证据后，新的会话回合必须重新从 Authority Bootstrap 开始；不得把前一个失败回合中未授权读取的 handoff/Recovery 内容沿用到通过后的恢复阶段。

**GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001：** Bootstrap 失败路径必须使用固定机器模板；禁止自由发挥、缩写字段或直接输出裸 `git ls-remote` CMD。

固定失败模板如下，字段顺序也属于契约：

```text
===== BEGIN AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====
AUTHORITY_BOOTSTRAP_REMOTE_URL=
AUTHORITY_BOOTSTRAP_BRANCH=
AUTHORITY_BOOTSTRAP_PATH=
AUTHORITY_HEAD_SOURCE=INSUFFICIENT_EVIDENCE
AUTHORITY_HEAD=INSUFFICIENT_EVIDENCE
AUTHORITY_EXACT_CONTENT_REF=NOT_APPLICABLE_NO_LIVE_HEAD
AUTHORITY_UNIQUE_MARKER_AUDIT=NOT_RUN_NO_EXACT_COMMIT
AUTHORITY_BOOTSTRAP_EVIDENCE=
AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=CURRENT_SESSION
AUTHORITY_BOOTSTRAP_VALIDATOR_ID=
AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES|NO
AUTHORITY_BOOTSTRAP_ACCEPTED=NO
AUTHORITY_BOOTSTRAP_FAILURE_REASON=
AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=PASS_NO_HANDOFF_OR_RECOVERY_READ|FAIL
AUTHORITY_BOOTSTRAP_NEXT_ACTION=ACQUIRE_LIVE_BRANCH_REF_ONLY
AUTHORITY_BOOTSTRAP_READ_ONLY_EVIDENCE_REQUIRED=YES
BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD
RAW_CMD_ALLOWED=NO
AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ID=
AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=YES|NO|NOT_YET_GENERATED
AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES|NO
===== END AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====
```

若需要用户本地取得 live ref，随后必须先输出完整 Artifact Acceptance，格式固定为：

```text
===== BEGIN BOOTSTRAP EVIDENCE ARTIFACT ACCEPTANCE =====
ARTIFACT_ID=
ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP
ARTIFACT_CONTRACT=GOV-STAGE-DELIVERY-001+GOV-STAGE-ARTIFACT-VERIFY-001+GOV-STAGE-VALIDATOR-001+GOV-STAGE-DELIVERY-IDENTITY-001
DELIVERY_ID=
PACKAGE_NAME=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=manifest.json
IDENTITY_BINDING_AUDIT=PASS|FAIL
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=
STRUCTURE_VALIDATION=PASS|FAIL
COMPLETENESS_VALIDATION=PASS|FAIL
SEMANTIC_VALIDATION=PASS|FAIL
REFERENCE_VALIDATION=PASS|FAIL
SCOPE_VALIDATION=PASS|FAIL
EXECUTABILITY_VALIDATION=PASS|FAIL
CONSUMER_VALIDATION=PASS|FAIL
VALIDATION_EVIDENCE=
VALIDATOR_ID=
VALIDATOR_SELF_CHECK=PASS|FAIL
VALIDATOR_ACCEPTED=YES|NO
ARTIFACT_ACCEPTED=YES|NO
===== END BOOTSTRAP EVIDENCE ARTIFACT ACCEPTANCE =====
```

固定规则：

1. Bootstrap 失败回复必须先完整输出 `BEGIN/END AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE`；缺一字段、字段乱序、模板缩写或只输出若干核心字段，均视为 `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=NO`。
2. `AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES` 只证明失败判断本身正确；在 evidence Artifact 尚未生成时允许 `AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=NOT_YET_GENERATED`，但此时不得发布任何命令。
3. 需要用户本地取证时，必须先生成 ZIP，再完成完整 Artifact Acceptance；只有 `VALIDATOR_ACCEPTED=YES` 且 `ARTIFACT_ACCEPTED=YES` 后，才允许把失败块中的 `AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED` 更新为 `YES` 并把 `AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED` 更新为 `YES`。
4. `RAW_CMD_ALLOWED=NO` 是硬约束。禁止向用户直接发布：
   `git ls-remote ...`
   或任何等价裸 CMD / shell 命令来代替 accepted ZIP。
5. Bootstrap 失败路径的用户执行交付固定为：
   `BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD`。
   ZIP 内 runner 只能执行 live branch-ref 读取；CMD 只能负责解压该已验收 ZIP 并调用 packaged runner。
6. 命令出现位置属于契约：任何用户可执行 CMD 必须位于完整 Artifact Acceptance 之后；在 `ARTIFACT_ACCEPTED=YES` 之前出现命令，`CONSUMER_VALIDATION=FAIL`。
7. evidence ZIP 的 runner 不允许接收 SpecForge 仓库路径作为参数；不得 `cd` 到 SpecForge / Validation 仓库，不得读取 handoff / WI / immutable evidence。其输入只能是 ZIP 自身校验值与固定 remote/ref 坐标。
8. evidence runner 输出必须包含：
```text
===== BEGIN FEEDBACK TO CHATGPT =====
PACKAGE_NAME=
DELIVERY_ID=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=manifest.json
IDENTITY_BINDING_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE
ACTION_TYPE=BOOTSTRAP_LIVE_REF_READ_ONLY
REMOTE_URL=
AUTHORITY_BRANCH=
LS_REMOTE_EXIT_CODE=
LS_REMOTE_STDOUT=
LIVE_REF_SHA=
REPOSITORY_READS=NONE
REPOSITORY_WRITES=NONE
LIFECYCLE_ACTIONS=NONE
===== END FEEDBACK TO CHATGPT =====
```
9. 只有 `LS_REMOTE_EXIT_CODE=0`、stdout 恰好解析为单一 `refs/heads/main` 且 SHA 合法时，`LIVE_REF_SHA` 才能填写 SHA；否则必须 `INSUFFICIENT_EVIDENCE`。
10. 用户返回该结构化回执后，必须重新执行 Authority Bootstrap；取证 runner 不读取 exact authority，不进行 PRECONCLUSION / Stage Input / Recovery。
11. 固定新会话提示词必须携带本规则最小硬约束：完整失败模板、`RAW_CMD_ALLOWED=NO`、`ONE_ACCEPTED_ZIP_PLUS_ONE_CMD`、Artifact Acceptance 必须先于 CMD。
12. 本规则只约束 Bootstrap 失败交付，不改变成功路径 `GOV-STAGE-AUTHORITY-BOOTSTRAP-001` 和后续 Recovery 契约。

### 2.2 SpecForge 自身开发：修改前治理

**GOV-PRE-001：** 修改任何代码前，必须完成源码取证和治理前置结论。治理前置结论至少包含：

```text
任务目标：
当前事实和一手证据：
适用架构规则 ID：
受影响模块：
受影响 Project Architecture：
受影响 Project Data Model：
受影响 Module Design：
受影响 Project Contract：
受影响 Module Contract：
受影响生产者和消费者：
受影响 Workflow / Gate / Runtime：
允许修改文件：
明确不允许修改范围：
需要新增或修改的测试：
是否需要修订本权威文件：
证据不足项：
```

以下任一项未完成时，不得修改代码：

```text
未读取远程权威文件
未固定远程 commit SHA
未调查当前源码事实
未判断架构影响
未判断契约影响
未确定生产者和消费者
未确定修改范围
未确定验证计划
```

### 2.3 架构变化必须在同一任务/WI闭环

**ARCH-WI-001：** 一个需求或任务引起架构变化时，必须在同一个任务范围内完成 Architecture、Data Model、Module Design、Contract、Task、实现和验证的同步修改。

对于使用 SpecForge 开发其他项目的模式 B：

```text
同一个 WI 内扩大治理范围
→ Architecture Candidate
→ Data Model Candidate（需要时）
→ Module Design Candidate
→ Contract Candidate（需要时）
→ Task
→ 一次审批
→ 一次 Atomic Spec Merge
→ Implementation
→ Verification
```

不为同一个需求另建独立架构 WI。旧文件中“新建架构 WI，并依赖跨 WI 自动恢复原 WI”的要求已经废止。

### 2.4 实施过程中的范围冻结

**GOV-SCOPE-001：** 实施过程中必须：

```text
只修改前置结论批准的范围
不临时扩大任务目标
不绕过现有架构
不自行发明跨模块契约
不为通过测试而削弱正式规则
不把测试兼容逻辑误写成生产规则
```

发现新的架构、契约、模块、消费者或文件影响时，必须停止扩大修改，重新执行治理前置分析并更新允许范围。

### 2.5 修改后治理闭环

**GOV-POST-001：** 修改完成后必须逐项验证：

```text
实际修改文件是否超出批准范围
是否符合 Project Architecture
是否符合 Project Data Model
是否符合 Module Design
是否破坏 Project Contract
是否破坏 Module Contract
是否遗漏生产者或消费者
是否破坏 Workflow / Gate / Runtime 状态边界
权威文件是否需要同步且已经同步
```

同时执行所有适用的普通软件工程验证：

```text
单元测试
属性测试（适用时）
集成测试（适用时）
端到端测试（适用时）
回归测试
TypeScript no-emit 检查
相关 package 构建
全仓确定性构建（达到集成或发布边界时）
git diff --check
git status --short
```

工程验证不是治理的全部内容。完整闭环是：

```text
架构一致性
+ 契约一致性
+ 实际范围审计
+ 功能与工程验证
+ 唯一权威文件同步
```

最终报告必须包含：

```text
实际修改：
架构一致性结论：
契约一致性结论：
实际范围审计：
测试结果：
构建和类型检查结果：
git diff/status 结果：
权威文件同步情况：
仍未解决的问题：
证据不足项：
```

### 2.6 Fail Closed 与证据不足

本节只定义什么时候必须停止；Stage、Artifact、Delivery、Bootstrap 和 Recovery 的具体协议分别归属于 2.8—2.12。

**GOV-EVID-001：** 任何必需事实、验证或契约证据不足时，必须标记 `INSUFFICIENT_EVIDENCE`，不得猜测、提交、推送或宣布完成。

出现以下任一情况，不得进入完成边界：

```text
架构未对账
契约未对账
实际范围未核对
生产者或消费者未查全
必需测试未完成或失败
必需构建或类型检查未完成或失败
应更新权威文件但尚未更新
存在未解决治理缺陷
存在 INSUFFICIENT_EVIDENCE
```

“每次完全做到”不依赖模型记忆，而由以下机制共同保证：

```text
用户提示词强制读取远程权威文件
+ 远程 commit SHA 固定本次规则版本
+ Stage Input / Checkpoint / Stage Output / Failure Diagnostic 固定执行契约
+ 当前持久化状态与 immutable evidence 作为运行事实
+ current-handoff 只保存当前动态交接并与持久化事实对账
+ Fail Closed 完成条件
```

如未来增加结构性回归测试，该测试只能检查本文件的唯一权威声明、必要章节、规则 ID 和旧文件非权威声明是否仍然存在；它属于普通仓库回归测试，不是 SpecForge 自治理流程。

### 2.7 Continuity 与当前用户授权边界

**GOV-CONT-001：** Context Compaction、跨会话续接、Agent Summary、旧 Prompt、Workflow Skill 和从状态推导出的剩余生命周期，不得扩大当前用户在本轮明确给出的操作授权边界。

固定优先级：

```text
当前最新用户指令 / OPERATION_BOUNDARY
> 当前持久化 Work Item 权威状态与运行证据
> 当前 Workflow Skill
> 旧 Prompt / Original Task / 历史交接
> Agent 根据阶段推断的 Pending Work
```

强制规则：
1. 用户明确规定“只执行到某状态后停止”“禁止 Verification / Close / Git 操作”或限定允许 Tool/写入范围时，该边界只允许由后续新的真实用户指令扩大，Agent、Skill、Compaction Summary、旧 Prompt 和连续性引擎均无权扩大；
2. 达到用户指定 stop condition 后，本轮即结束；即使完整 Workflow 仍有后续阶段，也必须等待新的用户指令；
3. 任何 Compaction、上下文恢复或续接发生后，在执行新的有副作用 Tool 前，Orchestrator 必须重新确认最新用户操作边界；边界无法从当前上下文或持久化 Continuity Snapshot 唯一恢复时，只允许只读取证并 Fail Closed；
4. `ContextSnapshot` 必须保存最新真实用户指令作为 `operation_boundary` 的原始证据；Continuation Prompt 必须把它放在 Original Task、Workflow Skill 和 Pending Work 之前，并明确禁止隐式扩大；
5. `architecture_change` 属于代码型 Workflow，Continuity Snapshot 必须像其他代码型 Workflow 一样保留文件状态和验证结果；
6. OpenCode 自身自动 Compaction 即使未显式调用 `sf_continuity`，重新加载后的 Orchestrator 也必须遵守同一优先级；不得读取旧 `prompts/*.txt` 或完整 Workflow Skill 来覆盖更窄的当前用户边界；
7. 本规则只约束当前用户授权与执行连续性，不改变 Work Item 状态机、Gate 判定或业务 Contract 语义。

### 2.8 Stage Execution Contract

本节是普通阶段执行的唯一规范位置；Stage Input、Checkpoint、Output、失败诊断、副作用、重试、Blocker、handoff、环境和分支模型都在这里定义。

**GOV-STAGE-001：** 完整阶段是用户交互粒度，Checkpoint 是内部证据粒度。

在不跨越用户授权、人工决策、daemon/OpenCode 手工生命周期或未知副作用边界的前提下，SpecForge 自身开发和真实项目验证优先“一轮推进一个完整阶段”。提高效率只能减少人工往返，不得减少证据、治理检查、测试、Fail Closed 或停止条件。

固定原则：

```text
用户操作粒度 = 一个完整阶段
内部证据粒度 = 一个可定位子步骤
```

**GOV-STAGE-INPUT-001：** 每个阶段执行前必须冻结 Stage Input。

新的 Stage Input 至少包含：

```text
GLOBAL_GOAL=
CURRENT_STAGE=
STAGE_GOAL=
REMOTE_URL=
AUTHORITY_BRANCH=
AUTHORITY_HEAD=
AUTHORITY_PATH=
AUTHORITY_COMMIT=
WORK_BRANCH=
WORK_HEAD=
REMOTE_WORK_HEAD=
WORKTREE_STATUS=
CURRENT_AUTHORITATIVE_STATE=
CURRENT_IMMUTABLE_EVIDENCE=
OPERATION_BOUNDARY=
SUCCESS_CRITERIA=
EXPECTED_SIDE_EFFECTS=
FORBIDDEN_SIDE_EFFECTS=
STOP_CONDITION=
BLOCKER=
BACKLOG=
NEXT_STAGE=
LOCAL_COMMAND_SHELL=
DOWNLOAD_PACKAGE_DIR=
LOCAL_PATH_QUOTING=
```

固定规则：

1. 字段不得因为同一事实已在 `GOVERNANCE PRECONCLUSION`、handoff、上一轮 receipt 或其他正文出现而省略；未知值必须显式写 `INSUFFICIENT_EVIDENCE` 或带来源状态的 pending 值。
2. `TARGET_BRANCH` / `REMOTE_HEAD` 是历史证据兼容字段；新的 Stage Input、Stage Output、Failure Diagnostic 与标准执行回执按 `GOV-STAGE-BRANCH-001` 使用 `AUTHORITY_BRANCH` / `WORK_BRANCH` 分离模型，不再把 `TARGET_BRANCH` / `REMOTE_HEAD` 当作新 Stage Input 必填字段。
3. `AUTHORITY_HEAD` 表示当前 authority branch 的 ref；`REMOTE_WORK_HEAD` 表示当前 work branch 的 remote ref；二者不得混用。
4. `CURRENT_AUTHORITATIVE_STATE` / `CURRENT_IMMUTABLE_EVIDENCE` 若仅来自 handoff 或旧 receipt，必须明确标记为 pending confirmation，不能写成已经由 StateManager / immutable evidence 重新确认的 authoritative fact。
5. 缺少 `SUCCESS_CRITERIA`、`EXPECTED_SIDE_EFFECTS`、`FORBIDDEN_SIDE_EFFECTS`、`STOP_CONDITION` 或当前动作所需的 branch/state/evidence 任一事实时，不得执行有副作用动作。
6. `LOCAL_COMMAND_SHELL`、`DOWNLOAD_PACKAGE_DIR`、`LOCAL_PATH_QUOTING` 是 Stage Input 的固定字段；即使当前 Stage 只读，也必须恢复并对账，避免后续交付重新猜测本地执行环境。

**GOV-STAGE-CHK-001：** 完整阶段内部必须形成可诊断 Checkpoint。

至少记录：

```text
STEP_ID=
STEP_NAME=
INPUT_EVIDENCE=
ACTION=
OUTPUT_EVIDENCE=
STATUS=PASS|FAIL|NOT_RUN
STATE_BEFORE=
STATE_AFTER=
SIDE_EFFECT_STARTED=
SIDE_EFFECT_CONFIRMED=
ARTIFACTS_CREATED=
ARTIFACTS_CHANGED=
```

阶段失败时必须能由 Checkpoint 唯一确定 `LAST_SUCCESSFUL_STEP` 与 `FIRST_FAILED_STEP`。

**GOV-STAGE-OUTPUT-001：** 阶段成功必须输出固定 Stage Output。

至少包含：

```text
RESULT=SUCCESS
GLOBAL_GOAL=
COMPLETED_STAGE=
SUCCESS_CRITERIA_RESULT=
AUTHORITATIVE_STATE_AFTER=
EXPECTED_SIDE_EFFECTS_AUDIT=
FORBIDDEN_SIDE_EFFECTS_AUDIT=
IMMUTABLE_EVIDENCE_CREATED=
IMMUTABLE_EVIDENCE_VERIFIED=
ARCHITECTURE_RECONCILIATION=
CONTRACT_RECONCILIATION=
SCOPE_AUDIT=
ARTIFACT_ACCEPTANCE_AUDIT=
TEST_RESULT=
BUILD_RESULT=
STOP_CONDITION_REACHED=
NEXT_STAGE=
NEXT_LEGAL_ACTION=
INSUFFICIENT_EVIDENCE=
```

不适用项必须显式写 `NOT_APPLICABLE`。

**GOV-STAGE-DIAG-001：** 阶段失败必须输出标准 Failure Diagnostic。

至少包含：

```text
RESULT=FAILED
LAST_SUCCESSFUL_STEP=
FIRST_FAILED_STEP=
FAILURE_CLASS=
ERROR_CODE=
ERROR=
STATE_BEFORE=
STATE_AFTER=
ACTION_TOOL=
ACTION_NAME=
ACTION_ARGS_HASH=
REQUEST_STARTED=
RESPONSE_RECEIVED=
SIDE_EFFECTS_OBSERVED=
ARTIFACTS_CREATED=
ARTIFACTS_CHANGED=
IMMUTABLE_EVIDENCE_ID=
IMMUTABLE_EVIDENCE_STATUS=
PRODUCER=
CONSUMER=
FAILED_INVARIANT=
RETRY_SAFETY=
RETRY_REASON=
NEXT_LEGAL_ACTION=
INSUFFICIENT_EVIDENCE=
```

`FAILURE_CLASS` 只允许：

```text
PRODUCT_DEFECT
GOVERNANCE_FAILURE
VALIDATION_HARNESS_DEFECT
ENVIRONMENT_FAILURE
AMBIGUOUS_SIDE_EFFECT
```

外围 runner 返回非零不得直接等价为产品失败。

**GOV-STAGE-SIDEFX-001：** 阶段前定义 Expected / Forbidden Side Effects，阶段后按语义 delta 审计。

动作后只判断实际 delta 是否落在 `EXPECTED_SIDE_EFFECTS`，以及是否触碰 `FORBIDDEN_SIDE_EFFECTS`；禁止机械要求整个文件集合、Git untracked 集合或 Runtime 目录与动作前完全相等。

例如正式 Gate 运行预期会新增 immutable `gate_attempts/attempt-NNNN/**`，并可能更新 latest Gate compatibility view 和合法状态事件；这些必须在执行前声明为 Expected Side Effects，不能被验证器误判为范围漂移。

**GOV-STAGE-RETRY-001：** 已开始的有副作用动作必须先证明实际效果，再决定是否重试。

1. `REQUEST_STARTED=NO`：修复前置问题后可重新执行；
2. `REQUEST_STARTED=YES` 且 `RESPONSE_RECEIVED=YES`：后续外围审计失败时，必须先读持久化状态与 immutable evidence，禁止直接重试；
3. `REQUEST_STARTED=YES` 且 `RESPONSE_RECEIVED=NO`：标记 `AMBIGUOUS_SIDE_EFFECT`，先只读取证；证据不足时 `RETRY_SAFETY=NO`；
4. Gate、User Decision、Merge、Code Permission、Verification、Close 不得由外围 runner 自动重试；
5. 旧 immutable evidence 不得删除、覆盖或改写。

**GOV-STAGE-BLOCKER-001：** 新问题必须先分类为 Blocker 或 Backlog。

```text
阻断当前 Stage Success Criteria
→ BLOCKER
→ 当前阶段处理或 Fail Closed

不阻断当前 Stage Success Criteria
→ BACKLOG
→ 记录后继续当前阶段
```

新增问题改变 Architecture、Contract、Module、Producer/Consumer、Workflow/Gate/Runtime 或批准文件范围时，按 `GOV-SCOPE-001` 重新做影响分析；非 Blocker 不得无因果扩大任务。

**GOV-STAGE-HANDOFF-001：** 稳定规则写入本权威文件；current-handoff 只保存一个当前执行动态状态区。

`docs/implementation/architecture-consistency/current-handoff.md` 是非权威动态交接，不得形成第二套治理规则。唯一 `CURRENT EXECUTION STATE` 至少包含：
```text
GLOBAL_GOAL=
CURRENT_STAGE=
CURRENT_STAGE_STATUS=
LAST_COMPLETED_STAGE=
CURRENT_BLOCKER=
REMOTE_HEAD_BASELINE=
AUTHORITY_BASELINE_COMMIT=
VALIDATION_PROJECT=
CURRENT_WI=
AUTHORITATIVE_WI_STATE=
LATEST_IMMUTABLE_EVIDENCE=
LATEST_PRODUCT_FIX=
OPERATION_BOUNDARY=
FORBIDDEN_ACTIONS=
NEXT_STAGE=
NEXT_LEGAL_ACTION=
STOP_CONDITION=
PERMANENT_INSUFFICIENT_EVIDENCE=
```

新会话固定恢复顺序：
```text
1. 从 GitHub 当前远程分支读取本权威文件并固定 AUTHORITY_HEAD
2. 读取 current-handoff 唯一 CURRENT EXECUTION STATE
3. 用当前持久化 Work Item 状态和 immutable evidence 对账 handoff
4. 应用最新用户 OPERATION_BOUNDARY
5. 输出完整 GOVERNANCE PRECONCLUSION + canonical Stage Input
6. 按 GOV-STAGE-RECOVERY-ACCEPT-001 执行 Recovery Acceptance
7. RECOVERY_ACCEPTED=YES 后才允许执行被接受的 NEXT_LEGAL_ACTION；否则 Fail Closed
```

冲突时以远程权威规则 + 当前持久化事实 + 最新用户授权为准，不得用模型记忆、旧 Prompt 或旧 handoff 覆盖当前事实。

**GOV-STAGE-ENV-001：** 本地执行环境属于跨会话动态输入；通用读取和引用规则写入本权威文件，机器相关具体值只写入 `current-handoff.md`。

`CURRENT EXECUTION STATE` 必须维护：

```text
LOCAL_COMMAND_SHELL=
DOWNLOAD_PACKAGE_DIR=
LOCAL_PATH_QUOTING=
```

固定规则：

1. 生成用户本地一键命令前，必须读取上述字段，不得假设 `%USERPROFILE%\Downloads`、桌面、当前目录或其他默认下载位置；
2. `LOCAL_COMMAND_SHELL=CMD` 时，只提供 Windows CMD 命令，不得改用 PowerShell；
3. 任何来自 `DOWNLOAD_PACKAGE_DIR` 的 ZIP 路径、解压目录、脚本路径以及包含空格或非 ASCII 字符（包括中文）的本地路径参数，都必须使用完整双引号包裹；
4. 一键命令必须使用 handoff 中当前 `DOWNLOAD_PACKAGE_DIR` 的实际值；用户后续修改该值时，只更新 handoff 动态状态，不把个人机器目录硬编码进本权威规则；
5. 新会话恢复 Stage Input 时，必须把 `LOCAL_COMMAND_SHELL`、`DOWNLOAD_PACKAGE_DIR`、`LOCAL_PATH_QUOTING` 作为本地执行环境输入一起恢复并对账。

**GOV-STAGE-BRANCH-001：** 权威规则分支与实际工作分支必须分离建模，禁止把 `main` 同时隐式解释为二者。

固定定义：

```text
AUTHORITY_BRANCH=main
AUTHORITY_HEAD=
WORK_BRANCH=
WORK_HEAD=
REMOTE_WORK_HEAD=
WORKTREE_STATUS=
```

固定规则：

1. `AUTHORITY_BRANCH` 表示唯一权威规则的读取分支；SpecForge 当前固定从远程 `main` 读取本权威文件。
2. `WORK_BRANCH` 表示当前实际调查、开发、验证或交付所在分支；可以是 `main`、feature、fix 或其他经用户授权的分支。
3. 新会话必须先从 `AUTHORITY_BRANCH` 读取本权威文件，再从上一轮标准执行回执恢复 `WORK_BRANCH`；不得因为 `AUTHORITY_BRANCH=main` 就自动把工作分支设为 `main`。
4. 如果 `WORK_BRANCH != AUTHORITY_BRANCH`，当前源码、当前工作 HEAD、worktree 和适用动态状态必须按 `WORK_BRANCH` 对账；本权威文件仍从 `AUTHORITY_BRANCH` 读取。
5. `WORK_HEAD` 必须来自当前本地工作分支；`REMOTE_WORK_HEAD` 必须来自对应远程 branch ref。commit 可访问不等于 branch HEAD。
6. `AUTHORITY_HEAD`、`WORK_HEAD`、`REMOTE_WORK_HEAD` 是每轮运行时事实和标准回执字段，不要求把当前 commit SHA 自引用写进同一 commit 的 handoff；新会话必须重新读取远程 refs 并与上一轮回执对账。
7. `current-handoff.md` 只持久化当前 `AUTHORITY_BRANCH`、`WORK_BRANCH` 和其他非自引用动态环境/阶段信息；精确 HEAD 以当前远程/本地读取结果与上一轮回执为准。
8. 任何分支切换必须成为显式 Stage，不得由补丁、验证、提交或生命周期 runner 顺便执行。
9. 分支切换前必须证明当前 worktree 没有未分类修改；需要与远程同步时必须先证明当前 branch lineage，无法证明时 Fail Closed。
10. 分支切换 Stage 必须输出 `BRANCH_SWITCH_FROM`、`BRANCH_SWITCH_TO`、`BRANCH_SWITCHED`，并在切换后重新读取 `WORK_HEAD`、`REMOTE_WORK_HEAD`、`WORKTREE_STATUS`。
11. 未取得当前真实工作分支证据时，只允许只读调查并标记 `INSUFFICIENT_EVIDENCE`，不得猜测分支后继续写入。
12. 历史字段 `TARGET_BRANCH` 可以保留在旧证据中；新的 Stage Input、Stage Output、Failure Diagnostic 与标准执行回执必须优先使用本规则的 `AUTHORITY_BRANCH` / `WORK_BRANCH` 分离模型。

### 2.9 Truth Source、Artifact Acceptance 与 Validator

本节只定义“事实从哪里来、成果如何验收、验证器如何自证”，不定义 Delivery 或 Bootstrap 状态机。

**GOV-STAGE-TRUTH-001：** 验证器必须复用正式产品真相源，禁止近似判断替代。

优先级：

```text
正式 StateManager / authority reader
> immutable Gate Attempt / input snapshot / Formal Version 等持久化证据
> 正式 parser / resolver / required-gates / reconciliation
> 受控 Tool handler 返回
> Git 精确结构化协议
> 人工文本搜索或临时近似解析
```

禁止用泛关键词推断产品能力；禁止猜 `events.jsonl` 字段代替 StateManager；禁止自写与正式 Trace/Candidate/Contract parser 不同的近似语义；禁止把 compatibility latest view 当 immutable Attempt。

**GOV-STAGE-ARTIFACT-VERIFY-001：** 任何阶段成果都必须在生成后执行独立后验验收；“生成成功”不等于“成果有效”。

固定流程：

```text
GENERATE
→ VERIFY
→ ACCEPT
→ PUBLISH / EXECUTE / COMMIT / PUSH / CONSUME
```

禁止：

```text
GENERATE
→ 直接认为正确
→ 进入下一阶段
```

“成果”至少包括：

```text
GOVERNANCE PRECONCLUSION
Stage Input
Checkpoint
Stage Output
Failure Diagnostic
current-handoff CURRENT EXECUTION STATE
标准执行回执
ZIP
CMD
runner / script
代码补丁
文档补丁
测试 / 类型检查 / 构建 / 审计证据
commit / push / merge plan 等交付结果
```

每个被生成或修改、且将被用户、脚本或下一阶段消费的成果，必须形成 Artifact Acceptance Checkpoint：

```text
ARTIFACT_ID=
ARTIFACT_TYPE=
ARTIFACT_CONTRACT=
GENERATOR=
VALIDATOR=
STRUCTURE_VALIDATION=PASS|FAIL|NOT_APPLICABLE
COMPLETENESS_VALIDATION=PASS|FAIL|NOT_APPLICABLE
SEMANTIC_VALIDATION=PASS|FAIL|NOT_APPLICABLE
REFERENCE_VALIDATION=PASS|FAIL|NOT_APPLICABLE
SCOPE_VALIDATION=PASS|FAIL|NOT_APPLICABLE
EXECUTABILITY_VALIDATION=PASS|FAIL|NOT_APPLICABLE
CONSUMER_VALIDATION=PASS|FAIL|NOT_APPLICABLE
VALIDATION_EVIDENCE=
ARTIFACT_ACCEPTED=YES|NO
```

固定规则：

1. `ARTIFACT_ACCEPTED=YES` 只允许在全部适用维度均为 `PASS` 且不存在该成果所需 `INSUFFICIENT_EVIDENCE` 时成立；`NOT_APPLICABLE` 必须有事实理由。
2. `ARTIFACT_ACCEPTED != YES` 时，该成果不得交付用户执行、不得执行、不得 commit/push、不得写入 handoff 作为已确认事实，也不得作为下一 Stage 输入。
3. `GOVERNANCE PRECONCLUSION` 与 `Stage Input` 本身都是成果。任何有副作用动作前必须逐字段检查治理前置结论和 `GOV-STAGE-INPUT-001` 全部必填字段；字段在前文其他章节出现过不能替代 Stage Input 自身完整性。
4. Stage Output、Failure Diagnostic、标准执行回执和 handoff 在被下一会话或下一阶段消费前，必须验证结构完整、字段齐全、语义自洽，以及 branch / HEAD / state / immutable evidence 引用与当前事实一致。
5. ZIP + CMD 交付必须验证 ZIP 文件集合、manifest/hash、runner 可解析性、CMD 引用的 ZIP/runner/参数、`DOWNLOAD_PACKAGE_DIR` 和 quoting 契约；只证明“ZIP 能打开”或“runner 能编译”不足以接受整个交付成果。
6. 代码/文档补丁的 Artifact Acceptance 必须复用 `GOV-POST-001` 的架构、契约、范围、测试、类型检查、构建、`git diff --check`、`git status` 等全部适用证据；不得另造较弱标准。
7. commit/push 成果必须验证实际 commit 文件集合、branch ref、remote HEAD、authority commit（适用时）和 worktree 状态；命令返回 0 本身不足以接受成果。
8. 能使用正式 schema/parser/resolver/test/结构化 Git 协议时，验证器必须复用正式真相源。关键成果不得只由生成器内部同一份期望字符串自证正确；生成器自检只能作为补充证据。
9. Artifact Acceptance Checkpoint 是 Stage Checkpoint 的一种，不建立新的业务 Workflow/Gate/治理层；验收记录由当前 Stage Output / Failure Diagnostic 与 side-effect audit 封口，不递归创建无限验证链。
10. 阶段成功前必须汇总 `ARTIFACT_ACCEPTANCE_AUDIT=PASS_ALL_REQUIRED_ARTIFACTS_ACCEPTED`；任一必需成果未接受时 Stage 必须 Fail Closed。
11. 新会话恢复后生成的 `GOVERNANCE PRECONCLUSION + STAGE INPUT` 必须先完成 Artifact Acceptance，才能执行 `NEXT_LEGAL_ACTION`。缺失 `GOV-STAGE-INPUT-001` 任一必填字段时必须先修正。

**GOV-STAGE-VALIDATOR-001：** 验证器本身属于必须验收的治理成果；验证器只能验证正式事实与正式契约，禁止把自然语言原句、格式细节、缓存视图或生成器自造期望当作阻断性真相源。

每个会阻断发布、执行、commit/push 或下一 Stage 的验证器必须先声明 Validator Contract：

```text
VALIDATOR_ID=
VALIDATION_TARGET=
CONTRACT_SOURCE=
TRUTH_SOURCE=
BASELINE_SOURCE=
BASELINE_FRESHNESS=
VALIDATOR_SELF_CHECK=
VALIDATOR_ACCEPTED=YES|NO
```

每个阻断断言必须结构化声明：

```text
ASSERTION_ID=
ASSERTION_TYPE=RULE_ID|SCHEMA|PARSER|STRUCTURED_STATE|IMMUTABLE_EVIDENCE|STRUCTURED_GIT|EXACT_HASH|NATURAL_LANGUAGE_AUX
TRUTH_SOURCE=
CONTRACT_SOURCE=
BLOCKING=YES|NO
```

固定规则：

1. `NATURAL_LANGUAGE_AUX` 只能 `BLOCKING=NO`。自然语言句子、空白、Markdown 标记、标题措辞和等价改写只能作为辅助证据，不能单独阻断任何有副作用动作。
2. 只有当权威契约明确规定 byte-exact 内容时，才允许以 `EXACT_HASH` 或正式 schema/parser 作为阻断断言；不得把开发者临时写下的字符串升级为隐式契约。
3. 规则存在性优先验证稳定 Rule ID 唯一性、正式 section、schema/parser 和结构字段；禁止用整句中文/英文正文是否逐字相等代替规则语义。
4. Git branch HEAD、commit 文件集合、worktree 和 remote ref 必须由 Git 精确结构化协议验证。remote branch HEAD 优先使用执行环境中的 `git ls-remote <remote> refs/heads/<branch>`；网页缓存、历史 commit 列表、raw branch 缓存和“某 commit 可访问”只能辅助对账，不能覆盖更新的结构化 branch-ref 证据。
5. 状态、Gate、Candidate、Trace、Contract、Formal Version 等产品事实继续严格遵守 `GOV-STAGE-TRUTH-001`；验证器不得复制一套近似 parser/resolver。
6. 对测试或文档做结构修改时，锚点必须先限定到稳定结构作用域（Rule ID、section、schema key、代码符号或测试 block），再在作用域内检查唯一性；禁止因同一合法字段出现在多个消费者区块而做全文件 `count == 1` 假设。
7. Validator Self Check 至少验证：runner/parser 可解析、所有 `BLOCKING=YES` 断言的 `ASSERTION_TYPE` 不是 `NATURAL_LANGUAGE_AUX`、每个阻断断言都有正式 `TRUTH_SOURCE` 与 `CONTRACT_SOURCE`、baseline 证据具有明确来源和 freshness、失败回滚不会删除阶段开始前已有合法成果。
8. 关键成果的 generator 与 validator 必须在证据路径上相互独立：validator 不得只重新读取 generator 自己写出的 expected string 再证明该 expected string 存在；必须至少有一条来自正式 authority/schema/parser/state/immutable evidence/structured Git/consumer test 的独立证据。
9. 验证器失败必须先分类 `VALIDATION_HARNESS_DEFECT`、`ENVIRONMENT_FAILURE`、产品/治理失败或 `AMBIGUOUS_SIDE_EFFECT`；外围验证器失败不得直接覆盖已存在的正式产品成功证据，也不得自动重试已经开始的有副作用动作。
10. `VALIDATOR_ACCEPTED=YES` 只有在 Validator Contract 完整、Self Check 通过、全部阻断断言都有正式真相源且不存在必需证据不足时成立；否则验证器本身不得作为 Artifact Acceptance 的依据。

### 2.10 Delivery、Receipt 与 Delivery Identity

本节是 ZIP/CMD、标准回执和 Delivery Identity 的唯一规范位置。

**GOV-STAGE-DELIVERY-001：** SpecForge 本地交付固定为一个完整 ZIP + 一条可直接复制执行的 Windows CMD。

固定交付契约：

```text
DELIVERY_FORMAT=ONE_COMPLETE_ZIP_PLUS_ONE_COPY_PASTE_CMD
LOCAL_COMMAND_SHELL=CMD
POWERSHELL_ALLOWED=NO
```

固定规则：

1. 每轮需要用户本地执行时，只交付一个完整 ZIP 和一条完整可复制 CMD；不得拆成多个需要用户人工拼装的操作。
2. CMD 只负责从 `DOWNLOAD_PACKAGE_DIR` 解压并调用 ZIP 内独立 runner；复杂 Python、Node、Git 解析逻辑放在 ZIP 内，不嵌入交互式 CMD。
3. 禁止以 PowerShell 替代 CMD；只有用户后续明确改变 `LOCAL_COMMAND_SHELL` 时才允许修订动态环境设置。
4. 下载目录以及中文/空格路径继续遵守 `GOV-STAGE-ENV-001`。
5. ZIP 交付前必须执行 runner 语法检查、ZIP reopen、文件清单和包内文件 SHA256 对账。
6. 用户约定：旧会话只要已经收到 ZIP + CMD，就一定先执行该 CMD，再开启新会话；框架不维护“已下发但尚未执行”的 Pending Operation 状态。
7. 新会话只需要固定启动提示词 + 上一轮完整标准执行回执，不需要复制旧 ZIP 内容、旧 CMD 内容或旧聊天历史。

**GOV-STAGE-RECEIPT-001：** 每个 ZIP/CMD 执行必须输出统一、可跨会话解释的标准执行回执；SUCCESS 与 FAILED 使用同一字段模型。

固定最小回执：

```text
===== BEGIN FEEDBACK TO CHATGPT =====
PACKAGE_NAME=
PACKAGE_SHA256=
DELIVERY_ID=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=
IDENTITY_BINDING_AUDIT=
DELIVERY_INTERNAL_REFERENCE_AUDIT=
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=

GLOBAL_GOAL=
CURRENT_STAGE=
STAGE_GOAL=
OPERATION_BOUNDARY=

ACTION_NAME=
ACTION_TYPE=READ_ONLY|LOCAL_PATCH|COMMIT_PUSH|LIFECYCLE_ACTION|ENVIRONMENT_OPERATION

RESULT=SUCCESS|FAILED
LAST_SUCCESSFUL_STEP=
FIRST_FAILED_STEP=
FAILURE_CLASS=
ERROR_CODE=
ERROR=

AUTHORITY_BRANCH=
AUTHORITY_HEAD=

WORK_BRANCH_BEFORE=
WORK_HEAD_BEFORE=
REMOTE_WORK_HEAD_BEFORE=

WORK_BRANCH_AFTER=
WORK_HEAD_AFTER=
REMOTE_WORK_HEAD_AFTER=
BRANCH_SWITCHED=YES|NO
WORKTREE_AFTER=

STATE_BEFORE=
STATE_AFTER=

FILES_CHANGED=
IMMUTABLE_EVIDENCE_CREATED=

REQUEST_STARTED=
RESPONSE_RECEIVED=

EXPECTED_SIDE_EFFECTS_AUDIT=
FORBIDDEN_SIDE_EFFECTS_AUDIT=
ARTIFACT_ACCEPTANCE_AUDIT=

NEXT_STAGE=
NEXT_LEGAL_ACTION=
STOP_CONDITION_REACHED=
INSUFFICIENT_EVIDENCE=
===== END FEEDBACK TO CHATGPT =====
```

固定规则：

1. 上述字段全部必须位于 BEGIN/END 回执边界内部；不得把 `FAILURE_CLASS`、`ERROR_CODE`、`ERROR` 等关键失败信息打印在 END 之后。
2. 所有字段都必须出现；不适用时显式写 `NOT_APPLICABLE`，未知且必须知道时写 `INSUFFICIENT_EVIDENCE`，不得省略后让新会话猜测。
3. `RESULT=SUCCESS` 必须能回答：本轮目标是什么、实际动作是什么、在哪个工作分支执行、状态和文件发生了什么、下一合法阶段是什么。
4. `RESULT=FAILED` 必须结合 `LAST_SUCCESSFUL_STEP`、`FIRST_FAILED_STEP`、`FAILURE_CLASS`、`ERROR_CODE`、`ERROR`、`REQUEST_STARTED`、`RESPONSE_RECEIVED`、分支/HEAD、状态和副作用判断实际执行效果；不得把 runner 的 FAILED 直接解释为正式动作未执行。
5. 有副作用动作已经开始时，新会话必须先用持久化状态和 immutable evidence 对账，再决定下一动作；禁止仅依据 `RESULT=FAILED` 重试。
6. `PACKAGE_NAME` 与 `PACKAGE_SHA256` 只用于识别上一轮实际执行包；不能代替远程 commit、branch ref 或持久化治理证据。
7. 新会话从上一轮完整回执恢复 `WORK_BRANCH_AFTER` 和最后已知 HEAD/状态，再重新读取当前远程/本地 refs；两者冲突时必须先报告并 Fail Closed。
8. 如果上一轮回执与当前持久化事实冲突，按 `GOV-CONT-001`、`GOV-STAGE-TRUTH-001` 处理，不得用旧会话记忆覆盖当前事实。

**GOV-STAGE-DELIVERY-IDENTITY-001：** 每个 ZIP/CMD 交付必须有唯一 Delivery Identity，并把 package、runner、validator 与标准执行回执绑定到同一个不可混用的身份命名空间；禁止复制上一版本 runner 后遗留旧 `VALIDATOR_ID`、`RUNNER_ID` 或 receipt emitter 身份。

每个交付的正式身份至少包含：

```text
DELIVERY_ID=
PACKAGE_NAME=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=manifest.json
IDENTITY_BINDING_AUDIT=PASS|FAIL
```

固定规则：

1. `DELIVERY_ID` 是一次具体 ZIP/CMD 交付的唯一身份键。同一次交付的 package、runner、validator、receipt emitter 必须全部声明同一个 `DELIVERY_ID`。
2. ZIP 交付必须在 `manifest.json` 中维护单一 identity object；至少包含：
```text
identity.delivery_id
identity.package_name
identity.runner.id
identity.runner.delivery_id
identity.runner.file
identity.validator.id
identity.validator.delivery_id
identity.validator.file
identity.receipt_emitter.id
identity.receipt_emitter.delivery_id
```
3. `identity.runner.delivery_id`、`identity.validator.delivery_id`、`identity.receipt_emitter.delivery_id` 必须与根 `identity.delivery_id` 完全相等；任一不一致时 `IDENTITY_BINDING_AUDIT=FAIL`。
4. `RUNNER_ID`、`VALIDATOR_ID`、`RECEIPT_EMITTER_ID` 必须由当前包的 identity manifest 读取；禁止在 receipt emitter 中另复制一个可独立漂移的版本化 ID 常量。
5. 对版本化本地交付，`RUNNER_ID` 与 `VALIDATOR_ID` 必须属于当前 `DELIVERY_ID` 命名空间；例如 `DELIVERY_ID=V117` 时，版本化 ID 必须使用 `V117_` 前缀。上一交付身份不得出现在当前交付的正式身份字段。
6. `PACKAGE_NAME` 必须与实际 ZIP 文件名一致；解压后的 bundle 目录、runner 文件名、validator 文件名必须与 identity manifest 声明一致。
7. 标准执行回执的字段集合以 `GOV-STAGE-RECEIPT-001` 固定最小回执为唯一 canonical output schema；本规则不再重复列字段，只约束这些身份字段必须全部来自同一个 `manifest.json` identity object。
8. `RESULT=SUCCESS` 时必须 `IDENTITY_BINDING_AUDIT=PASS`；身份不一致属于 `VALIDATION_HARNESS_DEFECT`，不得把其回执作为完整 Artifact Acceptance 证据。
9. package verifier 必须独立检查 manifest identity、实际 ZIP basename、bundle 路径、runner/validator 文件、命名空间和 receipt identity source；不能仅相信 runner 自己输出的 ID。
10. runner 启动后、执行任何仓库写入前必须完成 identity self-check。identity 失败时不得修改仓库。
11. commit/push 后的最终 Stage Output / receipt Artifact Acceptance 必须同时验证 package、runner、validator、receipt emitter 身份属于同一 `DELIVERY_ID`。
12. 该规则属于交付与证据治理，不改变任何业务 Workflow、Gate、Runtime、Work Item 状态机或 Project Contract。
#### 2.10.1 Delivery Internal Reference Binding

Delivery Identity 不只绑定 package / runner / validator / receipt emitter 的顶层身份，还必须约束标准执行回执内部所有“当前交付版本引用”，防止 `DELIVERY_ID=V121` 但 `NEXT_LEGAL_ACTION` 仍引用 `V120` 的证据漂移。

正式字段：

```text
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE|<field:token,...>
CURRENT_DELIVERY_REFERENCE_FIELDS=
VERSION_TOKEN_PATTERN=V[0-9]+
```

固定规则：

13. `manifest.json` 的 identity object 必须声明 `receipt_current_delivery_reference_fields`，列出标准回执中语义属于“本次交付”的控制字段；至少覆盖 `CURRENT_STAGE`、`ACTION_NAME`、`NEXT_STAGE`、`NEXT_LEGAL_ACTION`。
14. 对上述字段，任何匹配 `VERSION_TOKEN_PATTERN=V[0-9]+` 的版本 token 必须与根 `DELIVERY_ID` 完全相等；同一字段可以没有版本 token，但只要出现版本 token 就不得引用旧交付。
15. `PACKAGE_NAME`、`RUNNER_ID`、`VALIDATOR_ID`、`RECEIPT_EMITTER_ID` 继续受现有 Delivery Identity 顶层绑定约束；内部引用审计不能替代 `IDENTITY_BINDING_AUDIT`。
16. `NEXT_STAGE` / `NEXT_LEGAL_ACTION` 若要求用户携带、执行、验证或恢复某个版本化 receipt / ZIP / artifact，其版本必须来自当前 `DELIVERY_ID`，禁止独立硬编码上一版本号。
17. 历史事实若确需引用旧版本，必须放在明确的 provenance/evidence 历史字段中，不得伪装成 `CURRENT_*`、`NEXT_*`、`ACTION_*` 等当前控制字段；历史证据不属于 `receipt_current_delivery_reference_fields`。
18. `RESULT=SUCCESS` 时必须同时满足：
```text
IDENTITY_BINDING_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE
```
任一不成立时属于 `VALIDATION_HARNESS_DEFECT / EVIDENCE_IDENTITY_DEFECT`，不得把回执视为完整成功证据。
19. receipt emitter 必须在输出 SUCCESS 回执之前执行内部引用审计；不能先打印 SUCCESS 再事后发现旧版本引用。
20. package verifier 必须独立检查 manifest 的 `receipt_current_delivery_reference_fields`、runner 的 receipt 构造来源以及用户可见成功回执控制字段；只验证顶层 `DELIVERY_ID` 不足以接受交付。
21. 当前交付版本字符串应从 `identity.delivery_id` 派生；需要在 `NEXT_LEGAL_ACTION` 中引用当前 receipt 时必须动态构造，不得复制上一 runner 的 `Vxxx` 常量。

### 2.11 Bootstrap Envelope

本节只定义 pre-authority Bootstrap Envelope 及其 receipt/failure/evidence/success/coverage/order 自包含契约。

**GOV-STAGE-BOOTSTRAP-ENVELOPE-001：** 新会话在读取 exact-commit authority 之前只能依赖用户提示词中的 Bootstrap Envelope；凡是会约束 pre-authority 阶段行为的稳定规则，都必须被该 Envelope 自包含携带，并由同一结构回归测试覆盖。禁止出现“authority 已新增规则，但固定启动提示词尚未携带”的协议断层。

Bootstrap Envelope 至少覆盖以下五个子契约：

```text
BOOTSTRAP_ENVELOPE_VERSION=
BOOTSTRAP_COORDINATES_CONTRACT=PASS|FAIL
BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL
BOOTSTRAP_FAILURE_CONTRACT=PASS|FAIL
BOOTSTRAP_EVIDENCE_DELIVERY_CONTRACT=PASS|FAIL
BOOTSTRAP_SUCCESS_TRANSITION_CONTRACT=PASS|FAIL
BOOTSTRAP_ENVELOPE_ACCEPTED=YES|NO
```

#### 2.11.1 Receipt Presence / Consumption

上一轮回执必须先在用户提示词内完成存在性分类：

```text
LAST_EXECUTION_RECEIPT_STATUS=
PRESENT_VALID
| PRESENT_INVALID
| NONE_ALLOWED
| MISSING_REQUIRED

LAST_EXECUTION_RECEIPT_PACKAGE_NAME=
LAST_EXECUTION_RECEIPT_DELIVERY_ID=
LAST_EXECUTION_RECEIPT_VALIDATOR_ID=
LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT=
LAST_EXECUTION_RECEIPT_RESULT=
LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE
```

规则：

1. 用户提示词包含完整 `BEGIN/END FEEDBACK TO CHATGPT` 回执且结构、身份字段可解析时，必须 `LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID`，不得同时声称 `MISSING_LAST_EXECUTION_RECEIPT`。
2. 用户明确说明上一轮没有 ZIP+CMD 时才允许 `NONE_ALLOWED`。
3. 上一轮按连续上下文应有 ZIP+CMD、但提示词没有完整回执时，必须 `MISSING_REQUIRED` 并 Fail Closed。
4. 回执存在但缺必填字段、身份不一致或结构损坏时使用 `PRESENT_INVALID`。
5. `LAST_COMPLETE_RECEIPT` 只提供 last-confirmed continuity，不替代 live branch ref。

#### 2.11.2 Bootstrap Failure

失败路径继续完整遵守：

```text
GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001
GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001
RAW_CMD_ALLOWED=NO
BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD
```

失败阶段不得读取 handoff / Work Item / immutable evidence / Stage Input / Recovery。

#### 2.11.3 Bootstrap Evidence Delivery Identity

Bootstrap Failure evidence 的 canonical 机器模板统一定义在 `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001`；本节不再复制第二套字段模板。

pre-authority 固定 prompt 必须在附录 A 镜像 canonical 模板所需字段，因为新会话在 exact authority 读取之前不能依赖本文件正文。

固定接受条件：

```text
IDENTITY_BINDING_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE
VALIDATOR_ACCEPTED=YES
ARTIFACT_ACCEPTED=YES
```

只有以上全部成立后，才允许发布一个 ZIP + 一个 CMD。evidence runner 不接收 SpecForge / Validation 仓库路径，不读取项目文件，不执行生命周期动作。

#### 2.11.4 Bootstrap Success

取得允许的 live ref 后必须重新开始本回合 Authority Bootstrap，并输出完整：

```text
AUTHORITY_BOOTSTRAP_REMOTE_URL=
AUTHORITY_BOOTSTRAP_BRANCH=
AUTHORITY_BOOTSTRAP_PATH=
AUTHORITY_HEAD_SOURCE=
AUTHORITY_HEAD=
AUTHORITY_EXACT_CONTENT_REF=
AUTHORITY_UNIQUE_MARKER_AUDIT=
AUTHORITY_BOOTSTRAP_EVIDENCE=
AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=
AUTHORITY_BOOTSTRAP_VALIDATOR_ID=
AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=
AUTHORITY_BOOTSTRAP_ACCEPTED=
```

只有 `AUTHORITY_BOOTSTRAP_ACCEPTED=YES` 后才允许读取 exact-commit authority 之后的 handoff、持久化 Work Item / immutable evidence，并进入 PRECONCLUSION → canonical Stage Input → Recovery Acceptance。

#### 2.11.5 Coverage Closure

以下属于 pre-authority contract inventory：

```text
GOV-STAGE-AUTHORITY-BOOTSTRAP-001
GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001
GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001
GOV-STAGE-DELIVERY-001
GOV-STAGE-ARTIFACT-VERIFY-001
GOV-STAGE-VALIDATOR-001
GOV-STAGE-DELIVERY-IDENTITY-001
GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE
GOV-STAGE-BOOTSTRAP-ENVELOPE-001
```

固定规则：

1. 任何以后新增或修改的规则，只要改变 live-ref 取得、receipt 消费、Bootstrap failure、Bootstrap evidence ZIP、Delivery Identity、pre-authority Artifact Acceptance 或进入 Recovery 的条件，就必须在同一修改中更新：
   - 本 inventory；
   - `附录 A. 新会话固定启动提示词`；
   - `stage-execution-authority-contract.test.ts` 的 Bootstrap Envelope consumer test。
2. 三者必须在同一提交内原子变化；任一缺失，`BOOTSTRAP_ENVELOPE_ACCEPTED=NO`。
3. Bootstrap Envelope consumer test 必须直接检查固定提示词中真实结构字段，不允许只检查 authority 其他章节“曾经出现过同名字段”。
4. `BOOTSTRAP_ENVELOPE_ACCEPTED=YES` 是启动协议完整性，不替代 Authority Bootstrap Acceptance、Artifact Acceptance 或 Recovery Acceptance。
5. 当前 Envelope 若发现 receipt / identity / failure / success 任一子契约未覆盖，必须先修 Envelope，不得继续 WI 生命周期动作。

#### 2.11.6 Stable Prompt / Rule Section Scope

固定新会话 prompt 使用两个唯一 marker ID：`SPECFORGE_NEW_SESSION_PROMPT:START` 与 `SPECFORGE_NEW_SESSION_PROMPT:END`；完整 HTML comment marker 只允许在实际 prompt 边界各出现一次。

固定规则：

1. 首次建立 marker 时，必须先在旧 authority 上替换原 `附录 A. 新会话固定启动提示词` section，再插入可能复用该标题文字的新规则。
2. marker 建立后，所有 prompt 修改只能在 START/END marker scope 内执行；禁止全文件按自然语言标题寻找 prompt。
3. Rule section 验证必须按 `RULE_SECTION_BOUNDARY_CONTRACT=V2` 解析：起点是非 fenced 的 canonical Rule ID 物理行；终点是“下一个非 fenced Rule ID / 下一个非 fenced 正式编号 `##` 或 `###` 结构标题 / 下一个非 fenced `## 附录 ...` 标题 / prompt START marker”中的最早结构边界。`####` 及更深层内部子标题继续属于父 Rule；fenced fake Rule ID / heading 必须忽略。

正式机器 schema：

```text
RULE_SECTION_BOUNDARY_CONTRACT=V2
RULE_SECTION_START=NON_FENCED_CANONICAL_RULE_ID_LINE
RULE_SECTION_END=NEXT_NON_FENCED_RULE_ID|NEXT_NON_FENCED_NUMBERED_SECTION_HEADING_L2_L3|NEXT_NON_FENCED_APPENDIX_HEADING_L2|PROMPT_START
RULE_SECTION_NUMBERED_HEADING_PATTERN=^#{2,3}\s+[0-9]+(?:\.[0-9]+)*(?:\.)?\s+
RULE_SECTION_APPENDIX_HEADING_PATTERN=^##\s+附录(?:\s+|$)
RULE_SECTION_INTERNAL_SUBHEADING_LEVEL_MIN=4
RULE_SECTION_FENCED_CONTENT=IGNORE
RULE_SECTION_PROMPT_SYNC=ONLY_IF_PREAUTHORITY_BEHAVIOR_FIELDS_CHANGE
```
4. 禁止硬编码“某 Rule 的下一个 Rule 一定是 Recovery”。
5. 自然语言原句不得作为 blocking assertion；必须使用 Rule ID、schema 字段、parser 或结构 marker。
6. pre-authority rule inventory、固定 prompt、Bootstrap Envelope consumer test 在其任一真实 pre-authority 行为字段发生变化时必须原子更新。
7. `RULE_SECTION_BOUNDARY_CONTRACT` 只定义 authority validation / consumer parser 的结构作用域；若该 parser 契约变化不改变任何 pre-authority 行为字段，则必须原子同步 authority + consumer test，但不得为了形式改写固定 prompt 或 pre-authority inventory。
#### 2.11.7 Ordered Bootstrap Execution / Pre-tool Guard

Bootstrap Envelope 不只定义“必须有哪些字段”，还必须定义这些字段在任何工具读取之前的执行顺序。固定状态机：

```text
RECEIPT_AUDIT
→ PRETOOL_GUARD_ACCEPTED
→ LIVE_REF_RESOLUTION
→ AUTHORITY_EXACT_READ
→ BOOTSTRAP_SUCCESS_OR_FAILURE_ACCEPTANCE
→ BOOTSTRAP_ENVELOPE_SELF_CHECK
→ RECOVERY
```

新会话第一段结构化输出必须是：

```text
===== BEGIN BOOTSTRAP ENVELOPE PRETOOL GUARD =====
BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT
BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE
LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|PRESENT_INVALID|NONE_ALLOWED|MISSING_REQUIRED
LAST_EXECUTION_RECEIPT_PACKAGE_NAME=
LAST_EXECUTION_RECEIPT_DELIVERY_ID=
LAST_EXECUTION_RECEIPT_VALIDATOR_ID=
LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT=
LAST_EXECUTION_RECEIPT_RESULT=
LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=NO
BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL
BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES|NO
===== END BOOTSTRAP ENVELOPE PRETOOL GUARD =====
```

固定规则：

1. 上述 Pre-tool Guard 必须在任何 web、Git、file、handoff、Work Item、immutable evidence、Stage Input、Recovery 或其他仓库读取之前完成；Receipt Audit 只读取用户当前提示词中携带的上一轮标准回执。
2. `LAST_EXECUTION_RECEIPT_STATUS=MISSING_REQUIRED|PRESENT_INVALID` 时：
   - `BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE`；
   - `BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=NO`；
   - `BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS` 只表示正确停在 Receipt Audit；
   - 本轮不得执行 live-ref、不得读取 authority/handoff、不得生成 Bootstrap evidence ZIP；
   - 唯一动作是要求用户补齐或修正上一轮标准回执。
3. `LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|NONE_ALLOWED` 且 Receipt Audit 通过后，才允许：
```text
BOOTSTRAP_EXECUTION_PHASE=LIVE_REF_RESOLUTION
BOOTSTRAP_ALLOWED_TOOL_CLASS=LIVE_REF_ONLY
BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES
```
4. `LIVE_REF_ONLY` 只允许 `STRUCTURED_GIT_LS_REMOTE`、`GITHUB_REF_API_LIVE` 或消费 `USER_BOOTSTRAP_GIT_LS_REMOTE`；禁止读取 current-handoff、WI、immutable evidence、Stage Input、Recovery。
5. live ref 成功后才进入：
```text
BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ
BOOTSTRAP_ALLOWED_TOOL_CLASS=EXACT_AUTHORITY_ONLY
```
只有 exact authority 唯一 marker 与 Authority Bootstrap Validator 接受后，才允许 `AUTHORITY_BOOTSTRAP_ACCEPTED=YES`。
6. 任意阶段一旦在允许范围外读取：
```text
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES
BOOTSTRAP_EXECUTION_ORDER_AUDIT=FAIL
BOOTSTRAP_ENVELOPE_ACCEPTED=NO
```
本轮不得通过后续补字段把顺序违规“修复成成功”；如果已读取 handoff/WI，则 `AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=FAIL`，不得发布 evidence ZIP。
7. Bootstrap Failure Acceptance、Bootstrap Evidence Artifact Acceptance、Authority Bootstrap Success Acceptance 均必须发生在 Pre-tool Guard 之后。
8. 每个 Bootstrap 回合结束前都必须输出：
```text
===== BEGIN BOOTSTRAP ENVELOPE SELF CHECK =====
BOOTSTRAP_COORDINATES_CONTRACT=PASS|FAIL
BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL
BOOTSTRAP_FAILURE_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_EVIDENCE_DELIVERY_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_SUCCESS_TRANSITION_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES|NO
BOOTSTRAP_ENVELOPE_ACCEPTED=YES|NO
===== END BOOTSTRAP ENVELOPE SELF CHECK =====
```
9. `BOOTSTRAP_ENVELOPE_ACCEPTED=YES` 必须同时满足：Receipt Consumption 通过、Execution Order 通过、无 unauthorized read，以及本回合适用的 Failure / Evidence Delivery / Success Transition 子契约全部通过。
10. 固定 prompt 与 consumer test 必须验证以下文本顺序：
   - Pre-tool Guard 出现在 live-ref source 之前；
   - Receipt Audit 出现在 live-ref source 之前；
   - live-ref source 出现在 handoff / Recovery transition 之前；
   - Envelope Self Check 在本回合结束条件中不可省略。
11. 该顺序契约只治理新会话 Bootstrap 执行，不改变业务 Workflow、Gate、Runtime 或 WI 状态机。

### 2.12 Recovery Acceptance

Bootstrap 成功后才允许进入 Recovery；本节是 Recovery Acceptance 的唯一规范位置。

**GOV-STAGE-RECOVERY-ACCEPT-001：** 新会话恢复必须形成可机器检查的 Recovery Acceptance；生成 `GOVERNANCE PRECONCLUSION + Stage Input` 不等于恢复完成。

新会话的 `GOVERNANCE PRECONCLUSION` 至少包含：

```text
REMOTE_URL=
AUTHORITY_BRANCH=
AUTHORITY_HEAD=
AUTHORITY_PATH=
AUTHORITY_COMMIT=
WORK_BRANCH=
WORK_HEAD=
REMOTE_WORK_HEAD=
WORKTREE_STATUS=
LOCAL_REMOTE_CONSISTENCY=
TASK_GOAL=
CURRENT_FACTS_AND_EVIDENCE=
APPLICABLE_RULES=
AFFECTED_MODULES=
PROJECT_ARCHITECTURE_IMPACT=
PROJECT_DATA_MODEL_IMPACT=
MODULE_DESIGN_IMPACT=
PROJECT_CONTRACT_IMPACT=
MODULE_CONTRACT_IMPACT=
PRODUCER_CONSUMER_IMPACT=
WORKFLOW_GATE_RUNTIME_IMPACT=
ALLOWED_MODIFIED_FILES=
FORBIDDEN_SCOPE=
TEST_CHANGES_REQUIRED=
AUTHORITY_REVISION_REQUIRED=
INSUFFICIENT_EVIDENCE=
```

关键恢复事实必须区分事实本身与证据状态。至少使用以下证据状态之一：

```text
CONFIRMED_STRUCTURED=
HANDOFF_CLAIM_PENDING_CONFIRMATION=
RECEIPT_CLAIM_PENDING_CONFIRMATION=
WEB_AUXILIARY=
INSUFFICIENT_EVIDENCE=
```

在执行任何 `NEXT_LEGAL_ACTION`、生成供用户执行的 ZIP+CMD、commit/push 或生命周期动作前，必须输出并验收：

```text
RECOVERY_PRECONCLUSION_FIELDS_AUDIT=PASS|FAIL
RECOVERY_STAGE_INPUT_FIELDS_AUDIT=PASS|FAIL
RECOVERY_BRANCH_MODEL_AUDIT=PASS|FAIL
RECOVERY_ENVIRONMENT_AUDIT=PASS|FAIL
RECOVERY_TRUTH_SOURCE_AUDIT=PASS|FAIL
RECOVERY_OPERATION_BOUNDARY_AUDIT=PASS|FAIL
RECOVERY_NEXT_ACTION_CLASS=READ_ONLY_RECONCILIATION|SIDE_EFFECT_ACTION|WAIT_USER_AUTHORIZATION
RECOVERY_EVIDENCE_GAPS=
RECOVERY_VALIDATOR_ID=
RECOVERY_VALIDATOR_ACCEPTED=YES|NO
RECOVERY_ACCEPTED=YES|NO
```

固定规则：

1. `GOVERNANCE PRECONCLUSION` 或 Stage Input 任一必填字段缺失，`RECOVERY_ACCEPTED=NO`。
2. handoff 和上一轮 receipt 是恢复线索，不自动等于当前 authoritative product fact；State / immutable evidence 未按 `GOV-STAGE-TRUTH-001` 重新读取前，必须以 pending confirmation 表达。
3. `RECOVERY_NEXT_ACTION_CLASS=SIDE_EFFECT_ACTION` 时，当前动作所需的 authority ref、work branch/ref、worktree、State、immutable evidence、operation boundary 必须全部由适用正式 truth source 确认；任一关键事实仍为 pending/insufficient 时 `RECOVERY_ACCEPTED=NO`。
4. `RECOVERY_NEXT_ACTION_CLASS=READ_ONLY_RECONCILIATION` 时，可以存在待获取事实，但这些缺口必须同时出现在 `INSUFFICIENT_EVIDENCE`、`BLOCKER`、`RECOVERY_EVIDENCE_GAPS`，且 Stage Input 必须把 expected side effect 限定为取证包解压/输出等仓库外行为，禁止项目仓库写入和生命周期动作。此时 `RECOVERY_ACCEPTED=YES` 只表示“只读取证计划正确且完整”，不表示待确认的 State/ref/evidence 已经被确认。
5. `RECOVERY_NEXT_ACTION_CLASS=WAIT_USER_AUTHORIZATION` 时，必须证明当前停止边界来自最新真实用户授权边界或已对账的持久化连续性事实；不得仅因为旧 handoff 写着“等待授权”就省略必要的 branch/state 对账。
6. `RECOVERY_BRANCH_MODEL_AUDIT` 必须验证 Stage Input 使用 `AUTHORITY_BRANCH/AUTHORITY_HEAD` 与 `WORK_BRANCH/WORK_HEAD/REMOTE_WORK_HEAD/WORKTREE_STATUS` 分离模型；新的 Stage Input 不依赖历史 `TARGET_BRANCH/REMOTE_HEAD`。
7. `RECOVERY_ENVIRONMENT_AUDIT` 必须验证 `LOCAL_COMMAND_SHELL`、`DOWNLOAD_PACKAGE_DIR`、`LOCAL_PATH_QUOTING` 已从 handoff 恢复；需要本地执行时还必须验证交付遵守 `GOV-STAGE-ENV-001` / `GOV-STAGE-DELIVERY-001`。
8. `RECOVERY_TRUTH_SOURCE_AUDIT` 必须按 `GOV-STAGE-TRUTH-001` / `GOV-STAGE-VALIDATOR-001` 区分 structured truth、immutable evidence、handoff/receipt claim 与 web auxiliary；网页证据不得伪装成 `git ls-remote`。
9. Recovery validator 自身必须遵守 `GOV-STAGE-VALIDATOR-001`，使用稳定 Rule ID、结构字段和正式 truth source；自然语言正文只能是辅助证据。
10. 只有 `RECOVERY_VALIDATOR_ACCEPTED=YES` 且六项 Recovery Audit 全部 `PASS` 时，才允许 `RECOVERY_ACCEPTED=YES`。
11. `RECOVERY_ACCEPTED != YES` 时必须 Fail Closed：不得生成供用户执行的下一 ZIP+CMD，不得执行有副作用动作，不得进入下一 Stage；只能修正恢复成果或执行为取得缺失事实所必需的、已经被接受的只读取证。
12. `RECOVERY_ACCEPTED=YES` 后，后续 ZIP/CMD、runner、代码/文档补丁、执行回执仍分别遵守 `GOV-STAGE-ARTIFACT-VERIFY-001`；Recovery Acceptance 不替代后续 Artifact Acceptance。
<!-- SPECFORGE_AUTHORITY_PROTOCOL:END -->

## 3. SpecForge 目标治理架构

### 3.1 Canonical Product Lifecycle

本文件只保留一条完整业务项目治理主线。其他章节只能引用该主线或描述其中一个局部阶段，不得再定义第二条“完整流程”。

<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:START -->
```text
User Need
→ Work Item / Intake
→ Requirement
→ Impact Analysis
→ Classification / Workflow Routing
→ Candidate Preparation
   ├─ Requirement Candidate（需要时）
   ├─ Project Architecture Candidate（需要时）
   ├─ Project Data Model Candidate（需要时）
   ├─ Module Design Candidate（需要时）
   ├─ Project / Module Contract Candidate（需要时）
   ├─ Task
   └─ Trace Delta / Prospective Trace
→ Required Candidate Gates
→ User Decision
→ Atomic Spec Merge
→ Post-Spec-Merge Gate
→ Code Permission
→ Implementation
→ Actual Scope Audit
→ Verification
→ Formal Version Gate
→ Close Gate
→ Git Merge
```
<!-- SPECFORGE_CANONICAL_PRODUCT_LIFECYCLE:END -->

Trace 贯穿 Requirement、Architecture、Data Model、Module Design、Contract、Task、Implementation 和 Verification。

术语固定：

```text
Atomic Spec Merge
= Candidate / Prospective Spec 原子生效为正式 Project Spec

Git Merge
= 已通过 Close Gate 的工作分支合入目标 Git 分支
```

全文禁止用裸 `Merge` 或 `原子 Merge` 同时指代两种操作；涉及 Spec 生效必须写 `Atomic Spec Merge`，涉及 Git 分支必须写 `Git Merge`。
### 3.2 流程能力复用原则

SpecForge 的目标实现必须复用既有 Workflow、专业 Agent、Candidate、Gate、User Decision、Code Permission、Verification 和 Close 能力，不建立第二套平行治理流程。

固定原则：

```text
已有能力能够承载第 3.1 Canonical Product Lifecycle
→ 扩展现有能力

已有能力缺少正式 Architecture / Data / Contract / Trace 语义
→ 在原能力中补齐正式对象和机器约束

不得为了本方案再新增 Workflow / Agent / 平行 Gate 体系
```

`sf-requirements`、`sf-design`、`sf-task-planner`、`sf-executor`、`sf-verifier` 的职责边界以第 3.5 节和第 5 章为准；Candidate、Atomic Spec Merge、Code Permission、Actual Scope Audit、Verification、Close Gate、Git Merge 分别以第 5、7、8 章为唯一规范位置。
### 3.3 正式治理对象

正式治理对象固定如下。

#### 3.3.1 Project Architecture

正式位置：

```text
.specforge/project/architecture.md
```

它是：

> **整个项目最高层的技术设计真相源。**

负责：

1. 系统整体结构；
2. Module 划分和职责；
3. Module 之间的调用和依赖；
4. 公共基础设施；
5. 整体数据架构；
6. 关键数据流；
7. 所有 Module 共同遵守的系统级约束。

重要规则使用稳定 ID：

```text
ARCH-<DOMAIN>-NNN
```

例如：

```text
ARCH-FILE-001
所有持久化文件路径必须由统一路径服务决定。
```

#### 3.3.2 Project Data Model

新增正式位置：

```text
.specforge/project/data_model.md
```

它是：

> **整个项目的数据和数据库详细设计真相源。**

数据库必须从整个系统全局设计，不能先机械拆给各 Module。

负责：

* 核心业务实体；
* 实体之间关系；
* 数据库表及职责；
* 主要字段及业务含义；
* 主键、外键；
* 关键约束；
* 共享数据；
* 关联表；
* 历史、审计、汇总数据；
* 事务和一致性关系；
* 重要索引和性能设计；
* 数据生命周期；
* 数据所有权。

重要数据设计使用：

```text
DATA-<DOMAIN>-NNN
```

Architecture 与 Data Model 的边界：

```text
Architecture
= 数据系统总体怎么建设

Data Model
= 数据和数据库具体怎么设计
```

`data_model.md` 必须进入正式 Project Spec manifest，并作为唯一正式项目级数据模型。

Data Model 适用性不得通过“文件缺失”表达。新项目必须始终存在 `data_model.md`：

```text
有项目级数据/数据库设计
→ STATUS=ACTIVE
→ 写入正式 DATA-* 设计

确实不适用
→ STATUS=NOT_APPLICABLE
→ REASON=<为什么不适用>
→ EVIDENCE=<支持该结论的事实来源>
```

`STATUS=NOT_APPLICABLE` 只表示当前项目确实没有项目级数据模型内容，不允许用来绕过 Impact / Gate；后续需求一旦产生项目级数据语义，必须在同一个正式 WI 中把状态变为 `ACTIVE` 并形成正式 Data Model Candidate。

兼容读取 `domain_model.md` 时，只能把它当作历史输入；不得发展成第二套正式数据治理体系，不双写、不双向同步。

#### 3.3.3 Module Design

正式位置：

```text
.specforge/project/modules/<MODULE>/design.md
```

它是：

> **Module 在 Project Architecture 和 Project Data Model 约束下，具体如何完成自身职责的正式设计。**

Module Design 的稳定设计编号统一使用：

```text
DD-*
```

不再另造 `DES-*`。

Module Design 必须说明：

* 模块内部组成；
* 业务处理流程；
* 状态变化；
* 内部数据流；
* 如何使用公共基础设施；
* 如何使用项目数据模型；
* 错误处理；
* 边界条件；
* 实现约束；
* 验证方式。

它不能自行重新设计项目级数据库，也不能违反 Project Architecture。

#### 3.3.4 Project Contract

Project Contract 是正式治理对象；其存储、schema、source、owner、consumer、enforcement、兼容性与升级规则统一以第 6 章为唯一规范位置，本节不再重复定义。

#### 3.3.5 Module Contract

Module Contract 是正式治理对象；其内部边界、owner_module、source_refs、跨 Module 升级与阻断规则统一以第 6 章为唯一规范位置，本节不再重复定义。

### 3.4 Module 与代码归属

正式 Module Schema 必须同时覆盖治理对象归属和生产代码归属：

```text
module_file
requirements
design
contracts
trace
code_paths
```

例如：

```text
SYNC
code_paths:
  - packages/sync/**
```

`code_paths` 的作用只有一个：

> 根据真实代码文件确定它属于哪个 Module。

规则：

```text
一个生产代码文件
→ 必须唯一匹配一个 Module
```

出现：

```text
0 个 Module
或
多个 Module
```

都不能自动猜：

```text
BLOCK
```

项目公共代码也必须明确归属于某个正式 Module，例如 PLATFORM、CORE 等，不能成为无人管理区域。

### 3.5 各对象谁生产、依据什么生产、谁消费

这是本次方案最重要的规则。

| 对象                   | 生产者                   | 必须依据                                         | 强制消费者                                        |
| -------------------- | --------------------- | -------------------------------------------- | -------------------------------------------- |
| Requirement          | `sf-requirements`     | 用户需求、事实                                      | Impact、Design                                |
| Project Architecture | `sf-design`           | Requirement、现有系统事实、环境、决策                     | Data Model、Module Design、Impact、Verification |
| Project Data Model   | `sf-design`           | Requirement、Architecture、现有数据库事实             | Module Design、Task、Verification              |
| Module Design        | `sf-design`           | Requirement、Architecture、Data Model、Contract | Task、Executor、Verification                   |
| Project Contract     | 受控 Contract 写入        | Architecture/Data Model                      | Design、Task、Executor、Verification            |
| Module Contract      | `sf-design`           | Module Design                                | Task、Executor、Verification                   |
| Task                 | `sf-task-planner`     | 已批准 Design、Contract、Impact Scope             | Executor、Verifier                            |
| Impact Scope         | Agent 分析 + Runtime 推导 | Classification、Spec、Trace、code_paths         | Workflow、Candidate、Code Permission、Audit     |
| Trace                | 受控 Trace 系统维护           | 正式 ID 和引用                                    | Impact、Gate、Code Permission、Verification     |

核心原则：

> **一个正式对象如果没有明确的生产者和后续消费者，就不应该成为治理对象。**

## 4. Requirement → Impact → Classification → Workflow

### 4.1 Impact Scope

Impact Scope 固定写入：

```text
trigger_result.json
→ impact_scope
```

固定结构：

```text
affected_modules

architecture_refs

data_model_refs

design_refs

project_contract_refs

module_contract_refs

planned_code_paths
```

Impact Scope 定义：

> **本次变化需要治理的正式范围。**

### 4.2 Impact Scope 怎么产生

不能完全相信 Agent。

流程：

```text
Agent 根据 Requirement 和实际系统提出初步范围
↓
Runtime 根据正式 Spec、Trace、code_paths 自动解析
↓
补全能够确定的正式关系
↓
形成 trigger_result.json 中的权威 Impact Scope
```

Runtime 自动完成：

```text
代码路径
→ Module

Module
→ Design

Design
→ Architecture / Data Model

Architecture / Data Model / Design
→ Contract
```

如果发现：

```text
路径无法确定 Module
一个路径属于多个 Module
引用 ID 不存在
关系无法唯一确定
```

则不能猜：

```text
BLOCK
```

### 4.3 Impact Scope 的四个用途

#### 4.3.1 选择治理路径

不是 Impact Scope 直接调用 Skill。

关系是：

```text
Impact Scope
↓
Classification
↓
workflow_path / workflow_type
↓
对应 Workflow Skill
```


#### 4.3.2 决定必须产生哪些 Candidate

例如：

```text
architecture_changed=true
→ 必须有 Architecture Candidate

data_model_changed=true
→ 必须有 Data Model Candidate

design_changed=true
→ 必须有 Module Design Candidate

module_contract_changed=true
→ 必须有 Module Contract Candidate
```

这就是“该做的必须做到”。

不是增加 Readiness Gate。

而是 Candidate 完整性规则和适用 Gate 根据 Impact Scope 强制要求对应产物。


#### 4.3.3 形成 Code Permission

Impact Scope 再经过 Atomic Spec Merge 和 Task 精确化以后，形成最终开发许可。


#### 4.3.4 开发后验证有没有越界

```text
Approved Scope
vs
Actual Scope
```

必须：

```text
Actual Scope ⊆ Approved Scope
```

### 4.4 Classification 最终字段与 Fast Path 判定

Classification 的正式变化字段统一为：

```text
requirement_changed
acceptance_criteria_changed
business_rule_changed
user_visible_behavior_changed
data_semantics_changed
design_changed
module_boundary_changed
api_contract_changed
architecture_changed
data_model_changed
module_contract_changed
unknowns
```

只有下列条件全部成立，才允许进入 Code-only Fast Path：

```text
requirement_changed = false
acceptance_criteria_changed = false
business_rule_changed = false
user_visible_behavior_changed = false
data_semantics_changed = false
design_changed = false
module_boundary_changed = false
api_contract_changed = false
architecture_changed = false
data_model_changed = false
module_contract_changed = false
unknowns = []
```

缺一个条件都不能进入 Fast Path。
### 4.5 Workflow 路由最终规则

使用既有 Workflow 类型，不增加新的 Workflow。

但是调整路由职责。

#### 4.5.1 Requirement 本身发生变化

例如：

```text
新功能
业务要求变化
验收标准变化
```

继续：

```text
requirement_change_path
```

即使同一个需求同时需要修改 Architecture、Data Model、Design，也仍在这个 WI 内完成。

Impact Scope 决定 Candidate 中还需要哪些正式对象。

这样 Requirement 治理不会因为 Architecture 变化而被绕过。


#### 4.5.2 Requirement 不变，但 Architecture 或 Module Boundary 变化

```text
architecture_change_path
```


#### 4.5.3 Requirement 不变，Architecture 不变，但 Data Model / Module Design / Module Contract 变化

```text
design_change_path
```


#### 4.5.4 只有 Project Contract Registry 变化，而且没有代码实现

```text
contract_change_path
```

该路径定义为 Registry-only、无 Code Permission 的纯规格工作流。

如果 Project Contract 修改同时要求消费者代码变化：

```text
不能使用 contract_change_path
```

必须进入正常 Requirement / Design / Architecture 工作流。


#### 4.5.5 上层所有正式对象都不变

```text
code_only_fast_path
```

## 5. Candidate 与正式 Spec 生产

### 5.1 sf-design 的正式职责

不增加 Architecture Agent，不增加 Data Agent；Architecture、Data Model 和 Module Design 统一由 `sf-design` 负责。

正式生产顺序固定为：

```text
Requirement
↓
读取正式 Project Architecture
↓
决定 Architecture 保持 / 建立 / 修改
↓
读取正式 Project Data Model
↓
决定 Data Model 保持 / 建立 / 修改
↓
确定受影响 Module
↓
建立或修改 Module Design
↓
识别需要机器强制的 Contract
```

`sf-design` 只能基于 Requirement、正式上层 Spec 和真实系统事实产生 Candidate，不得跳过上层对象或以实现代码反向覆盖已批准设计。
### 5.2 Candidate 阶段专业产物所有权

Candidate 阶段的专业产物所有权固定为：

```text
sf-requirements
→ Requirement Candidate

sf-design
→ Architecture Candidate
→ Data Model Candidate
→ Module Design Candidate
→ Module Contract Candidate

受控 Project Contract writer
→ Project Contract Candidate

Project Contract Candidate 的正式 producer binding 固定为：

```text
PROJECT_CONTRACT_CANDIDATE_PUBLIC_TOOL=sf_contract_register
PROJECT_CONTRACT_CANDIDATE_CORE_PRODUCER=packages/daemon-core/src/tools/lib/contract-authoring.ts::authorContractCandidate()
PROJECT_CONTRACT_CANDIDATE_WRITE_SCOPE=WORK_ITEM_CANDIDATE_ONLY
PROJECT_CONTRACT_FORMAL_TRUTH_WRITE=NO
```

`sf_contract_register` 是公开 Tool/handler 名称；真实 Candidate authoring 由 `authorContractCandidate()` 承担。它只能产生或维护当前 Work Item 的 Project Contract Candidate，并登记对应 Candidate manifest；正式 Project Contract 只能通过批准后的 Atomic Spec Merge 生效。

sf-task-planner
→ tasks.md
→ Requirement / Task Trace

Runtime
→ candidate_manifest.json
→ derived indexes
→ Prospective Trace calculation
```

Agent 不得替 Runtime 猜 Candidate 目标路径、派生索引或 manifest；同一类正式产物只能有一个 owner。
### 5.3 Candidate 的正式目录

统一：

```text
candidates/project/architecture.md

candidates/project/data_model.md

candidates/project/extension_registry.json

candidates/project/modules/<MODULE>/design.md

candidates/project/modules/<MODULE>/contracts.json
```

需要新增 Module 或改变 `code_paths` 时，由 Runtime 生成相应：

```text
spec_manifest.json Candidate
```

所有正式 Spec 变更：

```text
一次 Gate
↓
一次 User Decision
↓
一次 Atomic Spec Merge
↓
Project Spec Version +1
```

Architecture、Data Model 等同一 Atomic Spec Merge 中的正式对象必须原子生效，禁止部分生效。

Atomic Spec Merge 的正式 producer binding 固定为：

```text
ATOMIC_SPEC_MERGE_PUBLIC_HANDLER=sf_v11_merge
ATOMIC_SPEC_MERGE_CORE_PRODUCER=packages/daemon-core/src/tools/lib/merge-runner-v11.ts::executeMerge()
ATOMIC_SPEC_MERGE_SEMANTIC_SCOPE=PROJECT_SPEC_ACTIVATION
GIT_MERGE_SEMANTIC_SCOPE=SEPARATE
```

`sf_v11_merge` 是公开 Merge Runner handler；其 Spec 合并业务动作由 `executeMerge()` 承担。该 producer 只属于 Atomic Spec Merge，不得与第 8.9 节的 Git Merge 混用。

### 5.4 requirements_index 和 design_index

它们是索引，不是独立设计真相源。

最终改成：

```text
requirements_index.md
→ Runtime 根据正式 Requirements 自动生成

design_index.md
→ Runtime 根据正式 Module Design 自动生成
```

不让 Agent 重复手工维护。

### 5.5 glossary.md

它只保存：

> 整个项目多个模块共同需要理解的正式业务和技术术语。

由 `sf-design` 在真正新增或改变项目公共术语时产生 Candidate。

不要求每个 WI 修改。

它不能覆盖 Requirement、Architecture 或 Data Model 中的正式规则。

### 5.6 decisions.md

它记录：

> 已经批准的重要项目级技术决策及其理由。

由 `sf-design` 在存在重要 Architecture / Data Model 决策时产生 Candidate。

Architecture 仍然是“现在必须遵守什么”的真相源。

Decisions 负责：

> “为什么当时这样决定”。

二者职责不重复。

## 6. Contract 与 Trace

### 6.1 两级契约模型

**GOV-CONTRACT-001：** 契约治理是架构一致性治理的必需组成部分。任何修改都必须完成契约分类、所有权、来源、消费者、兼容性、执行方式和回归验证检查。

**CON-MODEL-001：** 契约采用两级模型：

```text
Project / Public Contract
→ .specforge/project/extension_registry.json

Module / Internal Contract
→ .specforge/project/modules/<MODULE>/contracts.json
```

**CON-PROJ-001：** 跨 Module 或全项目共同依赖、必须由机器强制的规则属于 Project / Public Contract，存放于 `.specforge/project/extension_registry.json`。

**CON-MOD-001：** 只被同一个 Module 内部共同依赖、需要机器强制的规则属于 Module / Internal Contract，存放于 `.specforge/project/modules/<MODULE>/contracts.json`。

Contract 存储不得统一塞入 `extension_registry.json`；正式位置以本章两级 Contract 模型为准。

固定边界：

```text
所有消费者属于同一个 Module
→ Module Contract

出现其他 Module 消费者
→ 必须升级为 Project Contract

其他 Module 直接引用 Module Contract
→ BLOCK
```

**CON-PROM-001：** Module Contract 一旦出现其他 Module 消费者，必须在同一个 WI 内升级为 Project Contract，并同步更新受影响设计、消费者、Trace、验证和迁移内容；禁止其他 Module 直接消费 Internal Contract。

**CON-CONS-SOURCE-001：** Contract 的正式消费者关系只以正式 Trace 系统为真相源，不在 Contract 文件、Module 定义或其他文档中再维护一份可独立修改的消费者列表。

固定登记方式：

```text
具体 Module Design 规则（DD-*）
constrained_by
Contract ID
```

Module 消费者由该 `DD-*` 所属 Module 自动推导。不得只登记模糊的“某 Module 消费某 Contract”，也不得通过人工搜索或 Agent 猜测代替正式关系。

**CON-CONS-DELTA-001：** Contract 消费关系的增加、取消和变更必须进入同一个 WI 的 `trace_delta.md`：

```text
新增关系 → ADD
取消关系 → REMOVE
变更关系 → REMOVE 旧关系 + ADD 新关系
```

Runtime 必须以“当前正式 Trace + ADD - REMOVE”形成 Prospective Trace，并对合并后的关系执行完整性检查；ADD 与 REMOVE 必须随本次 Atomic Spec Merge 原子生效。

**CON-CONS-DELTA-CANON-001：** Governance Relation Delta 只表达“正式 Trace 边本身发生变化”，并且必须使用正式 Trace 的规范模型：

```text
Operation = ADD | REMOVE
From / To = 正式治理对象 ID
Relation = constrained_by | enforces
```

固定规则：

1. `From` / `To` 必须是可在 Prospective Architecture / Data Model / Module Design / Contract 中解析的正式 ID，不得写说明文字、值快照或人工标签；
2. Contract 消费关系固定表达为 `DD-* constrained_by <Contract ID>`；
3. Contract 的 `owner_module`、`source_refs`、枚举成员、schema 字段等 Contract 内容不得伪造为 `owned_by`、`consumed_by-*` 或其他 Trace Relation；
4. Contract 值、schema、枚举成员发生变化，但正式 Trace 边集合没有变化时，不得生成 Governance Relation Delta；
5. 只有消费者 DD、source/enforcement 正式对象或其他真实 Trace 边发生增加、删除、替换时，才生成对应 `ADD` / `REMOVE`；
6. Planner 在写入 Candidate 前必须逐行验证四列、Relation 枚举和正式 ID；无法证明合法时必须 Fail Closed。

**CON-CODE-CONS-001：** 生产代码的实际 Contract 消费不得建立第二套治理机制。`contract_integrity_gate` 必须结合 Module `code_paths`、Impact Scope、Code Permission、Changed Files Audit 和验证阶段取得的实际依赖证据，对账“Trace 声明的正式消费者”与“生产代码的实际 Module 依赖”。无法证明实际依赖完整时必须 Fail Closed，不得猜测。

Module Contract 升级为 Project Contract 时，Prospective Project Spec 必须同时包含：

```text
新的 Project Contract
原 Module Contract 的废弃、删除或替代说明
全部消费者关系的 REMOVE / ADD
受影响 Module Design 更新
Trace 更新
兼容性或迁移说明
验证与回归测试
```

缺少任一项，`contract_integrity_gate` 必须 BLOCK。

每次修改必须检查：

1. **CON-OWN-001：** 每条契约必须有明确 owner；历史名称 `CON-OWNER-001` 视为本规则的别名，不再新增引用；
2. **CON-REF-001：** 每条契约必须有可验证的 `source_refs`；Project Contract 来源于 ARCH/DATA，Module Contract 来源于 DD；历史名称 `CON-SOURCE-001` 视为本规则的别名，不再新增引用；
3. **CON-CONS-001：** 全部生产者和消费者必须识别完整；
4. **CON-COMPAT-001：** 必须判断变更属于兼容新增、兼容修改、破坏性修改、废弃还是迁移，并明确消费者处理方式；
5. **CON-PROM-001：** 必须检查 Module Contract 是否产生跨模块消费者，并执行升级或阻断；
6. **CON-ENFORCE-001：** 必须明确由哪个 Gate、Verifier、类型检查、静态分析或 Runtime 机制执行；
7. **CON-TEST-001：** 必须具备合法、非法、兼容、悬空引用、删除和跨模块边界回归测试；
8. **CON-REVIEW-001：** 机器无法确定执行的规则必须明确标记为“人工审查契约”。

只有文字说明、没有确定执行机制的规则，不得声称已经机器强制。

### 6.2 Contract 对象存储与 Schema

本节承接旧“正式治理对象”中的 Project / Module Contract 存储与 schema 细节；边界、owner、source、consumer、promotion、enforcement 以 6.1 的稳定 Rule ID 为最高约束。

#### 6.2.1 Project Contract

继续使用：

```text
.specforge/project/extension_registry.json
```

定义：

> 跨 Module 或全项目共同依赖、必须由机器强制的规则。

Contract Schema 固定复用统一模型：

```text
shared_enums
invariants
public_interfaces
extension_points
```

这些类型构成正式机器 Contract 模型。

增加统一元数据：

```text
source_refs
enforcement
```

其中：

```text
source_refs
```

必须指出 Contract 来源于哪条：

```text
ARCH-*
DATA-*
```

#### 6.2.2 Module Contract

> 权威说明：正式 Contract 采用 Project / Public Contract 与 Module / Internal Contract 两级模型；`extension_registry.json` 不得成为第二套 Contract 存储权威。

新增：

```text
.specforge/project/modules/<MODULE>/contracts.json
```

定义：

> 只被同一个 Module 内部共同依赖、需要机器强制的规则。

包括适合机器验证的：

* 内部枚举；
* 状态；
* 错误码；
* 数据结构；
* 内部接口约束；
* 不变量。

复用统一 Contract 基础数据结构，不另建平行 Contract 系统。

边界只有一条：

```text
所有消费者属于同一个 Module
→ Module Contract

出现其他 Module 消费者
→ Project Contract
```

其他 Module 直接依赖 Module Contract：

```text
BLOCK
```

Module Contract 的 `owner_module` 必须和目录所属 Module 一致。

其 `source_refs` 必须来自：

```text
DD-*
```

### 6.3 Trace：只保留一套

Trace 系统必须保留 Requirement → Design → Task 覆盖关系，并扩展到 Architecture、Data Model、Contract 与治理范围关系；不得建立第二套 Trace。

这一套继续保留，不重构 Requirement Trace。

在同一个 Trace 系统中增加新的治理关系：

```text
Architecture
↔ Data Model
↔ Module Design
↔ Contract
```

不建立第二套 Trace 文件。

仍然使用：

```text
.specforge/project/trace_matrix.md

.specforge/project/modules/<MODULE>/trace.md

.specforge/work-items/<WI>/trace_delta.md
```

### 6.4 新增 Trace 关系保持极简

正式治理关系只增加两种：

```text
constrained_by
enforces
```

#### 6.4.1 constrained_by

下层设计受哪个上层正式对象约束。

例如：

```text
DATA-ORDER-001
constrained_by
ARCH-DATA-001
```

```text
DD-ORDER-003
constrained_by
ARCH-MODULE-002
```

```text
DD-ORDER-003
constrained_by
DATA-ORDER-001
```

#### 6.4.2 enforces

Contract 机器强制哪条正式规则。

例如：

```text
PCON-001
enforces
ARCH-API-002
```

```text
MCON-ORDER-001
enforces
DD-ORDER-003
```

通过正反查询即可回答上下游关系，不增加更多 Relation 名称。

### 6.5 Trace Delta 与唯一关系真相源

Requirement / Task Trace 继续按 Requirement 治理规则工作。

Trace 只保留一个逻辑真相源：

```text
.specforge/project/trace_matrix.md
= 当前正式关系的项目级权威矩阵

.specforge/project/modules/<MODULE>/trace.md
= 从项目级权威矩阵按 Module 形成的受控视图，不得独立产生另一套关系事实

.specforge/work-items/<WI>/trace_delta.md
= 本次 WI 对正式关系提出的变更输入
```

Contract 消费关系必须登记为：

```text
DD-*
constrained_by
Contract ID
```

其所属 Module 由 `DD-*` 的正式归属自动推导。

`trace_delta.md` 必须明确支持：

```text
ADD
REMOVE
```

关系变更统一表达为：

```text
REMOVE 旧关系
+
ADD 新关系
```

Runtime 必须计算：

```text
Current Trace
+ ADD
- REMOVE
= Prospective Trace
```

Trace Gate、Spec Consistency Gate 和 Contract Integrity Gate 检查的是 Prospective Trace；通过审批和 Atomic Spec Merge 后，Prospective Trace 才成为新的正式 Trace。

新增的 Architecture/Data/Contract 关系只有真正发生变化时才要求对应 Delta。

Fast Path：

```text
正式关系没有变化
→ 不要求制造新的治理关系 Delta
```

Quick Change 在关系没有变化时不得为了形式强制产生 `trace_delta.md`；但 Gate 仍必须根据 Impact Scope 和实际修改范围验证“关系未变化”的声明。

## 7. Gate 与 Fast Path 强制治理

### 7.1 Trace Gate

Trace Gate 必须同时验证 Requirement → Design → Task 覆盖和本方案定义的 Architecture / Data / Contract / Scope 关系语义；不新建平行 Gate。

新增检查：

```text
From ID 是否存在

To ID 是否存在

Relation 是否为固定类型

关系方向是否合法

Module 是否正确

DATA 引用是否存在

Architecture 引用是否存在

Contract source 是否存在

Module Contract 是否被其他 Module 使用

删除正式对象后是否产生悬空关系

Current Trace + Trace Delta
形成的 Prospective Trace 是否仍然闭合
```

### 7.2 Spec Consistency Gate

正式使用：

```text
spec_consistency_gate
```

负责整个正式设计链一致性：

```text
Impact Scope
↔ Architecture
↔ Data Model
↔ Module
↔ Module Design
↔ Contract
↔ Trace
```

例如：

```text
Impact Scope 说 Data Model 要变化
但是没有 Data Model Candidate
→ BLOCK
```

```text
Module Design 引用了不存在的 DATA ID
→ BLOCK
```

```text
Design 违反正式 Architecture
→ BLOCK
```

### 7.3 Contract Integrity Gate

正式使用：

```text
contract_integrity_gate
```

不增加第二个 Contract Gate。`contract_integrity_gate` 必须在两个边界执行同一套 Contract 规则：

```text
Candidate 合并前
→ 检查 Prospective Project Spec 和 Prospective Trace

实现与验证后
→ 结合 code_paths、Code Permission、Changed Files Audit 和实际依赖证据复核生产代码消费者
```

必须检查：

```text
Module Contract Schema
owner_module 正确
source_refs 存在
enforcement 已声明
消费者关系来自 Trace 唯一真相源
ADD / REMOVE 合法且原子
Internal Contract 没有跨 Module 消费
Project Contract 变化后的全部消费者已同步
Module → Project Contract Promotion 完整
删除 Contract 后不存在悬空关系
Trace 声明消费者与生产代码实际 Module 依赖一致
```

出现以下任一情况必须 BLOCK：

```text
生产代码实际消费 Contract，但 Trace 未登记
Trace 登记消费，但 Contract 不存在或已删除
其他 Module 消费 Internal Contract
Promotion 缺少 Contract、Design、消费者、Trace、兼容性或测试中的任一项
无法取得足够证据证明消费者完整
```

### 7.4 Gate 的硬阻断与产品完成边界

**GATE-HARD-001：** Soft / Hard 描述的是 Gate 失败后是否由程序阻断流程：

```text
Soft
= 发现问题并记录，但不形成最终硬阻断

Hard
= 发现问题后立即阻断 Candidate Merge、Code Permission 或后续状态推进
```

必须区分：

```text
开发 SpecForge 产品时的中间代码状态
≠
完成后的 SpecForge 治理业务项目时的正式行为
```

开发过程中，源代码可以暂时存在部分 Gate 为 Soft 的中间状态，以便完成实现和验证；该状态只表示产品尚未完成，不能发布为本能力的正式完成版本，也不能设计成“某业务项目第一个 WI 完成后自动切换”。

**GATE-RETRY-STATE-001：** Candidate Gate 在 `gates_failed` 后修正 Candidate 并重跑时，Runtime 必须保证 Gate Attempt 判定与 Work Item 权威状态闭环一致。

固定规则：

1. `gates_failed` 仍只能按 v1.1 状态机进入 `candidate_preparing`；禁止新增 `gates_failed → approval_required` 直接边；
2. 如果 `sf_v11_gate_run` 接受并完成一次从 `gates_failed` 发起的完整 Candidate Gate 重跑，状态权威恢复必须沿现有合法边补齐：
   `gates_failed → candidate_preparing → candidate_prepared → gates_running → approval_required/gates_failed`；
3. Gate 通过最终必须为 `approval_required`；Hard Gate 失败最终必须回到 `gates_failed`；
4. 禁止出现“新的完整 Gate Attempt 已 passed，但 Work Item 仍保持旧 gates_failed”；
5. 每次重跑继续创建新的不可变 Gate Attempt，状态恢复不得覆盖旧 Attempt；
6. 已有修复前生成的有效 passed Attempt 时，不得为修复状态展示而重复 Gate；必须先只读证明 Candidate 与 Attempt 未变化，再沿合法状态边做证据驱动的状态权威恢复。

**GATE-ATTEMPT-RECONCILE-001：** 已经存在不可变 Candidate Gate Attempt、但因 Runtime 缺陷导致 Work Item 权威状态未完成 seal 时，只允许由 `gate_runner` 执行“历史 Attempt 状态对账”，不得通过重新运行 Gate 修复状态展示。

固定规则：

1. 对账入口必须显式指定 `reconcile_attempt_id=attempt-NNNN`，并与普通 `gate_ids/gate_type` 互斥；
2. 对账模式不得调用 `runRequiredGates`，不得创建新的 `gate_attempts/attempt-NNNN`；
3. 只能消费 `source=gate_run`、`summary_status=passed` 的最新 Attempt；
4. 该 Attempt 必须覆盖当前 Workflow/Candidate Phase 的全部 required Candidate Gates，且每个 required Gate 必须严格 `status=passed`；
5. 固定 `gates/*.json` 与 `gate_summary.md` latest compatibility view 必须与指定 Attempt 字节一致；
6. 指定 Attempt 的全部 required Gate `input_files` 必须仍存在，且文件修改时间不得晚于 Attempt 完成时间；无法证明未发生 Candidate/Gate 输入漂移时 Fail Closed；
7. 当前状态只允许处于 Candidate retry 边界：`gates_failed / candidate_preparing / candidate_prepared / gates_running`；
8. 状态恢复继续使用 `GATE-RETRY-STATE-001` 的合法状态链；最终 `gates_running → approval_required` seal 必须由 `gate_runner` actor 执行；
9. `sf-orchestrator`、人工状态工具或其他 actor 不得代替 `gate_runner` 完成该 seal；
10. 返回结果必须显式包含 `reconciliation_mode=true`、`gate_run_action=NOT_PERFORMED`、`new_gate_attempt_created=false` 和被消费的 `reconciled_attempt_id`。

**GATE-ATTEMPT-INPUT-SNAPSHOT-001：** Gate Attempt 的 `input_files` 只表示 Gate 声明/探测过的输入路径集合，不等价于“这些路径当时都存在”，也不是可用于历史 freshness 判断的内容快照。每个新的正式 Gate Attempt 必须额外冻结输入状态。

固定规则：

1. 每次 Gate Attempt 完成时，必须在该 Attempt 目录写入不可变 `input-snapshot.json`；
2. `input-snapshot.json` 对全部 Gate Report `input_files` 去重后逐路径记录：
   - `path`
   - `exists`
   - `kind=file|directory|other|missing`
   - 对存在的普通文件记录 `sha256`、`size`、`mtime_ms`
   - 对缺失路径明确记录 `exists=false, kind=missing`
3. 缺失路径是合法的 Gate 输入观测状态；不得仅因为 `input_files` 中某路径当前不存在，就推断“Attempt 后被删除”；
4. `GATE-ATTEMPT-RECONCILE-001` 的 freshness 判断必须使用 `input-snapshot.json` 比较当前存在状态、类型和文件 hash；
5. 历史 Attempt 如果没有 `input-snapshot.json`，不得通过 `mtime`、当前缺失状态或 Gate Report 文本反推历史输入状态；必须 Fail Closed；
6. 对没有输入快照的旧 Attempt，如仍需继续 Workflow，只能保留旧 Attempt 不变，并运行一次新的正式 Gate Attempt，让新 Attempt 生成输入快照并由 Gate Runner 正常完成状态 seal；
7. 新 Gate Attempt 不覆盖旧 Attempt；旧 Attempt 继续作为不可变历史证据存在。
8. `input-snapshot.json` 中的相对 `path` 必须以该 Gate Attempt 所属业务项目的 `projectRoot` 作为唯一解析基准；禁止相对于 daemon/SpecForge 产品仓库的 `process.cwd()` 解析。Snapshot 保存 Gate Report 的原始规范路径值，生产者读取与 reconciliation 消费者校验时必须使用同一 `projectRoot` 解析规则。

**GATE-FINAL-001：** 本能力最终完成后，SpecForge 治理任何业务项目时，从第一个 WI、后续 WI 到 Fast Path，以下三个 Gate 必须始终全部为 Hard：

```text
spec_consistency_gate = hard
trace_gate = hard
contract_integrity_gate = hard
```

不存在按项目、按 WI 或按“第一个 WI 是否完成”从 Soft 自动切换到 Hard 的状态机。

最终 Hard 状态必须由统一 Gate/Workflow/Runtime 机制共同保证，不新增平行配置体系：

```text
Gate 注册定义
→ 三个 Gate 的 severity 全部为 hard

Workflow Required Gates
→ 所有适用 Workflow 和 Fast Path 必须调用三个 Gate

Runtime 状态推进
→ 任一 Gate 失败，不得 Merge、不得发 Code Permission、不得继续推进

普通回归测试
→ 固定断言三个 Gate 的 severity、Workflow 覆盖和失败阻断行为
```

任一层不满足，SpecForge 不得宣布本能力完成或发布对应正式版本。

Phase 11 必须在候选实现已经具备上述最终 Hard 行为时进行真实端到端验收；Phase 12 不是让业务项目自行切换，而是确认、固化并发布这一最终产品行为。


<!-- SPECFORGE_GATE_ATTEMPT_EVIDENCE:START -->
#### 7.4.1 Gate Attempt 证据不可变性

**GATE-ATTEMPT-001：** 每次 Gate 运行必须形成一个独立、追加式、完成后不可修改的 Gate Attempt：

```text
.specforge/work-items/<WI>/gate_attempts/attempt-NNNN/
├── attempt-start.json
├── gates/<gate_id>.json
├── gate_summary.md
└── attempt-result.json
```

固定规则：

1. `attempt-NNNN` 单调递增，同一个 WI 内不得复用；
2. `attempt-start.json`、每个 Gate Report、`gate_summary.md` 和 `attempt-result.json` 使用独占创建，完成后不得覆盖；
3. Gate 失败、修正 Candidate 后重跑、部分 Gate 重跑和完整 Gate 重跑都必须创建新 Attempt；
4. 后续 Attempt 不得删除、修改或替换旧 Attempt；
5. Agent、Runtime 和人工审计必须报告 `attempt_id` 与 `attempt_path`，不能只报告可变的 latest 文件。

**GATE-LATEST-001：** latest compatibility 路径固定为：

```text
.specforge/work-items/<WI>/gates/<gate_id>.json
.specforge/work-items/<WI>/gate_summary.md
```

它们只表示“latest compatibility view”，供既有 Merge、Verification、Close 和读取消费者继续使用；它们不是历史审计真相源。历史审计必须读取 `gate_attempts/attempt-NNNN`。

**GATE-MIGRATION-001：** 升级前已经存在 latest Gate 文件、但尚无 `gate_attempts` 时，第一次升级后 Gate 运行前，Runtime 必须先把现有 latest 文件完整复制为 `attempt-0001` legacy snapshot，再创建新的 Attempt。无法证明被更早覆盖的历史内容时必须标记 `INSUFFICIENT_EVIDENCE`，不得伪造或声称已恢复。
<!-- SPECFORGE_GATE_ATTEMPT_EVIDENCE:END -->

### 7.5 Fast Path 的正确含义

Fast Path 只表示“正式上层治理对象确认不变时，不制造无意义 Candidate”；它不表示绕过治理。

进入 Fast Path 前，Classification 必须满足 4.4 的全部 false / empty 条件。Fast Path 仍必须执行：

```text
spec_consistency_gate
contract_integrity_gate
trace_gate
```

并验证：

```text
正式 Architecture
正式 Data Model
正式 Module Design
正式 Contract
正式 Trace
+
本次实际修改
→ 一致
```

只有在确实不存在关系变化时才允许不产生 Trace Delta；Gate 必须用 Impact Scope 和实际修改验证“无关系变化”声明。

Fast Path 不得降低三个核心 Gate 的 severity，不得绕过 Code Permission、Actual Scope Audit、Verification、Formal Version Gate、Close Gate 或 Git Merge Guard。
## 8. Implementation → Verification → Release

### 8.1 Code Permission

Code Permission 的正式许可模型必须包含：

```text
allowed_write_files
```

运行时根据它限制 Executor，并在发放时保存文件系统基线。

需要扩展成真正的治理冻结边界：

```text
affected_modules

allowed_write_files

architecture_refs

data_model_refs

design_refs

project_contract_refs

module_contract_refs

project_spec_version

impact_scope_hash
```

这些内容不能由 Executor 提交。

Runtime 根据：

```text
正式 Merge 后的 Project Spec
+
Impact Scope
+
tasks.md
```

自动形成。

### 8.2 Code Permission 发放以后范围冻结

Executor 不允许自行扩大治理范围。

如果需要增加一个文件：

#### 8.2.1 文件仍属于已经批准的治理范围

例如：

```text
还是原 Module
还是原 Design
还是原 Architecture / Data Model / Contract
```

Runtime 可以允许增加具体文件权限。

这只是把已有范围具体化，不是扩大治理范围。

#### 8.2.2 文件导致新的治理对象进入范围

例如：

```text
新的 Module
新的 Design
新的 Data Model
新的 Contract
```

则：

```text
BLOCK
SCOPE_EXPANSION_REQUIRED
```

必须重新正式治理。

不能因为代码已经需要它，就修改 Classification 直接放行。

### 8.3 Task

`sf-task-planner` 继续负责 Task。

Task 的正式内容必须包含：

```text
Task 引用 Requirement / Design
明确文件
明确约束
明确完成条件
明确验证方式
```

增加强制引用：

```text
DD refs

DATA refs（涉及数据时）

Contract refs

allowed_write_files
```

Architecture 一般通过 DD 继承。

如果 Task 直接落实 Architecture 系统级工作，则允许直接引用 ARCH。

### 8.4 Executor 怎么保证消费正式设计

不能只靠 Task 文本转述。

`sf_context_build` 必须构建正式执行上下文。

Executor 被调度时，Runtime 根据：

```text
Code Permission
+
Task refs
```

自动构造上下文：

```text
Task
+
对应 DD
+
对应 DATA
+
对应 ARCH
+
对应 Project / Module Contract
```

只提供本任务真正相关的内容，不把整个项目文档全部塞进去。

所以：

> **正式设计不是“要求 Executor 自己去找”，而是 Runtime 强制把应该消费的内容送到 Executor。**

### 8.5 Actual Scope Audit

Changed Files Audit 必须根据真实 Write Guard 记录和文件系统 Diff 判断文件是否超出 `allowed_write_files`；不新建第二套 Changed Files Audit。正式对账从文件级扩展为治理范围级：

```text
Actual File
vs
Allowed File
```

扩展为：

```text
Actual File
↓
code_paths
↓
Module
↓
DD
↓
DATA
↓
ARCH
↓
Contract
```

然后与 Code Permission 中冻结的治理范围比较。

必须：

```text
Actual Governance Scope
⊆
Approved Governance Scope
```

否则：

```text
Changed Files Audit = FAILED
```

### 8.6 Verification

Verifier 不再只证明程序能工作。

Runtime 同样根据真实修改构建验证上下文。

Verification 必须证明：

```text
1. 功能正确

2. Requirement / Acceptance Criteria 满足

3. 实现符合 Module Design

4. 实现符合 Project Data Model

5. 实现符合 Project Architecture

6. Project Contract 未违反

7. Module Contract 未违反

8. Actual Scope 未超过 Code Permission
```

Verification 正式证据对象固定为：

```text
verification_report
evidence_manifest
semantic_closure
verification_gate
```

不建立第二套 Verification。

`verification_gate` 只有在验证、证据和 Semantic Closure 全部满足后才能进入 `verification_done`。

### 8.7 Formal Version Gate

这是本次唯一新增的 Gate：

```text
formal_version_gate
```

位置：

```text
Verification Gate
↓
formal_version_gate
↓
Close Gate
↓
Closed
```

它不再检查业务是否正确。

业务正确性由 Verification 负责。

Formal Version Gate 只回答：

> **这个 WI 是否有资格作为正式版本进入默认主分支。**

检查：

```text
workflow_type / workflow_path 合法

本 Workflow 要求的 Gate 全部通过

Gate 仍然有效，没有过期

User Decision 与批准的 Candidate 一致

需要 Merge 的 Candidate 已正确 Merge

Fast Path 的 Merge 正确为 N/A

Post-Spec-Merge Gate 通过

Code Permission 合法

Changed Files Audit 通过

Verification Gate 通过

Semantic Closure 通过

不存在未解决 Hard Stop

不存在未治理 Extension Request

Git Diff 与本 WI 的实际变更一致

不存在本 WI 未治理的额外修改
```

输出：

```text
.specforge/work-items/<WI>/gates/formal_version_gate.json
```

### 8.8 Close Gate

Close Gate 不再重复做正式版本资格判断。

它只负责最后封口：

```text
权威状态 = verification_done

formal_version_gate = passed

Code Permission 已撤销

没有未解决 Hard Stop

关闭证据完整
```

然后：

```text
closed
```

`sf_close_gate` 独占关闭操作，并必须消费 `verification_done`、验证报告、Candidate、Atomic Spec Merge、Audit、Formal Version 等正式证据。

### 8.9 Git Merge

SpecForge 的正式 Git Merge 入口最终增加硬条件：

```text
WI = closed
AND
formal_version_gate = passed
AND
Formal Version Gate 对应的 Git Diff 没有变化
```

否则：

```text
Git Merge BLOCK
```

因此任何绕过 SpecForge 治理形成的工作区修改，都不能成为 SpecForge 正式版本。

## 9. 项目初始化、首次 WI 与后续 WI

### 9.1 Project Spec 初始化与兼容

Schema 修改采用向后兼容方式。

新增字段解析阶段先允许旧项目缺失：

```text
project.data_model

module.contracts

module.code_paths
```

不能因为升级 SpecForge 就让旧项目立即无法读取。

但是：

```text
新初始化项目
→ 使用新结构

完成 Spec Migration 的项目
→ 使用新结构
```

新治理规则只认：

```text
data_model.md
```

旧 `domain_model.md` 只兼容读取。

### 9.2 新项目首次治理自举

新项目的首个正式 WI 不定义第二条完整生命周期；它只是第 3.1 Canonical Product Lifecycle 在“项目尚无正式 Project Spec”条件下的首次运行。

首次 WI 必须在同一个 Candidate 范围内建立本项目所需的初始正式对象：

```text
Requirement
→ Project Architecture
→ Project Data Model（ACTIVE 或有证据的 NOT_APPLICABLE）
→ Module / code_paths
→ Module Design
→ Project / Module Contract（适用时）
→ Trace / Prospective Trace
→ Task
```

随后继续进入第 3.1 的统一阶段：

```text
Required Candidate Gates
→ User Decision
→ Atomic Spec Merge
→ Post-Spec-Merge Gate
→ Code Permission
→ Implementation
→ Actual Scope Audit
→ Verification
→ Formal Version Gate
→ Close Gate
→ Git Merge
```

治理 Spec 的生效条件固定为：

```text
Atomic Spec Merge 成功
+
全部 required Gate / Post-Spec-Merge Gate 满足
→ 正式治理 Spec 生效
```

不再定义或维护独立的 `独立治理激活字段` 状态字段。

从第一个 WI 开始，三个核心 Gate 就必须按最终产品规则全部 Hard；第一个 WI 完成后不发生 Gate 严格度切换。后续 WI 必须消费已经生效的正式 Architecture、Data Model、Module Design、Contract 和 Trace，并按同一套 Hard Gate 继续治理。

首次治理统一规则：不增加 Project Spec Readiness Gate；Architecture / Data Model / Module Design / Contract 必须在同一个正式 WI 内闭环，不拆分第二个架构 WI。
### 9.3 后续需求时怎么做

每次设计仍然先消费现有正式设计。

例如：

```text
Architecture 不变
Data Model 不变
Module Design 要变
```

则：

```text
正式 Architecture
+
正式 Data Model
↓
新的 Module Design Candidate
```

如果：

```text
Architecture 要变
Data Model 也要变
```

则同一个 WI 内：

```text
新的 Architecture Candidate
↓
新的 Data Model Candidate
↓
新的 Module Design Candidate
```

下层设计永远基于本次即将生效的上层设计，而不是旧版本。

## 10. SpecForge 产品实施路线

### 10.1 Phase 生命周期与发布边界

**PHASE-LIFE-001：** Phase 1—12 是本次开发 SpecForge 架构一致性治理能力的一次性产品实施与验收路线，不是业务项目的 WI 流程，也不是以后每次普通代码修改都从 Phase 1 重新执行。

首次完成本能力时按 Phase 1—12 推进。完成并发布后，后续修改按影响范围决定验证深度：

```text
不影响治理主链的局部修改
→ 定向单元测试、回归测试、类型检查、构建和架构/契约对账

影响项目初始化、Impact、Architecture、Data、Module、Contract、Trace、Candidate、Gate、Atomic Spec Merge、Code Permission、Audit、Verification 或 Close
→ 追加全新临时项目的首个 WI 端到端回归

影响真实 OpenCode、Agent 协作、daemon 生命周期、用户审批交互或安装后运行路径
→ 发布前追加真实环境验收

改变三个核心 Gate 的 severity、阻断条件、调用范围或绕过规则
→ 必须重新执行完整的 Phase 11 等价验收
```

已经进入最终 Hard 状态后，普通修改不得把任一核心 Gate 静默降级为 Soft；验证未通过时应阻止新版本发布，而不是降低治理强度。
### 10.2 Phase 1：建立数据结构

**Goal**

建立治理对象的类型、Schema、目录和变更标志，使第 3—9 章的正式对象可被机器表达。

**Canonical References**

第 3.3、3.4、4.1、4.4、6.1、7.4；`GOV-CONTRACT-001`、`CON-MODEL-001`、`GATE-FINAL-001`

**Required Outputs**

`data_model`、`contracts`、`code_paths`、`impact_scope`、`data_model_changed`、`module_contract_changed`、Formal Version Gate ID 等结构进入正式类型/Schema。

**Exit Criteria**

Schema/类型/路径彼此一致，兼容读取边界明确；没有第二套 Data/Contract/Trace 数据模型。

**Required Tests**

类型检查、Schema 单测、目录/序列化回归、workspace build
### 10.3 Phase 2：建立正式对象解析能力

**Goal**

建立稳定 ID、引用和代码归属解析能力，为 Impact、Gate、Trace、Contract 消费提供统一真相源。

**Canonical References**

第 3.3、3.4、4.2、6.4、6.5；`CON-CONS-SOURCE-001`

**Required Outputs**

ARCH/DATA/DD/Contract source ref resolver、code_paths→Module resolver、Project Spec graph resolver。

**Exit Criteria**

所有治理关系可由稳定 ID/固定结构解析；无法唯一解析时 Fail Closed。

**Required Tests**

parser/resolver 单测、冲突/缺失 ID 负例、Module 唯一归属测试
### 10.4 Phase 3：改造 sf-design 和上下文

**Goal**

让设计生产严格消费正式 Requirement、Architecture、Data Model、Contract 和 Impact Scope。

**Canonical References**

第 3.3、3.5、5.1；`GOV-ROLE-001`、`GOV-CONTRACT-001`

**Required Outputs**

`sf-design` 与 `sf_context_build` 能构造完整 Design Context 并生产适用 Candidate。

**Exit Criteria**

Module Design 不越过 Architecture/Data；Contract 来源可追溯；不新增 Architecture/Data Agent。

**Required Tests**

design/context 单测、缺少上层对象负例、端到端 Candidate context 测试
### 10.5 Phase 4：改造 Candidate

**Goal**

固定专业产物 owner，并让 Runtime 独占 manifest、索引和 Prospective Spec/Trace 派生。

**Canonical References**

第 5.2—5.6、第 3.1

**Required Outputs**

Requirement/Design/Task/Trace/Candidate Manifest 的 producer 归属一致。

**Exit Criteria**

不存在一个产物被多个专业 Agent 同时生产；Candidate 路径由 Runtime 决定。

**Required Tests**

Candidate producer/consumer 单测、manifest 完整性测试、Workflow 回归
### 10.6 Phase 5：扩展 Contract 与 Trace

**Goal**

把两级 Contract、消费者关系、Promotion、Prospective Trace 和代码消费者对账接入统一治理链。

**Canonical References**

第 6 章；`GOV-CONTRACT-001`、`CON-MODEL-001`、`CON-PROJ-001`、`CON-MOD-001`、`CON-PROM-001`、`CON-CONS-SOURCE-001`、`CON-CONS-DELTA-001`、`CON-CODE-CONS-001`

**Required Outputs**

Module Contract reader/validator、source_refs、Promotion checks、Prospective Trace、代码消费者证据。

**Exit Criteria**

Contract 关系只有一个真相源；跨 Module 消费正确 Promotion；无法证明代码消费者时 Fail Closed。

**Required Tests**

Contract/Trace 单测、Promotion 正负例、生产代码消费者集成测试
### 10.7 Phase 6：扩展 Gate

**Goal**

让三个核心 Gate 完整覆盖 Spec、Contract、Trace，并满足最终 Hard Enforcement。

**Canonical References**

第 7.1—7.4；`GATE-HARD-001`、`GATE-FINAL-001`、`GATE-ATTEMPT-001`、`GATE-LATEST-001`

**Required Outputs**

`spec_consistency_gate`、`contract_integrity_gate`、`trace_gate` 的正式报告、Attempt、阻断行为。

**Exit Criteria**

所有适用 Workflow/Candidate Phase 的 required Gate 完整执行；非法场景真实阻断。

**Required Tests**

Gate 单测、required-gates 覆盖、Attempt/retry/reconciliation 集成测试
### 10.8 Phase 7：修复 Fast Path

**Goal**

保证 Fast Path 只省略无意义 Candidate，不绕过正式对象一致性或核心 Gate。

**Canonical References**

第 4.4、7.5；`GATE-FINAL-001`

**Required Outputs**

Fast Path classification 条件和三个核心 Gate 调用覆盖。

**Exit Criteria**

任一上层对象变化或 unknown 存在即退出 Fast Path；无关系变化时可不制造 Trace Delta。

**Required Tests**

Fast Path 正负例、Gate 调用覆盖测试、关系变化回归
### 10.9 Phase 8：Code Permission 与 Actual Scope

**Goal**

把批准治理范围冻结到开发许可，并用真实写入证据验证 Actual Scope。

**Canonical References**

第 4.3.3、8.1、8.2、8.5；`GOV-SCOPE-001`

**Required Outputs**

Code Permission governance scope、code_paths Module resolution、Changed Files Audit。

**Exit Criteria**

`Actual Scope ⊆ Approved Scope`；新治理范围需求必须停止并重新分析。

**Required Tests**

permission/audit 单测、范围扩张负例、实际文件系统 diff 集成测试
### 10.10 Phase 9：Verification

**Goal**

让 Verification 同时证明业务正确性和 Architecture/Data/Design/Contract/Scope 一致性。

**Canonical References**

第 8.6；`GOV-CONTRACT-001`、`CON-CODE-CONS-001`

**Required Outputs**

`sf-verifier`、`verification_gate`、Semantic Closure 的正式证据链。

**Exit Criteria**

只有验证、证据和 Semantic Closure 全部满足才进入 `verification_done`。

**Required Tests**

verification 单测、semantic closure 回归、消费者/范围集成测试
### 10.11 Phase 10：Formal Version Gate

**Goal**

在 Verification 与 Close 之间冻结可交付正式版本，阻断验证后漂移。

**Canonical References**

第 8.7—8.9

**Required Outputs**

Formal Version evidence、Close consumption、Git Merge Guard linkage。

**Exit Criteria**

Formal Version 后任何未授权漂移都会阻断 Close/Git Merge。

**Required Tests**

Formal Version 正负例、dirty worktree 回归、Close/Git Merge 集成测试
### 10.12 Phase 11：最终 Hard 行为的真实新项目验收

**Goal**

用真实全新业务项目验证第 3.1 Canonical Product Lifecycle 的首个正式 WI，证明最终 Hard 行为可实际运行。

**Canonical References**

第 3.1、第 9.2、第 12 章；`PHASE-LIFE-001`、`GATE-FINAL-001`

**Required Outputs**

真实项目的 Requirement、Candidate、Gate Attempt、User Decision、Atomic Spec Merge、Code Permission、Implementation、Verification、Close、Git Merge 全链证据。

**Exit Criteria**

合法场景全部通过；非法场景全部真实阻断；Fast Path 不能绕过核心 Gate；不使用独立治理激活字段。

**Required Tests**

真实 OpenCode + SpecForge E2E、核心 Gate 正负例、审批/实现/Close/Git Merge 全链回归
### 10.13 Phase 12：最终 Hard Enforcement 固化与发布边界

**Goal**

把 Phase 11 已证明的行为固化为发布版本，不在业务项目运行时再切换治理强度。

**Canonical References**

第 7.4、第 10.1；`PHASE-LIFE-001`、`GATE-FINAL-001`

**Required Outputs**

三个核心 Gate hard 注册、Workflow/Fast Path 调用覆盖、Runtime 阻断、最终回归测试。

**Exit Criteria**

发布版本从业务项目第一个 WI 起即执行最终 Hard 行为；任何必需验证失败都阻止发布。

**Required Tests**

全量回归、TypeScript、相关/全仓 build、真实环境验收、发布前 E2E
## 11. Implementation Mapping

### 11.1 Implementation Mapping 边界

本章只描述“哪些实现区域通常承载第 3—10 章规则”，用于架构对账、消费者检查和实施规划；**不是任何具体任务的 write scope 或代码权限来源**。

```text
IMPLEMENTATION_MAPPING_ONLY=YES
TASK_WRITE_SCOPE_AUTHORITY=NO
```

任何具体任务允许修改哪些文件，必须由该任务自己的 `GOV-PRE-001` / `GOV-SCOPE-001` 影响分析、批准范围和运行时证据决定；不得因为文件出现在本章就自动取得修改权限。


### 11.2 类型和正式路径

重点修改：

```text
packages/types/src/work-item-types.ts
packages/types/src/contract-model.ts
packages/types/src/directory-layout.ts
packages/types/src/gate-ids.ts
```

### 11.3 Classification / Impact

重点修改：

```text
packages/daemon-core/src/tools/lib/change-classification.ts
packages/daemon-core/src/tools/lib/impact-analysis.ts
packages/daemon-core/src/tools/lib/trigger-result.ts
packages/daemon-core/src/tools/lib/workflow-path-selector-v11.ts
```

### 11.4 Project Spec / Context

重点修改：

```text
sf_project_init_core.ts
spec-migration-v11.ts
sf_context_build_core.ts
sf_design_gate_core.ts
```

并增加轻量：

```text
project-spec graph / id resolver
module code-path resolver
data-model parser
```

### 11.5 Contract / Trace

重点修改：

```text
contract-integrity.ts
contracts-registry.ts
sf_trace_matrix_core.ts
verification-evidence-v11.ts
```

### 11.6 Gates

重点修改：

```text
required-gates.ts
gate-runner-v11.ts
close-gate.ts
sf_verification_gate_core.ts
```

增加 Formal Version Gate 核心实现。

### 11.7 Permission / Audit / Merge

重点修改：

```text
code-permission-service-v11.ts
sf-v11-code-permission.ts
changed-files-audit.ts
sf-changed-files-audit.ts
merge-runner-v11.ts
Git governance merge guard
```

### 11.8 Agent

修改：

```text
sf-orchestrator.md
sf-design.md
sf-task-planner.md
sf-executor.md
sf-verifier.md
```

不增加 Agent。

### 11.9 Workflow / Skills

修改已有：

```text
feature_spec
bugfix_spec
change_request
feature_spec_design_first
architecture_change
quick_change
contract_change
spec_migration
```

以及对应 Workflow Skill。

不增加 Data Model Workflow。

## 12. 验收矩阵与完成标准

### 12.1 Acceptance Matrix

第 12 章只把第 3—9 章的正式规则实例化为验收场景；**不得在这里重新定义 Architecture、Contract、Trace、Gate、Scope 或 Lifecycle 规则**。如果矩阵与对应 Rule ID / canonical section 冲突，以正式规则为准并修订本矩阵。

| Scenario | Preconditions | Applicable Rules | Expected Artifact / Evidence | Expected Gate / Control | Expected State / Result |
|---|---|---|---|---|---|
| 首次项目没有 Architecture | 项目尚无正式 Project Architecture | 3.1, 3.3, 9.2 | Architecture/Data/Design Candidate + Trace/Task | Required Candidate Gates | PASS 后进入 User Decision；不得直接跳 Module Design |
| Architecture 已存在且不变 | Impact 判定 architecture_changed=false | 3.3, 4.3, 5.1 | 引用正式 Architecture 的下层 Candidate | spec_consistency_gate | PASS |
| 数据库全局模型变化 | data_model_changed=true | 3.3.2, 4.3.2, 6.5 | Data Model Candidate + 受影响 Design/Task/Trace | spec_consistency_gate + trace_gate | 全部闭合才 PASS |
| Module 私有 Contract | 消费者仅 owner Module | 6.1, 6.2; CON-MOD-001 | Module Contract + source_refs/Trace | contract_integrity_gate | PASS |
| 跨 Module 消费 Internal Contract | 其他 Module 消费 Module Contract | CON-PROM-001 | Promotion 所需 Project Contract Candidate | contract_integrity_gate | BLOCK，直到 Promotion 完整 |
| Module Contract Promotion | 跨 Module 消费已识别 | CON-PROM-001, CON-CONS-DELTA-001 | Project Contract + Consumers + Trace + 必要 Design | contract_integrity_gate + trace_gate | 完整才 PASS；缺一项 BLOCK |
| 普通 Fast Path | 4.4 全部 false / unknowns=[] | 4.4, 7.5 | 无无意义 Spec Candidate；保留一致性证据 | 三个核心 Gate | PASS |
| Fast Path 违反 Architecture | 实际修改与正式 Architecture 冲突 | 7.2, 7.5 | 冲突证据 | spec_consistency_gate | BLOCK |
| Fast Path 实际需要 Data Model 变化 | data_model_changed=true 或证据表明需变更 | 4.4, 7.5 | 重新分类后的 Candidate 要求 | Classification + spec_consistency_gate | 退出 Fast Path，进入完整 Candidate |
| 代码文件没有 Module 归属 | code_paths 解析 0 个 Module | 3.4, 8.1 | Module resolution evidence | Code Permission / Scope control | BLOCK |
| 代码文件匹配多个 Module | code_paths 解析 >1 Module | 3.4, 8.1 | 冲突 resolution evidence | Code Permission / Scope control | BLOCK |
| 多修改文件但仍在批准范围 | Actual Scope 仍是 Approved Scope 子集 | 8.2, 8.5; GOV-SCOPE-001 | Changed Files Audit | Actual Scope Audit | PASS |
| Implementation 需要新治理范围 | 实现发现新 Module/Contract/架构影响 | 8.2; GOV-SCOPE-001 | Scope expansion evidence | Scope Freeze | STOP；重新 Impact/批准，不得自行扩大 |
| 已经产生越界修改 | Actual Scope 不是 Approved Scope 子集 | 8.5; GOV-SCOPE-001 | 真实 Write Guard / filesystem diff | Actual Scope Audit | BLOCK |
| Project Contract 删除但消费者未更新 | 删除/变更 Project Contract | CON-CONS-SOURCE-001, CON-CONS-DELTA-001, CON-CODE-CONS-001 | Prospective Trace + consumer reconciliation | contract_integrity_gate | BLOCK |
| Trace 出现不存在 ID | Trace/Delta 引用无法解析 | 6.4, 6.5 | resolver / Trace evidence | trace_gate | BLOCK |
| 功能测试通过但治理未闭合 | 业务测试 PASS，治理证据缺失 | 8.6, 8.7 | Verification + governance evidence | Formal Version Gate | BLOCK |
| Formal Version 后工作区漂移 | Formal Version evidence 后发生修改 | 8.7, 8.8, 8.9 | worktree / fingerprint delta | Close Gate / Git Merge Guard | BLOCK |
| 完整最终交付 | 第 3.1 全链全部合法完成 | 3.1 + 第 4—9 章全部适用规则 | 完整 Candidate/Gate/Decision/Atomic Spec Merge/Permission/Audit/Verification/Formal Version/Close evidence | 全部适用 Gate | Close 成功且 Git Merge 才允许 |

### 12.2 最终完成标准

SpecForge 架构一致性治理能力只有同时满足以下条件，才能宣布产品能力完成：

```text
1. 第 3.1 Canonical Product Lifecycle 已由实现完整承载；
2. 第 3—9 章所有适用正式对象、Contract、Trace、Gate、Scope、Verification、Formal Version、Close、Git Merge 规则均有生产者和消费者；
3. 三个核心 Gate 在所有适用 Workflow / Fast Path 中保持 Hard；
4. Phase 11 真实全新项目端到端验收通过；
5. Phase 12 发布边界验证通过；
6. 单元、属性、集成、端到端、TypeScript、相关构建和必要全仓构建全部满足发布要求；
7. `git diff --check`、实际修改范围审计、生产者/消费者对账、authority 同步检查通过；
8. 不存在未解释的 `INSUFFICIENT_EVIDENCE`。
```

最终验收只引用第 3.1 Canonical Product Lifecycle，不再复制另一条流程。

<!-- SPECFORGE_NEW_SESSION_PROMPT:START -->

## 附录 A. 新会话固定启动提示词

下面整段是唯一固定启动提示词。必须逐阶段执行，禁止先调用工具再补审计：

```text
继续 SpecForge。

BOOTSTRAP_ENVELOPE_VERSION=2

BOOTSTRAP COORDINATES：
REMOTE_URL=https://github.com/lyqstart/SpecForge.git
AUTHORITY_BRANCH=main
AUTHORITY_PATH=docs/design/SpecForge架构一致性治理最终实施方案.md

上一轮 CMD 完整执行回执：
【必须粘贴从 ===== BEGIN FEEDBACK TO CHATGPT ===== 到 ===== END FEEDBACK TO CHATGPT ===== 的完整内容；上一轮明确没有 ZIP+CMD 时写 NONE】

第一动作必须是下面的 Pre-tool Guard。完成它之前禁止调用任何工具、禁止读取任何仓库或 handoff：

===== BEGIN BOOTSTRAP ENVELOPE PRETOOL GUARD =====
BOOTSTRAP_EXECUTION_PHASE=RECEIPT_AUDIT
BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE
LAST_EXECUTION_RECEIPT_STATUS=PRESENT_VALID|PRESENT_INVALID|NONE_ALLOWED|MISSING_REQUIRED
LAST_EXECUTION_RECEIPT_PACKAGE_NAME=
LAST_EXECUTION_RECEIPT_DELIVERY_ID=
LAST_EXECUTION_RECEIPT_VALIDATOR_ID=
LAST_EXECUTION_RECEIPT_IDENTITY_BINDING_AUDIT=
LAST_EXECUTION_RECEIPT_RESULT=
LAST_EXECUTION_RECEIPT_CONSUMPTION_AUDIT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=NO
BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL
BOOTSTRAP_PRETOOL_GUARD_ACCEPTED=YES|NO
===== END BOOTSTRAP ENVELOPE PRETOOL GUARD =====

Receipt 规则：
- 完整标准回执且结构/身份字段可解析：PRESENT_VALID。
- 明确上一轮没有 ZIP+CMD：NONE_ALLOWED。
- 应有回执但未粘贴：MISSING_REQUIRED。
- 有回执但结构或身份字段损坏：PRESENT_INVALID。
- PRESENT_VALID 时禁止同时写 MISSING_LAST_EXECUTION_RECEIPT。
- MISSING_REQUIRED / PRESENT_INVALID：立即停止；BOOTSTRAP_ALLOWED_TOOL_CLASS=NONE；不得执行 live-ref；只要求用户补回执。

只有 PRETOOL_GUARD_ACCEPTED=YES 后才能进入：

BOOTSTRAP_EXECUTION_PHASE=LIVE_REF_RESOLUTION
BOOTSTRAP_ALLOWED_TOOL_CLASS=LIVE_REF_ONLY

live ref 真相源只能是：
STRUCTURED_GIT_LS_REMOTE | GITHUB_REF_API_LIVE | USER_BOOTSTRAP_GIT_LS_REMOTE

此阶段禁止读取 current-handoff、Work Item、immutable evidence、Stage Input、Recovery。
禁止用 GitHub branch HTML、raw/main、搜索、compare 或 commit 可访问性确定当前 HEAD。

live ref 成功后：
BOOTSTRAP_EXECUTION_PHASE=AUTHORITY_EXACT_READ
BOOTSTRAP_ALLOWED_TOOL_CLASS=EXACT_AUTHORITY_ONLY

只读取：
https://raw.githubusercontent.com/lyqstart/SpecForge/<AUTHORITY_HEAD>/docs/design/SpecForge架构一致性治理最终实施方案.md

Authority Bootstrap 成功必须完整输出：
AUTHORITY_BOOTSTRAP_REMOTE_URL=
AUTHORITY_BOOTSTRAP_BRANCH=
AUTHORITY_BOOTSTRAP_PATH=
AUTHORITY_HEAD_SOURCE=
AUTHORITY_HEAD=
AUTHORITY_EXACT_CONTENT_REF=
AUTHORITY_UNIQUE_MARKER_AUDIT=PASS|FAIL
AUTHORITY_BOOTSTRAP_EVIDENCE=
AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=
AUTHORITY_BOOTSTRAP_VALIDATOR_ID=
AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES|NO
AUTHORITY_BOOTSTRAP_ACCEPTED=YES|NO

拿不到 live ref 时必须完整输出：

===== BEGIN AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====
AUTHORITY_BOOTSTRAP_REMOTE_URL=
AUTHORITY_BOOTSTRAP_BRANCH=
AUTHORITY_BOOTSTRAP_PATH=
AUTHORITY_HEAD_SOURCE=INSUFFICIENT_EVIDENCE
AUTHORITY_HEAD=INSUFFICIENT_EVIDENCE
AUTHORITY_EXACT_CONTENT_REF=NOT_APPLICABLE_NO_LIVE_HEAD
AUTHORITY_UNIQUE_MARKER_AUDIT=NOT_RUN_NO_EXACT_COMMIT
AUTHORITY_BOOTSTRAP_EVIDENCE=
AUTHORITY_BOOTSTRAP_EVIDENCE_FRESHNESS=CURRENT_SESSION
AUTHORITY_BOOTSTRAP_VALIDATOR_ID=
AUTHORITY_BOOTSTRAP_VALIDATOR_ACCEPTED=YES|NO
AUTHORITY_BOOTSTRAP_ACCEPTED=NO
AUTHORITY_BOOTSTRAP_FAILURE_REASON=
AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=PASS_NO_HANDOFF_OR_RECOVERY_READ|FAIL
AUTHORITY_BOOTSTRAP_NEXT_ACTION=ACQUIRE_LIVE_BRANCH_REF_ONLY
AUTHORITY_BOOTSTRAP_READ_ONLY_EVIDENCE_REQUIRED=YES
BOOTSTRAP_FAILURE_DELIVERY_MODE=ONE_ACCEPTED_ZIP_PLUS_ONE_CMD
RAW_CMD_ALLOWED=NO
AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ID=
AUTHORITY_BOOTSTRAP_EVIDENCE_ARTIFACT_ACCEPTED=YES|NO|NOT_YET_GENERATED
AUTHORITY_BOOTSTRAP_FAILURE_ACCEPTED=YES|NO
===== END AUTHORITY BOOTSTRAP FAILURE ACCEPTANCE =====

如果本轮发生任何越权读取：
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES
BOOTSTRAP_EXECUTION_ORDER_AUDIT=FAIL
BOOTSTRAP_ENVELOPE_ACCEPTED=NO
如果已经读取 current-handoff / WI / immutable evidence，则 AUTHORITY_BOOTSTRAP_PHASE_ACCESS_AUDIT=FAIL；本轮不得发布 Bootstrap evidence ZIP。

只有 Phase Access PASS 且需要本地取得 live ref 时，才能生成一个 BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP。发布前必须完整输出：

===== BEGIN BOOTSTRAP EVIDENCE ARTIFACT ACCEPTANCE =====
ARTIFACT_ID=
ARTIFACT_TYPE=BOOTSTRAP_LIVE_REF_EVIDENCE_ZIP
ARTIFACT_CONTRACT=GOV-STAGE-DELIVERY-001+GOV-STAGE-ARTIFACT-VERIFY-001+GOV-STAGE-VALIDATOR-001+GOV-STAGE-DELIVERY-IDENTITY-001
DELIVERY_ID=
PACKAGE_NAME=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=manifest.json
IDENTITY_BINDING_AUDIT=PASS|FAIL
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS|FAIL
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=
STRUCTURE_VALIDATION=PASS|FAIL
COMPLETENESS_VALIDATION=PASS|FAIL
SEMANTIC_VALIDATION=PASS|FAIL
REFERENCE_VALIDATION=PASS|FAIL
SCOPE_VALIDATION=PASS|FAIL
EXECUTABILITY_VALIDATION=PASS|FAIL
CONSUMER_VALIDATION=PASS|FAIL
VALIDATION_EVIDENCE=
VALIDATOR_SELF_CHECK=PASS|FAIL
VALIDATOR_ACCEPTED=YES|NO
ARTIFACT_ACCEPTED=YES|NO
===== END BOOTSTRAP EVIDENCE ARTIFACT ACCEPTANCE =====

只有 IDENTITY_BINDING_AUDIT=PASS、VALIDATOR_ACCEPTED=YES、ARTIFACT_ACCEPTED=YES 后，才能显示一个 ZIP 下载链接和一条 CMD。

evidence runner 只能执行：
git ls-remote https://github.com/lyqstart/SpecForge.git refs/heads/main

它不接收 SpecForge / Validation 仓库路径，不读取项目文件，不执行生命周期动作；回执必须完整包含：

===== BEGIN FEEDBACK TO CHATGPT =====
PACKAGE_NAME=
DELIVERY_ID=
RUNNER_ID=
VALIDATOR_ID=
RECEIPT_EMITTER_ID=
IDENTITY_MANIFEST=manifest.json
IDENTITY_BINDING_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_AUDIT=PASS
DELIVERY_INTERNAL_REFERENCE_MISMATCHES=NONE
ACTION_TYPE=BOOTSTRAP_LIVE_REF_READ_ONLY
REMOTE_URL=https://github.com/lyqstart/SpecForge.git
AUTHORITY_BRANCH=main
LS_REMOTE_EXIT_CODE=
LS_REMOTE_STDOUT=
LIVE_REF_SHA=
REPOSITORY_READS=NONE
REPOSITORY_WRITES=NONE
LIFECYCLE_ACTIONS=NONE
===== END FEEDBACK TO CHATGPT =====

每个 Bootstrap 回合结束前都必须输出：

===== BEGIN BOOTSTRAP ENVELOPE SELF CHECK =====
BOOTSTRAP_COORDINATES_CONTRACT=PASS|FAIL
BOOTSTRAP_RECEIPT_CONSUMPTION_CONTRACT=PASS|FAIL
BOOTSTRAP_FAILURE_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_EVIDENCE_DELIVERY_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_SUCCESS_TRANSITION_CONTRACT=PASS|FAIL|NOT_APPLICABLE
BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS|FAIL
BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=YES|NO
BOOTSTRAP_ENVELOPE_ACCEPTED=YES|NO
===== END BOOTSTRAP ENVELOPE SELF CHECK =====

只有 Envelope 适用子契约全部 PASS、BOOTSTRAP_EXECUTION_ORDER_AUDIT=PASS、BOOTSTRAP_UNAUTHORIZED_READ_DETECTED=NO 时，才允许 BOOTSTRAP_ENVELOPE_ACCEPTED=YES。

只有 AUTHORITY_BOOTSTRAP_ACCEPTED=YES 后才能：
BOOTSTRAP_EXECUTION_PHASE=RECOVERY
BOOTSTRAP_ALLOWED_TOOL_CLASS=RECOVERY
并按顺序：
- 读取 current-handoff；
- 恢复 WORK_BRANCH / WORK_HEAD / REMOTE_WORK_HEAD / WORKTREE_STATUS；
- 用持久化 Work Item / immutable evidence 对账 handoff；
- 输出完整 GOVERNANCE PRECONCLUSION；
- 输出 canonical Stage Input；
- 输出 GOV-STAGE-RECOVERY-ACCEPT-001 Recovery Acceptance；
- RECOVERY_ACCEPTED=YES 后才允许执行 NEXT_LEGAL_ACTION；
- 不自动重试已经开始的副作用动作。
```

任何以后新增会影响 exact authority 读取之前行为的规则，必须同时修改：
`GOV-STAGE-DELIVERY-IDENTITY-001#INTERNAL_REFERENCE + GOV-STAGE-BOOTSTRAP-ENVELOPE-001 + 附录 A 固定 prompt + Bootstrap Envelope consumer test`。

<!-- SPECFORGE_NEW_SESSION_PROMPT:END -->

## 附录 B. Rule ID 索引

| Rule ID | 规范位置 |
|---|---|
| `ARCH-WI-001` | 2.3 架构变化必须在同一任务/WI闭环 |
| `CON-CODE-CONS-001` | 6.1 两级契约模型 |
| `CON-CONS-DELTA-001` | 6.1 两级契约模型 |
| `CON-CONS-DELTA-CANON-001` | 6.1 两级契约模型 |
| `CON-CONS-SOURCE-001` | 6.1 两级契约模型 |
| `CON-MOD-001` | 6.1 两级契约模型 |
| `CON-MODEL-001` | 6.1 两级契约模型 |
| `CON-PROJ-001` | 6.1 两级契约模型 |
| `CON-PROM-001` | 6.1 两级契约模型 |
| `GATE-ATTEMPT-001` | 7.4.1 Gate Attempt 证据不可变性 |
| `GATE-ATTEMPT-INPUT-SNAPSHOT-001` | 7.4 Gate 的硬阻断与产品完成边界 |
| `GATE-ATTEMPT-RECONCILE-001` | 7.4 Gate 的硬阻断与产品完成边界 |
| `GATE-FINAL-001` | 7.4 Gate 的硬阻断与产品完成边界 |
| `GATE-HARD-001` | 7.4 Gate 的硬阻断与产品完成边界 |
| `GATE-LATEST-001` | 7.4.1 Gate Attempt 证据不可变性 |
| `GATE-MIGRATION-001` | 7.4.1 Gate Attempt 证据不可变性 |
| `GATE-RETRY-STATE-001` | 7.4 Gate 的硬阻断与产品完成边界 |
| `GOV-AUTH-001` | 1.2 唯一权威源 |
| `GOV-CONT-001` | 2.7 Continuity 与当前用户授权边界 |
| `GOV-CONTRACT-001` | 6.1 两级契约模型 |
| `GOV-EVID-001` | 2.6 Fail Closed 与证据不足 |
| `GOV-MODE-001` | 1.3.1 模式 A：SpecForge 自身开发 |
| `GOV-POST-001` | 2.5 修改后治理闭环 |
| `GOV-PRE-001` | 2.2 SpecForge 自身开发：修改前治理 |
| `GOV-REMOTE-001` | 2.1 新会话的远程权威入口 |
| `GOV-ROLE-001` | 1.3 文件作用范围与两种开发模式 |
| `GOV-SCOPE-001` | 2.4 实施过程中的范围冻结 |
| `GOV-SELF-001` | 1.3.1 模式 A：SpecForge 自身开发 |
| `GOV-STAGE-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-ARTIFACT-VERIFY-001` | 2.9 Truth Source、Artifact Acceptance 与 Validator |
| `GOV-STAGE-AUTHORITY-BOOTSTRAP-001` | 2.1 新会话的远程权威入口 |
| `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-001` | 2.1 新会话的远程权威入口 |
| `GOV-STAGE-AUTHORITY-BOOTSTRAP-FAIL-TEMPLATE-001` | 2.1 新会话的远程权威入口 |
| `GOV-STAGE-BLOCKER-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-BOOTSTRAP-ENVELOPE-001` | 2.11 Bootstrap Envelope |
| `GOV-STAGE-BRANCH-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-CHK-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-DELIVERY-001` | 2.10 Delivery、Receipt 与 Delivery Identity |
| `GOV-STAGE-DELIVERY-IDENTITY-001` | 2.10 Delivery、Receipt 与 Delivery Identity |
| `GOV-STAGE-DIAG-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-ENV-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-HANDOFF-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-INPUT-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-OUTPUT-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-RECEIPT-001` | 2.10 Delivery、Receipt 与 Delivery Identity |
| `GOV-STAGE-RECOVERY-ACCEPT-001` | 2.12 Recovery Acceptance |
| `GOV-STAGE-RETRY-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-SIDEFX-001` | 2.8 Stage Execution Contract |
| `GOV-STAGE-TRUTH-001` | 2.9 Truth Source、Artifact Acceptance 与 Validator |
| `GOV-STAGE-VALIDATOR-001` | 2.9 Truth Source、Artifact Acceptance 与 Validator |
| `PHASE-LIFE-001` | 10.1 Phase 生命周期与发布边界 |
