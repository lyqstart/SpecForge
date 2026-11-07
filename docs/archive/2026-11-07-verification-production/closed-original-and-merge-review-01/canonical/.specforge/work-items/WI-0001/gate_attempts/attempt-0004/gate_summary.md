# Gate Summary

Work Item: WI-0001
Overall Status: failed
Generated: 2026-11-03T13:56:49.735Z

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
- Status: passed
- Required: true

## User Decision Required

Some hard gates failed. User cannot approve until issues are resolved.