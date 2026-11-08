# Work Item 生命周期约定

> Role: DERIVED REFERENCE。稳定产品语义来自 SPS §6；业务权威状态与跳转由 Daemon StateManager 及共享状态合同维护。Workflow Runtime 不能替代该真相源。

当前主链：

```text
created → intake_ready
→ impact_analyzing → impact_analyzed → workflow_selected
→ candidate_preparing → candidate_prepared
→ gates_running → approval_required
→ approved
→ merge_ready → merging → merged → post_merge_verified
→ implementation_ready → implementation_running → implementation_done
→ verification_running → verification_done → closed
```

`gates_failed`、`blocked`、`rejected`、`superseded` 是受控失败或终态。无需修改 Project Spec 的 route 可以从 `approved` 直接进入 `implementation_ready`，或按当前 Runtime 合同采用其他不含 merge 的合法分支；`not_applicable` 是报告字段值，不是 workflow state。上表是理解完整 merge 主链的摘要，不授权手工跳转。

关键不变量：

1. 创建由 `sf_work_item_create` 拥有，ID 由 Runtime 分配。
2. `events.jsonl` 是状态事实源，`state.json` 可重建。
3. Candidate 必须先过 Gate，再绑定 User Decision。
4. Git 模式需要真实分支和基线；filesystem 模式不伪造 Git 提交。
5. 实施需要有效 Code Permission；正式验证计划前必须撤销代码权限。D23 使用独立 verification grant，不能恢复代码权限；关闭执行相应证据核验及 Close Gate。
6. 失败恢复继续同一 Work Item，保留失败事件与 HardStop，不创建替代 Work Item。
