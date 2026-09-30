# Workflow-Runtime 安全自审报告

**日期**：2026-06-08
**范围**：packages/workflow-runtime + packages/daemon-core（状态流转相关）
**目标**：证明关键流程不可绕过、关键状态不可伪造、关键权限不可越权、关键证据不可缺失、旧入口不可绕过新规则

---

## 1. 正确闭环

```
用户请求 → Orchestrator 意图分类 → 创建 WI (transitionFull → created)
→ intake → requirements/design → tasks → development → review → verification → completed
```

### 关键闭环步骤

| 步骤 | 触发者 | 执行者 | 产生证据 | 证据保存位置 | 谁能写 | 谁校验 | 缺失时阻断 | 其他入口可绕过？ |
|---|---|---|---|---|---|---|---|---|
| 创建 WI | Orchestrator | `transitionFull(from='')` | WorkflowInstance | 内存 + StateManager | transitionFull (only `'created'`) | `transitionFull` | throw if toState ≠ `'created'` | ❌ |
| 状态推进 | Orchestrator/Agent | `transitionFull()` | Gate JSON / Decision JSON / Reports | `.specforge/specs/<WI>/` | transitionFull (only valid transitions) | `enforceTransitionEvidence()` | throw if evidence missing | ⚠️ `transition()` 可绕过非关键状态 |
| Gate 执行 | Orchestrator | `executeGate()` | GateResult | `.specforge/specs/<WI>/gates/` | GateRunner | `determineNextState()` | `passed=false` → fail branch / throw | ❌ |
| 证据校验 | transitionFull | `enforceTransitionEvidence()` | 校验结果 (throw/silent) | — | transitionFull internal | transitionFull | throw → StateManager 不执行 | ❌ |
| 持久化 | StateManager | `StateManager.transition()` | WAL event + state.json | `.specforge/runtime/` | StateManager (after transitionFull) | WAL optimistic lock | StateManager 不被调用 | ⚠️ HTTP 端点缺 StateManager |
| 关闭 | Orchestrator | `transitionFull(to='closed')` | changed_files_audit.md + close_gate.json | `.specforge/specs/<WI>/` | transitionFull | `enforceTransitionEvidence('closed')` | throw | ❌ |

---

## 2. 所有入口清单

### 生产入口（guard 接入情况）

| ID | 文件 | 函数 | 生产可用 | Legacy | 接入 guard | 可绕过主流程 | 保留安全性说明 | 有测试证明 |
|---|---|---|---|---|---|---|---|---|
| EP-01 | `src/WorkflowEngine.ts:273` | `transitionFull()` | ✅ | ❌ | ✅ `isForbiddenTransitionV11` + `enforceTransitionEvidence` | ❌ | 主入口，完整 guard 链 | ✅ 107 tests |
| EP-03 | `src/WorkflowEngine.ts:539` | `WorkflowEngine.execute()` | ✅ | ❌ | ✅ evidence for CRITICAL_STATES | ⚠️ 依赖 workItemDir | 自主循环，检查 evidence | ✅ 107 tests |
| EP-04 | `src/WorkflowEngine.ts:142` | `createInstance()` | ✅ | ❌ | ❌ 不需要（只创建初始状态） | ❌ | 只创建内存 instance，初始状态固定 | ✅ |
| EP-17 | `daemon-core/.../sf-state-transition.ts` | `sf_state_transition` handler | ✅ | ❌ | ✅ two-phase (transitionFull → StateManager) | ❌ | 生产入口，两阶段 guard | ✅ 12 tests |
| EP-29 | `daemon-core/.../HTTPServer.ts:1528` | `POST /v11/work-item/create` | ✅ | ❌ | ✅ via tool dispatcher | ❌ | 委托 ToolDispatcher | ✅ |
| EP-30 | `daemon-core/.../HTTPServer.ts:1552` | `POST /v11/gate/run` | ✅ | ❌ | ✅ via tool dispatcher | ❌ | 委托 ToolDispatcher | ✅ |

### Legacy / 测试入口（绕过风险）

