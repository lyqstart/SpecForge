/**
 * tests/unit/release-precheck.test.ts
 *
 * Unit tests for release precheck script exit code behavior.
 * Validates: Requirement 5.3 - Release process SHALL refuse to publish
 * if any sub-package has a version different from root package.json.
 *
 * These tests execute the actual script and verify exit codes,
 * complementing the internal logic tests in scripts/ci/__test__.
 *
 * Run with:
 *   bun test tests/unit/release-precheck.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawn } from 'node:child_process';

// ----------------------------------------------------------------------------
// fixture helpers
// ----------------------------------------------------------------------------

interface FixtureRepo {
  readonly root: string;
  readonly cleanup: () => Promise<void>;
}

async function makeFixtureRepo(): Promise<FixtureRepo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-release-precheck-exit-'));
  return {
    root,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

async function writeManifest(
  root: string,
  relPath: string,
  content: Record<string, unknown>,
): Promise<void> {
  const abs = path.join(root, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

/**
 * Execute the release-precheck script against a fixture repo.
 * Returns { exitCode, stdout, stderr }.
 */
async function runScript(repoRoot: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  // Use forward slashes for cross-platform compatibility
  const scriptPath = 'scripts/ci/release-precheck.ts';

  return new Promise((resolve) => {
    const child = spawn(
      'bun',
      ['run', scriptPath, `--repo-root=${repoRoot}`],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? -1,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      resolve({
        exitCode: -1,
        stdout: '',
        stderr: err.message,
      });
    });
  });
}

// ----------------------------------------------------------------------------
// Test cases - Exit code behavior (Requirement 5.3)
// ----------------------------------------------------------------------------

describe('release-precheck script exit codes', () => {
  let fixture: FixtureRepo;

  beforeEach(async () => {
    fixture = await makeFixtureRepo();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('exits with code 0 when all sub-packages match root version (no drift)', async () => {
    // Root package.json declares version 6.0.0
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // Sub-package matches root - no drift
    await writeManifest(fixture.root, 'packages/foo/package.json', {
      name: '@specforge/foo',
      version: '6.0.0',
    });

    const result = await runScript(fixture.root);

    expect(result.exitCode).toBe(0);
  });

  it('exits with code 1 when a sub-package declares different version (drift detected)', async () => {
    // Root package.json declares version 6.0.0
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // Sub-package has DRIFTED version (5.0.0 != 6.0.0)
    await writeManifest(fixture.root, 'packages/drifted/package.json', {
      name: '@specforge/drifted',
      version: '5.0.0',
    });

    const result = await runScript(fixture.root);

    expect(result.exitCode).toBe(1);
    // Verify drift is reported in output
    expect(result.stderr).toContain('drifts');
    expect(result.stderr).toContain('packages/drifted/package.json');
  });

  it('exits with code 0 when no packages directory exists', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '1.0.0',
      private: true,
    });
    // No packages/ directory at all

    const result = await runScript(fixture.root);

    expect(result.exitCode).toBe(0);
  });

  it('exits with code 1 when multiple sub-packages have drift', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // Multiple drifted packages
    await writeManifest(fixture.root, 'packages/foo/package.json', {
      name: '@specforge/foo',
      version: '5.9.0', // drift
    });
    await writeManifest(fixture.root, 'packages/bar/package.json', {
      name: '@specforge/bar',
      version: '6.0.1', // drift (different direction)
    });
    await writeManifest(fixture.root, 'packages/baz/package.json', {
      name: '@specforge/baz',
      version: '6.0.0', // aligned - should NOT appear in error
    });

    const result = await runScript(fixture.root);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('drifts (2)');
  });

  it('exits with code 0 when sub-package has no version field (workspace protocol)', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0-dev',
      private: true,
    });
    // No version field - this is the recommended workspace pattern
    await writeManifest(fixture.root, 'packages/workspace-pkg/package.json', {
      name: '@specforge/workspace-pkg',
      private: true,
    });

    const result = await runScript(fixture.root);

    expect(result.exitCode).toBe(0);
  });
});