# Gate Summary

Work Item: WI-0002
Overall Status: failed
Generated: 2026-10-24T14:05:40.754Z

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
  - Every declared Module Design ID uses DD-<DOMAIN>-<NNN>

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
  - Every declared Module Design ID uses DD-<DOMAIN>-<NNN>

### trace_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - Every declared Module Design ID uses DD-<DOMAIN>-<NNN>

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