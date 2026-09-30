# SpecForge v1.2 Write Guard / hard_stop 职责边界整改影响分析与实施计划 v0.1

> 状态：设计/影响分析稿，不包含代码修改。  
> 适用分支：`fix/v1.2-write-guard-post-merge-live-fix` 当前 hotfix 链路之后。  
> 目标：停止继续以 `fix14/fix15/...` 局部补丁方式修补，先把 Write Guard、Path Policy、hard_stop、code_permission、State Machine、changed_files_audit、close_gate 的职责边界收敛清楚，再一次性实施。

---

## 1. 当前结论

当前反复出错，不是因为某一个 if 判断漏了，而是因为 **运行时控制职责分散**。

现在同一件事“是否允许写文件”同时被多个地方判断：

```text
OpenCode plugin
sf_safe_bash
native Write/Edit/ApplyPatch shadow wrapper
daemon-core write guard
code_permission_service
changed_files_audit
state_transition
close_gate
hard_stop runtime latch
```

这些地方没有一个统一的裁决入口，导致：

```text
修 native Write 绕过 → 授权写又被误挡；
修授权写误挡 → active WI 解析错误；
修 active WI → hard_stop 污染；
修空 WI hard_stop → reports 路径被挡；
修 reports 路径 → hard_stop 全局死锁暴露。
```

因此，本次整改目标不是继续追加小补丁，而是：

```text
把散落在 plugin、safe_bash、native shadow、audit、state_transition、close_gate 中的写入控制逻辑，收敛到 daemon-core 的统一 Write/Path/hard_stop 裁决链。
```

---

## 2. 设计标准中的既有职责

本整改不新增一个脱离标准的新架构。它基于已有 SpecForge 标准中的职责：

| 标准职责 | 应承担的事情 | 当前问题 |
|---|---|---|
| Runtime / StateManager | 维护唯一状态事实源 | 状态源已收敛，但运行控制状态仍散落 |
| State Machine | 控制合法状态流转 | hard_stop 在状态机之外形成全局阻断 |
| Path Policy | 判断路径类别和写入权限 | 路径规则散落在 plugin / safe_bash / audit |
| code_permission_service | 管理 allowed_write_files | native Write / sf_safe_bash 使用方式不一致 |
| Write Guard | 所有写入入口的前置控制 | 入口不统一，部分在 plugin，部分在 daemon |
| changed_files_audit | 审计实际写入是否越权 | 依赖 fallback / debug_hint 的情况仍存在 |
| close_gate | 最终收口验收 | 不能承担前面所有控制兜底 |
| hard_stop | 阻断严重治理违规 | 当前作用域不清，形成全局死锁 |

所以本任务更准确的名称是：

```text
v1.2 Write Guard / Path Policy / hard_stop 职责边界整改
```

不建议命名为“新增 Runtime Policy Control Plane”，避免偏离已有标准术语。

---

## 3. 已暴露的真实问题

### 3.1 native Write 绕过 Write Guard

早期 live acceptance 证明 OpenCode 原生 Write 工具可以绕过 SpecForge Write Guard。后续 fix09/fix10/fix11 尝试通过同名 plugin tool shadow native Write/Edit/ApplyPatch 修复。

问题：shadow 后又出现授权误挡、active WI 解析错误、hard_stop 污染。

结论：native Write 拦截不能靠 plugin 局部规则堆叠，必须统一进入 daemon-core 裁决。

---

### 3.2 空 work_item_id 曾持久化 project-level hard_stop

已通过 fix12 修复为非持久化行为。正确规则应固定为：

```text
work_item_id="" / invalid / retryable：
- 拒绝本次工具调用；
- 记录 diagnostic event；
- 不写 project-level hard_stop；
- 不污染 runtime hard_stop 状态；
- 不影响后续合法 WI。
```

---

### 3.3 reports path 写入曾被误挡

已通过 fix13 技术验证。正确规则应固定为：

