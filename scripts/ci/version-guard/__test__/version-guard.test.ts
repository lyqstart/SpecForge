/**
 * scripts/ci/version-guard/__test__/version-guard.test.ts
 *
 * Unit tests for the CI Version Guard orchestrator (`runVersionGuard`).
 *
 * Covers:
 *   1. 30 s hard-timeout triggering when a rule hangs
 *      (we use a tiny override to keep the test fast)
 *   2. Aggregation of violations from multiple rules
 *   3. `schema_version: "1.0"` is present in the stdout JSON
 *   4. Infrastructure errors (rule throws / git failure) bubble into
 *      `exitCode !== 0` and `infrastructureError` populated
 *   5. parseCliArgs basic round-trip
 *   6. formatHumanReport produces non-empty summary
 *
 * Run with:
 *   bun test scripts/ci/version-guard/__test__/version-guard.test.ts
 *
 * schema_version: 1.0
 */

import { describe, it, expect } from 'bun:test';

import {
  runVersionGuard,
  parseCliArgs,
  formatHumanReport,
  type RunVersionGuardOptions,
  type VersionGuardRule,
} from '../../version-guard';
import type { Violation } from '../types';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Build a rule that resolves immediately with a fixed list. */
function fixedRule(name: string, violations: Violation[]): VersionGuardRule {
  return {
    name,
    async check(): Promise<Violation[]> {
      return violations;
    },
  };
}

/** Build a rule that hangs longer than the provided timeout. */
function slowRule(name: string, durationMs: number): VersionGuardRule {
  return {
    name,
    async check(): Promise<Violation[]> {
      // Use a real timer; the orchestrator's hard timeout should preempt
      // this. Resolve to [] only if it ever completes (it shouldn't).
      await new Promise((r) => setTimeout(r, durationMs));
      return [];
    },
  };
}

/** Build a rule that throws — simulates infrastructure / git failure. */
function throwingRule(name: string, message: string): VersionGuardRule {
  return {
    name,
    async check(): Promise<Violation[]> {
      throw new Error(message);
    },
  };
}

/** Common scanner override: pretend no files changed. Avoids real git. */
const noopScanner: NonNullable<RunVersionGuardOptions['scanner']> = {
  async getChangedFiles() {
    return [];
  },
  async getFileHunks() {
    return { added: [], removed: [] };
  },
  async readFileWithSizeLimit() {
    return null;
  },
};

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

describe('runVersionGuard — schema_version', () => {
  it('emits schema_version "1.0" in the report', async () => {
    const { report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [],
      scanner: noopScanner,
    });
    expect(report.schema_version).toBe('1.0');
    expect(report.tool).toBe('CI_Version_Guard');

    // Round-trip through JSON to confirm the wire format keeps it.
    const parsed = JSON.parse(JSON.stringify(report));
    expect(parsed.schema_version).toBe('1.0');
  });
});

describe('runVersionGuard — violation aggregation', () => {
  it('collects violations across multiple rules in a single report', async () => {
    const v1: Violation = {
      ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
      file: 'a.ts',
      line: 7,
      matchedText: 'code_version: "6.0.0"',
    };
    const v2: Violation = {
      ruleId: 'MIN_SCHEMA_DECREASED',
      file: 'packages/version-unification/src/constants.ts',
      details: { from: 3, to: 2 },
    };
    const v3: Violation = {
      ruleId: 'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
      file: 'b.ts',
      line: 14,
      matchedText: 'data_schema_version = 5',
    };

    const { exitCode, report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [
        fixedRule('rA', [v1]),
        fixedRule('rB', [v2, v3]),
        fixedRule('rC', []),
      ],
      scanner: noopScanner,
    });

    expect(exitCode).toBe(1);
    expect(report.violations).toHaveLength(3);
    const ids = report.violations.map((v) => v.ruleId).sort();
    expect(ids).toEqual([
      'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
      'DATA_SCHEMA_WRITE_OUTSIDE_DEDICATED_MODULE',
      'MIN_SCHEMA_DECREASED',
    ]);
    expect(report.infrastructureError).toBeUndefined();
  });

  it('returns exitCode 0 with empty violations when all rules pass', async () => {
    const { exitCode, report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [fixedRule('clean', [])],
      scanner: noopScanner,
    });
    expect(exitCode).toBe(0);
    expect(report.violations).toEqual([]);
    expect(report.infrastructureError).toBeUndefined();
  });
});

