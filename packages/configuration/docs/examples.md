# Current configuration examples

Inspect the installed read-only CLI:

```bash
specforge config
specforge config --help
```

Read an existing initialized project:

```typescript
import { loadAcceptedConfigSync, createConfigAccess } from '@specforge/configuration';

const accepted = loadAcceptedConfigSync({ projectPath: process.cwd() });
const access = createConfigAccess(accepted);
const level = access.getOr<string>('logLevel', 'info');
// Consume level.value; level.source identifies the accepted layer.
```

This example does not create or repair truth sources. For project mutation, orchestrator uses `sf_project_config`: read the hash, validate, then update with `expected_sha256`. Restore selects the previous accepted hash. Active WI snapshots remain frozen. A conflict requires rereading authoritative state.

Trusted invocation environments can supply one JSON object in `SPECFORGE_CONFIG_OVERRIDES`, for example `{"logLevel":"debug"}`. Keep secrets out of transcripts. This does not authorize overriding a frozen snapshot or inventing CLI flags. See [format](configuration-format.md).
