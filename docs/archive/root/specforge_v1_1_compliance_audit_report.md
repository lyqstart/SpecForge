# SpecForge v1.1 标准符合性审核报告

> 审核对象：  
> 1. `https://github.com/lyqstart/specforge.git`  
> 2. `spec-opencode.zip`（位于 `~/.config/opencode/` 的 OpenCode 扩展程序、插件、自定义 Agent）  
> 3. `specforge_final_fused_standard_v1_1_patch1_zh.md`  
>
> 审核目标：判断当前 SpecForge 项目和 OpenCode 扩展是否符合 `SpecForge 最终融合标准 v1.1 + Patch 1`。  
>
> 审核结论：**当前项目不能判定为 v1.1 合格实现。**

---

## 1. 总体结论

当前 `specforge` / `spec-opencode.zip` 更准确地说，是一个基于 OpenCode 的：

```text
Agent + Tool + Plugin 工作流框架
```

但还不是 v1.1 标准要求的：

```text
不可绕过的规格驱动 Runtime
```

核心问题不是 Agent 提示词不够细，而是：

```text
标准要求关键控制必须由程序硬约束完成；
当前大量关键控制仍然依赖 Agent 提示词、工具说明和流程自觉。
```

`final fused standard v1.1` 明确要求：

```text
任何变更只能通过 Work Item 事务进入系统；
正式规格只能通过 Candidate + Gate + User Decision + Merge Runner 合并；
代码只能在 code_permission + allowed_write_files + Write Guard 下修改；
关闭只能在 verification、evidence、trace、audit、merge 或 not_applicable 全部闭环后通过 close_gate。
```

并且标准明确说：

```text
关键控制不得依赖 Agent 自觉执行；
必须落到 Runtime、State Machine、Path Policy、Gate Runner、User Decision Recorder、Merge Runner、
code_permission_service、Write Guard、changed_files_audit、close_gate。
```

当前项目还没有完成这条硬闭环。

---

## 2. 判断逻辑

OpenCode 本身提供的是扩展机制，可以配置：

```text
agents
tools
plugins
skills
```

OpenCode 插件可以监听事件，自定义工具也可以与内置工具共存，甚至覆盖部分工具行为。

因此，SpecForge 要实现 v1.1 的“不可绕过”，必须做到两件事：

```text
1. 入口收口：
   把 OpenCode 的 edit / write / bash / tool 调用纳入 SpecForge 权限系统。

2. 状态收口：
   所有 WI、Gate、User Decision、Merge、close 都由 Runtime 判断，
   不能由 Agent 自述、聊天同意或提示词承诺替代。
```

当前附件中的实现更接近：

```text
OpenCode tool 执行前后记录事件
Agent 按提示词生成规格和任务
部分工具做安全包装
部分 Gate 做检查
```

而不是：

```text
OpenCode tool 执行前必须经过 Runtime 权限判断
不合法直接阻断
合法才放行
执行后再审计实际改动
最后由 close_gate 判断是否可关闭
```

这是当前最大差距。

---

## 3. P0 问题：目录模型与 v1.1 标准冲突

### 3.1 仍大量使用 `.specforge/specs/<WI>` 作为主路径

v1.1 标准要求 MVP 用户项目 `.specforge/` 只能创建：

```text
.specforge/project/
.specforge/work-items/
.specforge/runtime/
```

并明确规定：

```text
.specforge/specs/<WI-ID>/ 只能作为 legacy read-only；
新 WI 不得写入旧路径；
旧 specs 不能作为当前规格真相源；
旧 specs 迁移必须通过 spec_migration_path。
```

但附件中大量文件仍以 `.specforge/specs/<WI>` 为主路径，例如：

```text
tools/lib/directory-layout.ts
tools/lib/sf_artifact_write_core.ts
tools/lib/sf_evidence_write_core.ts
tools/lib/sf_knowledge_graph_core.ts
agents/sf-requirements.md
agents/sf-design.md
agents/sf-task-planner.md
agents/sf-executor.md
agents/sf-reviewer.md
agents/sf-verifier.md
skills/sf-workflow-*.md
```

