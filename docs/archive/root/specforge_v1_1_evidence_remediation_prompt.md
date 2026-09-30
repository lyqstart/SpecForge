# SpecForge v1.1 证据型整改提示词（精简版）

> 用途：给开发 AI 使用，防止继续出现“只改文档、只让测试绿、旧结构仍能通过”的表面整改。

---

## 一、任务背景

当前 SpecForge 处于 bootstrap 自举整改阶段：

```text
旧 SpecForge / OpenCode 扩展正在被用来整改 SpecForge 自己。
旧系统只能作为开发辅助，不能自证 v1.1 合规。
```

本轮不是普通功能开发，而是治理系统整改。  
目标不是“测试能过”，而是证明：

```text
旧结构不能通过；
新结构按 v1.1 标准通过；
缺证据不能关闭；
越权不能写入；
缺 hash 不能合并；
旧 workflow 不能伪装成新 workflow。
```

---

## 二、硬性规则

### 1. 不允许只改文档

每个整改项必须同时提供：

```text
代码修改
正向测试
负向测试
grep 证据
bootstrap audit log
```

### 2. 不允许只让测试通过

必须证明：

```text
旧行为失败
新行为通过
```

### 3. 不允许降低标准

特别是 `code_only_fast_path`：

```text
candidate_manifest.entries = []
merge_report.status = not_applicable
但 trace_delta、verification_report、evidence_manifest、changed_files_audit 必须存在
```

禁止用以下 notApplicableFlags 放水：

```text
evidence_check
verification_check
trace_matrix_check
```

### 4. 不允许沿用旧字段

以下旧字段不得作为 v1.1 E2E 证据：

```text
workflow_type
workflow_selected
requirements-first
candidates
operation: update
gate_name
details-only gate report
```

必须使用 v1.1 标准字段：

```text
workflow_path
requirement_change_path
candidate_manifest.entries
operation: replace
candidate_hash
target_base_hash
manifest_hash
gate_id
gate_type
required
waiver_allowed
runner
started_at
finished_at
```

### 5. 不允许自称 complete

禁止写：

```text
v1.1 complete
final complete
production compliant
```

最多写：

```text
v1.1 filesystem lifecycle E2E improved
v1.1-bootstrap-e2e pending
```

---

## 三、本轮只修 5 个问题

### 1. 修正 workflow 字段

目标文件：

```text
packages/workflow-runtime/tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts
```

必须删除：

```text
workflow_type: 'requirements-first'
workflow_selected: 'requirements-first'
requirements-first
```

必须改为：

```json
{
  "workflow_path": "requirement_change_path"
}
```

必须断言：

```text
work_item.json.workflow_path === requirement_change_path
trigger_result.json.workflow_path === requirement_change_path
candidate_manifest.json.workflow_path === requirement_change_path
```

必须有负向测试：

```text
workflow_path 缺失必须失败
workflow_path = requirements-first 必须失败
trigger_result 与 work_item 不一致必须失败
```

必须提供 grep 证据：

```bash
grep -R "requirements-first" packages/workflow-runtime/tests/v11/e2e
grep -R "workflow_type" packages/workflow-runtime/tests/v11/e2e
grep -R "workflow_selected" packages/workflow-runtime/tests/v11/e2e
grep -R "workflow_path" packages/workflow-runtime/tests/v11/e2e
grep -R "requirement_change_path" packages/workflow-runtime/tests/v11/e2e
```

预期：

```text
requirements-first：无结果
workflow_type：无结果
workflow_selected：无结果
workflow_path：有结果
requirement_change_path：有结果
```

---

### 2. 修正 candidate_manifest 标准结构

目标文件：

```text
packages/workflow-runtime/tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts
```

必须删除旧结构：

```text
candidates
target_spec_version
operation: update
```

