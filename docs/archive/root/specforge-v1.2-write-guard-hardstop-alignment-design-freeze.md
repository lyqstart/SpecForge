# SpecForge v1.2 Write Guard / hard_stop 职责边界整改设计冻结稿

> 版本：v0.1  
> 目标：一次性整改 Write Guard、Path Policy、hard_stop、native Write shadow、sf_safe_bash、changed_files_audit、state_transition、close_gate 的职责边界，停止继续局部 fix14/fix15 式补丁。  
> 适用分支：`fix/v1.2-write-guard-post-merge-live-fix` 基础上新建治理分支。  
> 建议新分支：`hardening/v1.2-write-guard-hardstop-alignment`

---

## 1. 设计结论

当前问题不是单点 bug，而是运行控制职责分散：

```text
OpenCode plugin
native Write/Edit/ApplyPatch shadow
sf_safe_bash
StateManager
code_permission
Write Guard
hard_stop
changed_files_audit
state_transition
close_gate
```

这些模块现在各自有一部分判断逻辑，导致同一件事在不同入口得到不同结果。

最终整改目标：

```text
1. plugin 只做薄客户端；
2. daemon-core 承担统一写入裁决；
3. Path Policy 单独成为唯一路径分类来源；
4. hard_stop 默认 WI 级，project 级必须显式且稀有；
5. 空 work_item_id 永不持久化 hard_stop；
6. recovery 工具不能被 hard_stop 死锁；
7. native Write/Edit/ApplyPatch 与 sf_safe_bash 走同一裁决链；
8. changed_files_audit 消费统一事实源；
9. state_transition 在 implementation_done 前强制消费 audit；
10. close_gate 只做最终确认。
```

---

## 2. 不再继续局部补丁的原因

fix09 至 fix13 说明当前系统问题具有“入口转移”特征：

```text
fix09：挡住 native Write 未授权，但授权写也被误挡；
fix10：尝试放行授权写，但 active WI 解析错；
fix11：修 active WI，但暴露 hard_stop 污染；
fix12：修 empty work_item_id non-persistent，但 reports 写入被挡；
fix13：修 reports path，但暴露 hard_stop 全局死锁。
```

这说明补丁没有解决统一控制面问题。继续 fix14/fix15 只会继续扩大 plugin 中的特殊判断。

---

## 3. 当前架构问题

### 3.1 plugin 过重

当前 `setup/userlevel-opencode/plugins/sf_specforge.ts` 同时处理：

```text
1. native Write/Edit/ApplyPatch shadow；
2. hard_stop 读写；
3. active WI 推断；
4. report path 例外；
5. protected .specforge path 判断；
6. shell write 判断；
7. local allowlist fallback；
8. daemon fallback；
9. governance bypass 检测；
10. code permission 相关判断。
```

这使 plugin 事实上变成第二套 Runtime。

### 3.2 hard_stop 作用域不清

真实 live 暴露：

```text
WI-0001 触发 hard_stop 后，WI-0002 即使进入 implementation_running 且 code_permission 有效，也被 WI-0001 的 hard_stop 阻塞。
```

这是全局死锁，不符合 WI 事务边界。

### 3.3 Path Policy 分散

`.specforge/reports/**`、`.specforge/project/**`、业务文件、runtime 文件的规则分散在 plugin、safe_bash、audit、close_gate 中。

### 3.4 changed_files_audit 与 Write Guard 事实源不统一

审计必须基于统一事实源：

```text
write_guard_log
filesystem diff
code_permission release snapshot
allowed_write_files snapshot
blocked_write_attempts
```

不能依赖 Agent 报告或 debug fallback。

---

## 4. 目标职责边界

### 4.1 plugin 职责

plugin 只保留：

```text
1. 注册 OpenCode plugin；
2. shadow native Write/Edit/ApplyPatch；
3. 解析工具调用参数；
4. 抽取 targetPaths / command / cwd / toolName；
5. 调 daemon-core WritePolicyService；
6. 按 daemon 返回 allow/block 执行或拒绝。
```

plugin 不再保留：

```text
hard_stop 持久化
hard_stop 查询
Path Policy 判断
active WI fallback 决策
local allowlist fallback
report path 特例决策
project path 特例决策
```

### 4.2 daemon-core 职责

daemon-core 负责所有运行控制决策：

```text
StateManager
code_permission_service
PathPolicy
HardStopStore
WritePolicyService
write_guard_log
changed_files_audit
state_transition 前置约束
close_gate 最终确认
```

---

## 5. 新增 / 收敛模块设计

### 5.1 PathPolicyService

文件建议：

```text
packages/daemon-core/src/tools/lib/path-policy-v12.ts
```

路径分类：

