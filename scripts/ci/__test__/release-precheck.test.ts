/**
 * scripts/ci/__test__/release-precheck.test.ts
 *
 * Unit tests for `release-precheck.ts` (Requirement 5.3).
 *
 * Each test builds a real temporary directory with a fixture monorepo
 * (root `package.json` + a few `packages/<module>/package.json` files)
 * and asserts the structured result of `runReleasePrecheck`.
 *
 * Run with:
 *   bun test scripts/ci/__test__/release-precheck.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  runReleasePrecheck,
  parseCliArgs,
  formatHumanReport,
  type ReleasePrecheckResult,
} from '../release-precheck';

// ----------------------------------------------------------------------------
// fixture helpers
// ----------------------------------------------------------------------------

interface FixtureRepo {
  /** Absolute path to the temp repo root. */
  readonly root: string;
  /** Cleanup callback to delete the temp dir. */
  readonly cleanup: () => Promise<void>;
}

/** Build a brand-new temp directory we can treat as a repo root. */
async function makeFixtureRepo(): Promise<FixtureRepo> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-release-precheck-'));
  return {
    root,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/** Write a `package.json` to `<root>/<relPath>`, creating dirs as needed. */
async function writeManifest(
  root: string,
  relPath: string,
  content: Record<string, unknown>,
): Promise<void> {
  const abs = path.join(root, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

// ----------------------------------------------------------------------------
// Cases
// ----------------------------------------------------------------------------

describe('runReleasePrecheck', () => {
  let fixture: FixtureRepo;

  beforeEach(async () => {
    fixture = await makeFixtureRepo();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it('returns ok=true and empty drifts when all sub-packages match the root version', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    await writeManifest(fixture.root, 'packages/foo/package.json', {
      name: '@specforge/foo',
      version: '6.0.0',
    });
    await writeManifest(fixture.root, 'packages/bar/package.json', {
      name: '@specforge/bar',
      version: '6.0.0',
    });

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
    expect(result.rootVersion).toBe('6.0.0');
  });

  it('returns ok=false and lists drifts when a sub-package declares a different version', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // The matching sibling acts as a negative control — it must NOT
    // appear in the drift list.
    await writeManifest(fixture.root, 'packages/aligned/package.json', {
      name: '@specforge/aligned',
      version: '6.0.0',
    });
    await writeManifest(fixture.root, 'packages/drifted/package.json', {
      name: '@specforge/drifted',
      version: '5.0.0',
    });
    await writeManifest(fixture.root, 'packages/also-drifted/package.json', {
      name: '@specforge/also-drifted',
      version: '6.0.1',
    });

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(false);
    expect(result.rootVersion).toBe('6.0.0');
    // Sort by file for stable assertion (impl already sorts but be
    // explicit).
    const sorted = [...result.drifts].sort((a, b) =>
      a.file.localeCompare(b.file),
    );
    expect(sorted).toEqual([
      {
        file: 'packages/also-drifted/package.json',
        declared: '6.0.1',
        expected: '6.0.0',
      },
      {
        file: 'packages/drifted/package.json',
        declared: '5.0.0',
        expected: '6.0.0',
      },
    ]);
    // The aligned sibling MUST NOT appear in drifts.
    expect(
      result.drifts.find((d) => d.file === 'packages/aligned/package.json'),
    ).toBeUndefined();
  });

  it('treats a sub-package without a `version` field as OK (workspace package may not publish)', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // No `version` field — this is the recommended shape for workspace
    // members and must not be flagged as drift.
    await writeManifest(fixture.root, 'packages/no-version/package.json', {
      name: '@specforge/no-version',
      private: true,
    });

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
  });

  it('ignores a non-string `version` field (does not crash, does not flag drift)', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // A numeric `version` is an invalid manifest for npm, but it's not
    // the kind of drift this rule targets — `bun publish` itself will
    // reject it. We just ensure we don't trip on it.
    await writeManifest(fixture.root, 'packages/weird/package.json', {
      name: '@specforge/weird',
      version: 6 as unknown as string,
    });

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
  });

  it('returns ok=true when there is no `packages/` directory at all', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    // Deliberately no packages/ directory.

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
    expect(result.rootVersion).toBe('6.0.0');
  });

  it('throws a clear error when the root package.json is missing', async () => {
    // Don't write any root manifest.
    await expect(
      runReleasePrecheck({ repoRoot: fixture.root }),
    ).rejects.toThrow(/cannot read root package.json/);
  });

  it('throws a clear error when the root package.json has no string `version`', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      // Intentionally no `version`.
      private: true,
    });
    await expect(
      runReleasePrecheck({ repoRoot: fixture.root }),
    ).rejects.toThrow(/missing a string `version` field/);
  });

  it('does not descend below packages/<module>/ when looking for manifests', async () => {
    await writeManifest(fixture.root, 'package.json', {
      name: 'specforge',
      version: '6.0.0',
      private: true,
    });
    await writeManifest(fixture.root, 'packages/foo/package.json', {
      name: '@specforge/foo',
      version: '6.0.0',
    });
    // Build artefact buried two levels deep — must NOT be inspected.
    await writeManifest(fixture.root, 'packages/foo/dist/package.json', {
      name: '@specforge/foo-dist',
      version: '0.0.1', // would be a drift if inspected
    });

    const result = await runReleasePrecheck({ repoRoot: fixture.root });

    expect(result.ok).toBe(true);
    expect(result.drifts).toEqual([]);
  });
});

// ----------------------------------------------------------------------------
// Tiny helper coverage
// ----------------------------------------------------------------------------

describe('parseCliArgs', () => {
  it('returns the cwd as repoRoot when no flags are provided', () => {
    const r = parseCliArgs([]);
    expect(r.repoRoot).toBe(process.cwd());
  });

  it('honours --repo-root=<value>', () => {
    const r = parseCliArgs(['--repo-root=/tmp/some-fixture']);
    expect(r.repoRoot).toBe('/tmp/some-fixture');
  });
});

describe('formatHumanReport', () => {
  it('renders ok runs as "no drifts"', () => {
    const result: ReleasePrecheckResult = {
      ok: true,
      rootVersion: '6.0.0',
      drifts: [],
    };
    const text = formatHumanReport(result);
    expect(text).toContain('rootVersion=6.0.0');
    expect(text).toContain('no drifts');
  });

  it('renders drift runs with file/declared/expected per drift', () => {
    const result: ReleasePrecheckResult = {
      ok: false,
      rootVersion: '6.0.0',
      drifts: [
        {
          file: 'packages/foo/package.json',
          declared: '5.0.0',
          expected: '6.0.0',
        },
      ],
    };
    const text = formatHumanReport(result);
    expect(text).toContain('drifts (1)');
    expect(text).toContain('packages/foo/package.json');
    expect(text).toContain('declared=5.0.0');
    expect(text).toContain('expected=6.0.0');
  });
});
