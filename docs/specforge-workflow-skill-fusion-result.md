# Package 4：Workflow Skill 融合结果

本包基于 GitHub 当前 `setup/userlevel-opencode/skills/**/SKILL.md` 生成完整替换文件。

## 修改范围

- `setup/userlevel-opencode/skills/sf-intake/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-feature-spec/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-bugfix-spec/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-quick-change/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-design-first/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-change-request/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-refactor/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-ops-task/SKILL.md`
- `setup/userlevel-opencode/skills/sf-workflow-investigation/SKILL.md`

## 融合方式

保留原文件完整 v1.1 Final Governance Contract、状态机、Candidate/Merge/Code Permission/Close Gate 等既有规则。

在每个 workflow 主标题后增加两类内容：

1. `Governance Model Workflow Contract（依据 / 承接 / 验证 / 融合）`
   - 统一要求 orchestrator 在各阶段调度子 Agent 时传入 basis_inputs、upstream_to_cover、required_evidence、project_integration_effect。
   - 明确遇到 unknown / assumption 时只能 ask_user、investigate、mark_unknown 或 block。

2. workflow 专属四问控制点
   - feature_spec：规格优先，验证强度最高，必须形成用户结果到 requirements/design/tasks/trace/evidence 的闭环。
   - bugfix_spec：当前行为、预期行为、复现证据、根因证据、回归验证。
   - quick_change：轻量但不降低真实性；发现需求/设计/接口变化必须升级。
   - design_first：允许先设计，但后续 requirements 必须反向承接每个 DD。
   - change_request：重点是影响边界、兼容性和回归范围。
   - refactor：行为不变性是核心，不允许行为变化伪装成重构。
   - ops_task：安全、可回滚、可验证；运维经验沉淀到 knowledge/runbook。
   - investigation：结论必须有数据来源和限制说明，不进入 code_permission。
   - sf-intake：将 intake 从“记录需求”强化为事实、未知项、决策边界、禁止假设的收集阶段。

## 预期检查

替换后执行：

```powershell
git diff --stat
git diff -- setup/userlevel-opencode/skills
```

应看到所有 skill 文件只增加内容，不删除原有治理规则。