```text
business_file:
  src/**
  app/**
  packages/**
  docs/**
  需要 implementation_running + code_permission + allowed_write_files

spec_project_file:
  .specforge/project/**
  只能 merge_runner 写

runtime_file:
  .specforge/runtime/**
  只能 runtime 内部写

work_item_artifact:
  .specforge/work-items/**
  只能 runtime / artifact_write 写

report_file:
  .specforge/reports/**
  允许报告输出，不要求 code_permission

archive_file:
  .specforge/archive/**
  允许 runtime / agent_run 输出
```

核心接口：

```ts
export type PathCategory =
  | "business_file"
  | "spec_project_file"
  | "runtime_file"
  | "work_item_artifact"
  | "report_file"
  | "archive_file"
  | "unknown";

export interface PathPolicyDecision {
  path: string;
  normalizedPath: string;
  category: PathCategory;
  requiresCodePermission: boolean;
  allowedWriters: string[];
  protected: boolean;
}

export function classifyPath(projectDir: string, path: string): PathPolicyDecision;
```

### 5.2 HardStopStore

文件建议：

```text
packages/daemon-core/src/tools/lib/hard-stop-store-v12.ts
```

数据模型：

```ts
export type HardStopScope = "work_item" | "project";

export interface HardStopRecord {
  hard_stop_id: string;
  scope: HardStopScope;
  work_item_id?: string;
  reason: string;
  source_tool: string;
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
  allowed_recovery_tools: string[];
}
```

规则：

```text
1. 普通写入违规产生 work_item scope hard_stop；
2. project scope 只用于 runtime 状态损坏、StateManager 不可信等项目级灾难；
3. empty / invalid work_item_id 永不 persist；
4. unrelated WI 的 hard_stop 不能阻塞当前 WI；
5. recovery 工具不被 hard_stop 死锁。
```

### 5.3 WritePolicyService

文件建议：

```text
packages/daemon-core/src/tools/lib/write-policy-service-v12.ts
```

统一入口：

```ts
export interface WritePolicyRequest {
  projectDir: string;
  workItemId?: string;
  toolName: string;
  actorRole?: string;
  operation: "write" | "edit" | "delete" | "move" | "shell" | "report_output";
  targetPaths: string[];
  command?: string;
  cwd?: string;
  source: "native_write" | "native_edit" | "native_apply_patch" | "sf_safe_bash" | "tool_wrapper";
  callId?: string;
}

export interface WritePolicyResult {
  allowed: boolean;
  retryable: boolean;
  reason: string;
  violationType?: string;
  hardStop: boolean;
  hardStopScope?: "work_item" | "project";
  persistHardStop: boolean;
  targetPaths: string[];
  pathDecisions: PathPolicyDecision[];
  writeGuardLogEntry: unknown;
}

export async function evaluateWritePolicy(req: WritePolicyRequest): Promise<WritePolicyResult>;
```

裁决规则：

```text
1. invalid work_item_id：block + retryable/non-persistent，never hard_stop persist；
2. report_file：allow，不要求 code_permission，但禁止混入 project/runtime/work-items；
3. spec_project_file：只允许 merge_runner；
4. runtime_file：只允许 runtime 内部；
5. business_file：必须 implementation_running + code_permission + allowed_write_files；
6. out-of-scope：block 或记录 blocked_write_attempt；
7. current WI hard_stop active：block 当前 WI；
8. unrelated WI hard_stop：不影响当前 WI；
9. project hard_stop active：全局 block，但 recovery tools 允许。
```

### 5.4 write_guard_log

文件建议：

```text
packages/daemon-core/src/tools/lib/write-guard-log-v12.ts
```

所有写入裁决必须写入：

```text
allowed_business_write
blocked_business_write
report_output_write
protected_project_write_blocked
runtime_write_blocked
invalid_work_item_non_persistent
hard_stop_created
hard_stop_resolved
```

---

## 6. 工具入口改造

### 6.1 sf_safe_bash

目标文件：

```text
packages/daemon-core/src/tools/handlers/sf-safe-bash.ts
```

改造：

```text
1. 从 command 抽取写目标；
2. 调 WritePolicyService；
3. allowed 才执行；
4. blocked 则返回结构化错误；
5. 不再自己判断 hard_stop / path / permission。
```

### 6.2 native Write/Edit/ApplyPatch shadow

目标文件：

```text
setup/userlevel-opencode/plugins/sf_specforge.ts
```

改造：

```text
1. native tool wrapper 只提取参数；
2. 调 daemon WritePolicyService；
3. allowed 才调用实际文件写入；
4. blocked 返回 daemon 的 reason；
5. 删除本地 fallback allowlist。
```

### 6.3 sf_state_transition

目标文件：

```text
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
```

改造：

```text
1. 读取当前 WI scope hard_stop；
2. unrelated WI hard_stop 不阻塞；
3. recovery transition 或 resolve transition 允许；
4. implementation_running -> implementation_done 前强制 audit passed。
```

### 6.4 sf_code_permission

目标：

```text
1. enable/revoke/query 必须基于明确 WI；
2. revoke/query 作为 recovery 类工具，不能被同 WI hard_stop 死锁；
3. enable 在 hard_stop 下是否允许，由 HardStopStore 明确规则控制。
```

