# SpecForge Agent MD 融合设计清单 v0.1

> 本清单只做映射设计，不修改 Agent MD，不修改 gate。目标是先明确：`docs/specforge-governance-model.md` 中“依据、承接、验证、融合”四问，应该落到哪些现有 Agent / Skill / Gate 文件中，以及如何融入原文件现有章节。

## 1. 总原则

### 1.1 不新增孤儿角色

当前仓库已有 `setup/userlevel-opencode/agents` 下的角色文件，包括 `_AGENT_BASE.md`、`sf-orchestrator.md`、`sf-requirements.md`、`sf-design.md`、`sf-task-planner.md`、`sf-executor.md`、`sf-reviewer.md`、`sf-verifier.md`、`sf-investigator.md`、`sf-evidence-collector.md` 等。当前阶段不新增 `sf-intake-analyst.md`，除非后续同步修改 workflow / orchestrator 调度 / gate。

### 1.2 不尾部追加，不压缩覆盖

Agent MD 融合方式必须是：

1. 保留原有 v1.1 governance contract；
2. 保留原有角色边界、Candidate / Merge / Trace / Extension 规则；
3. 把“依据、承接、验证、融合”插入到原文件对应章节；
4. 不在尾部另起一套规则；
5. 不用短文件覆盖长文件。

### 1.3 四问模型

每个角色只回答和自己职责相关的四个问题：

| 四问 | 含义 | 不做什么 |
|---|---|---|
| 依据 | 我凭什么这么判断 | 不用“合理猜测”替代事实 |
| 承接 | 我有没有接住上游责任项 | 不覆盖上游所有文字，只承接责任项和约束项 |
| 验证 | 我的产物如何证明有效 | 不用文件存在/编译通过冒充用户目标完成 |
| 融合 | 我的产物如何交给下游或项目级真相源 | 不让 WI 产物成为孤岛 |

## 2. 文件级映射

## 2.1 `_AGENT_BASE.md`

### 当前职责

所有 Agent 的共同底线规则、执行流程、代码硬规则、治理契约。

### 应融合的规则

只放最小共同原则：

- 依据：所有重要判断必须说明依据类型；
- 承接：下游不得静默丢弃上游责任项；
- 验证：不能把文件存在、构建成功、报告非空等价为用户目标完成；
- 融合：WI 产物必须说明交给下游或项目级真相源的方式。

### 建议插入位置

放在原有 `SpecForge v1.1 Final Governance Contract` 后、通用执行流程前。

### 不应写入

- 不写每个角色的详细模板；
- 不写复杂 evidence schema；
- 不写 workflow 特定规则。

---

## 2.2 `sf-orchestrator.md`

### 当前职责

主编排 Agent：项目管理、用户沟通、意图判断、workflow 选择、阶段推进、调度子 Agent、调用 gate、记录用户决策。

### 应融合的规则

- 依据：不得自行把 unknown 清零；不得把猜测写成用户决策；
- 承接：调度下游前检查上游产物是否存在且处于可用状态；
- 验证：gate blocked 时不得推进状态；
- 融合：在 merge/close 前确认本 WI 是否声明项目级影响类型。

### 建议插入位置

1. 在 `Role` 中明确：orchestrator 是“流程编排者 + 用户接口 + 状态守门人”，不是内容审计者；
2. 在 `核心行为约束` 中增加：不得替专业 Agent 做内容判断；
3. 在 workflow 阶段推进规则中增加：gate blocked 必须停。

### 不应写入

- 不让 orchestrator 写 requirements/design/tasks；
- 不让 orchestrator 做语义审计；
- 不让 orchestrator 代替 verifier 判定用户目标完成。

---

## 2.3 `sf-intake/SKILL.md`

### 当前职责

intake 阶段提问脚本：项目初始化验证、需求收集、首次 WI 技术栈决策收集。

### 应融合的规则

- 依据：把用户原话、明确事实、未知项、禁止假设记录进 intake；
- 承接：把用户目标拆成可供 requirements 承接的 `user_outcomes`；
- 验证：标明哪些目标需要后续 required evidence；
- 融合：说明 intake 产物只进入当前 WI，不直接写项目级规格。

### 建议插入位置

1. 在 `B1 收集用户需求` 后新增“B1.1 Intake 四问整理”；
2. 在 10 个维度之后新增“必须输出的 intake 结构”。

### 不应写入

- 不新增 agent 文件；
- 不让 intake 做设计；
- 不让 intake 选择技术实现。

---

## 2.4 `sf-requirements.md`

### 当前职责

需求分析 Agent：基于 intake.md 生成 requirements.md；不看技术栈；不读 host-profile/prod-environment；需求描述“做什么”。