这说明当前实现仍然停留在旧目录体系。

### 3.2 实际后果

用户操作链路会变成：

```text
用户提出变更
→ Agent 创建或修改 .specforge/specs/WI-xxxx/**
→ 各 WI 的规格互相隔离
→ 没有项目级正式规格真相源
→ 没有 project_spec_version
→ 没有正式 Candidate 合并过程
```

系统风险是：

```text
1. 无法形成项目级规格事实；
2. 每个 WI 仍像一份孤立规格；
3. 后续变更无法稳定追溯到正式规格；
4. 无法证明代码修改前规格已完成受控合并；
5. 无法满足 v1.1 的 project-level truth source 要求。
```

### 3.3 `.specforge/archive/` 等目录仍存在

当前 `directory-layout.ts` 中仍定义了类似：

```text
.specforge/archive/
.specforge/archive/agent_runs/
.specforge/sessions/
.specforge/cas/
.specforge/knowledge/
.specforge/logs/
```

而 v1.1 MVP 明确禁止用户项目创建：

```text
.specforge/standards/
.specforge/archive/
.specforge/state/
.specforge/gates/
.specforge/reports/
.specforge/snapshots/
```

因此，当前目录模型整体需要迁移，不是局部修补。

---

## 4. P0 问题：状态机不是 v1.1 状态机

v1.1 要求的主状态包括：

```text
created
intake_ready
impact_analyzing
impact_analyzed
workflow_selected
candidate_preparing
candidate_prepared
gates_running
gates_failed
approval_required
approved
merge_ready
merging
merged
post_merge_verified
implementation_ready
implementation_running
implementation_done
verification_running
verification_done
closed
blocked
rejected
superseded
```

并明确禁止：

```text
created → implementation_running
intake_ready → implementation_running
impact_analyzing → implementation_running
impact_analyzed → implementation_running
workflow_selected → implementation_running
candidate_prepared → merging
approval_required → merging
approval_required → closed
merged → closed
closed → any
blocked → closed
rejected → closed
```

但附件中的 `tools/lib/state_machine.ts` 仍是旧工作流状态，例如：

```text
intake
requirements
requirements_gate
requirements_approval
design
design_gate
design_approval
tasks
tasks_gate
development
review
verification
verification_gate
completed
blocked
```

这套状态表达的是：

```text
需求 → 设计 → 任务 → 开发 → 审查 → 验证
```

而不是 v1.1 要求的：

```text
受控变更事务 → Candidate → Gate → User Decision → Merge → Permission → Implementation → Verification → close_gate
```

### 实际风险

当前状态机可能允许：

```text
tasks_gate → development
```

但 v1.1 要求在实现前必须先完成：

```text
candidate / gate / user_decision / merge 或 merge not_applicable
code_permission_service release
allowed_write_files
Write Guard enabled
```

所以当前状态机不能证明“实现阶段合法”。

---

## 5. P0 问题：缺少 Candidate / Manifest / User Decision / Merge Runner 主链

v1.1 的正式规格变更主链是：

```text
Agent 生成 Delta / Candidate
→ candidate_manifest.json
→ Gate Runner 生成 gates/*.json
→ gate_summary.md
→ gate_summary_gate
→ User Decision Recorder 写 user_decision.json
→ merge_ready_gate
→ Merge Runner 按 candidate_manifest.json 写 .specforge/project/**
→ merge_report.md
→ post_merge_gate
```

但当前附件中没有形成这条主链。

检索结果显示，以下关键对象基本缺失：

```text
candidate_manifest.json
user_decision.json
merge_report.md
gate_summary.md
merge_ready_gate
post_merge_gate
Merge Runner
User Decision Recorder
```

这说明当前系统还没有 v1.1 的规格合并事务模型。