describe('runVersionGuard — hard timeout', () => {
  it('triggers timeout when a rule outruns hardTimeoutMs and exits non-zero', async () => {
    const HARD_TIMEOUT = 50;
    const RULE_HANG = 5_000;

    const start = Date.now();
    const { exitCode, report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      hardTimeoutMs: HARD_TIMEOUT,
      rules: [slowRule('hanger', RULE_HANG)],
      scanner: noopScanner,
    });
    const elapsed = Date.now() - start;

    // Should have returned promptly — well before the rule's would-be
    // completion time.
    expect(elapsed).toBeLessThan(2_000);
    expect(report.timedOut).toBe(true);
    expect(exitCode).toBe(1);
    expect(report.infrastructureError).toBeDefined();
    expect(report.infrastructureError!).toContain('timeout');
  });
});

describe('runVersionGuard — infrastructure errors', () => {
  it('marks exitCode !== 0 and records error when a rule throws', async () => {
    const { exitCode, report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [throwingRule('boom', 'simulated git failure')],
      scanner: noopScanner,
    });
    expect(exitCode).toBe(1);
    expect(report.infrastructureError).toBeDefined();
    expect(report.infrastructureError!).toContain('boom');
    expect(report.infrastructureError!).toContain('simulated git failure');
  });

  it('treats getChangedFiles failure as infrastructure error', async () => {
    const failingScanner: NonNullable<RunVersionGuardOptions['scanner']> = {
      async getChangedFiles() {
        throw new Error('git not found');
      },
      async getFileHunks() {
        return { added: [], removed: [] };
      },
      async readFileWithSizeLimit() {
        return null;
      },
    };
    const { exitCode, report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [], // no rules, only the scannedFileCount probe runs git
      scanner: failingScanner,
    });
    expect(exitCode).toBe(1);
    expect(report.scannedFileCount).toBe(0);
    expect(report.infrastructureError).toBeDefined();
    expect(report.infrastructureError!).toContain('git not found');
  });

  it('memoises getChangedFiles so multiple rules share one call', async () => {
    let calls = 0;
    const memoScanner: NonNullable<RunVersionGuardOptions['scanner']> = {
      async getChangedFiles() {
        calls += 1;
        return ['a.ts', 'b.ts'];
      },
      async getFileHunks() {
        return { added: [], removed: [] };
      },
      async readFileWithSizeLimit() {
        return null;
      },
    };

    const probingRule = (name: string): VersionGuardRule => ({
      name,
      async check(ctx) {
        await ctx.getChangedFiles();
        await ctx.getChangedFiles();
        return [];
      },
    });

    const { report } = await runVersionGuard({
      diffBase: 'origin/main',
      repoRoot: process.cwd(),
      rules: [probingRule('r1'), probingRule('r2'), probingRule('r3')],
      scanner: memoScanner,
    });

    // Each rule called twice => 6 logical calls; the scannedFileCount
    // probe afterwards is one more. Memoisation collapses all of them
    // to a single underlying invocation.
    expect(calls).toBe(1);
    expect(report.scannedFileCount).toBe(2);
  });
});

describe('parseCliArgs', () => {
  it('returns defaults when no flags are supplied', () => {
    const out = parseCliArgs([]);
    expect(out.diffBase).toBe('origin/main');
    expect(typeof out.repoRoot).toBe('string');
    expect(out.hardTimeoutMs).toBe(30_000);
  });

  it('parses --diff-base, --repo-root, --timeout', () => {
    const out = parseCliArgs([
      '--diff-base=feature/x',
      '--repo-root=/tmp/foo',
      '--timeout=2500',
    ]);
    expect(out.diffBase).toBe('feature/x');
    expect(out.repoRoot).toBe('/tmp/foo');
    expect(out.hardTimeoutMs).toBe(2_500);
  });

  it('ignores invalid timeout values and keeps the default', () => {
    const out = parseCliArgs(['--timeout=abc']);
    expect(out.hardTimeoutMs).toBe(30_000);
  });
});

describe('formatHumanReport', () => {
  it('produces a non-empty summary when there are no violations', () => {
    const text = formatHumanReport({
      schema_version: '1.0',
      tool: 'CI_Version_Guard',
      diffBase: 'origin/main',
      scannedFileCount: 5,
      elapsedMs: 12,
      violations: [],
    });
    expect(text).toContain('CI Version Guard');
    expect(text).toContain('scannedFiles=5');
    expect(text).toContain('violations: none');
  });

  it('lists rule + file + line for each violation', () => {
    const text = formatHumanReport({
      schema_version: '1.0',
      tool: 'CI_Version_Guard',
      diffBase: 'origin/main',
      scannedFileCount: 1,
      elapsedMs: 1,
      violations: [
        {
          ruleId: 'CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON',
          file: 'a.ts',
          line: 9,
          matchedText: 'code_version: "1.2.3"',
        },
      ],
      infrastructureError: 'rule X threw',
    });
    expect(text).toContain('CODE_VERSION_LITERAL_OUTSIDE_PACKAGE_JSON');
    expect(text).toContain('a.ts:9');
    expect(text).toContain('infrastructureError: rule X threw');
  });
});
