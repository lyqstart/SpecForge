# OpenCode adapter deployment

Adapter is part of SpecForge's official installed production consumer. From the SpecForge repository root:

```bash
bun install --frozen-lockfile
bun scripts/prepare-current-release.ts
bun scripts/sf-installer.ts install
bun scripts/sf-installer.ts verify
specforge daemon start --detach
specforge daemon status
```

See [prerequisites/platform scope](../../../docs/user/install.md). Verified release payloads already contain their assets. Restart OpenCode to load updated user-level files; Thin Plugin does not own Daemon lifecycle.

Verify installed bytes and actual health/version. Check real kernel readiness, loaded Agents/Skills and provider-reported metadata. Installing a package or constructing an adapter does not establish model execution.

Missing provider capabilities remain unknown/null. Do not infer support from names, invent compatibility tables, create project-local production Plugin configuration or replace kernel execution with fallback simulation.

Upgrade with `bun scripts/sf-installer.ts upgrade`, then `verify` and appropriate explicit restarts. Incompatibility remains a typed failure until the owner restores the correct release. Preserve user changes; do not downgrade through ad hoc package installation.
