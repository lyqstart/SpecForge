# 归档说明

- **状态**：Superseded / 已取代
- **归档日期**：2026-07-27
- **现行实施方案**：[`../design/SpecForge架构一致性治理最终实施方案.md`](../design/SpecForge架构一致性治理最终实施方案.md)
- **最终决策记录**：[`../adr/ADR-007-architecture-consistency-governance.md`](../adr/ADR-007-architecture-consistency-governance.md)
- **用途**：保留早期方案演进历史，仅供审计和追溯，不再作为当前实现依据。

> 下文保持原方案内容，仅增加本归档说明。

---

# SpecForge 架构一致性治理最终方案

## 一、最终目标

SpecForge 要建立一条完整、不能绕过的开发治理链：

```text
用户需求
↓
Requirement
↓
影响分析
↓
Project Architecture
↓
Project Data Model
↓
Module Design
↓
Contract
↓
Task
↓
Code Permission
↓
Production Code
↓
Verification
↓
正式版本
```

核心原则：

> 先把应该怎么建设设计清楚，再允许开发；开发完成后，再根据真实修改检查代码是否仍然符合批准的设计。

Requirement 现有治理继续保留，本次不作为主要改造对象。

---

# 二、Project Architecture

正式文件：

```text
.specforge/project/architecture.md
```

定义：

> Project Architecture 是整个项目最高层的技术设计依据。

它必须回答：

1. 系统由哪些 Module 组成；
2. 每个 Module 负责什么；
3. Module 之间如何依赖和调用；
4. 公共基础设施如何建设；
5. 整体数据架构和数据库策略是什么；
6. 关键数据如何流动；
7. 所有 Module 必须共同遵守哪些系统级规则。

例如：

```text
所有文件存储路径必须由统一服务管理。

订单模块不能直接调用支付模块内部实现。

项目采用共享关系数据库。

跨模块修改关键业务数据必须通过正式接口。
```

### 谁生产

由现有：

```text
sf-design
```

负责。

不增加新的 Architecture Agent。

### 依据什么生产

新项目：

```text
Requirements
+ 运行环境
+ 工程约束
+ 用户已经确认的重要决策
```

已有项目还必须增加：

```text
真实代码
配置
接口
数据库
部署结构
实际运行关系
```

必须先尊重事实，再设计未来架构。

### 什么时候生产

设计开始时必须读取现有 Architecture。

如果 Architecture 尚未建立：

```text
先建立 Architecture Candidate
↓
再继续后续设计
```

如果已经存在：

```text
不需要改变
→ 直接作为后续设计约束

需要改变
→ 先产生新的 Architecture Candidate
→ 后续设计基于新的 Candidate
```

---

# 三、Project Data Model

新增正式文件：

```text
.specforge/project/data_model.md
```

它属于项目级正式设计，不属于某一个 Module。

定义：

> Project Data Model 是整个项目的数据和数据库详细设计。

必须从整个系统业务出发设计，不能先把数据库机械拆给各个 Module。

### Project Architecture 和 Data Model 的区别

Architecture 决定：

```text
数据库整体采用什么结构
数据如何划分
数据所有权原则
共享还是隔离
跨模块怎样访问
事务和一致性原则
```

Data Model 决定：

```text
具体有哪些业务实体
有哪些表
表承担什么职责
主要字段及业务含义
主键、外键
实体和表之间的关系
关键约束
共享数据
关联表
历史表
审计表
汇总表
跨表事务关系
重要索引和性能设计
```

简单说：

```text
Architecture
= 数据系统总体怎么建设

Data Model
= 数据库具体应该长什么样
```

### 谁设计

仍由：

```text
sf-design
```

负责。

不增加新的数据设计 Agent。

### 什么时候设计

顺序必须是：

```text
Requirement
↓
Project Architecture
↓
Project Data Model
↓
Module Design
```

第一次建设数据库：

```text
先建立 Architecture
↓
再建立完整 Data Model
↓
再做 Module Design
```

后续需求：

```text
Data Model 不需要变化
→ 使用现有正式 Data Model

Data Model 需要变化
→ 产生 Data Model Candidate
→ Module Design 基于新的 Candidate
```

### 依据什么设计

```text
Requirements
+ Project Architecture
+ Glossary
+ Decisions
+ 已有 Data Model
+ 已有相关 Design
+ 已有 Contract
```

已有项目还必须读取真实：

