# Daemon development

Read repository [AGENTS.md](../../AGENTS.md), run Bootstrap and follow the current execution mode/active development rules before product changes. SpecForge self-development does not create a product-self WI.

From the repository root:

```bash
bun install --frozen-lockfile
bun scripts/build-workspace.ts
bun run --cwd packages/daemon-core test
```

Use current source and original raw failure evidence to reconstruct the owner/call chain. Match code, schema/Tool metadata, installed templates, release producer, installer and actual deployed bytes. Existing tests and historical reports are consumers, not product authority.

For an actual platform release, use scripts/prepare-current-release.ts and scripts/verify-platform-release.ts in an isolated owned configuration. Do not count mocked/ skipped platforms or CLI usage output as executed tests. Preserve raw output and numeric exits.

Business state is owned by StateManager and controlled tool handlers. Use temporary synthetic projects for regression; do not overwrite real project truth, bypass HardStops or rerun closed work as a test fixture.

Current authority: [SPS](../../docs/product-specification/specforge-product-specification.md), [Registry](../../docs/product-specification/authority-registry.md), [active rules](../../docs/rule/specforge-active-development-rules.md).
