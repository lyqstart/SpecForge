# Work Item 使用流程

> Role: DERIVED OPERATING DOCUMENTATION。

用户只需要向 `sf-orchestrator` 描述目标，并在 Candidate 审批、风险接受或范围变化时作明确决定。标准主链为：

```text
Intake → Impact Analysis → Candidate → Gates → User Decision
→ Project Spec Merge（适用时）→ Code Permission → Implementation
→ Verification / Formal Version → Permission Revoke → Close
```

Git 项目必须在实施前绑定真实基线与分支，完成后进入受控提交/合并链。非 Git 项目采用冻结的 filesystem baseline，Formal Version Gate 不要求伪造 Git 历史。两种模式都必须保留同等强度的范围、验证和关闭证据。

出现 `blocked` 或 HardStop 时停止当前危险动作，把 Runtime 返回的原因、恢复条件和最后成功步骤交给用户；处理后从同一 WI 恢复。
