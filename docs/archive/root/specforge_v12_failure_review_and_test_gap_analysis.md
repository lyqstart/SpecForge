# SpecForge V12 回归失败复盘与后续代码交付纪律整改

> 固化日期：2026-06-20  
> 主题：V12 workflow authority / approval boundary 回归失败复盘  
> 范围：解释为什么这次出现多个问题、为什么前面多次真实项目测试没有发现、后续如何防止重复发生。

---

## 1. 结论摘要

V12 不是单点 bug，而是一次“治理标准提升”暴露了系统更深层的接口契约问题。

前面几次真实项目测试能通过，主要因为它们验证的是：

```text
流程能不能跑完；
状态能不能 closed；
Gate 能不能通过；
Candidate / Merge / Implementation / Verification / Close 链路能不能闭环。
```

V12 开始验证的是另一类更严格的问题：

```text
Orchestrator 是否有权代替用户审批；
user_approved 是否有用户原话证据；
auto_approved 是否有明确策略 ID；
daemon 校验字段、tool wrapper schema、OpenCode 当前会话工具 schema、live 用户目录部署是否一致。
```

这两个层级不同。

前几轮“通过”，不代表审批证据链正确；只是旧规则没有严格检查这一层。V12 收紧规则后，隐藏的不一致集中暴露。

---

## 2. 为什么这次出现这么多问题

### 2.1 我把“目标规则”误当成“系统接口已经具备”

V12 的目标规则是正确的：

```text
user_approved 必须携带 user_response_quote
auto_approved 必须携带 auto_approval_policy_id
Orchestrator 不得代替用户伪造 approved
```

但我没有完整确认整条工具链是否已经支持这些字段：

```text
daemon-core 校验是否要求字段；
setup/userlevel-opencode/tools wrapper 是否暴露字段；
live ~/.config/opencode/tools wrapper 是否同步；
OpenCode 当前运行会话是否加载了新 schema；
Agent 实际看到的工具 schema 是否包含字段；
字段是否能从 Agent 传到 wrapper，再传到 daemon。
```

结果就是：

```text
daemon 开始要求 user_response_quote / auto_approval_policy_id；
Agent 想传，但当前会话的工具 schema 没暴露；
OpenCode strict schema 过滤未声明字段；
daemon 收不到字段；
流程停在 approval_required。
```

这是接口契约链路缺口，不是单个文件问题。

---

### 2.2 我早期交付方式仍有“脚本 patch”惯性

V11 / V11.1 / V11.2 暴露过同类问题：

```text
PowerShell 直接处理 TypeScript 模板字符串；
脚本中出现 `${...}`、反引号、三元表达式；
使用正则替换源码；
脚本自检依赖脆弱字符串。
```

这些做法本身就不适合 SpecForge 这种治理系统。用户之前已经明确要求：

```text
能文件替换就文件替换；
脚本不要复杂；
脚本只负责备份、复制、自检；
不要在脚本里做复杂源码改写。
```

我没有一开始就严格执行，导致前面几轮出现 ParserError、半补丁、类型错误等问题。

---

### 2.3 我没有先做“职责链路图”

SpecForge 的真实运行链路不是一个 daemon 文件，也不是一个 Agent 文档，而是：

```text
daemon-core
setup/userlevel-opencode
live ~/.config/opencode
OpenCode 当前运行会话工具 schema
tools wrapper
agents
skills
installer / deploy source
runtime/state.json
runtime/events.jsonl
work_item artifacts
```

V12 实际涉及的职责链路是：

```text
sf_user_decision_record daemon handler
sf_user_decision_record OpenCode wrapper
setup/userlevel-opencode/tools 源文件
live ~/.config/opencode/tools 文件
OpenCode schema 加载与重启机制
sf-orchestrator 审批规则
workflow skill 审批规则
user_decision.json 产物
state transition approval_required → approved
```

我只改了其中一部分，没有把整条链路打通。

---

### 2.4 我把 build 通过误判为治理链路通过

TypeScript build 只能证明：

```text
源码语法正确；
类型关系基本正确；
包能编译。
```

但它不能证明：

```text
OpenCode 当前会话看到了新字段；
wrapper schema 已被重新加载；
Agent 能传 user_response_quote；
daemon 能收到 user_response_quote；
user_decision.json 能生成；
approval_required 能推进到 approved；
feature / bugfix / quick-change 三场景都能 closed。
```

V12 的失败就是 build 通过但真实审批链路失败。

---

### 2.5 我对“通过”的判定不够严格

V12 的 quick-change 后来能 closed，是因为运行中手工修复了 live wrapper 并重启 OpenCode 后才继续推进。

这不能证明 V12 补丁包本身完整。

严格标准应该是：

```text
同一个补丁包；
同一个安装/部署来源；
同一个干净重启环境；
feature / bugfix / quick-change 三场景；
全部自然跑到 closed；
不依赖现场手工修 live 文件；
不依赖绕行或临时恢复。
```

