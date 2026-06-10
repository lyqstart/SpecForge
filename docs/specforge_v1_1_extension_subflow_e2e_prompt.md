# SpecForge v1.1 Extension Subflow E2E 实现提示词

## 当前状态

当前分支：

```text
v1.1-daemon-opencode-e2e
```

已完成：

```text
Runtime execution chain fixed and merged
Production daemon write guard E2E completed
Full daemon startup integration verified
```

本轮剩余目标：

```text
实现并验证 Extension Subflow E2E
```

本轮不做 final validation，不声明 v1.1 complete。

---

## 一、本轮目标

必须验证真实链路：

```text
Agent 发现缺少扩展类型
→ extension_request.json
→ sf-orchestrator 阻断主流程
→ sf-extension 生成 extension_delta.md
→ extension_registry candidate
→ extension_gate
→ gate_summary
→ User Decision
→ executeV11Merge()
→ post_merge_gate
→ 主流程恢复
```

---

## 二、必须新增测试

新增：

```text
packages/workflow-runtime/tests/v11/e2e/v11-extension-subflow-e2e.test.ts
```

如实际目录不同，按项目结构放置，但文件名必须包含：

```text
extension-subflow-e2e
```

测试必须使用真实文件系统结构，不能只测对象拼装。

---

## 三、必须覆盖 6 个场景

### B1 缺少扩展类型时触发 extension_request

前置：

```text
.specforge/project/extension_registry.json 不包含 retry_policy
```

输入：

```text
设计过程中需要 design type retry_policy
```

期望：

```text
写出 extension_request.json
blocking_current_flow=true
主流程状态变为 blocked 或 extension_required
普通 Agent 不得继续生成依赖 retry_policy 的正式产物
```

### B2 sf-extension 生成扩展候选

必须生成：

```text
extension_delta.md
candidates/project/extension_registry.json
candidate_manifest.json
```

candidate_manifest.json 必须使用 v1.1 标准结构：

```text
entries
operation=replace
candidate_hash
target_base_hash
manifest_hash
target_path=.specforge/project/extension_registry.json
candidate_path 指向 candidates/project/extension_registry.json
```

### B3 extension_gate 生成标准 Gate Report

必须生成：

```text
gates/extension_gate.json
```

必须包含：

```text
gate_id
gate_type
required
status
input_files
checks
blocking_issues
warnings
waiver_allowed
runner
started_at
finished_at
```

### B4 User Decision 结构化

必须生成：

```text
user_decision.json
```

必须绑定：

```text
work_item_id
workflow_path
base_spec_version
candidate_manifest_path
manifest_hash
gate_summary_path
gate_summary_hash
decision_status=approved
```

聊天里的“同意”不能直接作为 merge 依据。

### B5 executeV11Merge 合并 extension_registry

必须通过：

```text
executeV11Merge()
```

合并：

```text
candidates/project/extension_registry.json
→ .specforge/project/extension_registry.json
```

合并后必须证明：

```text
project_spec_version 递增
extension_registry.project_spec_version 同步
updated_by_work_item = 当前 WI
updated_at 非空
post_merge_gate passed
```

### B6 主流程恢复

合并后必须证明：

```text
sf-orchestrator 重新读取 extension_registry.json
原 Agent 不复用旧输出
旧 Candidate invalidated 或重新生成
主流程恢复执行
```

---

## 四、必须覆盖负向场景

至少覆盖：

```text
普通 Agent 直接写 .specforge/project/extension_registry.json 必须被拒绝
没有 extension_request.json 时不得临时使用未知扩展类型
Extension Subflow 不经过 User Decision 时不得 merge
Extension Subflow 不经过 executeV11Merge 时不得合并正式规格
operation=update 的 candidate_manifest 必须被拒绝
candidate_hash / target_base_hash / manifest_hash 缺失或错误必须被拒绝
extension_registry 合并后 project_spec_version 未递增必须失败
主流程恢复时复用旧 Candidate 必须失败
```

---

## 五、文档同步

必须更新：

```text
docs/bootstrap/specforge-v1.1-bootstrap-audit-log.md
docs/bootstrap/specforge-v1.1-compliance-gap.md
docs/bootstrap/specforge-v1.1-runtime-execution-chain-merge-readiness.md
```

文档状态必须写成：

```text
Runtime Execution Chain：Fixed and merged
Production Daemon Write Guard E2E：Completed
Extension Subflow E2E：Completed in branch 或 In progress
Full v1.1 final-complete validation：pending
```

禁止写：

```text
v1.1 complete
final complete
production compliant
```

---

## 六、必须运行测试

至少运行：

```bash
cd packages/workflow-runtime
npx vitest run tests/v11/e2e/v11-extension-subflow-e2e.test.ts
npx vitest run tests/v11/e2e
npx vitest run tests/v11/unit/path-policy-permissions.test.ts
```

回归 daemon：

```bash
npx vitest run packages/daemon-core/tests/v11-full-daemon-startup-writeguard-e2e.test.ts
npx vitest run packages/daemon-core/tests/v11-production-daemon-writeguard-e2e.test.ts
```

如果实际命令不同，按实际项目结构执行，但必须报告完整命令和结果。

---

## 七、汇报格式

完成后只按以下格式汇报：

```text
## 分支

## 修改文件

## Extension Subflow E2E

### B1 extension_request
- 结果：
- 证据：

### B2 extension candidate
- 结果：
- 证据：

### B3 extension_gate
- 结果：
- 证据：

### B4 User Decision
- 结果：
- 证据：

### B5 executeV11Merge
- 结果：
- 证据：

### B6 主流程恢复
- 结果：
- 证据：

## 负向场景

## 测试命令与结果

## bootstrap 文档同步

## 仍未完成项
```

---

## 八、失败规则

出现以下任意一项，本轮失败：

```text
普通 Agent 直接写 .specforge/project/extension_registry.json
缺少 extension_request.json 时继续使用未知扩展类型
Extension Subflow 不经过 extension_gate
Extension Subflow 不经过 User Decision
Extension Subflow 不经过 executeV11Merge
candidate_manifest 使用 candidates 旧结构
candidate_manifest 使用 operation=update
candidate_hash / target_base_hash / manifest_hash 未校验
extension_registry 合并后 project_spec_version 未递增
post_merge_gate 未执行
主流程恢复时继续复用旧 Candidate
测试只拼对象，不写真实文件
bootstrap audit log 未记录测试命令和结果
声明 v1.1 complete
```

---

## 九、完成标准

本轮完成后只能声明：

```text
Extension Subflow E2E completed
```

不能声明：

```text
v1.1 complete
```

本轮通过后，下一轮进入：

```text
v1.1 final validation
```
