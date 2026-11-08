# GateResult contract

The [shared interface](../src/types.ts) and [runners](../src/GateRunner.ts) define this library result. The Daemon's formal GateReport is a separate controlled artifact contract; a locally constructed GateResult is not an accepted governance receipt.

| Field | Meaning |
| --- | --- |
| schema_version | independent result schema 1.0 |
| passed | boolean result consumed together with status and policy |
| reason | optional human explanation; not independent proof |
| details | optional structured diagnostics; sanitize before logging |
| status | optional passed / failed / blocked / waived / not_enabled |

A real verified pass must come from the check owner. Failed means checked and rejected; blocked means prerequisites prevented execution. Waived is explicit policy acceptance and must not be represented as verified execution. Not-enabled means no configured executable check. Required/hard Gate policy and approval/waiver validity belong to their controlled owners.

```typescript
import type { GateResult } from '@specforge/workflow-runtime';
const blocked: GateResult = {
  schema_version: '1.0', passed: false, status: 'blocked',
  reason: 'Required input is unavailable'
};
```

Do not manufacture passed results for unexecuted tests, copy stale evidence, or use a callback/result object to bypass StateManager, Code Permission, verification grants, HardStops, Gates or Close. D23 execution evidence has its own immutable plan/attempt/lease/receipt checks.

Run repository verification through the current workspace test entry. Business project verification follows the approved controlled verification owner, not an unregistered workflow CLI command.