### 错误链路

当前容易形成：

```text
用户说“同意”
→ Agent 继续推进
→ Agent 直接进入设计 / 任务 / 开发
```

### 正确链路

v1.1 要求：

```text
用户说“同意”
→ User Decision Recorder 写 user_decision.json
→ merge_ready_gate 校验 decision、hash、base_spec_version、manifest、gate_summary
→ Merge Runner 只按 candidate_manifest 合并
→ post_merge_gate 校验写入结果和版本
→ 后续实现权限才可能释放
```

你当前缺的是程序级审批事实和合并执行器，不是缺“同意”的提示词。

---

## 6. P0 问题：Write Guard 没有真正实现

v1.1 要求 Write Guard 覆盖所有写入入口：

```text
edit 工具
SpecForge 写文件工具
bash
formatter
generator
package manager
snapshot update
Git 相关写入
```

并且所有可能写文件的命令必须声明：

```text
expected_write_files
```

无声明则默认只读或阻断。

当前附件中虽然已有 `sf_safe_bash`，能做危险命令拦截、timeout 和审计日志，但这不是完整 Write Guard。

### 缺失能力

当前没有看到完整实现：

```text
code_change_allowed
code_permission_service
allowed_write_files 的硬校验
expected_write_files
write_scope_gate
actual_changed_files audit
escaped_write_incident
普通 Agent 写 .specforge/project/** 阻断
普通 Agent 写 user_decision.json 阻断
普通 Agent 写 gates/** 阻断
普通 Agent 写 gate_summary.md 阻断
普通 Agent 写 merge_report.md 阻断
closed WI 后写入阻断
```

### Agent 权限过宽

多个 Agent 仍然拥有：

```yaml
permission:
  edit: allow
  bash: allow
```

例如：

```text
sf-orchestrator
sf-requirements
sf-design
sf-task-planner
sf-executor
sf-debugger
sf-investigator
```

这会导致一个关键问题：

```text
Agent 提示词说“不要越界写”，
但系统层没有保证它不能越界写。
```

v1.1 要求的是：

```text
Agent 负责生成意图；
Runtime 负责批准动作；
Write Guard 负责执行前阻断；
changed_files_audit 负责执行后对账；
close_gate 负责最终闭锁。
```

当前主要仍停留在：

```text
Agent 自己承诺不越界。
```

这不符合 v1.1 的核心精神。

---

## 7. P0 问题：extension_registry.json / Extension Subflow 未落地

Patch 1 明确要求：

```text
.specforge/project/extension_registry.json
```

必须属于项目级正式规格，即使为空也必须存在。

Agent 在生成 requirements、design、tasks、verification、Gate 产物时，必须先确认所使用类型是否已经在正式 `extension_registry.json` 中登记。

如果缺少必要类型，必须触发 Extension Subflow：

```text
Agent 发现扩展缺口
→ 写 extension_request.json
→ handoff 报告 extension_required
→ sf-orchestrator 阻断主流程
→ sf-orchestrator 调度 sf-extension
→ sf-extension 生成 extension_delta.md
→ 生成 extension_registry candidate
→ extension_gate
→ Gate Summary
→ User Decision
→ Merge Runner 合并 extension_registry.json
→ post_merge_gate
→ 恢复主流程
```

但当前附件中只在部分 Agent 宪法内容里提到了 `extension_registry`，没有看到完整落地：

```text
sf-extension agent
extension_request.json 处理逻辑
extension_delta.md
extension_gate
extension_registry candidate
extension_registry merge
close_gate 检查未处理 extension_request
```

因此 Patch 1 基本没有程序级实现。

---

## 8. P1 问题：OpenCode Plugin 更像事件采集，不是写入拦截

当前 `plugins/sf_specforge.ts` 主要做：

```text
注册项目到 daemon
监听 tool.execute.before / after
监听 event
监听 chat / system / messages hooks
发送事件给 daemon
```

