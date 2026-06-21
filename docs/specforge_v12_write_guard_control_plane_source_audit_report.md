# SpecForge v1.2 Write Guard Control Plane 源码审查报告

版本：v0.1  
日期：2026-06-21  
范围：GitHub `main` 当前源码审查；不包含本地编译结果。  
目标：先基于真实源码确认 Write Guard / safe_bash / executor 写入 / changed_files_audit / state_transition / close_gate / artifact_write 的职责边界，再决定修复方案。

---

## 1. 结论摘要

这次源码审查确认：

```text
Write Guard 规则引擎本体存在；
code_permission 权限事实存在；
changed_files_audit 事后审计存在；
close_gate 最后防线存在；
但 shell / executor 写入入口没有统一进入 canonical Write Guard 控制面；
state_transition 没有在 implementation_running -> implementation_done 前消费 changed_files_audit failed 结果；
sf_artifact_write 存在 work_log/template 路由异常，并缺少 extension 专用 file_type。
```

因此，v1.2 当前不能 final stable 的根因不是“没有规则”，而是：

```text
规则存在，但接入不完整；
权限存在，但执行入口不查；
审计存在，但状态机不消费；
close_gate 能挡住，但太晚。
```

---

## 2. 源码审查范围

本轮审查了以下实际源码路径：

```text
packages/daemon-core/src/tools/lib/write-guard-v11.ts
packages/daemon-core/src/tools/lib/bash-guard.ts
packages/daemon-core/src/tools/lib/sf_safe_bash_core.ts
packages/daemon-core/src/tools/handlers/sf-safe-bash.ts
packages/daemon-core/src/tools/handlers/sf-changed-files-audit.ts
packages/daemon-core/src/tools/handlers/sf-state-transition.ts
packages/daemon-core/src/tools/lib/state-machine-v11.ts
packages/daemon-core/src/tools/lib/state-coordinator-v11.ts
packages/daemon-core/src/tools/lib/close-gate.ts
packages/daemon-core/src/tools/handlers/sf-v11-code-permission.ts
packages/daemon-core/src/tools/lib/write-guard-log.ts
packages/daemon-core/src/tools/lib/filesystem-diff.ts
packages/daemon-core/src/tools/handlers/sf-artifact-write.ts
packages/daemon-core/src/tools/lib/sf_artifact_write_core.ts
setup/userlevel-opencode/tools/sf_safe_bash.ts
setup/userlevel-opencode/tools/sf_artifact_write.ts
setup/userlevel-opencode/tools/lib/thin-client.ts
```

---

## 3. 源码事实一：canonical Write Guard 存在

`write-guard-v11.ts` 明确声明：

```text
CANONICAL WRITE GUARD — all write decisions MUST go through this module.
```

其规则覆盖：

```text
1. 无 active WI 写代码；
2. code_change_allowed=false 写代码；
3. 写入不在 allowed_write_files 内；
4. 普通 Agent 写 .specforge/project/**；
5. 普通 Agent 写 user_decision.json；
6. 普通 Agent 写 gates/**；
7. 普通 Agent 写 gate_summary.md；
8. 普通 Agent 写 merge_report.md；
9. 冻结后修改 Candidate / Manifest / Gate Summary；
10. closed WI 继续写入。
```

核心函数包括：

```text
evaluatePolicy(...)
checkWrite(...)
performChangedFilesAudit(...)
```

判断：

```text
规则引擎本体是存在的；
不需要重新发明一套 Write Guard；
修复重点是让所有写入入口调用这个 canonical checkWrite/evaluatePolicy。
```

---

## 4. 源码事实二：sf_safe_bash 入口没有完整接入 Write Guard

### 4.1 userlevel 工具只是转发

`setup/userlevel-opencode/tools/sf_safe_bash.ts` 只是把 OpenCode 工具调用转发到 daemon 的 `sf_safe_bash`：

```text
daemon.invokeTool("sf_safe_bash", args, context)
```

它本身不做 Write Guard 判断。

### 4.2 daemon handler 只做两类拦截

`packages/daemon-core/src/tools/handlers/sf-safe-bash.ts` 当前主要做：

```text
1. 检查 active WI 是否 hard_stop；
2. 如果命令字符串包含 .specforge/work-items/，直接阻断；
3. 其他命令交给 safeBashExecute。
```

它没有：

```text
1. 从命令中解析业务区写入目标；
2. 从命令中解析 .specforge/project/** 写入目标；
3. 读取 work_item.json 的 code_permission；
4. 检查当前 WI 状态是否 implementation_running；
5. 调用 checkWrite；
6. 写 write_guard_log.jsonl；
7. 对被拒绝写入设置 blocked_write_attempts/hard_stop。
```

