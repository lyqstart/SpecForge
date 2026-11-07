# Gate Summary

Work Item: WI-0001
Overall Status: failed
Generated: 2026-11-03T13:06:23.123Z

## Gate Reports

### candidate_manifest_gate
- Type: hard_gate
- Status: passed
- Required: true

### contract_integrity_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - Prospective Trace is valid before Contract integrity decisions
  - Illegal Trace relation: DATA-CORE-003 constrained_by PI-CORE-001

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
- Status: failed
- Required: true
- Blocking Issues:
  - Illegal Trace relation: DATA-CORE-003 constrained_by PI-CORE-001
  - DATA-CORE-003 constrained_by PI-CORE-001: relation direction/type is legal

### trace_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - Illegal Trace relation: DATA-CORE-003 constrained_by PI-CORE-001
  - Data design DATA-CORE-003 is constrained by Project Architecture
  - Contract PI-0001 formally enforces source ARCH-CORE-001
  - Contract PI-0001 formally enforces source ARCH-CORE-003
  - Contract PI-0001 formally enforces source DATA-CORE-001
  - Contract PI-0001 formally enforces source DATA-CORE-002
  - DATA-CORE-003 constrained_by PI-CORE-001 is semantically legal

### workflow_selection_gate
- Type: hard_gate
- Status: passed
- Required: true

### workflow_specific_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - C:/Users/lyq/AppData/Local/Temp/sf-conformance-business-R6ttE7/.specforge/work-items/WI-0001/candidates/project/architecture.candidate.md: 设计治理分析缺少 "analysis_scope: system_governance" 声明

## User Decision Required

Some hard gates failed. User cannot approve until issues are resolved.