### 应融合的规则

- 依据：每条 Must REQ 必须引用 intake 中的用户事实或用户目标；
- 承接：requirements 必须覆盖 intake 的用户结果、关键未知项、禁止假设；
- 验证：每条 Must REQ 必须写 Required Evidence 和 Not Done When；
- 融合：requirements candidate 必须继续遵守 candidates/** 和 trace_delta 规则。

### 建议插入位置

1. 在 `需求澄清` 后加入“依据与用户目标承接”；
2. 在 `需求精确化` 中加入 Required Evidence / Not Done When；
3. 在 Required Output 的 requirements 模板中增加字段，而不是另起模板。

### 不应写入

- 不让 requirements 选择技术方案；
- 不让 requirements 判断服务器接口如何实现；
- 不让 requirements 读技术环境文件。

---

## 2.5 `sf-design.md`

### 当前职责

设计 Agent：基于 requirements.md、host-profile、prod-environment、project-rules 做架构、接口、数据模型和测试策略。

### 应融合的规则

- 依据：每个 DD 必须说明 decision_basis；
- 承接：每个 Must REQ 必须被设计处理，状态为 covered / blocked / out_of_scope_with_reason；
- 验证：每个跨系统边界必须给出 verification hook；
- 融合：设计变更必须声明是否影响 architecture/design_index/decisions/trace。

### 建议插入位置

1. 在“读取配置文件”后加入“当前实现理解要求”；
2. 在“设计硬规则 DD1-DD6”中融合：DD 必须引用 REQ + basis；
3. 在 Assumptions 段明确 unknown 不能当 fact；
4. 在 Required Output 的 design 模板中加入 Requirements Coverage。

### 不应写入

- 不写任务步骤；
- 不指定 executor 操作命令；
- 不把验证报告写在 design。

---

## 2.6 `sf-task-planner.md`

### 当前职责

任务规划 Agent：基于 design.md 拆成可由 executor 执行的 tasks.md；已有 context_block、verification_commands、DD 引用等规则。

### 应融合的规则

- 依据：每个 task 的 context_block 必须包含 Basis；
- 承接：每个 DD/设计责任项必须有 task 或 blocked 理由；
- 验证：Done When 拆成 Code / Behavior / Evidence；
- 融合：tasks.md 必须继续生成 trace_delta，使 verifier/reviewer 能追踪 REQ/DD/TASK/EVIDENCE。

### 建议插入位置

1. 在 T2 `上下文充分原则` 中扩展 context_block；
2. 在 Step 3 预检中增加“是否拿到 current implementation context”；
3. 在 Required Output 的 TASK 示例中加入 Basis、Done When Evidence、Not Done When。

### 不应写入

- 不让 task-planner 自己执行代码调查命令；
- 不让 task-planner 编写代码；
- 不让它凭空补 design 缺失内容，应 blocked/退回。

---

## 2.7 `sf-investigator.md`

### 当前职责

调查诊断 Agent：复现问题、根因分析、日志分析、证据收集、输出 investigation_report。

### 应融合的规则

- 依据：负责产生 CODE_OBSERVED / RUNTIME_OBSERVED / ENV_OBSERVED；
- 承接：处理 intake/design/task 中的 unknown；
- 验证：调查报告必须列出可复现命令、输出、结论依据；
- 融合：调查结论可作为 design/task 的依据，但不直接修改规格。

### 建议插入位置

在 Responsibilities 中增加“当前实现快照”和“未知项调查”。

### 不应写入

- 不让 investigator 修代码；
- 不让 investigator 替用户做需求决策。

---

## 2.8 `sf-executor.md`

### 当前职责

执行 Agent：接收单个 task，修改授权文件，跑 verification_command，报告结果。已有最小代码、真测试、allowed_write_files、changed_files_audit 等强规则。

### 应融合的规则

- 依据：执行前确认 task basis 与当前代码不冲突；
- 承接：只承接当前 task，不扩展 WI 范围；
- 验证：success 必须同时满足 Done When Code / Behavior / Evidence；
- 融合：输出 evidence 给 reviewer/verifier，不写治理产物。

### 建议插入位置

1. 在执行流程 Step 1 增加 Task Contract 预检；
2. 在成功报告 JSON 中加入 done_when 和 evidence_produced；
3. 在失败报告中加入 basis_conflict / design_conflict。

### 不应写入

- 不让 executor 宣称 WI 完成；
- 不让 executor 修改 tasks/design/requirements；
- 不让 executor 用框架文件存在当 success。

---

## 2.9 `sf-reviewer.md`

### 当前职责

审查 Agent：规格审查 + 代码审查；已有功能正确性、覆盖度、质量、安全、性能、可维护性和 evidence-based finding。

### 应融合的规则

- 依据：每个 blocking finding 必须有代码/规格/测试证据；
- 承接：审查实现是否覆盖 REQ/DD/TASK 责任项；
- 验证：识别 framework-only、mock-only、silent failure、未接线；
- 融合：审查 project integration effect 是否缺失或不合理。

### 建议插入位置

1. 在“维度 2：需求覆盖度”中扩展为“规格责任覆盖度”；
2. 在 Evidence-Based Review Findings 中加入 framework-only finding；
3. 在 Required Output 的 traceability 中加入 design/task coverage。

### 不应写入

- 不让 reviewer 修改代码；
- 不让 reviewer 代替 verifier 运行完整验收。

---

## 2.10 `sf-evidence-collector.md`

### 当前职责

证据收集 Agent：收集命令输出、测试结果、文件变更记录，生成 evidence_manifest.json。

### 应融合的规则

- 依据：每条 evidence 标明来源命令、执行环境、原始输出；
- 承接：每条 evidence 必须支持某个 TASK/REQ/AC；
- 验证：只收集，不判定 pass/fail；
- 融合：evidence_manifest 为 verifier/close_gate 输入。

### 建议插入位置

在“组织证据结构”中扩展 evidence_manifest 字段：supports、level、command、observed、blocking。

### 不应写入

- 不让 evidence-collector 做通过/失败判断；
- 不让它补写未执行命令。

---

## 2.11 `sf-verifier.md`

### 当前职责

验证 Agent：只读验证，运行测试、验收、冒烟、回归；已有 L1-L10 测试矩阵和未执行层级 blocked 规则。

### 应融合的规则

- 依据：verification_report 只能来自实际执行结果；
- 承接：必须覆盖 required evidence，而不是只覆盖测试层级；
- 验证：判断 evidence 是否足以证明用户目标；
- 融合：verification_report 为 close_gate 的用户目标完成输入。

### 建议插入位置

1. 在“测试矩阵”后加入 Required Evidence Coverage；
2. 在报告 JSON 中加入 outcomes、required_evidence、missing_evidence；
3. 保留 L1-L10，但增加“测试层级不等于用户目标证明”。

### 不应写入

- 不让 verifier 修改代码；
- 不让 verifier 用 report 非空等价 PASS。

---

## 2.12 `sf-workflow-feature-spec/SKILL.md`

### 当前职责

feature_spec workflow skill，串联 requirements/design/tasks/gates/approval/merge/implementation/verification/close。

### 应融合的规则

- 依据：candidate 阶段必须有来源依据；
- 承接：每阶段 handoff 必须说明上游责任项如何交给下游；
- 验证：verification 阶段必须验证 required evidence；
- 融合：merge 阶段必须声明 project integration effect。

### 建议插入位置

在各阶段 handoff 中加入四问检查，不改变状态机。

### 不应写入

- 不在 workflow skill 里展开所有角色细节；
- 不绕过 TypeScript gate。

---

## 2.13 `close-gate.ts`

### 当前职责

最终 close gate：检查 authoritative state、必备文件、verification_report、evidence、approval、code_permission、changed_files_audit 等。

### 应融合的规则

- 依据：检查报告中是否存在 unresolved unknown / assumption as fact；
- 承接：检查 Must REQ / required evidence 是否有覆盖摘要；
- 验证：检查 verification_report 是否声明 missing blocking evidence；
- 融合：检查 merge_report / candidate_manifest 是否声明 project integration effect。

### 建议插入位置

先不改代码。后续 Package 3 才做。

### 不应写入

- 不让 close_gate 理解所有业务细节；
- 不做复杂自然语言判断；
- 只检查结构化字段和明确缺口。

## 3. 修改优先级

### 第一批：Agent MD 融合

1. `_AGENT_BASE.md`
2. `sf-intake/SKILL.md`
3. `sf-requirements.md`
4. `sf-design.md`
5. `sf-task-planner.md`
6. `sf-executor.md`
7. `sf-reviewer.md`
8. `sf-verifier.md`

### 第二批：辅助角色

1. `sf-investigator.md`
2. `sf-evidence-collector.md`
3. `sf-debugger.md`
4. `sf-knowledge.md`
5. `sf-extension.md`

### 第三批：workflow / gate

1. `sf-workflow-feature-spec/SKILL.md`
2. 其他 workflow skill
3. TypeScript gate / close gate

## 4. 不做的事

本清单阶段不做：

1. 不新增 `sf-intake-analyst.md`；
2. 不修改 gate 代码；
3. 不生成完整 Agent MD 替换包；
4. 不修改 workflow JSON；
5. 不引入复杂 obligation 状态机。