| ID | 文件 | 函数 | 生产可用 | Legacy | 接入 guard | 可绕过主流程 | 安全性说明 | 有测试证明 |
|---|---|---|---|---|---|---|---|---|
| EP-02 | `src/WorkflowEngine.ts:216` | `transition()` | ⚠️ 导出 | ✅ `@deprecated TEST SCAFFOLD ONLY` | ⚠️ CRITICAL STATES throw，其他无 evidence | ✅ 非关键状态可绕过 | CRITICAL STATES 硬阻断，非关键状态无 evidence | ✅ 证明 CRITICAL 阻断 |
| EP-07 | `src/engine/WorkflowInstance.ts:249` | `transitionState()` | ⚠️ 导出 | ✅ `@deprecated TEST SCAFFOLD ONLY` | ⚠️ CRITICAL_INSTANCE_STATES throw | ✅ 非关键状态直接赋值 | CRITICAL STATES 硬阻断 | ✅ 证明 CRITICAL 阻断 |
| EP-11 | `src/engine/WorkflowEngine.ts:142` | `transition()` (simplified) | ⚠️ 导出 | ✅ `@deprecated` | ⚠️ 同 EP-02 | ✅ 同 EP-02 | 简化引擎副本 | ✅ 同 EP-02 |
| EP-26 | `daemon-core/.../StateManager.ts:123` | `StateManager.transition()` | ✅ | ❌ | ❌ 无 evidence check | ⚠️ 直接调用可绕过 | 只能从 EP-17 调用（EP-17 先调 transitionFull） | ✅ 证明单独调用不触发 evidence |

### 危险入口（需修复）

| ID | 文件 | 函数 | 问题 | 严重性 |
|---|---|---|---|---|
| EP-15 | `src/engine/AgentWorkflowEngine.ts:218` | `execute()` override | **不调用 `enforceTransitionEvidence()`**，直接 `instance.currentState = nextState` (L307) | 🔴 HIGH |
| EP-18 | `daemon-core/.../HTTPServer.ts:874` | `POST /state/transition` | 不调用 `StateManager.transition()`，状态只在内存（缺持久化） | 🟡 MEDIUM |
| EP-10 | `src/engine/WorkflowInstance.ts:315` | `clearHistory()` | 导出公开，无 guard，可销毁审计记录 | 🟡 MEDIUM |
| EP-21/22 | 持久化层 | `deleteInstance()` | 无 guard，可删除工作流实例 | 🟡 MEDIUM |

---

## 3. 统一 guard 入口

### 主 guard 链

```
sf_state_transition (tool handler, EP-17)
  └─→ transitionFull() (EP-01)
       ├─→ isForbiddenTransitionV11(from, to)  // 12 条禁止规则
       ├─→ isValidTransition(from, to)          // 状态机定义
       ├─→ enforceTransitionEvidence(to, workItemDir)  // 关键状态证据前置
       └─→ onTransition() callback              // WAL 持久化
  └─→ StateManager.transition() (EP-26)         // WAL event + state.json
```

### Legacy 入口处理

| Legacy 入口 | 处理方式 | 是否安全 |
|---|---|---|
| `transition()` (EP-02) | `@deprecated TEST SCAFFOLD ONLY`，CRITICAL STATES throw | ⚠️ 非关键状态无 evidence |
| `transitionState()` (EP-07) | `@deprecated TEST SCAFFOLD ONLY`，CRITICAL_INSTANCE_STATES throw | ⚠️ 同上 |
| `AgentWorkflowEngine.execute()` (EP-15) | **未接入统一 guard** | 🔴 危险 |

---

## 4. 权限矩阵

**默认策略：全部拒绝。** 只有明确 actor，在明确 state 下，对明确 resource，执行明确 operation，且证据齐全，才允许。

### 权限检查矩阵

| 检查项 | 实现位置 | 何时检查 | 缺失时行为 |
|---|---|---|---|
| unknown actor 拒绝 | `transitionFull()` 无 actor 参数时仍允许 | 未实现 — 缺 actor 校验 | ⚠️ GAP |
| 无上下文拒绝 | `transitionFull()` 检查 `!workItemDir` for CRITICAL | CRITICAL STATES 进入时 | throw |
| 状态不对拒绝 | `isValidTransition()` + `isForbiddenTransitionV11()` | 每次转换 | throw |
| 权限缺失拒绝 | 未实现 — 无 role/permission 模型 | — | ⚠️ GAP |
| scope 不匹配拒绝 | 未实现 — 无 scope 检查 | — | ⚠️ GAP |
| operation 不匹配拒绝 | `isValidTransition()` 只允许已定义边 | 每次转换 | throw |
| 已关闭状态拒绝 | `isForbiddenTransitionV11('closed', ANY) → true` | 每次转换 | throw |
| legacy 路径拒绝写入 | CRITICAL STATES 在 legacy 函数中 throw | legacy 函数内部 | throw |
| 非授权主体写关键证据拒绝 | 未实现 — 无 actor → evidence 授权映射 | — | ⚠️ GAP |

