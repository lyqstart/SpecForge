# Tasks — WI-008: v1.1 Review Fixes

> Work Item: WI-008 | Workflow: change_request | Based on: 6 review feedback areas

---

## TASK-1 Fix directory-layout.ts LAYOUT to v1.1 MVP

**task_id**: TASK-1
**refs**: [CR-1]

### What
Modify `packages/types/src/directory-layout.ts`:
- Move `logs` entries under `runtime` as `runtime/logs`, `runtime/logs/telemetry.jsonl`, etc.
- Remove top-level `archive`, `sessions`, `cas`, `knowledge`, `logs` from LAYOUT main area
- Keep `specs` as legacy read-only with explicit comment
- Keep only: `manifest`, `project`, `workItems`, `config`, `runtime` as v1.1 MVP main paths
- Archive/sessions/cas go under `runtime/` sub-paths (e.g., `runtime/archive`, `runtime/sessions`, `runtime/cas`)
- Knowledge stays as committed path (not in MVP forbidden list per reviewer)

### allowed_write_files
- `packages/types/src/directory-layout.ts`

### verification_commands
```bash
cd packages/types && npx tsc --noEmit
```

---

## TASK-2 Update render-layout.ts and README.md

**task_id**: TASK-2
**refs**: [CR-2]

### What
- `scripts/render-layout.ts`: Update to reflect new layout (project/work-items/runtime as main)
- `README.md`: Change "安装后用户项目视角" to show project/work-items/runtime structure; mark specs as legacy read-only; remove archive/knowledge/sessions as v1.1 current model

### allowed_write_files
- `scripts/render-layout.ts`
- `README.md`

---

## TASK-3 Create docs/standards/ directory with 3 files

**task_id**: TASK-3
**refs**: [CR-3]

### What
Create:
- `docs/standards/fused_standard.md` — copy/symlink reference to v1.1 standard
- `docs/standards/implementation_plan.md` — v1.1 implementation plan overview
- `docs/standards/source_mapping.md` — standard section → code module mapping

### allowed_write_files
- `docs/standards/fused_standard.md`
- `docs/standards/implementation_plan.md`
- `docs/standards/source_mapping.md`

---

## TASK-4 Fix WorkflowEngine executeSimpleGate default behavior

**task_id**: TASK-4
**refs**: [CR-4]

### What
Fix in BOTH locations:
1. `packages/workflow-runtime/src/WorkflowEngine.ts` L267-272
2. `packages/workflow-runtime/src/engine/WorkflowEngine.ts` L485-490

Change `executeSimpleGate` from:
```typescript
if (gate.checkFn) {
  return await gate.checkFn();
}
return { schema_version: '1.0', passed: true, reason: 'No check function defined, default pass' };
```

To:
```typescript
if (gate.checkFn) {
  return await gate.checkFn();
}
// CR-4 fix: No checkFn means gate cannot verify — must fail/blocked
// Only gates explicitly marked as not_enabled (non-critical) can bypass
if (gate.required === false || gate.severity === 'soft') {
  return { schema_version: '1.0', passed: true, reason: 'Non-critical gate without checkFn, auto-waived' };
}
return { schema_version: '1.0', passed: false, reason: 'Required gate has no check function defined — blocked' };
```

Also update `SimpleGateDefinition` type in `types/gate-definition.ts` to add `required?: boolean` and `severity?: 'hard' | 'soft'`.

### allowed_write_files
- `packages/workflow-runtime/src/WorkflowEngine.ts`
- `packages/workflow-runtime/src/engine/WorkflowEngine.ts`
- `packages/workflow-runtime/src/types/gate-definition.ts`
- `packages/workflow-runtime/src/types.ts`

### verification_commands
```bash
cd packages/workflow-runtime && npx tsc --noEmit
cd packages/daemon-core && npx tsc --noEmit
```

---

## TASK-5 Strengthen Path Policy with actor+path+operation+WI status

**task_id**: TASK-5
**refs**: [CR-5]

### What
Rewrite `packages/daemon-core/src/tools/lib/path-policy.ts`:

Add `enforceWritePolicy(actor, filePath, operation, wiStatus)`:
- `.specforge/project/**` → only `Merge Runner` can write
- `.specforge/work-items/*/gates/**` → only `Gate Runner` can write
- `.specforge/work-items/*/user_decision.json` → only `User Decision Recorder` can write
- `.specforge/work-items/*/merge_report.md` → only `Merge Runner` can write
- `.specforge/specs/**` → read-only in new flow (WI status ≠ legacy)
- Forbid `.specforge/standards`, `.specforge/archive`, `.specforge/snapshots`, `.specforge/state`, `.specforge/reports` in user projects

### allowed_write_files
- `packages/daemon-core/src/tools/lib/path-policy.ts`

### verification_commands
```bash
cd packages/daemon-core && npx tsc --noEmit
```

---

## TASK-6 Add evidence prerequisites to state machine transitions

**task_id**: TASK-6
**refs**: [CR-6]

### What
Modify `packages/daemon-core/src/tools/lib/state-machine-v11.ts`:

Add `STATE_EVIDENCE_REQUIREMENTS` map:
```typescript
export const STATE_EVIDENCE_REQUIREMENTS: Record<string, { requiredFile: string; description: string }> = {
  'approval_required': { requiredFile: 'gate_summary.md', description: 'Gate Summary must exist' },
  'merge_ready': { requiredFile: 'user_decision.json', description: 'User Decision must exist' },
  'merging': { requiredFile: 'gate_summary.md', description: 'merge_ready_gate must have passed' },
  'closed': { requiredFile: 'verification_report.md', description: 'close_gate must have passed' },
};
```

Add `checkStateEvidenceRequirement(status, workItemDir)` function that verifies the required file exists before allowing transition INTO that state.

Update `isValidV11Transition` to accept optional `workItemDir` and check evidence.

### allowed_write_files
- `packages/daemon-core/src/tools/lib/state-machine-v11.ts`

### verification_commands
```bash
cd packages/daemon-core && npx tsc --noEmit
cd packages/daemon-core && npx vitest run tests/v11-runtime-integration.test.ts tests/v11-section21-acceptance.test.ts
```
