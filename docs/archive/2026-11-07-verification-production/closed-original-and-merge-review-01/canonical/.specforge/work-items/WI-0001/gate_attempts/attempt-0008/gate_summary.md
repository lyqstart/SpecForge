# Gate Summary

Work Item: WI-0001
Overall Status: failed
Generated: 2026-11-07T09:39:24.314Z

## Gate Reports

### formal_version_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - Verification Gate passed
  - Hard Gate verification_gate.json did not fail

### verification_gate
- Type: hard_gate
- Status: failed
- Required: true
- Blocking Issues:
  - semantic closure is bound to the current verification artifacts
  - Unverified Contract consumer src/greet.ts has structured manual review for PI-CORE-001

## User Decision Required

Some hard gates failed. User cannot approve until issues are resolved.