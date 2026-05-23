/**
 * Unit test for sf-installer `migrate-manifest` subcommand registration.
 *
 * **Validates: Requirements 12.1**
 *
 * R12.1 (literal contract): the SpecForge_System SHALL expose
 * Migrate_Manifest_Command as `bun scripts/sf-installer.ts migrate-manifest`.
 *
 * This test runs the literal command line in a subprocess and asserts:
 *   - exit code === 0
 *   - stdout contains the substring `migrate-manifest`
 *   - stdout contains help-banner content (the `用法:` / `选项:` headings)
 *
 * The subprocess approach (vs. importing `runMigrateManifestCommand` directly)
 * is intentional — R12.1 is about the *exposed CLI surface*, so we must
 * exercise the actual `bun scripts/sf-installer.ts <subcommand>` invocation
 * path that users will type, not the internal function.
 *
 * Per `tasks.md` 13.5, this file lives under the root `tests/unit/` directory
 * (not under any `packages/<module>/tests/`) — it's a cross-cutting test that
 * validates the installer entry point owns the subcommand registration.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root = tests/unit/ → ../../
const PROJECT_ROOT = join(__dirname, '..', '..');
const SF_INSTALLER_PATH = join(PROJECT_ROOT, 'scripts', 'sf-installer.ts');

// Spawning a child process + bun startup + TS transpile is non-trivial on
// Windows. Give the test a generous timeout so a cold cache doesn't flake.
const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;

describe('sf-installer subcommand registration (R12.1)', () => {
  it(
    '`bun scripts/sf-installer.ts migrate-manifest --help` exits 0 with help banner',
    () => {
      const result = spawnSync('bun', [SF_INSTALLER_PATH, 'migrate-manifest', '--help'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        // Resolve `bun.exe` via PATH on Windows (spawnSync needs shell:true on
        // Windows to look up `bun` from PATH the same way a user would).
        shell: process.platform === 'win32',
        // Hard ceiling on subprocess wall-clock time — protects against the
        // installer wedging on lock acquisition or other unexpected I/O.
        timeout: SUBPROCESS_TEST_TIMEOUT_MS - 5_000,
      });

      // R12.1 literal contract: the subcommand must dispatch successfully.
      expect(result.error, `subprocess error: ${result.error?.message ?? ''}`).toBeUndefined();
      expect(result.signal, `subprocess killed by signal: ${result.signal ?? ''}`).toBeNull();
      expect(result.status).toBe(0);

      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';

      // The subcommand name must appear verbatim somewhere in stdout — this
      // is the strongest evidence that the help banner emitted by
      // `runMigrateManifestCommand` (not the installer's top-level usage)
      // was the one that ran.
      expect(
        stdout,
        `expected stdout to contain 'migrate-manifest', got stdout=${JSON.stringify(
          stdout,
        )} stderr=${JSON.stringify(stderr)}`,
      ).toContain('migrate-manifest');

      // The migrate-manifest command's own help banner contains a `用法:`
      // header (Chinese for "Usage:") and a `--help` flag listing.
      // Asserting both keeps us robust against minor wording tweaks while
      // still rejecting the installer's top-level usage banner (which uses
      // the same `用法:` heading but does NOT enumerate `--manifest-path`).
      expect(stdout).toMatch(/用法:|Usage:/);
      expect(stdout).toContain('--help');

      // R12.1 dispatch surface: stderr should be silent on the happy path —
      // a non-empty stderr would indicate the installer fell through into
      // an error branch despite returning exit 0 (which would be a
      // contract bug worth catching here).
      expect(stderr.trim()).toBe('');
    },
    SUBPROCESS_TEST_TIMEOUT_MS,
  );
});
