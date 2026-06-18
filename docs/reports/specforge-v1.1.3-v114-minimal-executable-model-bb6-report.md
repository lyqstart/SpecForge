# SpecForge v1.1.3 BB6 Gate Auto-Advance Fix Report

## Result

- Patch status: `already_applied`
- Target: `packages/daemon-core/src/tools/handlers/sf-v11-gate-run.ts`

## Fix

Changed gate auto-advance comparison from legacy all gates to candidate-phase gates:

```ts
const requiredGateIds = getRequiredGates(input.workflowPath, 'candidate');
```

## Why

- BA v1 made `gate_ids=all` expand to candidate gates.
- Auto-advance still compared the executed gates against legacy all gates.
- Legacy all gates for `code_only_fast_path` still include `verification_gate`.
- Therefore candidate gates could pass but auto-advance could still report `not_full_required_gate_run`.

## Verification

- `bun run build`: PASS
- `packages/daemon-core npx tsc --noEmit`: PASS
- `git diff --check`: PASS

## Script robustness note

BB v6 intentionally avoids brittle function-shape anchors. It only applies the exact semantic replacement required for this bug and prints RESULT / CAUSE / NEXT ACTION on every exit.
