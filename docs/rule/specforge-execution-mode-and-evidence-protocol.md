# SpecForge 执行模式与证据协议

> **性质**：执行与证据规则，不是产品规格。产品需求与架构权威归 Product Specification 与 Authority Registry。
>
> **生效**：自 2026-10-03（AR-DEC-05）起，SpecForge 的所有外部执行会话必须声明并遵守本协议。

## 1. 执行模式（两种且仅两种）

```text
CODEX_DIRECT
WORKBUDDY_COORDINATED
```

不存在第三种模式；任何其他执行形态（人工终端、匿名脚本、无 RUN_ID 会话）不得直接修改 SpecForge 仓库。

### 1.1 CODEX_DIRECT

Codex 同时负责规划、执行与验证；不把执行任务交给 WorkBuddy。适用于 Codex 可直接操作仓库终端的场景。

### 1.2 WORKBUDDY_COORDINATED

```text
Codex    = Planner / Auditor（规划者与独立审核者）
WorkBuddy = Executor / Evidence Producer（执行者与证据生产者）
用户     = 消息转交与产品决策（不执行终端操作）
```

硬性规则：

- WorkBuddy 的自述、摘要或报告**不能替代 Codex 独立审核**。审核必须基于 EVIDENCE_ROOT 中的原始证据。
- 每个阶段必须有 RUN_ID 与 EVIDENCE_ROOT；到达停点即停，不自行推进。

## 2. 新会话恢复链

任何新会话（无论模式）必须按此链恢复，不得凭记忆续接：

```text
AGENTS.md
→ project-session-bootstrap（只读）
→ REQUIRED_RULES（完整读取）
→ EXECUTION_MODE
→ EXECUTION_RUN_ID / EVIDENCE_ROOT
→ LAST_EXECUTION_CHECKPOINT
→ NEXT_LEGAL_ACTION
→ STOP_CONDITION
```

## 3. 模式切换

- **最新明确用户指令可以切换模式**；没有明确切换指令时，继承 `docs/project-status.md` 声明的当前模式。
- 模式**不得在阶段中途静默切换**。切换=新阶段边界，必须以新 RUN_ID 开始并在 journal 中记录切换事实与用户指令引用。

## 4. WORKBUDDY_COORDINATED 证据协议

### 4.1 证据目录结构

```text
<EVIDENCE_ROOT>/
  received-prompt.txt     # 收到的完整提示词原文（逐字）
  journal.jsonl           # 只追加：command_started / command_finished
  checkpoint.json         # 每步更新：进度、状态、停因、下一步
  change-plan.md          # 修改类阶段必备（仅读阶段可省略）
  commands/NNNN.command.txt / .stdout.txt / .stderr.txt / .result.json
  snapshots/              # 只读副本（不修改原文件）
  handoff.json            # 阶段结束的机器可读交接
  manifest.sha256         # 全部证据文件哈希清单（自校验一次）
  prior-push-report.txt   # （如适用）转交的历史操作报告
```

EVIDENCE_ROOT 一经创建不得删除或覆盖；冲突时返回 `EVIDENCE_DIRECTORY_COLLISION` 并停止。

### 4.2 命令四件套

每条命令记录 `command / cwd / purpose / 真实 UTC 时间 / carrier_exit_code / inner_exit_code / expected_writes / observed_writes`。

- **UTC 时间必须来自真实系统时钟**，不得手工估算。
- **inner_exit_code 必须是数字**。PowerShell 载体必须用 `$LASTEXITCODE`（`$?` 是布尔，禁止当退出码）。OpenCode 载体必须输出哨兵 `__INNER_EXIT_CODE=<数字>`。
- 载体退出码与内部退出码分开记录。
- 重试用新 seq，不覆盖失败记录。
- 每阶段最多一次执行载体替代。

### 4.3 观察者效应（observer effects）

载体或运行时自身产生的写入（OpenCode 会话存储、daemon observability 日志）必须列入 OBSERVER_EFFECTS，不得隐藏；并用前后 git status 证明仓库未被改动。

### 4.4 写入分类（四类，严格区分）

```text
TRUTH_SOURCE_WRITES        # .specforge/**、正式规格、治理状态（本协议下 WorkBuddy 阶段默认禁止）
REPOSITORY_TRACKED_WRITES  # 目标 Git 仓库内受版本控制的文件修改（受 change-plan 约束）
RUNTIME_OBSERVER_WRITES    # 载体/运行时自治日志（必须申报，不算仓库写入）
EXTERNAL_EVIDENCE_WRITES   # EVIDENCE_ROOT 内的证据产物（唯一默认允许）
```

任何报告必须按此四类归集实际写入，不得混计。

### 4.5 证据分级（六类）

