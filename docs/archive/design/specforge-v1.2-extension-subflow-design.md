# SpecForge v1.2 Extension Subflow Design

<!-- SF_V12_EXTENSION_SUBFLOW_DESIGN -->

## 1. 核心目标

Extension Subflow 解决主流程中发现缺少类型、缺少 schema、缺少 workflow path、缺少 gate type 时如何闭环的问题。

不允许：

```text
AI 发现缺类型后临时编一个类型继续跑。
```

必须：

```text
发现扩展缺口 -> extension request -> extension proposal -> gate -> user decision -> registry merge -> 返回主流程
```

## 2. Extension Registry

注册表路径：

```text
.specforge/project/extensions/extension_registry.json
```

示例：

```json
{
  "schema_version": "1.2",
  "registry_version": "EXT-0001",
  "extensions": [
    {
      "extension_id": "artifact.security_review",
      "kind": "artifact_type",
      "status": "active"
    }
  ]
}
```

## 3. 发起条件

必须触发 Extension Subflow 的情况：

- artifact type 缺失；
- workflow path 无法表达；
- gate 类型缺失；
- project spec section 缺失；
- 用户明确要求新增类型；
- 现有 schema 与真实需求冲突。

## 4. Extension Request

```json
{
  "schema_version": "1.2",
  "parent_work_item_id": "WI-0001",
  "request_id": "EXTREQ-WI-0001-001",
  "missing_kind": "artifact_type",
  "missing_name": "security_review",
  "reason": "current workflow requires a security review artifact but no artifact type exists",
  "return_state": "candidate_preparing"
}
```

## 5. 执行者

职责：

- sf-orchestrator：发现缺口并暂停主流程；
- sf-extension：生成 extension proposal；
- gate runner：验证 proposal；
- user decision recorder：记录审批；
- merge runner：合并 registry；
- sf-orchestrator：恢复主流程。

OpenCode 子 agent 不能无限递归开子 agent，因此 extension agent 不得再无限触发子流程。

## 6. Extension Proposal

```json
{
  "schema_version": "1.2",
  "extension_id": "artifact.security_review",
  "kind": "artifact_type",
  "schema_delta": {},
  "usage_contract": {},
  "compatibility_impact": "low",
  "return_to_parent": {
    "parent_work_item_id": "WI-0001",
    "return_state": "candidate_preparing"
  }
}
```

## 7. 返回主流程

返回必须携带：

- parent_work_item_id；
- extension_id；
- registry_version；
- merge evidence；
- return_state；
- next_action。

如果 extension 被拒绝，parent WI 必须 blocked 或 rejected，不得继续假装扩展存在。

## 8. 验收项

正向：

- 缺少 artifact type 时生成 extension request；
- extension proposal 通过 gate；
- user approval 后 registry 更新；
- parent workflow 读取新 registry_version；
- parent workflow 回到 return_state。

负向：

- 未审批 extension 不得写 registry；
- 拒绝 extension 后 parent WI 不得继续；
- stale registry version 拒绝 merge；
- extension agent 不得无限递归；
- extension 不得修改主流程状态源。
