# Semantic Closure 生产者—消费者契约治理

> 日期：2026-07-25
> 事件：fj1 / WI-0006 在 `verification_done` 后反复进入 `insufficient_artifacts`
> 契约 ID：`semantic-closure/v1`

## 1. 已确认事实

1. 旧 `sf_semantic_closure_run` 只能从 verification report fenced JSON、Evidence
   Manifest sections 或显式 Trace chain 构建闭包；它不读取 Knowledge Graph。
2. OpenCode Tool 描述没有公开上述完整输入格式。
3. Verifier Required Output 没有 `semantic_closure`，但后文要求它提供闭包来源。
4. Workflow 要求 Orchestrator 用 `template=verification_report` 写验证 JSON；活跃
   `sf_artifact_write` handler 却绕过已有 renderer，把对象直接序列化为裸 JSON。
5. 旧 Verification Gate 只检查报告存在、Evidence JSON 可解析和代码契约，未实现
   标准要求的结论、测试、Evidence、审计和 Trace 闭环。
6. Gate 通过后仍可通过受控 Writer 修改 verification report / Evidence，旧 Gate
   没有输入 hash 失效机制。
7. 部署 Agent 文档还引用了仓库中不存在的 Evidence 专用写入/查询工具，与实际
   `sf_artifact_write(file_type="evidence_manifest")` 路径冲突。

因此，Semantic Closure validator 的失败关闭行为正确；首次偏离发生在上游
Contract / Agent / Workflow Skill / Artifact Writer / Verification Gate 的契约漂移。
能力判定为 `CONTRACT_CONFLICT + PARTIALLY_SUPPORTED`。

## 2. 治理目标

```text
一个可发现的 typed contract
→ 一个专业生产者
→ 一个受控写入/生成路径
→ 一个在状态推进前执行的 hard gate
→ 一个绑定输入 hash 的 close 复核
→ 一个合法恢复路径
```

不得把“增加 fenced block 提示词”作为最终修复，因为该做法仍会让关键契约依赖
Markdown 装饰和 Agent 猜测。

## 3. 权威合同

### 3.1 所有权

- `sf-verifier` 拥有 `verification_report`、`evidence_manifest` 和返回的
  `semantic_closure` 内容。
- Artifact Writer 强制 `verification_report` 使用 `template=verification_report`；
  自由文本或裸 Markdown 报告不会落盘。
- Orchestrator 不得代写或改写 Verifier 结论，只能把 Verifier 返回的
  `semantic_closure` 原样传给专用 Tool。
- `.semantic_closure.json` 和 `semantic_closure_report.md` 只能由
  `sf_semantic_closure_run` 生成。

### 3.2 Typed Tool 输入

首选调用：

```text
sf_semantic_closure_run(
  work_item_id=<WI-ID>,
  semantic_closure=<SemanticClosureManifest>
)
```

正常实现型 Manifest 包含：

```text
outcomes
requirements
design_decisions
tasks
evidence
project_integration
```

Investigation 使用同一 Tool 的 investigation profile。`contract_change` 由其专属
registry/merge 契约关闭，不强行伪造通用 OUT/REQ/DD/TASK 链。

### 3.3 兼容入口

为恢复旧 Work Item，Builder 继续接受：

1. verification report fenced JSON；
2. Evidence Manifest semantic sections；
3. `OUT → REQ → DD → TASK → EV` 显式 Trace chain。

这些是迁移兼容入口，不再是要求 Agent 猜测的首选协议。Knowledge Graph 明确不在
数据源集合中。

## 4. 强制执行顺序

```text
changed_files_audit passed
→ sf-verifier 写 verification_report + evidence_manifest
→ sf-verifier 返回相同 Verification JSON（含 typed semantic_closure）
→ sf_semantic_closure_run
→ semantic_closure_valid=true
→ verification_gate
→ verification_done
→ code_permission revoke
→ close_gate
→ closed
```

Verification Gate 负责：

1. 解析机器可读 Verification Contract；
2. 要求 conclusion=pass；
3. 要求测试已执行或明确 not_applicable；
4. 要求 Acceptance Criteria 全部通过，E2E 通过或明确 not_applicable；
5. 要求报告声明引用已登记 Evidence，并显式声明验证副作用；
6. 要求 Evidence Manifest 非空；
7. 要求 changed_files_audit PASS；
8. 要求 Semantic Closure 有效；
9. 对账 closure evidence 与 Evidence Manifest 的 status、level、type、supports；
10. 校验 closure provenance。

## 5. 陈旧性与恢复

闭包生成时记录以下输入的 SHA-256：

```text
trace_delta.md
verification_report.md
evidence/evidence_manifest.json
merge_report.md
changed_files_audit.md
semantic closure payload
```

Verification Gate 与 Close Gate 都重新核对 provenance。任一输入在闭包生成后变化，
Gate 失败并要求重建。

`work_item.json` 不纳入 provenance：它包含 state、更新时间和 code permission 等生命周期
元数据，Verification Gate 推进状态、Close Gate 撤权都会合法修改这些字段；把它整体
绑定到闭包会导致正常流程自我失效。Work Item ID 已由 typed closure 和 Tool 调用上下文
校验，生命周期状态由 StateManager 独立负责。

`verification_done` 后，Artifact Writer 冻结 verification report / Evidence；
Semantic Closure Tool 拒绝 force 重建。合法恢复为：

```text
verification_done
→ implementation_ready
→ 重新验证并写入产物
→ 重新生成 semantic closure
→ 重跑 verification_gate
```

该路径保留旧失败与 Gate 证据，不创建重复 Work Item，也不允许手改 `.specforge`。

## 6. 部署一致性

改动必须同步：

- daemon-core handler / validator / gate / close；
- OpenCode Tool Schema；
- sf-verifier / sf-orchestrator；
- Agent Base / Debugger 的 Evidence 登记说明；
- 所有包含 verification gate 的 Workflow Skill；
- canonical standard、source mapping 和 implementation playbook；
- installer 所复制的用户级 source；
- 单元、合同对齐和 Gate 回归测试。

远端部署完成后还需执行 installer upgrade/verify 并重启 daemon；仓库源码测试不能代替
远端用户级副本和运行中 daemon 的版本证据。