这更像：

```text
审计 / 遥测 / 上下文同步插件
```

不是：

```text
写入强制拦截插件
```

尤其是 `wrap()` 捕获异常后主要是 `console.warn`，不会阻断 OpenCode 工具执行。

当前链路更接近：

```text
OpenCode tool 将要执行
→ SpecForge 记录事件
→ OpenCode tool 继续执行
```

而 v1.1 要求：

```text
OpenCode tool 将要执行
→ SpecForge Runtime 判断权限
→ 不合法直接拒绝执行
→ 合法才放行
→ 执行后审计实际改动
```

这是架构级差距。

---

## 9. P1 问题：Agent 体系方向正确，但不能替代 Runtime

你的 Agent 体系有很多正确方向：

```text
sf-investigator 强调先证据后结论
sf-reviewer 强调只读审查
sf-verifier 强调不能只凭测试通过就完成
sf-task-planner 要求 allowed_write_files
sf-executor 要求只执行单个 TASK
```

这些都对。

但问题是：

```text
Agent 合同不能替代 Runtime 合同。
```

如果 OpenCode 的 edit/bash 仍允许，Agent 提示词中的“不得越界”没有硬约束。

正确边界应该是：

```text
普通 Agent 可以生成：
requirements_delta.md
design_delta.md
tasks.md
trace_delta.md
Candidate 内容
verification_report.md
handoff
evidence

普通 Agent 不能：
推进 WI 状态
释放 code_permission
写 .specforge/project/**
写 user_decision.json
写 gates/**
写 gate_summary.md
写 merge_report.md
关闭 WI
绕过 Gate
```

这些必须由 Runtime 和工具权限实现，而不是靠提示词。

---

## 10. P1 问题：README / 安装说明仍是旧体系

当前项目说明仍把 SpecForge 描述为：

```text
需求 → 设计 → 任务 → 有测试证据的代码
9 个专业 Agent
4 个 Gate
状态机驱动
Knowledge Graph / Knowledge Base
Plugin 自动初始化 specforge/ 目录
```

并且仍使用类似：

```text
project-root/specforge/
  manifest.json
  agents/
  config/
  runtime/
  logs/
  specs/
  archive/
  knowledge/
  sessions/
```

这与 v1.1 要求的：

```text
project-root/.specforge/
  project/
  work-items/
  runtime/
```

不一致。

风险是：

```text
1. 使用者继续以为 specs 是主线；
2. 开发者继续沿旧架构补功能；
3. 目录迁移被推迟；
4. v1.1 标准和代码实际路径长期分裂。
```

---

## 11. 严重等级汇总

| 严重级别 | 问题 | 判断 |
|---|---|---|
| P0 | 仍使用 `.specforge/specs/<WI>` 作为主产物路径 | 不符合 v1.1 |
| P0 | 没有 `.specforge/project/` 项目级正式规格真相源闭环 | 不符合 v1.1 |
| P0 | 没有 `.specforge/work-items/<WI>` 事务模型 | 不符合 v1.1 |
| P0 | 没有 Candidate / candidate_manifest / gate_summary / user_decision / merge_report 主链 | 不符合 v1.1 |
| P0 | 没有 Merge Runner | 不符合 v1.1 |
| P0 | 没有 User Decision Recorder | 不符合 v1.1 |
| P0 | 没有 close_gate | 不符合 v1.1 |
| P0 | 没有真正 Write Guard | 不符合 v1.1 |
| P0 | 状态机仍是旧工作流状态，不是事务状态机 | 不符合 v1.1 |
| P0 | Patch 1 的 extension_registry / Extension Subflow 未实现 | 不符合 v1.1 |
| P1 | Plugin 主要是事件采集，不是写入阻断 | 架构风险 |
| P1 | Agent 权限过宽，edit allow 太多 | 架构风险 |
| P1 | README / 安装后目录说明仍是旧体系 | 迁移风险 |
| P2 | Gate 工具已有基础，但不是 v1.1 Gate Report / Gate Summary 模型 | 需重构 |
| P2 | Evidence 系统较丰富，但路径和 manifest 模型不符合新标准 | 需迁移 |

