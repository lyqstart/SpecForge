# Archived Legacy Protocol Tests

These tests were written for the old version-unification protocol
(sf_specforge_plugin_entry.ts, 8-field RuntimeManifest, satisfiesRange-based compatibility).

That file was deleted during the V6.0→V6.1 plugin protocol migration (2026-05-24).
The new plugin uses:
- `.opencode/plugins/sf_specforge.ts` as the entry point
- `@specforge/version-unification` with 3-field ProjectManifest + StartupCompatibilityChecker
- `@specforge/service-management` ReconnectingDaemonClient for daemon communication

These tests are kept for reference only. They CANNOT run as-is.

File extensions are renamed to `.test.ts.disabled` so that test runners (vitest/bun)
do not accidentally pick them up.
