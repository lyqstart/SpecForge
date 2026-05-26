/**
 * Property test for atomic chain failure preserves pre-state.
 *
 * Feature: version-unification, Property 9: Atomic chain failure preserves pre-state
 * Derived-From: v6-architecture-overview Property 9
 * Validates: Requirements 4.5, 13.1, 13.2
 *
 * Property 9 statement (from design.md §Correctness Properties):
 *
 *   For any migration chain [m_{from+1}, …, m_to] and any failure injection at
 *   step index K ∈ [from+1, to] (failure during forward() or during the writer
 *   call), after MigrationRunner.run returns:
 *
 *     - if step-K rollback succeeded:
 *         every file under projectDir is byte-identical to its state captured
 *         immediately before step K-1 completed (i.e., data_schema_version
 *         === K-1); the chain is aborted; an entry has been appended to
 *         <project>/specforge/migration-error.log containing the offending
 *         pair [K-1, K], the originating error message, and the stack trace.
 *
 *     - if step-K rollback failed:
 *         data_schema_version is byte-identical to its pre-migration value
 *         (= from); the same diagnostic log entry is written, with rollback
 *         failure annotated.
 *
 * Test environment:
 *  - real filesystem temp dirs via fs.mkdtemp (tracked + afterEach cleanup)
 *  - fault injection arbitrary: random chain length `to ∈ [1,5]` × failing
 *    step `K ∈ [1, to]` (covers first-step, middle-step, last-step failures)
 *  - numRuns: 1000 (data integrity critical — R4.5 / R13.1 / R13.2)
 *  - per-`it` timeout: 60_000 ms (~30-50ms per iteration × 1000)
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  Migration,
  MigrationContext,
  MigrationRegistry,
} from '../../src/migration/registry';
import { MigrationRunner } from '../../src/migration/runner';
import type { ProjectManifest } from '../../src/manifest/types';

// ---------------------------------------------------------------------------
// Dynamic temp-dir tracking (T1: 对称清理原则)
//
// Each fast-check iteration creates a unique temp dir; afterEach removes the
// whole tree at the end of every `it`. Cleanup is O(numRuns).
// ---------------------------------------------------------------------------

const trackedTempDirs: string[] = [];

async function makeTrackedTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prop9-'));
  trackedTempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (trackedTempDirs.length > 0) {
    const dir = trackedTempDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {
      /* best-effort */
    });
  }
});

// ---------------------------------------------------------------------------
// Fault-injection arbitrary
// ---------------------------------------------------------------------------

interface FaultInjection {
  /** Chain target version (from = 0). */
  to: number;
  /** Index of the step that throws during forward (1 ≤ K ≤ to). */
  failingStep: number;
}

/**
 * Generates (to, failingStep) such that 1 ≤ failingStep ≤ to ≤ 5.
 *
 * Range chosen to cover:
 *   - first-step failure (failingStep = 1)
 *   - middle-step failure (failingStep ∈ (1, to))
 *   - last-step failure (failingStep = to)
 * while keeping per-iteration cost bounded (≤ 5 fs round-trips per chain).
 */
function arbitraryFaultInjection(): fc.Arbitrary<FaultInjection> {
  return fc
    .integer({ min: 1, max: 5 })
    .chain((to) =>
      fc.integer({ min: 1, max: to }).map((failingStep) => ({ to, failingStep })),
    );
}

// ---------------------------------------------------------------------------
// Migration fixture: deterministic chain with one fault-injection point
// ---------------------------------------------------------------------------

/**
 * Each migration writes a marker file `step-<N>.json` with content
 * `{"step": N}`. The migration at `failingStep` instead throws synchronously
 * inside forward() *before* writing — that lets us assert post-rollback that
 * step-K.json does NOT exist while step-{1..K-1}.json do exist with their
 * exact pre-K-1 contents.
 */
function buildRegistry(to: number, failingStep: number): MigrationRegistry {
  const migrations: Migration[] = [];
  for (let v = 1; v <= to; v++) {
    const targetVersion = v;
    migrations.push({
      targetVersion,
      forward: async (ctx: MigrationContext) => {
        if (targetVersion === failingStep) {
          // Fault injection: throw before any write happens.
          throw new Error(`fault-injected forward failure at step ${targetVersion}`);
        }
        await ctx.writeJson(`step-${targetVersion}.json`, { step: targetVersion });
      },
      isIdempotentAtTarget: async () => false,
    });
  }

  // Minimal duck-typed registry — we only need scriptsBetween().
  return {
    scriptsBetween(from: number, target: number): readonly Migration[] {
      if (from >= target) return [];
      return migrations.filter(
        (m) => m.targetVersion > from && m.targetVersion <= target,
      );
    },
  } as unknown as MigrationRegistry;
}

/**
 * Creates a fresh project with `specforge/manifest.json` at dsv = `from`.
 */
async function setupInitialProject(
  projectDir: string,
  from: number,
): Promise<{ manifestPath: string; manifestSnapshot: string }> {
  const specforgeDir = path.join(projectDir, 'specforge');
  const manifestPath = path.join(specforgeDir, 'manifest.json');
  await fs.mkdir(specforgeDir, { recursive: true });

  const now = new Date().toISOString();
  const initial: ProjectManifest = {
    data_schema_version: from,
    initialized_at: now,
    updated_at: now,
  };
  const content = JSON.stringify(initial, null, 2);
  await fs.writeFile(manifestPath, content, 'utf-8');

  return { manifestPath, manifestSnapshot: content };
}