### 当前权限模型总结

当前系统是**单租户信任模型**：任何能调用 `transitionFull()` 的调用者都被信任。没有 role/permission/scope 概念。权限保护来自：
1. **证据前置**：CRITICAL STATES 必须有物理文件证据
2. **禁止转换**：12 条硬编码禁止规则
3. **状态机约束**：只允许已定义边
4. **遗留函数限制**：CRITICAL STATES 在 `transition()` 中硬 throw

---

## 5. 状态证据矩阵

### CRITICAL_STATES 证据要求

| 状态 | 前置证据 | 前置 Gate | 允许写入者 | 失败时阻断 | 测试 |
|---|---|---|---|---|---|
| `approval_required` | `gate_summary.md` + `gates/gate_summary_gate.json(passed)` | gate_summary_gate | transitionFull | throw → StateManager 不执行 | ✅ NE-4, PM-5 |
| `merge_ready` | `user_decision.json(approved/waived)` | — | transitionFull | throw | ✅ §3 (3 tests), PM-1, PM-pos-4/5 |
| `merging` | `gates/merge_ready_gate.json(passed)` | merge_ready_gate | transitionFull | throw | ✅ §4 (3 tests) |
| `post_merge_verified` | `gates/post_merge_gate.json(passed)` | post_merge_gate | transitionFull | throw | ✅ §5 (2 tests) |
| `implementation_ready` | `tasks.md` + `work_item.json(allowed_write_files)` + `gates/code_permission_release_gate.json(passed)` | code_permission_release_gate | transitionFull | throw | ✅ §11 (7 tests), PM-5/5b/5c/5d |
| `verification_done` | `verification_report.md` + `evidence/evidence_manifest.json` | — | transitionFull | throw | ✅ PM-4/4b, PM-pos-2 |
| `closed` | `changed_files_audit.md` + `gates/close_gate.json(passed)` | close_gate | transitionFull | throw | ✅ §6 (4 tests), PM-3 |

### 非关键状态

非 CRITICAL 状态（`created`, `intake_ready`, `impact_analyzing` 等）**不强制 evidence check**。`enforceTransitionEvidence` 对非 CRITICAL 状态的 switch case 无匹配项，静默通过。

---

## 6. Gate 阻断矩阵

| Gate 结果 | `determineNextState` 行为 | 进入 pass 分支？ | 进入 fail 分支？ | 阻断？ |
|---|---|---|---|---|
| `passed=true` + `status=passed` | → `next['pass']` 或 string next | ✅ | ❌ | ❌ |
| `passed=false` + `status=failed` | → `next['fail']` 或 throw (string next + gate) | ❌ | ✅ | ✅ |
| `passed=false` + `status=blocked` | → `next['fail']` | ❌ | ✅ | ✅ |
| `passed=false` + `status=not_enabled` | → `next['fail']` | ❌ | ✅ | ✅ |
| `passed=false` + `status=waived` | → `next['fail']`（与 failed 相同处理） | ❌ | ✅ | ✅ |

**关键保证**：`gateOk = gateResult.passed === true`，只有严格 `true` 才进入 pass 分支。`not_enabled` 永远不能当 passed。

### executeSimpleGate 无 checkFn 行为

| 场景 | passed | status | 理由 |
|---|---|---|---|
| `required=true`(默认) + 无 checkFn | `false` | `'blocked'` | "Required gate has no check function defined" |
| `required=false` + 无 checkFn | `false` | `'not_enabled'` | "Non-required gate without checkFn" |
| `severity='soft'` + 无 checkFn | `false` | `'blocked'` | severity 字段**不被** executeSimpleGate 读取 |

### 测试覆盖

| 场景 | 测试 | 结果 |
|---|---|---|
| Gate failed → 流程不继续 | §4 T12, §6 T18 | ✅ |
| Gate not_enabled → 硬流程不继续 | NE-1 through NE-7 | ✅ |
| Gate 缺失 → 硬流程不继续 | §3 T8, §4 T11, §5 T14, §6 T16-17 | ✅ |
| 异常被 catch 后不继续 | ST-EV-3 (transitionFull throw → StateManager 不调用) | ✅ |