这解释了 live 现象：

```text
sf_safe_bash 能拦 .specforge/work-items/**；
但拦不住业务区文件和 .specforge/project/**。
```

---

## 5. 源码事实三：bash-guard 只识别少量 Unix/bash 写入模式，不覆盖 PowerShell

`bash-guard.ts` 的文件修改命令识别主要是：

```text
> file
>> file
tee file
```

它没有覆盖本轮 live acceptance 使用的 PowerShell 写入方式：

```text
Set-Content -Path ...
Out-File -FilePath ...
New-Item -ItemType File ...
Add-Content -Path ...
Remove-Item ...
Copy-Item ...
Move-Item ...
```

更重要的是，它调用 policy 时只传了一个极简 context：

```text
hasActiveWI: true
callerRole: agent
isFrozen: false
```

没有传：

```text
workItem.status
workItem.code_change_allowed
workItem.allowed_write_files
workflow_path
```

因此，即使匹配到了某个写入路径，也无法执行 code_permission / allowed_write_files 判断。

判断：

```text
bash-guard 目前只能当危险命令/简单重定向拦截器；
不能视为完整 Write Guard runtime enforcement。
```

---

## 6. 源码事实四：sf_safe_bash_core 默认写策略是 allow-all

`sf_safe_bash_core.ts` 中存在 `DEFAULT_BASH_WRITE_POLICY`，注释说明：

```text
Default bash write policy used when no WI-specific policy is available.
This default policy allows all writes.
```

判断：

```text
这是 shell 写入绕过的直接源码根因之一。
如果没有 WI-specific policy，默认不应 allow-all；
至少在 active WI 存在时，应 fail-closed 或要求显式 target extraction + checkWrite。
```

---

## 7. 源码事实五：changed_files_audit 是事后审计，不是运行时拦截

`sf_changed_files_audit` 的 handler 会：

```text
1. 读取 work_item.json；
2. 检查 code_permission 是否曾经 enable；
3. 取 allowed_write_files 或 allowed_write_files_snapshot；
4. 优先读取 write_guard_log.jsonl；
5. 否则回退到 work_item.actual_changed_files；
6. 再否则使用 debug_hint.actual_changed_files；
7. 生成 changed_files_audit.md；
8. 返回 passed / out_of_scope / violations。
```

这说明：

```text
changed_files_audit 的职责是写后审计；
它不能阻止文件落盘；
如果运行时入口没有写 write_guard_log.jsonl，它只能 fallback 或被调用方传参提示。
```

live 中出现的：

```text
Data Source: debug_hint.actual_changed_files (deprecated fallback; not a trusted Runtime source)
```

与源码一致。

判断：

```text
changed_files_audit 能发现问题，但不能替代 runtime interception；
write_guard_log.jsonl 没有完整接入时，审计源也不够权威。
```

---

## 8. 源码事实六：write_guard_log 设计为事实源，但入口没有完整写入

`write-guard-log.ts` 的设计很清楚：

```text
write_guard_log.jsonl 是 changed_files_audit 的事实源；
每个 allowed write 和 blocked write 都应写入；
getFactualChangedFiles() 从 allowed entries 生成审计输入。
```

但 live 暴露的问题是：

```text
shell / executor Write 成功落盘，却没有对应 write_guard_log allowed/blocked entry；
changed_files_audit 只能 fallback。
```

判断：

```text
write_guard_log 本体可复用；
需要把 shell / executor 写入入口全部接入 appendWriteGuardLog。
```

---

## 9. 源码事实七：code_permission 权限事实源存在

`sf-v11-code-permission.ts` 当前能：

```text
1. enable/release code_permission；
2. 写 code_change_allowed=true；
3. 写 allowed_write_files；
4. 保存 allowed_write_files_snapshot；
5. revoke 后写 code_change_allowed=false；
6. 清空 allowed_write_files；
7. 写 code_permission_revoked=true。
```

判断：

```text
权限事实不是缺失；
修复不应重写 code_permission；
应复用现有 work_item.json 事实源。
```

---

## 10. 源码事实八：state_transition 没有 implementation_done 前置 audit 检查

`state-machine-v11.ts` 合法跳转表包含：

```text
implementation_running -> implementation_done
```

`state-coordinator-v11.ts` 在执行 transition 前会检查：

```text
1. 目标状态是否合法；
2. 禁止跳转；
3. seal transition 主体；
4. 目标状态的 evidence requirement。
```

但当前 evidence requirement 只覆盖：

```text
approval_required -> gate_summary.md
merge_ready -> user_decision.json
merging -> gate_summary.md
closed -> verification_report.md
```

没有：