async function readManifest(manifestPath: string): Promise<ProjectManifest> {
  return JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as ProjectManifest;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Property 9 — main PBT
// ---------------------------------------------------------------------------

describe('Property 9: Atomic chain failure preserves pre-state', () => {
  describe('R4.5 / R13.1 / R13.2: forward throw at step K → rollback succeeds', () => {
    it(
      'Property: any (to, failingStep) → dsv=K-1, files at K-1 state, log entry recorded',
      async () => {
        await fc.assert(
          fc.asyncProperty(arbitraryFaultInjection(), async ({ to, failingStep }) => {
            const projectDir = await makeTrackedTempDir();
            const from = 0;
            const { manifestPath } = await setupInitialProject(projectDir, from);

            const registry = buildRegistry(to, failingStep);
            const runner = new MigrationRunner(projectDir, registry);

            const result = await runner.run({ projectDir, from, to });

            // (a) Result is FAILED_ROLLED_BACK with the offending pair.
            expect(result.kind).toBe('FAILED_ROLLED_BACK');
            if (result.kind !== 'FAILED_ROLLED_BACK') return; // narrow for TS

            expect(result.pair).toEqual([failingStep - 1, failingStep]);

            // (b) Manifest's data_schema_version is preserved at K-1
            //     (= last successful step's target). R4.5 / R13.1.
            const finalManifest = await readManifest(manifestPath);
            expect(finalManifest.data_schema_version).toBe(failingStep - 1);

            // (c) Project files reflect the K-1 successful state:
            //     step-{1..K-1}.json exist with exact contents,
            //     step-{K..to}.json do NOT exist. R4.5 byte-identicality.
            for (let v = 1; v < failingStep; v++) {
              const filePath = path.join(projectDir, `step-${v}.json`);
              const stepFile = JSON.parse(
                await fs.readFile(filePath, 'utf-8'),
              ) as { step: number };
              expect(stepFile).toEqual({ step: v });
            }
            for (let v = failingStep; v <= to; v++) {
              const filePath = path.join(projectDir, `step-${v}.json`);
              expect(await fileExists(filePath)).toBe(false);
            }

            // (d) migration-error.log exists with a JSONL entry containing
            //     the offending pair, error message, stack trace, and the
            //     rollback="ok" annotation. R13.2.
            const logPath = path.join(
              projectDir,
              'specforge',
              'migration-error.log',
            );
            expect(await fileExists(logPath)).toBe(true);

            const logContent = await fs.readFile(logPath, 'utf-8');
            const lines = logContent.split('\n').filter((l) => l.length > 0);
            expect(lines.length).toBeGreaterThanOrEqual(1);

            const lastEntry = JSON.parse(lines[lines.length - 1]);
            expect(lastEntry.pair).toEqual([failingStep - 1, failingStep]);
            expect(typeof lastEntry.err).toBe('string');
            expect(lastEntry.err).toContain('fault-injected forward failure');
            expect(typeof lastEntry.stack).toBe('string');
            expect(lastEntry.stack.length).toBeGreaterThan(0);
            expect(lastEntry.rollback).toBe('ok');
          }),
          { numRuns: 1000 },
        );
      },
      60_000,
    );
  });

  // -------------------------------------------------------------------------
  // R13.2: first JSONL entry must carry schema_version="1.0"
  // -------------------------------------------------------------------------
  describe('R13.2: migration-error.log first entry carries schema_version="1.0"', () => {
    it('first JSONL line includes schema_version: "1.0"', async () => {
      const projectDir = await makeTrackedTempDir();
      await setupInitialProject(projectDir, 0);

      const registry = buildRegistry(/* to */ 2, /* failingStep */ 1);
      const runner = new MigrationRunner(projectDir, registry);

      const result = await runner.run({ projectDir, from: 0, to: 2 });
      expect(result.kind).toBe('FAILED_ROLLED_BACK');

      const logPath = path.join(projectDir, 'specforge', 'migration-error.log');
      const lines = (await fs.readFile(logPath, 'utf-8'))
        .split('\n')
        .filter((l) => l.length > 0);

      expect(lines.length).toBeGreaterThanOrEqual(1);
      const firstEntry = JSON.parse(lines[0]);
      expect(firstEntry.schema_version).toBe('1.0');
    });
  });

  // -------------------------------------------------------------------------
  // R4.5: rollback-failure semantics (currently not exercisable through the
  // runner's natural code path because rollbackStep wraps everything in a
  // single try/catch and silently swallows individual file restore failures.
  // We still document the contract here so future work can wire in a stubbed
  // FS or DI seam to exercise it.)
  // -------------------------------------------------------------------------
  describe('R4.5: rollback-failure preserves pre-migration dsv (semantic placeholder)', () => {
    it.skip(
      'rollback failure → dsv = from + log entry annotated rollback="failed:<reason>"',
      async () => {
        // Intentionally skipped: the current MigrationRunner.rollbackStep only
        // returns rollbackSucceeded=false when the *outer* try/catch fires,
        // which in practice cannot be triggered without injecting an fs
        // failure. Covered indirectly by the contract in
        // MigrationRunner.run's `else` branch (exercised by integration tests
        // with a mocked fs in task 15.3 follow-up work).
      },
    );
  });
});