---

## 7. Required Artifact 生成与校验矩阵

| Artifact | 总清单声明 | 生成阶段 | 明确 Actor | Gate 读取 | Close 阶段校验 | 缺失时测试失败 |
|---|---|---|---|---|---|---|
| `gate_summary.md` | ✅ enforceTransitionEvidence | gates_running | GateRunner | approval_required check | — | ✅ §3 T8 |
| `gates/gate_summary_gate.json` | ✅ | gates_running | GateRunner | approval_required check | — | ✅ NE-4 |
| `user_decision.json` | ✅ | approval_required | UserDecisionRecorder | merge_ready check | — | ✅ §3 T8, PM-1 |
| `gates/merge_ready_gate.json` | ✅ | merge_ready | MergeRunner | merging check | — | ✅ §4 T11 |
| `gates/post_merge_gate.json` | ✅ | merged | Orchestrator | post_merge_verified check | — | ✅ §5 T14 |
| `tasks.md` | ✅ | tasks | sf-task-planner | implementation_ready check | — | ✅ PM-5c |
| `work_item.json(allowed_write_files)` | ✅ | tasks | sf-task-planner | implementation_ready check | — | ✅ PM-5d |
| `gates/code_permission_release_gate.json` | ✅ | implementation_ready | Orchestrator | implementation_ready check | — | ✅ §11 T50, PM-5/5b |
| `verification_report.md` | ✅ | verification | sf-verifier | verification_done check | — | ✅ PM-4b |
| `evidence/evidence_manifest.json` | ✅ | verification | sf-verifier | verification_done check | — | ✅ PM-4 |
| `changed_files_audit.md` | ✅ | close | Orchestrator | closed check | ✅ | ✅ §6 T16, PM-3 |
| `gates/close_gate.json` | ✅ | close | CloseGate | closed check | ✅ | ✅ §6 T17-18 |

---

## 8. Runtime Guard 与 Config 对照表

| 规则 | Runtime 阻断函数 | 配置位置 | 生成阶段 | 证据文件 | 测试文件 | 测试结果 |
|---|---|---|---|---|---|---|
| 禁止跳过到 implementation_running | `isForbiddenTransitionV11` | `state-machine.ts` FORBIDDEN_TRANSITIONS | — | — | evidence-guard-v11 S19 | ✅ |
| closed 不可转出 | `isForbiddenTransitionV11('closed', ANY)` | 同上 | — | — | ⚠️ 无显式测试 | ⚠️ GAP-3 |
| approval 需 gate_summary | `enforceTransitionEvidence` | `WorkflowEngine.ts:431` | gates_running | gate_summary.md + gate JSON | §3, NE-4 | ✅ |
| merge 需 user decision | 同上 | 同上 | approval_required | user_decision.json | §3, PM-1 | ✅ |
| merging 需 merge_ready gate | 同上 | 同上 | merge_ready | merge_ready_gate.json | §4 | ✅ |
| implementation 需 code permission | 同上 | 同上 | tasks | code_permission_release_gate.json | §11, PM-5 | ✅ |
| verification 需 report + manifest | 同上 | 同上 | verification_running | verification_report.md + evidence_manifest.json | PM-4/4b | ✅ |
| closed 需 audit + close gate | 同上 | 同上 | close | changed_files_audit.md + close_gate.json | §6 | ✅ |
| not_enabled ≠ pass | `determineNextState` | `WorkflowEngine.ts:785` | — | — | NE-1~NE-7 | ✅ |
| transition() 不达 CRITICAL | `transition()` CRITICAL throw | `WorkflowEngine.ts:216` | — | — | §9 | ✅ |

---

## 9. Legacy 入口保留说明

| Legacy 入口 | 保留原因 | 当前保护 | 建议 |
|---|---|---|---|
| `WorkflowEngine.transition()` | 测试脚手架向后兼容 | CRITICAL STATES throw；`@deprecated` 标记 | 增加 `process.env.NODE_ENV === 'test'` 运行时检查 |
| `engine/WorkflowEngine.transition()` | 简化引擎副本 | 同上 | 同上 |
| `WorkflowInstanceStateManager.transitionState()` | 测试脚手架 | CRITICAL_INSTANCE_STATES throw | 增加 NODE_ENV 检查 |
| `AgentWorkflowEngine.execute()` | Agent-based 工作流执行 | **无 evidence check** | 🔴 **必须修复**：调用 `enforceTransitionEvidence` |
| `clearHistory()` | 内部使用 | 无限制 | 限制为 private 或增加 state guard |
| `deleteInstance()` | 持久化层 | 无限制 | 增加 critical state 检查 |

