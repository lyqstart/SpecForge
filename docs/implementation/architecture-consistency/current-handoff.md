# SpecForge 架构一致性治理当前交接提示词

> **文件性质**：非权威当前交接文件
> **唯一产品设计依据**：`docs/design/SpecForge架构一致性治理最终实施方案.md`
> **当前活动实施文件**：`docs/implementation/architecture-consistency/P0-contract-consumer-closure.md`
> **最后确认的远程基线**：`main@08629b58c6aad82bf669a35e1f2bc8473cfa7ef3`
> **重要说明**：新会话开始时必须重新读取 GitHub `main` 当前 HEAD，不得把上述 SHA 当成永远不变的基线。

继续 SpecForge 架构一致性治理能力的开发和验证。

## 一、仓库与权威入口

远程仓库：

```text
https://github.com/lyqstart/SpecForge.git
```

目标分支：

```text
main
```

在分析、设计、修改或给出操作命令前，必须先从 GitHub 当前远程 `main` 读取：

```text
docs/design/SpecForge架构一致性治理最终实施方案.md
```

该文件是开发 SpecForge 架构一致性治理与契约治理能力的唯一当前产品设计依据。

同时读取当前活动实施文件：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
```

该实施文件不是第二权威源。它只说明当前 P0 缺陷为什么存在、怎样实现、允许修改哪些范围和怎样验收。与唯一权威文件冲突时，以唯一权威文件为准。

开始工作前必须记录并报告：

```text
远程仓库地址
远程分支
远程 HEAD commit SHA
权威文件路径及所在 commit SHA
活动实施文件路径、状态及所在 commit SHA
本地分支和本地 HEAD（如使用本地证据）
工作区状态（如使用本地证据）
本地与远程是否一致
```

远程、本地、上传副本或旧提示词不一致时，必须先报告差异并固定本次基线，禁止混用不同版本。

## 二、必须区分三类规则

以后每条规则、差距、缺陷、修改决定和测试结论都必须标记适用范围。

### `PRODUCT_DEVELOPMENT`

只约束当前如何开发和验证 SpecForge 产品，例如：

```text
读取远程权威文件
固定 commit SHA
修改前治理分析
冻结修改范围
测试、类型检查、构建
维护实施文件
SpecForge 不使用 SpecForge 自治理自己
```

### `PROJECT_GOVERNANCE`

描述完成后的 SpecForge 治理业务项目时必须自动执行的行为，例如：

```text
Architecture、Data Model、Module Design、Contract 和 Trace 的正式链路
Gate 的检查与阻断
Impact Scope 自动推导
Code Permission
Actual Scope Audit
Verification 和 Close
```

业务项目不直接读取《SpecForge架构一致性治理最终实施方案.md》或 P0 实施文件。这些规则必须落实到 SpecForge 的程序、Tool、Skill、Agent、Workflow、Gate、Runtime、项目模板和测试中。

### `BOTH`

既约束当前开发 SpecForge，也必须成为以后治理业务项目的不变式，例如：

```text
唯一真相源
Fail Closed
证据不足不得猜测
生产者和消费者必须完整
影响范围必须完整
正式关系必须原子变化
实际修改不得越过批准范围
不能以 warning 冒充机器强制
```

当前开发阶段由人工治理和普通软件工程验证执行；产品完成后由 SpecForge 程序自动执行。

## 三、沟通和分析方式

始终站在架构和业务视角说明问题，顺序必须是：

```text
业务目标
→ 所处流程
→ 参与角色与治理对象
→ 正常行为
→ 异常行为及风险
→ 最后说明对应程序、Tool、Skill、Agent、Gate 或源码文件
```

出现代码名词时必须立即解释其业务意义。不得只报文件名、函数名或技术缩写。

每个问题必须明确区分：

```text
权威方案缺口
实际代码缺陷
测试覆盖缺口
实现证据不足
产品尚未达到最终完成边界
```

“没有找到证据”不得直接写成“代码一定有 Bug”；证据不足必须标记：

```text
INSUFFICIENT_EVIDENCE
```

## 四、当前已完成内容

已经完成：

```text
唯一权威文件建立
其他冲突文件降级为非权威资料
本地与 GitHub main 同步
固定 SpecForge 自身开发执行协议
明确权威文件是开发 SpecForge 的产品设计依据
明确业务项目不直接读取该权威文件
区分 SpecForge 产品开发、业务项目治理行为和一次性产品实施 Phase
明确三个核心 Gate 的最终 Hard 行为
明确 Contract 消费关系以 Trace 为唯一真相源
明确 Trace Delta 使用 ADD、REMOVE
完成权威规则—源码—测试静态对账
完成 P0 Contract 消费者闭环根因分析和完整实现设计
```

最后确认的提交：

```text
08629b58c6aad82bf669a35e1f2bc8473cfa7ef3
docs(governance): clarify product and runtime boundaries
```

新会话必须以 GitHub 当前 `main` 实际 HEAD 为准。如果已经存在更新提交，先读取更新内容，不得回退到 `08629b5`。

## 五、当前 P0 缺陷

缺陷编号：

```text
GOV-DEFECT-CONTRACT-CONSUMER-001
```

名称：

```text
Contract 正式消费者与实际代码消费者未形成 Trace 驱动闭环
```

当前定性：

```text
权威方案：已经闭环
当前程序：尚未完整落实
优先级：P0
```

核心问题：

```text
现有 Contract Integrity 检查仍主要依赖显式文档标记、文本搜索和部分代码检查
没有以 Prospective Trace 形成唯一、可反向查询、可原子变更的消费者事实
```

最终必须实现：

```text
DD-* constrained_by Contract-ID