```text
数据库 Schema
Migration
ORM Model
SQL
数据访问代码
```

---

# 四、Module Design

正式文件：

```text
.specforge/project/modules/<MODULE>/design.md
```

定义：

> Module Design 描述一个 Module 在整个项目正式架构和数据设计下，具体怎样完成自己的职责。

它不是单纯：

```text
Requirement → Design
```

而必须是：

```text
Requirement
+
Project Architecture
+
Project Data Model
+
已有 Module Design
+
Project Contract
+
Module Contract
+
本次 Impact Scope
↓
Module Design
```

Module Design 主要负责：

```text
模块内部组成
业务处理流程
状态变化
内部数据流
使用哪些公共能力
如何使用正式数据模型
错误处理
边界情况
实现约束
验证方式
```

Module Design **不能重新发明项目级数据库结构**。

它负责说明：

> 本模块如何使用已经批准的数据结构完成自己的功能。

---

# 五、Contract

Contract 定义：

> Architecture、Data Model 和 Module Design 中那些必须稳定、明确，并且需要机器强制执行的规则。

不是所有设计都进入 Contract。

只有适合机器验证的规则进入。

## Project Contract

继续使用：

```text
.specforge/project/extension_registry.json
```

负责：

```text
跨 Module
或者全项目共同依赖
```

的机器规则。

来源可以是：

```text
Project Architecture
Project Data Model
```

## Module Contract

新增：

```text
.specforge/project/modules/<MODULE>/contracts.json
```

只保存一个 Module 内部共同使用的机器规则。

来源：

```text
Module Design
```

唯一边界规则：

```text
所有消费者都属于一个 Module
→ Module Contract

出现其他 Module 消费者
→ Project Contract
```

禁止其他 Module 直接依赖 Internal Contract。

---

# 六、Trace

Trace 不是新的业务文档。

它负责维护正式对象之间的关系：

```text
Architecture
↓
Data Model
↓
Module Design
↓
Contract
```

代码不逐文件长期写入 Trace。

代码通过 Module 的：

```text
code_paths
```

自动确定所属 Module。

因此可以得到：

```text
代码文件
↓
Module
↓
Module Design
↓
Project Data Model
↓
Project Architecture
↓
相关 Contract
```

继续复用：

```text
.specforge/project/trace_matrix.md

.specforge/project/modules/<MODULE>/trace.md

.specforge/work-items/<WI>/trace_delta.md
```

只有正式关系发生变化时才需要 Trace Delta。

Trace 应尽量由正式 ID 和引用关系自动生成、自动校验，减少 Agent 自由手写。

---

# 七、Impact Scope

Impact Scope 定义：

> 本次需求到底需要治理哪些正式对象。

它不是简单的“准备修改哪些文件”。

至少需要确定：

```text
affected_modules

architecture_refs

data_model_refs

design_refs

project_contract_refs

module_contract_refs

planned_code_paths
```

Impact Scope 由：

```text
Agent 初步分析
+
机器根据 Module、Trace、code_paths 自动补全和校验
```

共同产生。

## Impact Scope 有四个用途

### 1. 决定走哪套治理流程

例如：

```text
Architecture 变化
→ architecture_change_path

Data Model / Module Design / Module Contract 变化
→ design_change_path

只有 Project Contract 变化
→ contract_change_path

正式上层设计都不变
→ code_only_fast_path
```

Workflow Path 再加载对应的现有 Workflow Skill。

### 2. 决定本次必须修改哪些正式设计

例如：

```text
Architecture 需要变化
→ 必须产生 Architecture Candidate

Data Model 需要变化
→ 必须产生 Data Model Candidate

Module Design 需要变化
→ 必须产生 Design Candidate
```

不能直接跳到代码。

### 3. 决定 Code Permission

最终批准：

```text
允许修改哪些 Module
允许修改哪些代码
必须遵守哪些 Architecture
Data Model
Design
Contract
```

### 4. 开发后检查是否越界

比较：

```text
Approved Impact Scope
vs
Actual Changed Files
```

发现超范围修改：

```text
BLOCK
```

---

# 八、治理对象如何保证质量

所有正式对象统一遵守一个规则：

```text
谁生产
↓
依据什么生产
↓
必须回答什么问题
↓
机器能检查什么
↓
用户需要批准什么
↓
后续谁必须消费
```

质量保证分三层。

