# SpecForge 架构一致性治理合同

> `DOCUMENT_ROLE=SUBORDINATE_TECHNICAL_GOVERNANCE_CONTRACT`
>
> `CONTRACT_VERSION=2.0`
>
> 本文件是 SpecForge 当前有效的架构一致性与契约治理技术合同。它服从
> [`docs/product-specification/specforge-product-specification.md`](../product-specification/specforge-product-specification.md)
> 与 [`docs/product-specification/authority-registry.md`](../product-specification/authority-registry.md)，不创造产品需求、产品架构或发布范围。
>
> 2026-10-06 之前的完整 4462 行实施方案已原样归档为
> [`docs/archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md`](../archive/design/SpecForge架构一致性治理最终实施方案.full-history-20261006.md)，
> 归档源 SHA-256 为 `25861569ced52f8017a68c7c9765c32c376b25afe70568e924db3eed5380b7d8`。
> 该文件只保存历史规则、实施过程和审计证据，不得作为当前产品或执行输入。

## 1. 权威、入口与文档边界

### 1.1 当前权威顺序

**GOV-AUTH-001：** 发生冲突时按以下顺序解释并修正下游：

1. `docs/product-specification/specforge-product-specification.md`：唯一产品规格；
2. `docs/product-specification/authority-registry.md`：文件角色、裁决与解释优先级；
3. 与二者一致的 Accepted ADR；
4. 本文件及已登记的模块 Contract；
5. 实现、部署模板、安装器、脚本和 Agent guidance；
6. 测试与发布消费者；
7. `docs/archive/**` 中的历史材料。

下游与上游冲突时必须报告 `AUTHORITY_CONFLICT` 并修正下游。证据不足时必须报告
`INSUFFICIENT_EVIDENCE`；不得用代码、测试、README、聊天、历史报告或归档材料反向创造产品决定。

### 1.2 新会话与恢复入口

**GOV-CONT-001：** 新会话只有一个恢复链：

```text
AGENTS.md
→ node scripts/project-session-bootstrap.mjs
→ 完整读取 Bootstrap 输出的 REQUIRED_RULES
→ docs/project-status.md 的 NEXT_LEGAL_ACTION
```

- `AGENTS.md` 是稳定入口，不保存动态状态；
- `docs/project-status.md` 是唯一当前状态文件，只保存可恢复检查点；
- Bootstrap 必须只读核验本地/远端 Git、必需规则、唯一状态块、根 `.kiro` 缺失和工作树变化；
- `BOOTSTRAP_STATUS=BLOCKED`、基线不一致、规则缺失或变化未分类时 fail closed；
- 不得创建新的 handoff、current-status、recovery-status 或会话专用当前状态文件；
- 所有 current-handoff 类旧表达均已失效。

### 1.3 执行模式与经验规则

**GOV-EXECUTION-MODE-001：** 外部执行只有 `CODEX_DIRECT` 与 `WORKBUDDY_COORDINATED`
两种模式。模式、RUN_ID、EVIDENCE_ROOT、证据四件套、数字退出码、写入分类和停点的唯一规则为
[`docs/rule/specforge-execution-mode-and-evidence-protocol.md`](../rule/specforge-execution-mode-and-evidence-protocol.md)。
WorkBuddy 自述不能替代 Codex 独立审核。

**AR-DEC-06：** 每次 SpecForge 产品开发必须完整读取
[`docs/rule/specforge-active-development-rules.md`](../rule/specforge-active-development-rules.md)，并按任务关键词定向检索
[`docs/rule/specforge-development-error-ledger-and-experience.md`](../rule/specforge-development-error-ledger-and-experience.md)。
历史账本不是每会话全文读取的活动规则载体。

### 1.4 明确退役的旧机制

以下机制只存在于归档历史，不属于当前合同：

- 把根 `.kiro` 或归档 Kiro 文件作为产品权威；
- 从远程 raw 文件、网页或上一会话收据建立另一条权威恢复链；
- 以固定大段新会话提示替代 `AGENTS.md + Bootstrap + project-status`；
- 把 ZIP、CMD、临时交付包或 current-handoff 作为恢复前提；
- 由活动测试读取归档内容并据此约束当前产品行为。