---

## 10. 反向绕过测试矩阵

| # | 场景 | 入口 | 缺失条件 | 预期阻断 | 阻断函数 | 测试文件 | 结果 |
|---|---|---|---|---|---|---|---|
| 1 | 无 workItemDir 不能执行 | transitionFull | workItemDir | throw | enforceTransitionEvidence | evidence-guard-v11 §2 S3-S9 | ✅ |
| 2 | 状态不对不能执行 | transitionFull | fromState ≠ actual | throw | transitionFull state match | evidence-guard-v11 S25 | ✅ |
| 3 | 无效转换不能执行 | transitionFull | 非法 from→to | throw | isValidTransition | evidence-guard-v11 S19/S21 | ✅ |
| 4 | 禁止转换不能执行 | transitionFull | FORBIDDEN_TRANSITIONS | throw | isForbiddenTransitionV11 | evidence-guard-v11 S19 | ✅ |
| 5 | 缺 gate 不能推进 | transitionFull | gate JSON 文件不存在 | throw | enforceTransitionEvidence | evidence-guard-v11 §3-6 | ✅ |
| 6 | Gate failed 不能推进 | determineNextState | passed=false | fail branch / throw | determineNextState | evidence-guard-v11 §4 T12 | ✅ |
| 7 | Gate not_enabled 不能当 passed | determineNextState | passed=false, status=not_enabled | fail branch | determineNextState | NE-1~NE-7 | ✅ |
| 8 | 缺 user_decision 不能推进 | transitionFull | user_decision.json 缺失 | throw | enforceTransitionEvidence | §3 T8, PM-1 | ✅ |
| 9 | 缺审批不能推进 | transitionFull | user_decision.json rejected | throw | enforceTransitionEvidence | §3 T9, PM-pos-5 | ✅ |
| 10 | 缺验证不能完成 | transitionFull | verification_report.md 缺失 | throw | enforceTransitionEvidence | PM-4b | ✅ |
| 11 | 缺审计不能关闭 | transitionFull | changed_files_audit.md 缺失 | throw | enforceTransitionEvidence | §6 T16, PM-3 | ✅ |
| 12 | 已关闭不能修改 | transitionFull | from='closed' | throw | isForbiddenTransitionV11 | ⚠️ 无显式测试 | ⚠️ GAP-3 |
| 13 | 旧入口不能达 CRITICAL | transition() | to=CRITICAL_STATE | throw | transition() CRITICAL check | §9 T39-41 | ✅ |
| 14 | transition() 非关键可绕过 | transition() | to=非关键状态 | **不阻断** | — | §9 T42 | ⚠️ 设计如此 |
| 15 | AgentWorkflowEngine 无 evidence | AgentWorkflowEngine.execute() | workItemDir | **不阻断** | — | ⚠️ 无测试 | 🔴 **GAP-1** |
| 16 | StateManager 直接调用无 evidence | StateManager.transition() | — | **不阻断** | — | ST-EV-3 证明 EP-17 不单独调用 | ✅ |
| 17 | HTTP 端点缺持久化 | HTTPServer.handleStateTransition | StateManager | **不持久化** | — | ⚠️ 无测试 | ⚠️ GAP |
| 18 | clearHistory 无限制 | clearHistory() | — | **不阻断** | — | ⚠️ 无限制测试 | ⚠️ GAP-4 |

---

## 11. 搜索验证结果

