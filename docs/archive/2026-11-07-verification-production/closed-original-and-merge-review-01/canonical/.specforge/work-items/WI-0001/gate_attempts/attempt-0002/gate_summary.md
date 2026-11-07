# Gate Summary

Work Item: WI-0001
Overall Status: failed
Generated: 2026-11-03T13:14:00.551Z

## Gate Reports

### candidate_manifest_gate
- Type: hard_gate
- Status: passed
- Required: true

### contract_integrity_gate
- Type: hard_gate
- Status: passed
- Required: true

### entry_gate
- Type: hard_gate
- Status: passed
- Required: true

### path_policy_gate
- Type: hard_gate
- Status: passed
- Required: true

### required_files_gate
- Type: hard_gate
- Status: passed
- Required: true

### schema_gate
- Type: hard_gate
- Status: passed
- Required: true

### spec_consistency_gate
- Type: hard_gate
- Status: passed
- Required: true

### trace_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - Data design DATA-CORE-003 is constrained by Project Architecture

### workflow_selection_gate
- Type: hard_gate
- Status: passed
- Required: true

### workflow_specific_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Problem Understanding
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Existing Architecture Analysis
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Governance Classification
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Existing Capability Assessment
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Solution Strategy
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Impact Analysis
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少有效章节或内容过短: Verification Plan
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 系统治理分析缺少 capability_verdict，合法值为 reuse_existing、extend_existing、new_capability_required、blocked

## User Decision Required

Some hard gates failed. User cannot approve until issues are resolved.