V12 没有达到这个标准。

---

## 3. 为什么前面多次实际项目测试没有发现问题

这是另一个严重问题。不能简单说“因为 V12 新增了规则”，还要明确前面的测试盲区。

---

### 3.1 前面测试覆盖的是“旧成功路径”，不是“新治理约束路径”

前面 V6～V11 真实项目测试主要验证：

```text
Candidate 是否完整；
Gate 是否通过；
merge 是否推进；
post_merge_gate 是否推进；
code_permission 是否释放；
executor 是否执行；
changed_files_audit 是否通过；
verification_gate 是否通过；
close_gate 是否通过。
```

这些测试证明流程能跑完，但没有验证：

```text
user_approved 是否必须来自用户原话；
auto_approved 是否必须来自配置策略；
Orchestrator 是否会擅自代表用户审批；
wrapper schema 是否暴露审批证据字段；
OpenCode schema 是否需要重启才能生效；
当前运行会话工具 schema 是否与文件系统源码一致。
```

所以，前几次测试没有覆盖 V12 本次失败的关键点。

---

### 3.2 旧规则允许 Orchestrator “代替用户批准”，掩盖了问题

在旧流程中，bugfix 场景曾经可以这样继续：

```text
用户原始请求是“修复 bug”；
Orchestrator 把这个解释为用户已授权；
以 user_approved 形式记录决策；
继续 merge / implementation / verification / close。
```

这个行为能让流程 closed，但治理上是不严谨的。

V12 纠正了这个边界：

```text
用户要求修 bug ≠ 用户批准 Candidate；
user_approved 必须有用户在审批阶段的明确原话；
auto_approved 必须有明确策略 ID；
Agent 不能把“任务委托”解释成“候选规格批准”。
```

所以旧测试会通过，是因为旧规则没有把这个漏洞拦住。

---

### 3.3 测试没有包含“工具 schema 负向用例”

前面真实项目测试没有专门验证：

```text
当 daemon 要 user_response_quote 时，Agent 是否真的能传这个字段；
当 daemon 要 auto_approval_policy_id 时，Agent 是否真的能传这个字段；
字段写在 comments 里是否会被拒绝；
未声明字段是否会被 OpenCode schema 过滤；
wrapper 文件更新后是否必须重启。
```

这些都是 V12 这类治理规则的核心用例，但前面没有作为验收项。

---

### 3.4 测试没有验证“仓库源文件 → 用户级部署 → 当前会话 schema”的一致性

SpecForge 有至少三层工具定义：

```text
仓库源文件；
setup/userlevel-opencode/tools；
用户 live 目录 ~/.config/opencode/tools；
OpenCode 当前会话中已加载的 schema。
```

前面测试多数只看运行结果，没有强制验证：

```text
仓库源文件包含字段；
setup 源包含字段；
live 文件包含字段；
当前会话实际 schema 暴露字段；
重启后 schema 生效；
工具调用实际 payload 包含字段。
```

因此，live wrapper 与当前会话 schema 的不一致没有提前暴露。

---

### 3.5 测试没有把“approval_required 是否能自然越过”作为单独断言

前面真实测试只看最终 closed，或者看某个流程片段能继续执行。

V12 以后必须把 approval 阶段拆成强断言：

```text
状态进入 approval_required；
用户明确回复“批准”；
sf_user_decision_record 调用必须包含 user_response_quote；
生成 user_decision.json；
events.jsonl 出现 approval_required → approved；
actor 必须是 user_decision_recorder；
不得通过 work_item.json 替代 user_decision；
不得通过 Orchestrator 直接 state_transition 绕过。
```

前面没有把这几个点作为强制验收。

---

### 3.6 测试没有对“不该通过的行为”做断言

好的治理测试不只验证应该通过，还要验证不该通过的行为一定失败。

前面缺少这些负向测试：

```text
user_approved 缺少 user_response_quote 必须失败；
auto_approved 缺少 auto_approval_policy_id 必须失败；
comments 中写 user_response_quote 不得替代结构化字段；
Orchestrator 不能用 file_type=work_item 写审批结果；
work_item.json 不得承载 user_decision；
未重启 OpenCode 时新 schema 不应被假定生效。
```

这类负向测试缺失，是前面没发现问题的主要原因之一。

---

### 3.7 产物检查不够硬

真正可信的回归判断必须以 `.specforge` 产物为准，而不是只看日志里某一段“通过”。

每个场景必须检查：

```text
runtime/state.json current_state = closed
runtime/events.jsonl 有完整状态链
user_decision.json 存在且字段正确
gate_summary.md / gates/*.json 全部通过
changed_files_audit.md 通过
close_gate.json 通过
work_item.json 没被错误当作状态源或决策源
```

V12 本次复盘中，feature 和 bugfix 的 zip 仍停在 approval_required，说明日志里的部分成功不能代替产物真相。

---

## 4. 我的代码目标是什么，是否实现

### 4.1 V11 目标

目标：