```text
.specforge/reports/**：
- 属于治理报告输出；
- 不要求 code_permission；
- 可由受控报告输出工具写；
- 不计入业务 changed_files_audit 违规；
- 但不能因此放开 .specforge/project/** 或 .specforge/runtime/**。
```

---

### 3.4 hard_stop 全局死锁

最终 live acceptance 暴露：WI-0001 触发 hard_stop 后，WI-0002 即使进入 `implementation_running` 并具有 `code_permission`，仍被 WI-0001 的 hard_stop 全局阻塞。

表现：

```text
WI-0001 unauthorized write → hard_stop
WI-0002 implementation_running + code_permission active
WI-0002 sf_safe_bash 被 WI-0001 hard_stop 阻塞
WI-0002 sf_state_transition 被阻塞
WI-0002 sf_code_permission 被阻塞
系统进入无法恢复的死锁
```

这是当前最关键的阻断缺陷。

正确规则：

```text
WI 级 hard_stop 只阻断同一个 WI；
project 级 hard_stop 只能用于项目级灾难；
recovery/debug/read/resolve 工具不能被无差别阻断；
WI-A hard_stop 不得影响 WI-B 合法执行。
```

---

## 4. 当前代码职责问题

### 4.1 plugin 层过重

`setup/userlevel-opencode/plugins/sf_specforge.ts` 当前承担了大量核心治理职责：

```text
native Write/Edit/ApplyPatch shadow
hard_stop 持久化
hard_stop 查询
active WI fallback
candidate WI 推断
reports path 例外
protected path 判断
native write local allowlist fallback
shell write heuristic
```

这导致 plugin 成为第二套 Runtime。

目标：plugin 降级为薄客户端。

plugin 只保留：

```text
1. 注册 OpenCode plugin；
2. shadow native Write/Edit/ApplyPatch；
3. 抽取 toolName / args / targetPaths / command / cwd；
4. 调用 daemon-core 统一裁决；
5. 按裁决结果 allow / block。
```

plugin 应移除或迁移：

```text
hard_stop 持久化
hard_stop 查询
Path Policy 判断
code_permission 判断
active WI fallback
reports/project/runtime 路径例外
local allowlist fallback
```

---

### 4.2 daemon-core 裁决入口不足

当前 daemon-core 已有 `write-guard-runtime-v12.ts`、`code-permission-service-v11.ts`、`changed-files-audit.ts`、`close-gate.ts` 等能力，但缺少一个统一入口来回答：

```text
这个工具、这个 WI、这个状态、这个路径、这个 actor，现在是否允许写？
```

目标：新增/收敛一个统一服务。

建议名称：

```text
WritePolicyService
```

注意：这是实现层服务名，不是设计标准新术语。

---

### 4.3 hard_stop 存储和作用域不清

当前 hard_stop 有多种形式：

```text
plugin 内存/本地判断
.specforge/work-items/<WI>/hard_stop.json
.specforge/runtime/hard_stops.jsonl
工具返回 hard_stop=true
StateManager 事件里的 hard_stop 信息
```

目标：hard_stop 必须统一成明确模型：

```text
scope = work_item | project
work_item_id = required when scope=work_item
project scope = only explicit project-level disaster
invalid WI = non-persistent diagnostic only
```

---

## 5. 目标架构

### 5.1 统一写入裁决链

所有写入口统一走：

```text
Tool call / Native Write / sf_safe_bash
  ↓
plugin thin adapter
  ↓
daemon-core WritePolicyService.evaluateWritePolicy()
  ↓
PathPolicy.classify()
  ↓
StateManager + code_permission + hard_stop scope + actor role
  ↓
allow / block / retryable / non-persistent / hard_stop scoped
  ↓
write_guard_log
  ↓
actual tool execution or rejection
```

---

### 5.2 WritePolicyService 接口草案

