# Work Item 使用流程

> Role: DERIVED OPERATING DOCUMENTATION。

用户只需要向 `sf-orchestrator` 描述目标，并在 Candidate 审批、风险接受或范围变化时作明确决定。标准主链为：

```text
Intake → Impact Analysis → Candidate → Gates → User Decision
→ Project Spec Merge（适用时）→ Code Permission → Implementation
→ Code Permission Revoke → Verification Plan → Controlled Verification Run
→ Verification Evidence / Formal Version → Close
```

Git 项目必须在实施前绑定真实基线与分支，完成后进入受控提交/合并链。非 Git 项目采用冻结的 filesystem baseline，Formal Version Gate 不要求伪造 Git 历史。两种模式都必须保留同等强度的范围、验证和关闭证据。

D18 的 `sf_safe_bash` 只用于受限只读探测，不执行正式测试。D23 由真实 `sf-orchestrator` 通过 `sf_verification_plan` 冻结计划，再由真实 `sf-verifier` 通过 `sf_verification_run` 在独立 grant 和受支持 profile 下执行并登记完整证据。正式验证计划前先撤销代码权限；验证授权不能恢复代码写权限。未执行、平台不支持、拒绝或中断必须如实记录，不得生成成功证据或以普通终端绕过。

出现 `blocked` 或 HardStop 时停止当前危险动作，把 Runtime 返回的原因、恢复条件和最后成功步骤交给用户；处理后从同一 WI 恢复。