```text
implementation_done -> changed_files_audit.md must exist and passed=true
implementation_done -> blocked_write_attempts must be 0
implementation_done -> out_of_scope must be 0
```

判断：

```text
DEFECT-2 源码根因成立：
状态机允许 implementation_running -> implementation_done，但没有消费 changed_files_audit failed 结果。
```

---

## 11. 源码事实九：close_gate 是有效最后防线，但太晚

`close-gate.ts` 会要求：

```text
changed_files_audit.md 存在；
changed_files_audit 内容包含 pass/success；
code_permission revoked；
allowed_write_files empty；
No unresolved Write Guard violations。
```

这解释 live 现象：

```text
state_transition 已经允许 implementation_done；
verification_gate 也能过；
但 close_gate 仍能根据 changed_files_audit.md fail。
```

判断：

```text
close_gate 是有效最后防线；
但 runtime interception 和 state_transition 前置审计不能缺位；
否则非法文件已经落盘，流程已经推进太远。
```

---

## 12. 源码事实十：sf_artifact_write 的 work_log/template 路由异常有源码依据

`sf-artifact-write.ts` 存在：

```text
inferCanonicalFileType(args)
```

它会在 `file_type=work_log` 时，根据：

```text
run_id
template
content 前 400 字符
```

推断成：

```text
trigger_result
candidate_manifest
trace_delta
impact_analysis
change_classification
tasks
merge_report
evidence_manifest
```

这解释了 live 中 work_log 被错误路由/覆盖 evidence_manifest 的现象。

同时 `sf_artifact_write_core.ts` 中：

```text
if template === "verification_report"，就把 content 当 JSON 渲染为 verification report；
else if file_type === "work_log" && agent_content，才生成 work_log。
```

因此：

```text
file_type=work_log + template=verification_report
```

会优先走 template 渲染，而不是 work_log 逻辑。

判断：

```text
DEFECT-3 源码根因成立：
work_log + template 路由优先级有问题；
inferCanonicalFileType 对 work_log 做内容嗅探过于危险；
extension_request / extension_candidate / extension_delta 也没有 canonical file_type。
```

---

## 13. executor Write 工具问题的边界

从 SpecForge 仓库可以确认：

```text
SpecForge 自定义工具通过 userlevel thin-client 调 daemon；
sf_safe_bash 是自定义工具；
sf_artifact_write 是自定义工具。
```

但 OpenCode 内置 Write 工具不是 SpecForge daemon handler。live 中 executor Write 能落盘，说明它绕开了 SpecForge daemon 的 `checkWrite()`。

这意味着修复 DEFECT-1 时需要分两层考虑：

```text
1. SpecForge 自定义工具层：
   sf_safe_bash / sf_artifact_write / merge_runner 等能在 daemon 内修。

2. OpenCode 内置写工具层：
   需要通过插件 hook / tool invocation event / 禁用内置 Write / 替换为受控写工具 / 审计+fail-fast 来治理。
```

如果 OpenCode 插件不能在调用前拦截内置 Write，至少必须：

```text
1. 明确禁止 executor 使用内置 Write；
2. 提供受控 sf_file_write 或 sf_guarded_write；
3. changed_files_audit 必须以 filesystem diff + write_guard_log 双源校验；
4. state_transition 必须拒绝 audit failed；
5. close_gate 保持最后防线。
```

---

## 14. 修复范围建议

建议创建一个合并治理分支：

```text
fix/v1.2-write-guard-control-plane-hardening
```

不要拆成很多小分支。

### 14.1 A 包：runtime interception

优先修：

```text
sf_safe_bash
bash-guard
write_guard_log
write target extraction
```

目标：

```text
1. 在 sf_safe_bash 执行前解析写入目标；
2. 覆盖 PowerShell 写命令：
   - Set-Content
   - Add-Content
   - Out-File
   - New-Item -ItemType File
   - Remove-Item
   - Copy-Item
   - Move-Item
3. 覆盖 bash/cmd 基础写命令：
   - >
   - >>
   - tee
   - touch
   - rm
   - cp
   - mv
   - echo ... > file
4. 对每个目标调用 checkWrite；
5. 拒绝时写 write_guard_log blocked entry；
6. 拒绝时设置 hard_stop / blocked_write_attempts；
7. 允许时写 write_guard_log allowed entry；
8. 默认策略从 allow-all 改为 active WI 下 fail-closed。
```

### 14.2 B 包：state_transition audit gate

修：

```text
state-coordinator-v11.ts
或 sf-state-transition.ts
```

目标：

```text
implementation_running -> implementation_done 前检查：
1. changed_files_audit.md 存在；
2. Result: PASS；
3. Out of scope: 0；
4. Violations: 0；
5. work_item.write_guard_violations 为空；
6. hard_stop 不存在；
7. blocked_write_attempts = 0。
```