## 第一层：生产规则

修改 `sf-design` 等正式职责。

明确 Architecture、Data Model、Module Design、Contract 必须：

```text
读取哪些上游信息
回答哪些问题
引用哪些正式依据
输出哪些结构
```

防止 Agent 自由发挥。

## 第二层：机器 Gate

机器负责可以客观判断的事情：

```text
对象是否完整
正式 ID 是否存在
引用是否合法
上下层是否一致
Contract 是否完整
Trace 是否闭合
有没有遗漏正式影响范围
```

## 第三层：User Decision

架构是否合理、方案是否接受这类不能完全依赖机器判断的问题：

```text
Candidate
↓
Gate 全部通过
↓
用户批准
↓
Merge
```

机器保证：

> 完整、一致、可追溯、不能绕过。

用户最终确认：

> 方案本身是否符合项目目标。

---

# 九、治理对象如何保证一定被消费

不能只写在 Agent 提示词里。

必须沿主链强制传递。

## 生产 Module Design

必须读取：

```text
Requirement
Architecture
Data Model
Contracts
Impact Scope
```

## 生产 Task

必须读取：

```text
批准的 Design
相关 Architecture / Data Model
相关 Contract
Impact Scope
```

Task 必须明确：

```text
实现哪个 Design
允许修改什么
受哪些 Contract 约束
如何验证
```

## Executor

只接受已经冻结的：

```text
Task
Code Permission
Design Refs
Contract Refs
Allowed Files
```

不允许 Executor 自己扩大设计范围。

## Verification

重新读取：

```text
Actual Changed Files
Architecture
Data Model
Module Design
Contracts
Trace
Approved Impact Scope
```

因此正式对象不是“写完放在那里”，而是在后续流程中必须持续使用。

---

# 十、完整 SpecForge 融合流程

最终主流程：

```text
用户需求
↓
Intake
↓
Requirement
↓
Classification + Impact Analysis
↓
Impact Scope
↓
Workflow Selection
↓
设计阶段
```

设计阶段首先读取已有正式设计。

如果 Architecture 需要建立或改变：

```text
Architecture Candidate
```

然后：

```text
Project Data Model Candidate
（需要建立或改变时）
```

然后：

```text
Module Design Candidate
```

再确定：

```text
Project / Module Contract Candidate
```

再处理：

```text
Trace Delta
（关系改变时）
```

之后：

```text
sf-task-planner
↓
tasks.md
↓
Required Gates
↓
User Decision
↓
正式 Spec Merge
↓
Code Permission
↓
Implementation
↓
Actual Changed Files
↓
Scope Audit
↓
Architecture / Data Model /
Design / Contract Verification
↓
Functional Verification
↓
Formal Version Gate
↓
Close
↓
SpecForge Git Merge
```

---

# 十一、Fast Path

Fast Path 的含义必须保持：

> 上层正式设计不需要修改，不代表不用遵守上层设计。

因此 Fast Path：

```text
Requirement
↓
Impact Scope
↓
确认 Architecture 不变
确认 Data Model 不变
确认 Module Design 不变
确认 Contract 不变
↓
读取现有正式设计
↓
一致性检查
↓
Code Permission
↓
Implementation
↓
Actual Scope Audit
↓
Verification
```

不产生没有意义的 Spec Candidate。

---

# 十二、Code Permission

Code Permission 是正式治理完成后对生产代码发放的修改许可。

必须绑定：

```text
Affected Modules
Allowed Write Files

Architecture Refs
Data Model Refs
Design Refs
Project Contract Refs
Module Contract Refs
```

Code Permission 发放以后：

> 本次治理范围冻结。

Implementation 不能自行扩大。

发现确实需要扩大：

```text
停止实施
↓
重新进行影响分析和治理
```

---

# 十三、Actual Scope Audit

开发完成后必须以真实事实为准。

来源：

```text
Write Guard factual log
+
Git Diff
```

重新得到：

```text
实际改了哪些文件
↓
属于哪些 Module
↓
影响哪些 Design
↓
影响哪些 Data Model
↓
影响哪些 Architecture
↓
影响哪些 Contract
```

必须：

```text
Actual Scope
⊆
Approved Impact Scope
```

否则 Verification 失败。

---

# 十四、Verification

Verification 最终必须同时证明五件事：