必须使用：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-E2E-001",
  "workflow_path": "requirement_change_path",
  "base_spec_version": "PSV-0001",
  "merge_required": true,
  "entries": [
    {
      "candidate_path": ".specforge/work-items/WI-E2E-001/candidates/project/requirements_index.md",
      "target_path": ".specforge/project/requirements_index.md",
      "operation": "replace",
      "candidate_hash": "sha256:...",
      "target_base_hash": "sha256:..."
    }
  ],
  "manifest_hash": "sha256:..."
}
```

必须断言：

```text
entries 存在
entries.length > 0
operation = replace
candidate_hash 存在
target_base_hash 存在
manifest_hash 存在
merge_required = true
target_path 只能指向 .specforge/project/**
candidate_path 只能指向当前 WI 的 candidates/**
```

必须有负向测试：

```text
缺 manifest_hash 必须失败
缺 candidate_hash 必须失败
缺 target_base_hash 必须失败
operation = update 必须失败
target_path 非 .specforge/project/** 必须失败
candidate_path 不在当前 WI candidates/** 必须失败
```

---

### 3. 修正 Gate Report 标准结构

目标文件：

```text
packages/workflow-runtime/tests/v11/e2e/v11-filesystem-lifecycle-e2e.test.ts
```

必须删除旧结构：

```text
gate_name
details
```

必须使用：

```json
{
  "schema_version": "1.0",
  "work_item_id": "WI-E2E-001",
  "gate_id": "candidate_manifest_gate",
  "gate_type": "hard_gate",
  "required": true,
  "status": "passed",
  "input_files": [],
  "checks": [],
  "blocking_issues": [],
  "warnings": [],
  "waiver_allowed": false,
  "waiver_required": false,
  "waiver_ids": [],
  "started_at": "2026-06-09T00:00:00Z",
  "finished_at": "2026-06-09T00:00:00Z",
  "runner": "Gate Runner"
}
```

必须有负向测试：

```text
缺 gate_id 必须失败
缺 gate_type 必须失败
缺 required 必须失败
hard_gate failed 必须阻断 merge
waiver_allowed=false 时不能 waiver
```

---

### 4. 修正 code_only_fast_path 放水问题

目标文件：

```text
packages/workflow-runtime/tests/v11/e2e/v11-compliance-e2e.test.ts
```

禁止用：

```text
notApplicableFlags: evidence_check
notApplicableFlags: verification_check
notApplicableFlags: trace_matrix_check
```

必须证明：

```text
candidate_manifest.entries = []
merge_report.status = not_applicable
trace_delta.md 存在，内容包含 Trace Impact: none
verification_report.md 存在
evidence_manifest.json 存在
changed_files_audit 存在并 passed
close_gate 通过
```

必须有负向测试：

```text
缺 trace_delta.md，close_gate 必须失败
缺 verification_report.md，close_gate 必须失败
缺 evidence_manifest.json，close_gate 必须失败
缺 changed_files_audit，close_gate 必须失败
candidate_manifest.entries 非空，必须失败
```

---

### 5. 同步 bootstrap 文档

必须更新：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
```

audit log 必须记录：

```text
修改文件
删除的旧行为
新增的标准行为
正向测试命令
负向测试命令
grep 证据
测试结果
仍未完成项
```

compliance gap 只能写真实状态，例如：

```text
filesystem E2E standard-structure remediation in progress
code-only hard evidence checks added
bootstrap e2e pending final validation
```

不得写：

```text
v1.1 complete
final complete
production compliant
```

---

## 四、最终交付格式

完成后只能按以下格式汇报：

```text
## 修改文件

- 文件 1：
  - 删除了什么旧行为
  - 新增了什么标准行为

## grep 证据

### 旧行为应消失

命令：
结果：

### 新行为应存在

命令：
结果：

## 正向测试

命令：
结果：

## 负向测试

命令：
结果：

## bootstrap 文档同步

- audit log 是否更新：
- compliance gap 是否更新：

## 仍未完成项

只能列事实，不能写“基本完成”。
```

---

## 五、失败判定规则

任何一项违反，直接失败：

```text
旧字段 grep 仍存在
没有新字段 grep 证据
没有负向测试
code-only 通过 notApplicableFlags 绕过 evidence / verification / trace
candidate_manifest 没有 manifest_hash / candidate_hash / target_base_hash
Gate Report 没有 gate_id / gate_type / required / waiver_allowed
bootstrap audit log 没更新
只改文档没改测试
只改测试没改标准结构
```

---

## 六、核心提醒

SpecForge 是治理系统，不是普通功能插件。

治理系统的合格标准不是：

```text
能跑
测试绿
文件存在
```

而是：

```text
不合规时必须失败
越权时必须阻断
缺证据时必须不能关闭
缺 hash 时必须不能合并
旧 workflow 必须不能通过
```