### 6.5 changed_files_audit

目标：

```text
1. 读取 write_guard_log；
2. 区分 business file / report file / runtime artifact；
3. report_file 不计入 out_of_scope；
4. protected project write blocked 必须导致 audit failed；
5. blocked_write_attempts 必须进入 audit 输出。
```

### 6.6 close_gate

目标：

```text
1. 只做最终一致性确认；
2. 检查 unresolved hard_stop；
3. 检查 audit passed；
4. 检查 code_permission revoked；
5. 不再承担前置治理职责。
```

---

## 7. 删除 / 迁移清单

从 `sf_specforge.ts` 迁出或删除：

```text
persistHardStop
maybePersistHardStopFromGuardResult
assertNoRelevantHardStop
findAnyValidHardStopRecord
readHardStopRecord
localNativeWriteAllowDecision
candidateNativeWriteWorkItems
isSpecForgeReportsShellWriteAllowed
isSpecForgeReportsOutputTarget
isProtectedSpecForgeNonReportPathText
```

保留：

```text
OpenCode plugin setup
native tool registration
parameter extraction
request dispatch to daemon
error formatting
```

---

## 8. 测试设计

### 8.1 单元测试

新增：

```text
packages/daemon-core/tests/v12-path-policy-regression.test.ts
packages/daemon-core/tests/v12-hardstop-scope-regression.test.ts
packages/daemon-core/tests/v12-write-policy-service-regression.test.ts
```

覆盖：

```text
reports path allowed
project path blocked
runtime path blocked
business path requires permission
empty WI non-persistent
WI-A hard_stop does not block WI-B
project hard_stop blocks all non-recovery tools
recovery tools allowed
```

### 8.2 集成测试

新增：

```text
packages/daemon-core/tests/v12-write-guard-hardstop-alignment.integration.test.ts
```

核心场景：

```text
WI-0001 unauthorized write -> WI-scoped hard_stop
WI-0002 implementation_running + code_permission -> allowed write succeeds
WI-0001 remains blocked
WI-0002 audit passed -> implementation_done -> verification_done -> close_gate -> closed
```

### 8.3 保留并扩展现有测试

必须继续通过：

```text
v12-write-guard-control-plane-hardening.test.ts
v12-empty-wi-hardstop-regression.test.ts
v12-report-path-write-guard-regression.test.ts
v11-install-deployment-consistency.test.ts
```

---

## 9. Live acceptance 最终场景

clean live 目录中必须跑：

```text
1. empty work_item_id 不持久化 hard_stop；
2. .specforge/reports/** 可写；
3. .specforge/project/** 不可写；
4. native Write 未授权 blocked；
5. native Write 授权 allowed 并 closed；
6. native Write out-of-scope blocked 或 audit failed；
7. WI-A hard_stop 不影响 WI-B；
8. recovery 工具不死锁。
```

最终报告：

```text
.specforge/reports/specforge-v1.2-write-guard-hardstop-alignment-final-live-acceptance-report.md
```

结论只能是：

```text
ALIGNMENT_LIVE_ACCEPTANCE_PASSED
ALIGNMENT_LIVE_ACCEPTANCE_FAILED
```

---

## 10. 实施分支与提交策略

分支：

```text
hardening/v1.2-write-guard-hardstop-alignment
```

提交顺序：

```text
1. docs: design freeze
2. refactor: add path policy and hardstop store
3. refactor: add write policy service
4. refactor: thin plugin native write shadow
5. refactor: route sf_safe_bash through write policy
6. refactor: align state_transition/code_permission/audit/close_gate
7. test: add hardstop scope/write policy/path policy regression
8. docs: validation report
```

必须遵守：

```text
每次替换即 WIP commit/push；
失败也提交 failed snapshot；
技术验证通过后再 live；
live 通过才 merge main/tag。
```

---

## 11. 明确禁止事项

```text
1. 禁止继续在 sf_specforge.ts 里堆特殊 if；
2. 禁止 hard_stop 默认 project scope；
3. 禁止 empty work_item_id 写任何 hard_stop 文件；
4. 禁止 changed_files_audit 依赖 Agent 报告；
5. 禁止 close_gate 承担前置 Write Guard 职责；
6. 禁止 live acceptance 访问 D:\code\temp\SpecForge 仓库源码；
7. 禁止没有 clean live 通过就 tag stable。
```

---

## 12. 设计冻结结论

本次整改不是新增标准，而是把既有标准中的 Runtime、Path Policy、Write Guard、code_permission、hard_stop、changed_files_audit、close_gate 职责重新收敛到正确位置。

核心动作：

```text
plugin 变薄；
daemon-core 统一裁决；
hard_stop 作用域化；
Path Policy 单源化；
Audit 事实源化；
State Machine 前置约束化；
Live acceptance 自动化。
```

完成后，SpecForge 才能避免继续出现“补一个入口、另一个入口炸”的问题。