Current Trace
+ ADD
- REMOVE
= Prospective Trace

Module Contract 被其他 Module 消费
→ BLOCK

Contract 变化
→ 反向展开全部消费 DD
→ 推导全部消费 Module
→ 补全 Impact Scope
→ 冻结 Code Permission

正式 Trace 消费者
↔
实际生产代码 Module 依赖
↔
Verification 证据
```

不得新增：

```text
第二套消费者 Registry
Module 定义中的独立消费者列表
新的 Contract Gate
新的 Trace 系统
新的 Relation 类型
```

## 六、当前活动实施文件的使用规则

当前唯一活动实施文件：

```text
docs/implementation/architecture-consistency/P0-contract-consumer-closure.md
```

其状态应为：

```text
APPROVED_FOR_IMPLEMENTATION
```

开始修改代码时，先把状态改为：

```text
IN_PROGRESS
```

实施过程中发现新影响时，必须先更新该实施文件，再扩大代码修改范围。

完成后在同一文件中补充：

```text
完成 commit SHA
实际修改文件
架构、Contract、Trace 对账
实际范围审计
测试、类型检查和构建结果
真实项目验证
未解决问题
INSUFFICIENT_EVIDENCE
```

然后把状态改为：

```text
COMPLETED
```

同一个 P0 问题不得再建立独立实施报告、交接文件或“最终修正版”。

## 七、文件交付、替换与压缩包清理规则

> **适用范围**：`PRODUCT_DEVELOPMENT`。这是以后所有新会话和文件交付必须遵守的固定操作规则。

当需要修改用户本地仓库中的文件时：

```text
由 ChatGPT 在工作环境中完成文件修改
→ 完成编码、格式和内容验证
→ 生成保留仓库相对路径的替换压缩包
→ 用户只负责把完整文件替换到本地仓库
```

禁止要求用户通过 Python、PowerShell、sed、文本替换命令或其他脚本在本地修改文件内容。

用户本地允许执行的操作仅包括：

```text
删除错误文件
解压并覆盖完整文件
Git 暂存
验证
提交
推送（仅在用户明确同意时）
```

压缩包生命周期固定为：

```text
解压替换
→ 验证文件内容、目录和 Git 差异
→ 提交或确认安装成功
→ 删除本地压缩包
```

验证或提交失败时保留压缩包，便于重新替换；只有确认成功后才能清理。

ChatGPT 生成替换包前必须自行检查：

```text
压缩包只包含预期文件
仓库相对路径正确
UTF-8 编码正确
没有行尾空格
没有重复文件
没有 README、临时文件或其他附带文件
git diff --check 预期可通过
```

## 八、当前下一项工作

现在直接开始：

```text
依据 P0-contract-consumer-closure.md，
把 Contract 消费者闭环作为一个完整治理主题实施。
```

一次只完成这一项，不同时处理其他 P1、P2 或延期债务。

修改前必须输出治理前置结论，至少包括：

```text
任务目标
当前事实和一手证据
规则适用范围：PRODUCT_DEVELOPMENT / PROJECT_GOVERNANCE / BOTH
适用的权威规则 ID
受影响模块
受影响 Architecture、Data Model、Module Design
受影响 Project Contract、Module Contract
受影响生产者和消费者
受影响 Trace、Impact Scope、Gate、Code Permission、Audit、Verification、Close
允许修改文件
明确禁止修改范围
测试矩阵
是否需要再次修订权威文件
证据不足项
```

治理前置结论完成前不得修改代码。

## 九、P0 实施边界

主要检查并按证据修改现有能力：

```text
sf_trace_matrix_core
project-governance-v2
contract-integrity
impact-analysis
code-contract-verifier
```

如现有调用链确有需要，再修改：

```text
gate-runner
merge-runner
共享 Contract 类型
部署态同步 Tool
sf-design
sf-task-planner
sf-verifier
相关 Workflow Skill
```

所有代码名词必须先解释其在业务治理流程中的作用，再说明源码位置。

明确不处理：

```text
其他 P1/P2 差距
Requirement 治理扩展
daemon 生命周期
服务器部署
fj1
GOV-DEBT-001 packages/daemon-core/.specforge
```

## 十、P0 完成条件

必须覆盖活动实施文件中的全部回归场景，至少包括：

```text
Trace ADD / REMOVE 合法与非法操作
DD constrained_by Contract 合法关系
跨 Module 消费 Internal Contract 阻断
Project Contract 多 Module 消费
Contract 删除后的悬空消费者
完整与不完整 Module→Project Promotion
Impact Scope 自动展开全部消费者
Code Permission 覆盖全部消费 Module
生产代码实际消费但 Trace 未登记
未支持语言的人工审查证据
Fast Path 不得漏过 Contract/Trace 变化
Contract、Design、Trace 原子 Merge
Verification 和 Close 闭环
部署态 Tool、Skill、Agent 与源码一致
```

修改完成后必须执行：

```text
相关单元测试
属性测试（适用时）
集成测试
端到端测试（适用时）
回归测试
TypeScript no-emit
相关 package build
必要的全仓 deterministic build
git diff --check
git status --short
```

最终报告必须明确：

```text
实际修改
架构一致性
Contract 一致性
Trace 一致性
实际范围审计
测试与构建
权威文件是否需要同步
活动实施文件是否已更新
仍未解决问题
INSUFFICIENT_EVIDENCE
```

## 十、daemon、OpenCode、提交和推送边界

不得自动启动、停止或重启 daemon。

不得自动启动 OpenCode。

任何需要 daemon 或 OpenCode 的步骤，必须先明确告诉用户，由用户手工执行。

不操作服务器，不操作 fj1。

未经用户明确要求，不推送远程仓库。

不得删除：

```text
C:\Users\luo\.config\opencode
C:\Users\luo\.specforge
```

## 十一、后续路线

P0 完成并闭环后，再逐项处理：

```text
P1：Contract 完整兼容性分类
P1：Trace 架构语义闭包
P1：删除 Contract 后悬空关系及 Promotion 回归
P2：唯一权威源结构性回归测试
P2：同一 WI 架构闭环防退化测试
最终三个核心 Gate 全部 Hard
WorkDesk 真实新项目完整验收
GOV-DEBT-001 延期污染问题
```

不得提前把自动化测试冒充真实 OpenCode + SpecForge 业务项目验收。

不要重新生成全仓巨大日志。优先使用针对性的源码读取、测试和小范围证据。