```ts
export interface WritePolicyInput {
  projectRoot: string;
  workItemId?: string;
  toolName: string;
  actorRole?: string;
  operation: 'create' | 'modify' | 'delete' | 'shell_write' | 'unknown';
  targetPaths: string[];
  command?: string;
  cwd?: string;
  source: 'native_write' | 'native_edit' | 'native_apply_patch' | 'sf_safe_bash' | 'tool_execute_before';
  callId?: string;
}

export interface WritePolicyDecision {
  allowed: boolean;
  reason: string;
  violationType?: string;
  retryable: boolean;
  hardStop: boolean;
  hardStopScope: 'none' | 'work_item' | 'project';
  persistHardStop: boolean;
  normalizedTargets: Array<{
    path: string;
    category: PathCategory;
    inAllowedWriteFiles: boolean;
  }>;
}
```

---

### 5.3 PathPolicy 分类

统一路径分类如下：

| 分类 | 路径 | 规则 |
|---|---|---|
| business_file | `src/**`, `packages/**`, `app/**`, 普通业务文件 | 必须 `implementation_running + code_permission + allowed_write_files` |
| spec_project_file | `.specforge/project/**` | 只能 `merge_runner` 写 |
| runtime_file | `.specforge/runtime/**` | 只能 Runtime 内部写 |
| work_item_artifact | `.specforge/work-items/**` | 只能 Runtime / `sf_artifact_write` 写 |
| report_file | `.specforge/reports/**` | 报告输出允许，不要求 code_permission |
| archive_file | `.specforge/archive/**` | Runtime / agent_run 输出允许 |
| logs_file | `.specforge/logs/**` | Runtime 记录允许，普通工具禁止 |
| unknown_file | 其他路径 | 默认按 business_file 处理，除非显式配置 |

---

### 5.4 hard_stop 作用域模型

建议数据结构：

```json
{
  "hard_stop_id": "HS-0001",
  "scope": "work_item",
  "work_item_id": "WI-0001",
  "reason": "WRITE_GUARD_RUNTIME_BLOCKED",
  "source_tool": "sf_safe_bash",
  "source_call_id": "...",
  "created_at": "...",
  "resolved": false,
  "resolved_at": null,
  "allowed_recovery_tools": [
    "sf_state_read",
    "sf_changed_files_audit",
    "sf_close_gate",
    "sf_code_permission",
    "sf_hard_stop_resolve"
  ]
}
```

规则：

```text
1. 普通写入违规 → work_item scoped hard_stop。
2. 空 work_item_id → no hard_stop, non-persistent diagnostic。
3. 无法确定 WI → retryable/block current call, but no project hard_stop。
4. project scoped hard_stop 只能由 Runtime 明确创建。
5. WI-A hard_stop 不影响 WI-B。
6. recovery tools 允许在对应 WI 上运行。
```

---

## 6. 受影响文件

### 6.1 必须重构/新增

```text
setup/userlevel-opencode/plugins/sf_specforge.ts
packages/daemon-core/src/tools/lib/write-policy-service-v12.ts
packages/daemon-core/src/tools/lib/path-policy-v12.ts
packages/daemon-core/src/tools/lib/hard-stop-store-v12.ts
packages/daemon-core/src/tools/lib/write-guard-log-v12.ts
packages/daemon-core/src/tools/handlers/sf-safe-bash.ts
```

### 6.2 必须联动检查

```text
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
packages/daemon-core/src/tools/handlers/sf-code-permission.ts
packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts
packages/daemon-core/src/tools/handlers/sf-close-gate.ts
packages/daemon-core/src/tools/handlers/sf-artifact-write.ts
packages/daemon-core/src/tools/lib/code-permission-service-v11.ts
packages/daemon-core/src/tools/lib/changed-files-audit.ts
packages/daemon-core/src/tools/lib/close-gate.ts
```

### 6.3 Userlevel 部署同步

```text
setup/userlevel-opencode/plugins/sf_specforge.ts
setup/userlevel-opencode/tools/*
scripts/run-install-deployment-consistency.ps1
scripts/check-userlevel-live-consistency.ps1
```