建议不要只在 close_gate 检查。

### 14.3 C 包：artifact_write cleanup

修：

```text
sf-artifact-write.ts
sf_artifact_write_core.ts
artifact-schema-validation.ts
setup/userlevel-opencode/tools/sf_artifact_write.ts
```

目标：

```text
1. work_log 不再被 inferCanonicalFileType 内容嗅探误转；
2. template=verification_report 不能覆盖 work_log 语义；
3. work_log 要么拒绝 template，要么忽略 template，优先写 work_log；
4. 新增 file_type：
   - extension_request
   - extension_candidate
   - extension_delta
5. 新增路径：
   - .specforge/work-items/<WI>/extension_request.json
   - .specforge/work-items/<WI>/candidates/extension_candidate.json
   - .specforge/work-items/<WI>/candidates/extension_delta.json
6. 新增 schema validation；
7. userlevel enum 同步更新。
```

### 14.4 D 包：OpenCode 内置 Write 工具治理

需要先查插件能力和实际配置。可能方案：

```text
1. 如果 OpenCode 插件能拦截 tool.invoking：
   在 sf_specforge.ts 中对 Write/Edit/MultiEdit/Bash 做 preflight；
   命中写入时转 daemon checkWrite；
   拒绝则返回 hard_stop。

2. 如果不能拦截内置工具：
   禁用或不暴露内置 Write；
   强制 executor 使用 sf_guarded_write；
   audit 必须用 filesystem diff 检出任何未登记写入；
   state_transition 必须阻断 audit failed。
```

这一块不能靠猜，需要继续看插件入口代码。

---

## 15. 验收矩阵建议

修复包必须包含：

### 15.1 单元测试

```text
1. sf_safe_bash Set-Content 未授权拒绝；
2. sf_safe_bash Set-Content 非 implementation_running 拒绝；
3. sf_safe_bash Set-Content allowed_write_files 内允许；
4. sf_safe_bash Set-Content out-of-scope 拒绝；
5. sf_safe_bash 写 .specforge/project/** 非 merge_runner 拒绝；
6. sf_safe_bash revoke 后拒绝；
7. write_guard_log 写入 allowed/blocked entry；
8. changed_files_audit 使用 write_guard_log 作为事实源；
9. implementation_running -> implementation_done 在 audit fail 时拒绝；
10. implementation_running -> implementation_done 在 audit pass 时允许；
11. work_log + template=verification_report 不覆盖 evidence_manifest；
12. extension_request/candidate/delta file_type 路径正确。
```

### 15.2 live 回归

```text
1. 01 Project Spec Store + quick_change 不重跑全量，只做关键 smoke；
2. 02-A 负向 WI：非法写入运行时必须拒绝，文件不得落盘；
3. 02-B 正向 WI：合法写入 closed；
4. 03 Extension Subflow：无需 workaround，使用 extension_* file_type；
5. final report 判定 v1.2 是否可进入 stable closure。
```

---

## 16. 当前不能直接写最终补丁的原因

当前已经能确定核心修复方向，但仍建议在出修复包前继续看一个关键区域：

```text
OpenCode plugin / sf_specforge.ts / event hook / tool.invoking 拦截能力
```

原因：

```text
sf_safe_bash 可以在 daemon 内修；
但 executor Write 工具是 OpenCode 内置写工具，不一定经过 daemon；
如果不查插件入口，可能只修了 shell，却修不了 Write 工具。
```

如果插件能拦截内置 Write，则应在插件层修。
如果插件不能拦截，则必须通过禁用内置 Write + 提供受控写工具 + audit/state_gate fail-fast 来治理。

---

## 17. 本轮审查结论

```text
DEFECT-1 成立：
Write Guard runtime interception 缺失，根因是写入入口没有统一调用 canonical checkWrite，sf_safe_bash 默认 allow-all，bash-guard 不覆盖 PowerShell 写命令且缺 WI context，executor Write 绕过 daemon。

DEFECT-2 成立：
state_transition / state-coordinator 没有在 implementation_running -> implementation_done 前检查 changed_files_audit passed=true。

DEFECT-3 成立：
sf_artifact_write 对 work_log 的 canonical inference 和 template 优先级导致路由异常，且缺少 extension 专用 file_type。
```

最终修复策略：

```text
不要重写规则引擎；
复用 write-guard-v11.ts、code-permission-service-v11.ts、write-guard-log.ts、changed-files-audit.ts、close-gate.ts；
把所有写入入口接入 canonical Write Guard；
把 changed_files_audit 结果前移到 implementation_done 前；
把 artifact_write 的 file_type 路由修正并补齐 extension file_types。
```
