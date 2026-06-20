# SpecForge V12 回归失败复盘修正版：旧规则测试定位错误与新规则验证纪律

> 固化日期：2026-06-20  
> 修订原因：前一版复盘仍把“前面测的是旧规则下能否 closed”说得过于中性，没有明确指出这是测试目标错误。  
> 本文明确结论：旧规则测试只能作为回归保护，不能作为新规则验收。前面花大量时间验证旧规则能 closed，对验证新治理规则是否实现是不充分的。

---

## 1. 直接结论

用户批评是正确的。

我们的目标不是证明旧规则还能跑，而是把新规则写好、实现好、测试好。

前面多次真实项目测试虽然跑了 feature / bugfix / quick-change，但很多测试的实际价值被高估了，因为它们主要证明：

```text
旧规则下流程还能 closed。
```

这不是本阶段的主目标。

本阶段的主目标应该是证明：

```text
新规则已经成为系统强约束；
Agent 想绕过也绕不过；
工具链能承载新规则所需字段；
正向路径能通过；
负向路径必须失败；
产物能证明规则真实生效。
```

因此，前面测试存在严重偏差：测试了流程运行性，没有充分测试新治理规则的强制性。

---

## 2. 旧规则测试有没有意义

有，但意义很小，且只能作为辅助回归。

旧规则测试的唯一价值是：

```text
确认新补丁没有把已经修好的旧链路破坏。
```

例如：

```text
Candidate Gate 不应回归；
状态权威链路不应回归；
changed_files_audit 不应回归；
close_gate 不应回归。
```

但旧规则测试不能回答：

```text
user_approved 是否必须携带 user_response_quote；
auto_approved 是否必须携带 auto_approval_policy_id；
Orchestrator 是否真的不能代替用户批准；
wrapper schema 是否真的暴露新字段；
OpenCode 当前会话是否真的加载了新 schema；
work_item.json 是否真的不能伪装成 user_decision。
```

所以旧规则测试只能占很小比例，不能作为主要验收依据。

建议比例：

```text
新规则强制验证：80%
旧链路回归保护：20%
```

前面实际上反过来了，这是错误的。

---

## 3. 为什么前面多次测试没有发现问题

### 3.1 测试目标设错

前面测试的核心验收经常是：

```text
最终是否 closed。
```

这对旧规则有效，但对新规则不够。

比如 V12 的新规则是审批边界：

```text
user_approved 必须带用户原话；
auto_approved 必须带策略 ID；
Orchestrator 不得代替用户批准。
```

那么测试目标不应该只是 closed，而应该是：

```text
sf_user_decision_record 调用中必须有 user_response_quote；
缺少 user_response_quote 必须失败；
comments 中写 user_response_quote 不得通过；
user_decision.json 必须生成；
events.jsonl 必须出现 approval_required → approved；
actor 必须是 user_decision_recorder；
work_item.json 不能承载 user decision。
```

前面没有这么测，所以没有发现问题。

---

### 3.2 旧流程的“成功”掩盖了治理漏洞

旧流程允许 Orchestrator 把“用户委派修 bug”解释成“用户已批准 Candidate”。

这会让流程继续 closed，但治理上是错误的。

正确规则是：

```text
用户要求修 bug ≠ 用户批准 Candidate。
```

这两者必须分开。

旧流程的成功，反而掩盖了这个漏洞。

---

### 3.3 真实项目测试没有转换成“新规则断言”

真实项目测试本身没有问题，问题是测试断言错了。

例如测试 bugfix 项目时，不应只看：

```text
npm test 是否通过；
WI 是否 closed。
```

还必须看：

```text
workflow_type 是否保持 bugfix_spec；
Candidate 审批是否真的等待用户；
user_response_quote 是否落盘；
没有 user_response_quote 时是否拒绝；
Orchestrator 是否没有用 work_item.json 伪写决策；
approval_required → approved 是否由 user_decision_recorder 完成。
```

前面缺少这些断言，所以测试没有打到问题。

---

### 3.4 没有做负向测试

新规则不是只要正向通过。新规则最重要的是：违规时必须失败。

V12 必须有这些负向测试：

```text
user_approved 不传 user_response_quote → 必须失败；
user_response_quote 放在 comments 中 → 必须失败；
auto_approved 不传 auto_approval_policy_id → 必须失败；
Orchestrator 直接 state_transition approval_required → approved → 必须失败；
sf_artifact_write file_type=work_item 写 decision_status → 必须失败；
work_item.json 出现 user_response_quote → 必须判为违规；
wrapper schema 缺字段 → 安装自检必须失败。
```

前面没有负向测试，所以即使旧路径能跑，也不能说明新规则可靠。

---

### 3.5 没有验证“规则实现链路”

新规则不是写在 daemon 里就完了。

每条新规则都必须验证完整链路：

```text
规则定义
→ daemon 校验
→ tool handler
→ OpenCode wrapper schema
→ setup 部署源
→ live 用户目录
→ 当前运行会话 schema
→ Agent 调用参数
→ daemon 收到 payload
→ runtime events
→ artifact 落盘
→ close_gate 检查
```

V12 只改了一部分，漏了 wrapper schema 和 live/runtime schema，所以测试才会失败。

---

## 4. 前面完善旧规则的问题在哪里