---

## 12. 整改原则

不要继续优先补 Agent。

当前最重要的不是：

```text
让 Agent 更聪明
让提示词更严
让流程描述更完整
```

而是先完成：

```text
Runtime 主链硬化
Path Service / Path Policy
State Machine
Candidate Manifest
User Decision Recorder
Merge Runner
Write Guard
changed_files_audit
close_gate
```

一句话：

```text
先把“不能绕过”做出来，再让 Agent 在这个笼子里工作。
```

---

## 13. 建议整改分支

建议新建分支：

```bash
git checkout -b specforge-v1.1-runtime-governance-migration
```

分支目标不要叫“优化 Agent”，而应明确为：

```text
将 SpecForge 从旧版 Agent 工作流迁移为 v1.1 Runtime Governance 闭环。
```

---

## 14. 第一轮整改范围

第一轮不要贪多，只做 4 件事：

```text
1. directory-layout.ts 迁移到 .specforge/project + work-items + runtime
2. state_machine.ts 替换为 v1.1 主状态机
3. 新增 path_policy + id_rules
4. 禁止新写 .specforge/specs/**
```

### 第一轮不做

```text
不做完整 Merge Runner
不做完整 Write Guard
不做完整 User Decision
不做 Agent 大重写
不做 UI
不做复杂 Gate DAG
不做 legacy migration 自动化
```

原因：

```text
目录和状态机不先改，后面的所有功能都会继续长在旧骨架上。
```

---

## 15. 第一轮整改详细要求

### 15.1 Path Service

新增或重构 Path Service，至少提供：

```text
projectRoot()
projectSpecManifest()
projectExtensionRegistry()
projectRequirementsIndex()
projectDesignIndex()
projectArchitecture()
projectGlossary()
projectDecisions()
projectTraceMatrix()
projectModulesRoot()
moduleRoot(moduleName)
moduleJson(moduleName)
moduleRequirements(moduleName)
moduleDesign(moduleName)
moduleTrace(moduleName)

workItemsRoot()
workItemRoot(workItemId)
workItemJson(workItemId)
workItemIntake(workItemId)
workItemChangeClassification(workItemId)
workItemImpactAnalysis(workItemId)
workItemTriggerResult(workItemId)
workItemTasks(workItemId)
workItemTraceDelta(workItemId)
candidateManifest(workItemId)
gateSummary(workItemId)
userDecision(workItemId)
verificationReport(workItemId)
mergeReport(workItemId)
evidenceManifest(workItemId)
```

### 15.2 Path Policy

Path Policy 必须校验：

```text
使用项目根目录相对路径
使用 POSIX 风格 /
不允许绝对路径
不允许 ..
不允许 ~
不允许 Windows 反斜杠 \
引用项目规格文件必须带 .specforge/ 前缀
正式规格只能位于 .specforge/project/**
WI 事务文件只能位于 .specforge/work-items/<WI-ID>/**
runtime 文件只能位于 .specforge/runtime/**
```

### 15.3 Legacy specs 只读

所有新写入必须禁止：

```text
.specforge/specs/**
```

允许的行为只有：

```text
读取旧 specs
生成 migration inventory
通过 spec_migration_path 迁移
```

不得静默混写。

---

## 16. 第二轮整改范围

第二轮做状态机。

### 16.1 替换状态枚举

必须替换为 v1.1 主状态：

```text
created
intake_ready
impact_analyzing
impact_analyzed
workflow_selected
candidate_preparing
candidate_prepared
gates_running
gates_failed
approval_required
approved
merge_ready
merging
merged
post_merge_verified
implementation_ready
implementation_running
implementation_done
verification_running
verification_done
closed
blocked
rejected
superseded
```