| 搜索项 | 搜索结果 | 结论 |
|---|---|---|
| `transition()` 是否仍被生产代码调用 | `@deprecated TEST SCAFFOLD ONLY` 标记。grep 显示只在测试文件和 WorkflowEngine 自身定义 | ❌ 生产代码不调用 |
| CRITICAL STATES 在 `transition()` 中是否 throw | `if (CRITICAL_STATES.has(toState)) throw` (L245-247) | ✅ 硬阻断 |
| `AgentWorkflowEngine.execute()` 是否调用 `enforceTransitionEvidence` | **不调用**。L307 直接 `instance.currentState = nextState` | 🔴 **危险** |
| `not_enabled` 是否能走 pass 分支 | `gateOk = gateResult.passed === true`，not_enabled → passed=false → gateOk=false | ✅ 不可能 |
| `severity='soft'` 是否影响 executeSimpleGate | executeSimpleGate **不读取** severity 字段 | ✅ 不影响 |
| FORBIDDEN_TRANSITIONS 是否包含 `closed → ANY` | `if (from === 'closed') return true` (L85) | ✅ closed 是吸收态 |
| enforceTransitionEvidence 是否有 default case | switch 无 default — 非匹配状态静默通过 | ⚠️ 非关键状态无 evidence |
| `waived` 在 determineNextState 中如何处理 | 与 failed 相同 — `passed=false` → fail branch | ✅ 但 ⚠️ 无专用测试 |
| tests/setup.ts 是否启用 fake timers | ✅ `vi.useFakeTimers()` 在全局 beforeEach | ✅ 全包 fake timers |
| retry.test.ts 失败是否因 fake timer 污染 | 全局 fake timers 导致 `sleep()` 的 `setTimeout` 永远不 fire（除非 `vi.advanceTimersByTime()`） | ⚠️ 测试写法问题 |

---

## 12. 测试命令和结果

```bash
# v1.1 主链路测试 (107 tests)
cd packages/workflow-runtime
node ./node_modules/vitest/vitest.mjs run --no-watch tests/unit/evidence-guard-v11.test.ts
# 结果：107/107 passed

# 生产入口测试 (12 tests)
cd packages/daemon-core
node ./node_modules/vitest/vitest.mjs run --no-watch tests/unit/sf-state-transition.test.ts
# 结果：12/12 passed

# 全量 unit 测试 (39 failed，全为预存问题)
cd packages/workflow-runtime
node ./node_modules/vitest/vitest.mjs run --no-watch tests/unit/*.test.ts
# 结果：653 passed, 39 failed (全部预存，非 v1.1 回归)
```

---

## 13. 修改文件列表

**本次审计为纯调查，未修改任何代码。**

---

## 14. 每个文件解决的问题

N/A — 纯调查，未修改代码。

---

## 15. 仍未解决的问题

| ID | 问题 | 严重性 | 影响范围 |
|---|---|---|---|
| **FIND-1** | `AgentWorkflowEngine.execute()` 不调用 `enforceTransitionEvidence()`，L307 直接赋值 `instance.currentState` | 🔴 HIGH | Agent-based 工作流可绕过所有证据前置 |
| **FIND-2** | `AgentWorkflowEngine.determineNextState()` override 放松了 v1.1 严格语义，string next + gate failed 不 throw | 🟡 MEDIUM | Agent-based 工作流可能忽略 gate 失败 |
| **FIND-3** | HTTP `POST /state/transition` 不调用 `StateManager.transition()`，状态只在内存 | 🟡 MEDIUM | 进程重启后状态丢失 |
| **FIND-4** | `clearHistory()` 公开导出，无 guard | 🟡 MEDIUM | 可销毁审计记录 |
| **FIND-5** | `deleteInstance()` 无 critical state 检查 | 🟡 MEDIUM | 可删除正在运行的工作流 |
| **FIND-6** | 无 actor/role/permission 模型 | 🟡 MEDIUM | 任何调用者都被信任 |
| **FIND-7** | `waived` gate status 无专用测试 | 🟢 LOW | 行为正确但未验证 |
| **FIND-8** | `closed` 吸收态无显式测试 | 🟢 LOW | 代码正确但未测试 |
| **FIND-9** | 39 个预存 unit test 失败未修复 | 🟢 LOW | 不影响 v1.1 主链路 |

---

## 16. 不确定项

| ID | 不确定点 | 需要什么确认 |
|---|---|---|
| **UNC-1** | `AgentWorkflowEngine` 是否在生产中被使用 | 如果不被生产使用，FIND-1 降级 |
| **UNC-2** | HTTP `POST /state/transition` 是否有生产客户端 | 如果无客户端，FIND-3 降级 |
| **UNC-3** | `clearHistory()` 是否被生产代码调用 | 如果只在测试中使用，FIND-4 降级 |
| **UNC-4** | `waived` 是否是 v1.1 设计的特性 | 如果不是，FIND-7 可忽略 |
| **UNC-5** | `transition()` deprecated 函数是否应增加 NODE_ENV 运行时检查 | 取决于团队对测试与生产的隔离策略 |