---

## 7. 文件级改造要求

### 7.1 `sf_specforge.ts`

目标：瘦身。

必须移走：

```text
persistHardStop
assertNoRelevantHardStop
candidateNativeWriteWorkItems
localNativeWriteAllowDecision
reports path policy 判断
project/runtime/logs path policy 判断
active WI fallback 策略
```

保留：

```text
OpenCode plugin 注册
native Write/Edit/ApplyPatch shadow
参数提取
daemon client 调用
错误展示
```

验收：

```text
plugin 中不再出现核心 hard_stop 持久化逻辑；
plugin 中不再出现完整 Path Policy；
plugin 只做 adapter。
```

---

### 7.2 `write-policy-service-v12.ts`

新增。

职责：

```text
统一裁决所有写入请求。
```

必须处理：

```text
empty WI
invalid WI
no active WI
WI-scoped hard_stop
project-scoped hard_stop
state != implementation_running
code_permission=false
target not in allowed_write_files
report path
project path
runtime path
archive path
```

---

### 7.3 `path-policy-v12.ts`

新增。

职责：

```text
统一路径分类，不允许每个模块自己写 if。
```

必须导出：

```ts
classifyPath(projectRoot, path): PathCategory
isReportPath(...)
isSpecProjectPath(...)
isRuntimePath(...)
isBusinessPath(...)
```

---

### 7.4 `hard-stop-store-v12.ts`

新增或重构。

职责：

```text
统一创建、读取、解析、恢复 hard_stop。
```

必须支持：

```text
createWorkItemHardStop
createProjectHardStop
getBlockingHardStopForToolCall
resolveHardStop
listActiveHardStops
```

核心规则：

```text
getBlockingHardStopForToolCall(WI-0002) 不得返回 WI-0001 的 hard_stop。
```

---

### 7.5 `sf-safe-bash.ts`

改为：

```text
解析 shell 写目标；
调用 WritePolicyService；
allowed 才执行；
blocked 直接返回结构化错误；
不再自己持久化 hard_stop。
```

---

### 7.6 `sf-state-transition.ts`

必须调整：

```text
1. 不受无关 WI hard_stop 阻塞；
2. 同 WI hard_stop 下允许 recovery/resolve 类 transition；
3. implementation_running -> implementation_done 前强制检查 changed_files_audit passed；
4. 不允许 close_gate 兜底前置错误。
```

---

### 7.7 `changed-files-audit.ts`

必须调整为读统一事实源：

```text
write_guard_log
filesystem diff
allowed_write_files_snapshot
code_permission facts
PathPolicy category
```

不能把 `.specforge/reports/**` 算作 business out-of-scope。

---

### 7.8 `close-gate.ts`

只做最终确认：

```text
code_permission revoked
changed_files_audit passed
no unresolved hard_stop for current WI
no project hard_stop
required files exist
trace/evidence/user decision valid
```

不能替代 state_transition / write_guard 的前置控制。

---

## 8. 测试计划

### 8.1 新增单元测试

```text
packages/daemon-core/tests/v12-path-policy-regression.test.ts
packages/daemon-core/tests/v12-hardstop-scope-regression.test.ts
packages/daemon-core/tests/v12-write-policy-service-regression.test.ts
```

用例：

```text
1. report path 分类为 report_file；
2. project path 分类为 spec_project_file；
3. business file 需要 code_permission；
4. empty work_item_id non-persistent；
5. WI-A hard_stop 不阻塞 WI-B；
6. project hard_stop 才全局阻塞；
7. recovery tool 不被 hard_stop 锁死；
8. .specforge/project/** 非 merge_runner blocked；
9. .specforge/reports/** allowed；
10. src/** unauthorized blocked；
11. src/** authorized allowed；
12. src/** out-of-scope blocked。
```

### 8.2 新增集成测试

```text
packages/daemon-core/tests/v12-write-guard-hardstop-integration.test.ts
```