## 2. SpecForge 自身开发与执行治理协议

### 2.1 禁止自我治理

**GOV-SELF-001：** 对 SpecForge 产品自身的直接开发，不得启动 SpecForge 自身的 Work Item、
Workflow、Candidate、Gate、User Decision、Merge Runner、Code Permission 或 Close 流程。
仓库维护遵循本合同、活动开发规则、执行模式协议和 Git 协作规则。

### 2.2 修改前治理

**GOV-PRE-001：** 写入前必须形成可复核的修改前结论：

```text
目标与逐项完成标准
→ 已确认事实及证据强度
→ 实际架构和完整 producer-consumer 链
→ 与设计架构的差异
→ 首次偏离点与治理归属
→ SUPPORTED / SUPPORTED_WITH_RECOVERY / PARTIALLY_SUPPORTED /
  UNSUPPORTED / CONTRACT_CONFLICT / RUNTIME_DEFECT / INSUFFICIENT_EVIDENCE
→ 最小完整方案、允许写入范围、测试计划和恢复点
```

关键事实必须标记为 `CONFIRMED`、`CORROBORATED`、`HYPOTHESIS` 或
`INSUFFICIENT_EVIDENCE`。历史报告和 Agent 摘要只能作为线索；源码、配置、Git 对象、
StateManager 事件、原始日志和可复核运行结果才可支撑相应强度的结论。

### 2.3 完整闭环

**GOV-CLOSELOOP-001：** 修改必须覆盖受影响的完整语义链，而不是只修第一个可见消费者：

```text
业务 / 治理目标
→ canonical semantic source / Contract / Schema
→ Producer
→ Parser / Normalizer
→ direct Consumer
→ Gate / Runtime enforcement
→ downstream Consumer
→ 代码 / Schema / Agent guidance / Template / 文档落点
→ 自动化测试与真实 Producer 回归
→ 修改后反向验收
```

设计时应维护最小映射：

```text
GOAL_ID | GUARANTEE | CANONICAL_SOURCE | PRODUCER | DIRECT_CONSUMER |
DOWNSTREAM_CONSUMER | IMPLEMENTATION_LOCATIONS | VALIDATION | RESULT
```

任一目标没有来源、消费者或验证证据时，`MODIFICATION_COMPLETE=NO`。

### 2.4 范围变化

**GOV-SCOPE-001：** 允许范围必须覆盖已确认的 Producer、Parser / Normalizer、direct Consumer、
downstream Consumer、Agent guidance、Template、Test、部署模板和安装器。调查发现新的受影响层时，
必须重新执行 `GOV-PRE-001 + GOV-CLOSELOOP-001` 并重新冻结允许范围；不得在旧范围下静默扩写。

### 2.5 修改后验收

**GOV-POST-001：** 修改后按原始目标逐项反向验收：

```text
POST_CHANGE_GOAL_RECONCILIATION
CANONICAL_SEMANTIC_SOURCE_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE
PRODUCER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE
PARSER_NORMALIZER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE
DIRECT_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE
DOWNSTREAM_CONSUMER_RECONCILIATION=PASS|FAIL|INSUFFICIENT_EVIDENCE
REAL_PRODUCER_REGRESSION=PASS|FAIL|NOT_APPLICABLE|INSUFFICIENT_EVIDENCE
PARALLEL_SEMANTIC_SOURCE_AUDIT=PASS|FAIL|INSUFFICIENT_EVIDENCE
MODIFICATION_COMPLETE=YES|NO
```

普通测试通过不能替代治理目标验收。只有目标、语义源、所有真实消费者、运行边界与回归证据均闭环，
才可声明 `MODIFICATION_COMPLETE=YES`。

### 2.6 Fail closed 与证据

**GOV-EVID-001：** 工具失败、网络失败、超时、权限拒绝、输出截断和异常副作用都必须保留原始结果；
不得把失败重试覆盖为成功，也不得把“未发现”提升为“不存在”。无法取得必需证据时停止在
`INSUFFICIENT_EVIDENCE` 或明确 blocker。