```text
implementation 阶段只允许 executor 写 allowed_write_files；
executor 不得触碰 .specforge/work-items；
sf_safe_bash 不得造成不可恢复 HardStop；
changed_files_audit 能统计 blocked_write_attempts。
```

结论：

```text
基本实现，但过程不合格。
```

问题：

```text
V11 / V11.1 / V11.2 交付方式不严谨；
脚本 patch 脆弱；
直到 V11.3 才通过 build 和真实回归。
```

---

### 4.2 V12 目标

目标：

```text
workflow_type 权威；
启动状态协议规范；
用户审批边界规范；
user_approved 必须有 user_response_quote；
auto_approved 必须有 auto_approval_policy_id；
Orchestrator 不得代替用户批准。
```

结论：

```text
未完整实现。
```

已实现部分：

```text
daemon 校验规则开始生效；
bugfix_spec 创建入口部分生效；
Orchestrator 被阻止继续伪造 user_approved。
```

未实现部分：

```text
wrapper schema / setup / live / 当前会话工具 schema 未完整同步；
feature 和 bugfix 未自然 closed；
quick-change 是现场修 live wrapper 后才 closed；
work_item 被误用为 user_decision 的风险仍然存在。
```

---

## 5. 后续必须改变的代码交付方法

### 5.1 每一轮补丁前必须先写“职责链路表”

模板：

```text
目标：
涉及阶段：
涉及状态：
涉及 daemon 文件：
涉及 tool handler：
涉及 OpenCode wrapper：
涉及 setup 源文件：
涉及 live 部署文件：
涉及 Agent：
涉及 Skill：
涉及 installer：
涉及 runtime 产物：
涉及负向测试：
涉及真实回归场景：
```

没有职责链路表，不写代码。

---

### 5.2 不再用复杂脚本 patch 源码

以后默认：

```text
整文件替换；
脚本只做备份、复制、自检；
不在 PowerShell 里拼 TypeScript 模板字符串；
不在脚本里做复杂正则替换；
不让脚本承担代码生成职责。
```

---

### 5.3 build 不是完成标准

完成标准必须同时包含：

```text
TypeScript build 通过；
仓库源文件自检通过；
setup 源文件自检通过；
live 用户目录自检通过；
OpenCode 重启要求明确；
真实工具 schema 暴露字段；
三场景真实回归 closed；
产物 zip 检查通过。
```

---

### 5.4 每次回归必须包含正向 + 负向

例如审批治理必须测：

正向：

```text
用户回复“批准”；
sf_user_decision_record(user_response_quote="批准") 成功；
user_decision.json 生成；
状态进入 approved。
```

负向：

```text
缺 user_response_quote 必须失败；
把 user_response_quote 写进 comments 必须失败；
Orchestrator 用 work_item 写审批必须失败；
auto_approved 缺 policy_id 必须失败。
```

---

## 6. V13 必须一次性处理的范围

V13 不能只修一个字段，必须合并治理：

```text
1. 修 sf_user_decision_record wrapper 源文件；
2. 修 setup/userlevel-opencode/tools 部署源；
3. 修 installer / install 来源；
4. 同步 live ~/.config/opencode/tools；
5. 增加 schema 自检；
6. 明确 OpenCode 重启要求；
7. 禁止用 file_type=work_item 写 user decision；
8. 增加 user_decision 专用 artifact 或强制只走 sf_user_decision_record；
9. 三场景重新跑：
   - feature-spec-project
   - bugfix-spec-project
   - quick-change-project
10. 每个场景必须检查：
   - user_decision.json
   - events.jsonl
   - runtime/state.json
   - close_gate.json
   - changed_files_audit.md
```

---

## 7. 后续验收标准

V13 只有满足以下条件才算通过：

```text
feature-spec-project:
  - user approval 带 user_response_quote
  - user_decision.json 存在
  - final state closed

bugfix-spec-project:
  - workflow_type 保持 bugfix_spec
  - user approval 带 user_response_quote
  - 不使用 work_item 伪写决策
  - final state closed

quick-change-project:
  - auto_approved 若启用，必须带 auto_approval_policy_id
  - 或 user_approved 带 user_response_quote
  - final state closed

所有场景:
  - changed_files_audit passed
  - blocked_write_attempts = 0
  - close_gate passed
  - code_permission revoked
  - allowed_write_files cleared
```

---

## 8. 最终反思

这次问题不是“测试太少”，而是测试层级错了。

前面测试证明：

```text
旧规则下流程能跑完。
```

这次 V12 要证明：

```text
新治理规则下流程仍能正确、可审计、不可伪造地跑完。
```

这是更高一层的标准。前面的测试没有设计来发现这类问题，所以没发现是必然的。

后续不能再用“跑完一次真实项目”作为唯一依据。必须同时验证：

```text
接口契约；
部署链路；
运行时 schema；
正向路径；
负向路径；
产物真相；
状态权威。
```

只有这样，SpecForge 才能从“能运行”走向“治理可靠”。