### 16.2 禁止跳转

必须测试以下跳转失败：

```text
created → implementation_running
intake_ready → implementation_running
impact_analyzing → implementation_running
impact_analyzed → implementation_running
workflow_selected → implementation_running
candidate_prepared → merging
approval_required → merging
approval_required → closed
merged → closed
closed → any
blocked → closed
rejected → closed
```

### 16.3 状态推进主体

状态推进必须绑定主体：

```text
sf-orchestrator
Runtime State Machine
Gate Runner
User Decision Recorder
Merge Runner
code_permission_service
close_gate
```

普通 Agent 不得直接推进 WI 状态。

---

## 17. 第三轮整改范围

第三轮做 Candidate 主链。

### 17.1 必须新增

```text
candidate_manifest.json
gates/<gate_id>.json
gate_summary.md
user_decision.json
merge_report.md
merge_ready_gate
post_merge_gate
Merge Runner
User Decision Recorder
```

### 17.2 关键规则

```text
Candidate 必须是完整目标文件，不是 patch
candidate_path 必须指向当前 WI 的 candidates/**
target_path 必须指向 .specforge/project/**
Merge Runner 只能按 candidate_manifest 合并
Merge Runner 禁止扫描 candidates/** 自行决定合并对象
聊天“同意”不能替代 user_decision.json
base_spec_version 不一致不能 Merge
hash 不一致不能 Merge
```

---

## 18. 第四轮整改范围

第四轮做真正 Write Guard。

### 18.1 必须新增

```text
code_permission_service
code_change_allowed
allowed_write_files
expected_write_files
write_scope_gate
changed_files_audit
escaped_write_incident
```

### 18.2 必须覆盖

```text
edit 工具
SpecForge 写文件工具
bash
formatter
generator
package manager
snapshot update
Git 相关写入
```

### 18.3 必须阻断

```text
无 active WI 写代码
code_change_allowed=false 写代码
写入不在 allowed_write_files 内的代码文件
普通 Agent 写 .specforge/project/**
普通 Agent 写 user_decision.json
普通 Agent 写 gates/**
普通 Agent 写 gate_summary.md
普通 Agent 写 merge_report.md
冻结后修改 Candidate / Manifest / Gate Summary
closed WI 继续写入
```

---

## 19. 第五轮整改范围

第五轮实现 Patch 1。

### 19.1 必须新增正式规格文件

```text
.specforge/project/extension_registry.json
```

并在 `spec_manifest.json` 中登记：

```json
{
  "project": {
    "extension_registry": ".specforge/project/extension_registry.json"
  }
}
```

### 19.2 必须新增 Extension Subflow

```text
extension_request.json
sf-extension Agent
extension_delta.md
extension_registry candidate
extension_gate
extension_registry merge
extension_registry post_merge_gate
主流程恢复逻辑
```

### 19.3 必须阻断

```text
Agent 临时创造扩展类型
未知类型直接写入 Candidate
普通 Agent 直接写 extension_registry.json
sf-design 直接启动 Extension Subflow
Extension Subflow 不经过 User Decision
Extension Subflow 不经过 Merge Runner
主流程不重新读取 extension_registry 就继续执行
```

---

## 20. 第一轮验收标准

第一轮完成后，至少要能证明：

```text
1. 新项目初始化只创建：
   .specforge/project/
   .specforge/work-items/
   .specforge/runtime/

2. 不再新建：
   .specforge/specs/
   .specforge/archive/
   .specforge/state/
   .specforge/gates/
   .specforge/reports/
   .specforge/snapshots/

3. spec_manifest.json 存在。

4. extension_registry.json 存在。

5. Path Policy 能拒绝：
   绝对路径
   ..
   ~
   Windows 反斜杠
   非 .specforge/ 前缀的规格路径

6. 新 WI 创建在：
   .specforge/work-items/<WI-ID>/

7. 旧 .specforge/specs/** 只能读取，不能写入。

8. 所有路径生成集中在 Path Service。
```

