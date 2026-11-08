# @specforge/configuration

Derived reference for the shared CLI/Daemon configuration consumer. Product decisions remain in the [Product Specification](../../docs/product-specification/specforge-product-specification.md).

Deploy this workspace with the [official installer](../../docs/user/install.md).

```typescript
import { loadAcceptedConfigSync, createConfigAccess } from '@specforge/configuration';

const access = createConfigAccess(loadAcceptedConfigSync());
const level = access.getOr<string>('logLevel', 'info');
// level is { value, source, path }. Do not log arbitrary configuration values.
```

Supply `{ projectPath }` for an existing initialized project. Layers are builtin → user → project → trusted runtime. User configuration is `<OpenCode config>/sf-user/config/config.json` (optional); project configuration is `<project>/.specforge/config/project.json` (required with project context). Configuration schema `1.0` is independent of product release identity.

Production accepts the JSON object `SPECFORGE_CONFIG_OVERRIDES`, not arbitrary prefixed environment variables or invented CLI flags. Library interpolation/loaders do not expand that production contract.

Project mutation belongs to orchestrator's `sf_project_config` tool: read/validate/update/restore. Update/restore require `expected_sha256`; an active WI's accepted configuration remains frozen. Sensitive credential fields cannot be supplied from project configuration. Never bypass a rejection with a manual truth-source edit.

See [format](docs/configuration-format.md), [examples](docs/examples.md), [practices](docs/best-practices.md), [acceptance source](src/accepted-config.ts) and [access API](src/config-access.ts). Build/test through the current workspace dependency order.
