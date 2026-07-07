# SpecForge semantic closure close gate integration result

## Scope

This package completes the semantic closure hardening as one integrated change:

1. `packages/daemon-core/src/tools/lib/close-gate.ts`
2. `packages/daemon-core/tests/unit/close-gate-semantic-closure.test.ts`
3. `packages/daemon-core/tests/unit/close-gate-extension-request.test.ts`
4. `packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts`

It does not change workflow state authority, merge behavior, code permission behavior, or the close-gate handler lifecycle. The handler still advances state only after `runCloseGate()` passes.

## Functional change

`close_gate` now requires the Work Item root to contain:

```text
.semantic_closure.json
```

The file is a machine-readable semantic closure manifest. Before `close_gate` can pass, it must validate:

```text
OUT -> REQ -> DD -> TASK -> EV
```

The validator blocks close when:

- no user outcome is declared;
- no requirement/task/evidence exists;
- a user outcome is not covered by requirements;
- a MUST requirement is not covered by tasks;
- design decisions are not justified by requirements;
- required evidence is missing, failed, blocked, unknown, or weak;
- file-only / compile-only / build-only / static-only evidence is used as completion proof;
- `project_integration.status` is not `merged` or `not_applicable`.

## Why this blocks the fj1 failure mode

The fj1 logging failure happened because framework files existed, but the actual user outcome was not proven:

```text
local persistence + server upload + flush call chain
```

With this close-gate integration, a Work Item cannot close merely because files were created, tests compiled, or a report mentions evidence. It must provide a passed, non-weak evidence chain proving the declared outcome and MUST requirements.

## Test coverage

Added:

```text
packages/daemon-core/tests/unit/close-gate-semantic-closure.test.ts
```

Updated fixtures:

```text
packages/daemon-core/tests/unit/close-gate-extension-request.test.ts
packages/daemon-core/tests/unit/sf-v11-close-gate.test.ts
```

The updated fixtures now write `.semantic_closure.json`, because close gate requires it.

## Local verification commands

Run from:

```powershell
cd D:\code\temp\SpecForge\packages\daemon-core
```

Recommended targeted checks:

```powershell
bun run test -- tests/unit/semantic-closure-core.test.ts tests/unit/close-gate-semantic-closure.test.ts tests/unit/close-gate-extension-request.test.ts tests/unit/sf-v11-close-gate.test.ts
bun run build
```

Then from repo root:

```powershell
cd D:\code\temp\SpecForge
git status --short
git diff --stat
```
