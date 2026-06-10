# Work Item 流程

## 状态流转
created → intake_ready → impact_analyzing → impact_analyzed → workflow_selected → candidate_preparing → candidate_prepared → gates_running → approval_required → approved → merge_ready → merging → merged → post_merge_verified → implementation_ready → implementation_running → implementation_done → verification_running → verification_done → closed

## 关键约束
- Agent 不能直接写 `.specforge/project/` — 只能通过 MergeRunner
- Agent 不能修改 `allowed_write_files` 之外的文件
- 所有合并必须经过 User Decision
- CloseGate 必须基于文件证据