---

## 21. 第二轮验收标准

第二轮完成后，至少要能证明：

```text
1. v1.1 主状态枚举完整存在。
2. 旧状态不再作为主状态使用。
3. 禁止跳转全部有测试。
4. 普通 Agent 不能直接推进状态。
5. closed 状态不可再变更。
6. blocked 不能直接 closed。
7. merged 不能直接 closed。
```

---

## 22. 第三轮验收标准

第三轮完成后，至少要能证明：

```text
1. 没有 candidate_manifest 不能 Merge。
2. 没有 user_decision.json 不能 Merge。
3. 聊天“同意”不能直接 Merge。
4. hash 不匹配不能 Merge。
5. base_spec_version 不匹配不能 Merge。
6. Merge Runner 只能写 manifest entries。
7. 普通 Agent 不能写 .specforge/project/**。
8. merge_report.md 必须生成。
9. post_merge_gate 必须通过后才算 merged 完成。
```

---

## 23. 第四轮验收标准

第四轮完成后，至少要能证明：

```text
1. 无 active WI 写代码失败。
2. code_change_allowed=false 写代码失败。
3. allowed_write_files 外写入失败。
4. bash 未声明 expected_write_files 默认只读或阻断。
5. formatter 额外改文件会被 changed_files_audit 抓到。
6. 普通 Agent 写 user_decision.json 失败。
7. 普通 Agent 写 gates/** 失败。
8. 普通 Agent 写 gate_summary.md 失败。
9. 普通 Agent 写 merge_report.md 失败。
10. closed WI 后继续写入失败。
```

---

## 24. 第五轮验收标准

第五轮完成后，至少要能证明：

```text
1. extension_registry.json 是项目级正式规格文件。
2. spec_manifest.json 登记 extension_registry。
3. Agent 使用未知类型前会触发 extension_request.json。
4. blocking_current_flow=true 时主流程阻断。
5. sf-orchestrator 调度 sf-extension。
6. sf-extension 只生成 candidate，不直接写正式 registry。
7. extension_gate 是 hard_gate。
8. extension_registry 修改必须经过 User Decision。
9. Merge Runner 合并 extension_registry。
10. 合并后主流程重新读取 registry 并重新生成相关产物。
11. 未处理 extension_request 时 close_gate 失败。
```

---

## 25. 对当前项目的最终定性

当前项目不能判定为：

```text
SpecForge final fused standard v1.1 合格实现
```

只能判定为：

```text
旧版 SpecForge V6 风格的 OpenCode 多 Agent 工作流框架，
具备部分 Gate、状态流转、Evidence、Knowledge、safe_bash 能力，
但尚未实现 v1.1 的项目级规格真相源、事务型 WI、
Candidate 合并、User Decision、Merge Runner、Write Guard、close_gate 硬闭环。
```

最关键的问题是：

```text
标准还没有变成 Runtime 的不可绕过规则。
```

---

## 26. 下一步建议

建议立即执行：

```bash
git checkout -b specforge-v1.1-runtime-governance-migration
```

然后按顺序整改：

```text
Round 1：目录模型 + Path Service + Path Policy + legacy specs read-only
Round 2：v1.1 State Machine
Round 3：Candidate Manifest + Gate Report + Gate Summary + User Decision + Merge Runner
Round 4：code_permission_service + allowed_write_files + Write Guard + changed_files_audit
Round 5：extension_registry.json + Extension Subflow
Round 6：verification_report + evidence_manifest + close_gate
Round 7：端到端验收场景
```

不要先重写 Agent。

Agent 可以后调，Runtime 必须先硬化。

---

## 27. 一句话结论

```text
SpecForge 当前不是“缺几个功能”，而是“旧工作流骨架与 v1.1 治理标准不一致”。
必须先迁移 Runtime 主链，再谈 Agent 优化。
```