```text
1. 功能正确

2. Production Code
   符合 Project Architecture

3. Production Code
   符合 Project Data Model
   和 Module Design

4. Project / Module Contract
   没有被破坏

5. Actual Changed Files
   没有超过批准范围
```

---

# 十五、Formal Version Gate

只新增这一道正式 Gate。

职责：

> 判断一个已经完成开发和验证的 WI 是否有资格进入正式主分支。

检查：

```text
Workflow 合法

Required Gates 完成

User Decision 有效

正式 Candidate 已正确 Merge

Code Permission 有效

Actual Scope Audit 通过

Verification 通过

Git Diff 与 WI 一致

不存在未治理修改
```

全部通过：

```text
Formal Version Gate
↓
Close
↓
Git Merge
```

---

# 十六、项目级文档最终职责

```text
architecture.md
→ sf-design 负责项目总体架构

data_model.md
→ sf-design 负责项目级详细数据设计

requirements_index.md
→ 根据正式 Requirement 自动维护

design_index.md
→ 根据正式 Module Design 自动维护

glossary.md
→ sf-design 维护项目公共业务术语

decisions.md
→ 记录正式批准的重要项目级技术决策

trace_matrix.md
→ 根据正式关系受控维护

spec_manifest.json
→ 系统维护正式 Spec 清单
```

原则：

> 能由正式数据自动得到的内容，不让 Agent 重复手工维护。

---

# 十七、Module Schema

每个 Module 正式登记：

```text
module_file
requirements
design
contracts
trace
code_paths
```

其中：

```text
contracts
```

指向 Module Contract。

```text
code_paths
```

负责把真实代码映射到 Module。

这是：

```text
Code
↓
Module
↓
Design
↓
Data Model
↓
Architecture
↓
Contract
```

能够自动建立的基础。

---

# 十八、现有 SpecForge 需要改造的主要部分

最终不是单纯增加几个文件，而是修改现有治理链。

## 1. sf-design

增加正式职责：

```text
Project Architecture 生产规则
Project Data Model 生产规则
Module Design 上游消费规则
Contract 提取规则
正式引用规则
```

## 2. Impact Analysis / Classification

增加：

```text
Impact Scope
Data Model Impact
Module Contract Impact
机器补全影响范围
```

并以 Impact Scope 作为 Workflow Selection 的依据。

## 3. Candidate / Merge

正式支持：

```text
Architecture
Data Model
Module Design
Project Contract
Module Contract
Trace
```

作为同一 WI 的正式 Spec Candidate。

## 4. sf-task-planner

Task 必须消费：

```text
Design
Architecture / Data Model 约束
Contract
Impact Scope
```

## 5. Spec Consistency Gate

扩展为检查：

```text
Architecture
Data Model
Module Design
Contract
Trace
Impact Scope
```

的整体一致性。

## 6. Contract Integrity Gate

扩展：

```text
Module Contract
Internal Contract 外部引用
Contract Promotion
source_refs
```

## 7. Trace Gate

从简单文件检查升级为正式关系语义检查。

## 8. Fast Path

必须消费现有：

```text
Architecture
Data Model
Design
Contract
Trace
```

## 9. Code Permission

增加正式设计引用和冻结范围。

## 10. Verification

增加：

```text
Actual Scope Audit
Architecture 一致性
Data Model 一致性
Design 一致性
Contract 一致性
```

## 11. Formal Version Gate

接入最终 Close 和 Git Merge 入口。

---

# 十九、最终治理闭环

改造完成以后，对于任何一段生产代码，SpecForge 都能够回答：

```text
为什么允许修改这段代码
↓
它属于哪个 Module
↓
它落实哪个 Module Design
↓
它使用哪个 Project Data Model
↓
它受哪些 Project Architecture 约束
↓
它受哪些 Contract 强制
↓
本次修改是否获得批准
↓
实际修改是否超出批准范围
↓
最终验证是否通过
```

反方向也能够回答：

```text
一个 Requirement / Architecture / Data Model 发生变化
↓
影响哪些 Module
↓
哪些 Design 要变化
↓
哪些 Contract 要变化
↓
哪些代码可能需要变化
↓
需要走什么治理流程
```

最终形成：

```text
Requirement
↓
Architecture
↓
Data Model
↓
Module Design
↓
Contract
↓
Task
↓
Code
↓
Verification
↓
Formal Version
```

这一条完整、双向可追溯、机器能够检查并且能够阻断违规修改的治理链。
