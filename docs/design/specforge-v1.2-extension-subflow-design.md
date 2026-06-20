# SpecForge v1.2 Extension Subflow Design

## 1. 问题定义

主流程执行中可能发现：

- 缺少 artifact type；
- 缺少 workflow type；
- 缺少 gate type；
- 缺少 extension registry 条目；
- 现有流程无法表达当前需求。

这类问题不能靠 AI 临时发挥，也不能在主流程中静默绕过。

## 2. 设计目标

Extension Subflow 目标：

```text
主流程发现扩展缺口 -> 触发 Extension Subflow -> 形成扩展提案 -> 审批 -> 合并 registry -> 返回主流程继续执行
```

## 3. 发起者

可发起者：

- sf-orchestrator；
- gate runner；
- workflow selection；
- artifact validator；
- user decision recorder。

发起条件：

- 当前 workflow 无法表达真实需求；
- artifact schema 缺失；
- extension type 不存在；
- extension registry 缺失；
- 用户明确要求新增类型。

## 4. 执行者

OpenCode 子 agent 不能无限递归开子 agent，因此 v1.2 应采用：

```text
orchestrator 发起 extension request；
extension agent 执行；
extension tool 写 registry candidate；
gate/user decision 控制合并；
orchestrator 接收结果并继续主流程。
```

## 5. 输入

Extension Subflow 输入：

- parent_work_item_id；
- extension_reason；
- missing_type；
- required_behavior；
- affected workflow；
- expected schema；
- return_state；
- blocking level。

## 6. 输出

Extension Subflow 输出：

- extension proposal；
- schema delta；
- registry candidate；
- compatibility impact；
- user decision；
- merge evidence；
- return token。

## 7. 返回主流程

Extension Subflow 完成后必须返回：

```text
parent_work_item_id
extension_id
registry_version
return_state
next_action
```

主流程不得丢失上下文。

## 8. 验收项

1. 缺少 extension type 时能触发 subflow；
2. subflow 能写 extension proposal；
3. 用户拒绝时主流程 blocked/rejected；
4. 用户批准时 registry 更新；
5. 主流程能读取 registry_version 后继续；
6. 不允许 extension agent 无限递归开子 agent。