问题不在于完全不能测旧规则，而在于把旧规则测试当成了阶段成果。

这没有意义。

旧规则测试应该只是每轮最后的回归保护：

```text
确认老功能没坏。
```

真正的阶段成果必须是：

```text
新规则被实现；
新规则被强制；
新规则有正向测试；
新规则有负向测试；
新规则在真实项目中有证据产物。
```

如果一轮补丁只证明“旧流程还能 closed”，那这轮对新治理目标基本没有价值。

---

## 5. 后续必须改成“新规则优先”的工作方式

以后每轮不能直接写代码。

必须先写新规则验收矩阵。

模板如下。

---

## 6. 新规则验收矩阵模板

### 6.1 规则描述

```text
规则 ID：
规则名称：
规则目标：
为什么需要：
涉及阶段：
涉及状态：
涉及产物：
涉及工具：
涉及 Agent / Skill：
```

### 6.2 正向用例

```text
合法输入：
预期工具调用：
预期 daemon payload：
预期 events.jsonl：
预期 artifact：
预期最终状态：
```

### 6.3 负向用例

```text
违规输入：
预期错误码：
是否 hard_stop：
是否 retryable：
是否允许继续：
预期 artifact 不应出现：
预期状态不应推进：
```

### 6.4 部署链路检查

```text
仓库源文件：
setup 源文件：
installer 来源：
live 用户目录：
当前 OpenCode schema：
是否需要重启：
重启后如何确认：
```

### 6.5 真实项目测试断言

```text
feature 场景必须证明：
bugfix 场景必须证明：
quick-change 场景必须证明：
产物 zip 必须包含：
日志必须包含：
不得出现：
```

没有这张表，不写代码。

---

## 7. V13 必须按新规则优先方式执行

V13 不能再先写补丁。

V13 必须先完成以下规则矩阵。

### R1：用户审批证据规则

```text
user_approved 必须携带 user_response_quote。
```

正向：

```text
用户回复“批准”；
sf_user_decision_record(user_response_quote="批准") 成功；
user_decision.json 生成；
状态 approval_required → approved。
```

负向：

```text
不传 user_response_quote → 失败；
写在 comments 中 → 失败；
Orchestrator 代填 → 失败；
work_item.json 写 decision 字段 → 失败。
```

---

### R2：自动审批策略规则

```text
auto_approved 必须携带 auto_approval_policy_id，且策略存在。
```

正向：

```text
配置 code_only_fast_path_default；
传 auto_approval_policy_id；
daemon 验证 policy；
user_decision.json 标记 auto_approved。
```

负向：

```text
缺 policy_id → 失败；
policy_id 不存在 → 失败；
comments 中写 policy_id → 失败；
Agent 自称符合策略但未传字段 → 失败。
```

---

### R3：wrapper schema 一致性规则

```text
daemon 要求的字段必须在 OpenCode wrapper schema 中暴露。
```

正向：

```text
setup wrapper 包含字段；
live wrapper 包含字段；
当前 OpenCode schema 可见字段；
调用 payload 真正传到 daemon。
```

负向：

```text
setup 有但 live 没有 → 安装自检失败；
live 有但未重启 → 当前 schema 自检失败；
字段只在 comments 中 → 失败。
```

---

### R4：user_decision 产物边界规则

```text
用户决策不能写入 work_item.json。
```

正向：

```text
只生成 user_decision.json；
work_item.json 不包含 user_response_quote；
events 由 user_decision_recorder 推进。
```

负向：

```text
sf_artifact_write file_type=work_item 写 decision_status → 失败；
work_item.json 出现 user_response_quote → close_gate 失败；
Orchestrator 手写 decision artifact → 失败。
```

---

## 8. V13 的完成标准

V13 只有满足以下条件才算完成：

```text
1. 新规则矩阵已写入文档；
2. 代码按矩阵实现；
3. build 通过；
4. wrapper/setup/live/current schema 全部自检通过；
5. feature / bugfix / quick-change 三场景全部自然 closed；
6. 每个场景都证明 user_decision 正确落盘；
7. 至少执行审批负向测试；
8. 产物 zip 检查通过；
9. 不依赖手工修 live wrapper；
10. 不依赖跳过审批或临时绕行。
```

---

## 9. 对用户问题的直接回答

### 9.1 “旧规则还要测试吗？”

要，但只作为回归保护，不是主目标。

### 9.2 “花那么长时间测试旧规则有意义吗？”

作为主测试目标，没有意义。

它只说明旧流程还能跑，不能说明新规则写好了。

### 9.3 “完善旧规则有什么意义？”

如果只是完善旧规则本身，没有意义。

我们要完善的是新治理规则；旧规则只用于防止新补丁破坏历史能力。

### 9.4 “为什么前面没发现？”

因为测试断言错了。

前面测试了：

```text
能否 closed。
```

没有测试：

```text
是否按新规则、带新证据、通过新接口、生成新产物、拒绝违规路径地 closed。
```

这是测试设计失败。

---

## 10. 新纪律

从 V13 开始：

```text
不先写代码；
先写新规则验收矩阵；
不测旧成功路径作为主结论；
每条新规则必须有正向和负向测试；
每个真实项目测试必须说明它证明了哪条新规则；
没有证明新规则，就不能算通过。
```