修改前后执行 `git status`；提交前执行 `git diff` 与 `git status`。交付至少报告：

- 修改原因与影响范围；
- 文件列表和 diff 摘要；
- 测试、构建、Bootstrap 与远端核验结果；
- 产品规格、Authority Registry、ADR 和治理文档影响；
- 未解决风险、恢复点和下一合法动作。

## 3. 稳定运行合同的归属

本文件只冻结跨模块治理不变量。字段级 Schema、工具参数和实现算法必须由版本化源码或专门 Contract
拥有；不得把几百行复制到本文件形成第二套实现真相。

### 3.1 Validation Contract

**GOV-STAGE-VALIDATOR-001：** 阻断性验证必须在执行前冻结合同，并由
`scripts/validation-contract-kernel.ts` 执行。稳定字段为：

```text
VALIDATION_CONTRACT_ID=
VALIDATION_CONTRACT_FROZEN=YES|NO
VALIDATION_CONTRACT_HASH=
COMPARATOR=EQUALS|NOT_EQUALS|SET_EQUALS|SUBSET|ZERO|NO_NEW_FAILURES|HASH_EQUALS|EXIT_CODE_EQUALS
BASELINE_MODE=ABSOLUTE|DELTA|NOT_APPLICABLE
RUNTIME_BLOCKING_ASSERTION_CREATION_ALLOWED=NO
RUNTIME_BLOCKING_ASSERTION_MUTATION_ALLOWED=NO
CANONICAL_LOCAL_DELIVERY_VALIDATOR_KERNEL=scripts/validation-contract-kernel.ts
CANONICAL_LOCAL_DELIVERY_VALIDATOR_TYPECHECK=bun run typecheck:validator-contract
RUNTIME_COMPILER_OPTION_SYNTHESIS_ALLOWED=NO
WINDOWS_NPM_SHIM_EXECUTION=CMD_CALL_REQUIRED
VERSIONED_TOOLCHAIN_DEPRECATION_POLICY_REQUIRED=YES
VALIDATOR_KERNEL_TYPE_ENVIRONMENT=NODE
TYPE_ENVIRONMENT_SOURCE=VERSIONED_TSCONFIG_AND_DECLARED_DEPENDENCIES
```

### 3.2 Gate attempt 与恢复

以下稳定不变量由 Runtime 源码、Schema 和相应测试共同实现：

- `GATE-ATTEMPT-001`：每次 Gate 执行拥有不可覆盖的 attempt 证据；
- `GATE-LATEST-001`：latest 只能投影一个已完成 attempt，不是独立真相源；
- `GATE-MIGRATION-001`：旧投影只能通过受测迁移读取，不得重写历史 attempt；
- `GATE-RETRY-STATE-001`：重试必须从 Runtime 权威状态和合法恢复序列继续。

### 3.3 责任层与最小完整扩展

问题必须定位到首次偏离的责任层：Standard、Contract、Workflow Skill、Agent、Tool Schema、
Tool Handler、Runtime / State、Permission / Write Guard、Gate、Merge / Audit / Close、Deployment 或
Business Project。现有能力不够时，先补齐最小但完整、可验证、可审计、可恢复的治理闭环，再从原任务
合法断点恢复；不得硬编码单个 Work Item、手改真相源、绕过 HardStop 或让下游补丁掩盖上游缺陷。

## 4. 完成条件

本合同的变更只有在以下条件全部满足时才完成：

1. SPS 与 Authority Registry 的产品决定没有被下游文档扩大或改写；
2. 当前合同与完整历史归档角色清晰，归档没有成为活动消费者；
3. 源码、部署模板、安装器、Agent guidance 和测试的受影响消费者已经逐项核验；
4. 定向测试、完整回归、构建、Bootstrap、diff 检查和远端基线按风险通过；
5. 唯一 `docs/project-status.md` 已更新到真实可恢复检查点；
6. ADR、ERR、审计证据和历史报告继续保留。