必须覆盖：

```text
WI-A hard_stop active
WI-B implementation_running + code_permission active
WI-B writes allowed file successfully
WI-A remains blocked
WI-B audit passed
WI-B implementation_done allowed
WI-B close_gate closed
```

### 8.3 保留现有回归测试

必须继续通过：

```text
v12-write-guard-control-plane-hardening.test.ts
v12-empty-wi-hardstop-regression.test.ts
v12-report-path-write-guard-regression.test.ts
v11-install-deployment-consistency.test.ts
```

---

## 9. Live acceptance 计划

整改后必须重跑 clean live acceptance。

目录：

```text
D:\code\temp\SpecForge-v12-live-acceptance-alignment-clean
```

场景：

```text
1. empty work_item_id 不持久化 hard_stop；
2. .specforge/reports/** 可写；
3. .specforge/project/** 不可写；
4. native Write 未授权 blocked；
5. native Write 授权 allowed + WI closed；
6. native Write out-of-scope blocked / audit failed；
7. WI-A hard_stop 不影响 WI-B；
8. recovery 工具不死锁。
```

最终结论：

```text
ALIGNMENT_LIVE_ACCEPTANCE_PASSED
ALIGNMENT_LIVE_ACCEPTANCE_FAILED
```

八项必须全过。

---

## 10. 实施分支与提交策略

分支：

```text
hardening/v1.2-write-guard-hardstop-alignment
```

不建议继续使用：

```text
fix/v1.2-write-guard-post-merge-live-fix
```

原因：该分支已经包含多轮 fix09-fix13 热修，适合作为问题证据链，不适合作为长期治理分支继续堆补丁。

实施策略：

```text
1. 从当前 main 或当前 hotfix 最新点开 alignment 分支；
2. 先提交影响分析文档；
3. 再提交设计冻结文档；
4. 再做一次性代码整改；
5. 技术验证通过后部署；
6. clean live acceptance 通过后 merge main。
```

提交建议：

```text
docs(write-guard): add hardstop alignment impact analysis
docs(write-guard): freeze hardstop alignment design
fix(write-guard): align path policy hardstop and write guard responsibilities
test(write-guard): add scoped hardstop and write policy regressions
docs(write-guard): record alignment live acceptance
```

---

## 11. 禁止事项

本轮禁止：

```text
1. 不继续在 sf_specforge.ts 里追加局部 if；
2. 不继续做 fix14 单点补丁；
3. 不用 close_gate 兜底前面所有问题；
4. 不让 Agent 自己判断是否能写；
5. 不把普通 WI hard_stop 升级成 project hard_stop；
6. 不让 OpenCode live acceptance 访问 D:\code\temp\SpecForge 源码仓库；
7. 不在 live acceptance 失败后继续绕过测试。
```

---

## 12. 验收标准

整改完成必须满足：

```text
1. plugin 变薄，不再持有核心治理逻辑；
2. 所有写入口统一调用 daemon-core WritePolicyService；
3. PathPolicy 是唯一路径分类来源；
4. hard_stop 有明确 scope；
5. empty work_item_id 不落盘；
6. WI-A hard_stop 不影响 WI-B；
7. recovery 工具不死锁；
8. report path 可写；
9. project path 仍受保护；
10. native Write / Edit / ApplyPatch 未授权 blocked；
11. native Write / Edit / ApplyPatch 授权 allowed；
12. out-of-scope blocked 或 audit failed；
13. changed_files_audit 读事实源；
14. implementation_done 前必须 audit passed；
15. close_gate 只做最终收口。
```

---

## 13. 最终判断

当前系统不能继续靠小补丁收口。

正确路线是：

```text
先冻结职责边界 → 再一次性整改 → 再完整测试 → 再 clean live acceptance → 再合并 main/tag。
```

如果继续在当前 plugin 上堆 fix14/fix15，短期可能压住一个现象，但会继续制造新的交叉污染。