```text
CONFIRMED          # 一手证据直接支持
CORROBORATED       # 多项独立证据共同支持，含有限推断
HYPOTHESIS         # 仅用于规划取证，不得作为结论
INSUFFICIENT_EVIDENCE # 证据不足以判断
AUTHORITY_CONFLICT # 权威文件与现实互相矛盾
RUNTIME_DEFECT     # 设计支持但实现未落实
```

### 4.6 一手证据排除清单

以下内容**禁止**当作对应事实的一手证据：

- Agent/助手的自述与摘要
- reason / comments 文本字段
- `exit=True`（或任何布尔哨兵）——必须是数字退出码
- 无 RUN_ID 的会话内操作叙述

### 4.7 自检与强制停点

- manifest.sha256 生成后必须自校验一次。
- 到达声明停点（READY_FOR_CODEX_REVIEW / BLOCKED / 规则A 等）立即停止并按指定格式返回；不得自行进入下一阶段。

## 5. Bootstrap 集成契约

`scripts/project-session-bootstrap.mjs` 必须：

1. 只接受 `PROJECT_STATUS_SCHEMA=2`。
2. 校验 `EXECUTION_MODE ∈ {CODEX_DIRECT, WORKBUDDY_COORDINATED}`。
3. 校验 EXECUTION_STATE / 三角色 / 协议路径 / RUN_ID / EVIDENCE_ROOT / 停点字段存在。
4. 输出全部执行模式字段与执行协议文件 SHA-256。
5. 协议文件缺失或字段不合法时 fail closed（BLOCKED）。
6. 保持只读。

## 6. 与既有规则的关系

- 本协议是 AGENTS.md 会话门禁的执行层细化；冲突时以 AGENTS.md 与活动规则的 fail-closed 原则为准。
- 经验规则的读取顺序（AR-DEC-06）：先完整读取当前活动规则 `docs/rule/specforge-active-development-rules.md`（新会话必须项）；历史账本 `docs/rule/specforge-development-error-ledger-and-experience.md` 只用于按任务关键词、涉及模块和适用 EXP 的定向检索与历史证据取证，不再要求全文读取。门禁输出增加 `ACTIVE_EXPERIENCE_RULES_FILE_READ=YES` 与 `HISTORICAL_LEDGER_SEARCH=<关键词及命中 EXP/ERR，或 NONE_WITH_JUSTIFICATION>`。
- 证据协议错误按经验账本 ERR/EXP 机制登记（见 A02 三项：局部读取冒充全文、游标误判、布尔退出码）。

## 7. 跨会话执行窗口与容量检查点（AR-DEC-06 补充，源自 P1-A02 实证）

以下规则由 P1-A02 的真实执行验证并经 Codex 全账本审计（journal 0033）固化：

### 7.1 SESSION_ID 与 EXECUTION_ATTEMPT_ID

- SESSION_ID 是可能跨多个对话持续存在的环境标识，**不能**作为"是否为新对话"的判断依据。
- 每次实际执行使用唯一 EXECUTION_ATTEMPT_ID；同一 RUN_ID 下的每个新对话窗口必须取得新的 Attempt ID，禁止写"XX continuing"。
- RUN_ID 表示一个阶段；ATTEMPT_ID 表示该阶段内的一次执行窗口。

### 7.2 容量检查点

- 正常上下文容量耗尽不是业务 BLOCKED。必须记录：

```text
STATUS=IN_PROGRESS_CAPACITY_CHECKPOINT
STOP_REASON=CONTEXT_CAPACITY_NORMAL
```

- 每个容量检查点必须生成可复制的恢复胶囊（RESUME_CAPSULE），含：RUN_ID、EVIDENCE_ROOT、恢复前固定哈希核验集（checkpoint/journal/receipts/coverage/Git 状态）、当前覆盖、下一未执行步骤与下一 Attempt ID。
- 普通容量检查点允许在新对话凭胶囊继续，不需要逐窗口等待 Codex 审批。

### 7.3 Receipt 封存纪律

- 未封存 receipt 的读取或动作不得计入已验证覆盖；覆盖仅由已封存 receipt 建立。
- receipt 应在每块工作完成后**立即封存**（含完整 64 位首尾行哈希），不能等到整个对话结束。
- 恢复时先校验固定哈希、Git 状态、checkpoint 和下一未执行步骤，任一不一致即 HARD_STOP 并返回 BASELINE_DRIFT。

### 7.4 强制返回 Codex/用户的条件（穷尽列举）

只有以下情形强制返回，不得在普通容量检查点滞留等待：

1. 真实 HardStop；
2. 权威冲突（AUTHORITY_CONFLICT）；
3. 基线漂移（哈希或 Git 状态不一致）；
4. 意外仓库写入；
5. 破坏性动作需求；
6. 测试失败需要归因；
7. 必须由用户裁决的事项；
8. 阶段完成到达声明停点。

### 7.5 审核边界

- WorkBuddy 自述仍不能替代 Codex 对最终 diff、测试和证据的独立审核；本节只解除逐容量窗口的人工审批，不解除阶段终点的独立审核。
