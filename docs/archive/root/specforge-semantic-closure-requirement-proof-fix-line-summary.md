# Line Summary

- `packages/daemon-core/src/tools/lib/semantic-closure-core.ts`
  - tighten `requirementHasClosureEvidence()` so a MUST requirement requires direct passed non-weak evidence for that requirement id.
  - remove the unused task-level fallback helper that let sibling requirement evidence satisfy another requirement through a shared task.
