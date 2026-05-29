/**
 * CP-2: sf_state_transition Guard Idempotency Property Test
 *
 * Feature: daemon-core, CP-2: Transition Guard Idempotency
 * Derived-From: TASK-5 (DD-2 guard idempotency verification)
 *
 * Property: The sf_state_transition handler's project initialization guard
 * (manifest.json check) is idempotent — the result depends solely on the
 * existence of .specforge/manifest.json, not on call count, timing, or
 * interleaving with other contexts.
 *
 * Specifically:
 * 1. manifest.json absent → always returns PROJECT_NOT_INITIALIZED (no matter how many times)
 * 2. manifest.json present → normal Work Item creation proceeds
 * 3. Result deterministic: same manifest existence + same args → same outcome
 *
 * Uses fast-check asyncProperty to generate random workItemIds, toStates,
 * and context directories, then verifies guard idempotency across
 * repeated calls.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { getHandler } from '../../src/tools/ToolDispatcher';
// Side-effect import registers the handler globally
import '../../src/tools/handlers/sf-state-transition';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Arbitraries ──

const workItemIdArb = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0,
);

const toStateArb = fc.constantFrom(
  'intake',
  'requirements',
  'design',
  'tasks',
  'development',
  'review',
  'verification',
  'completed',
);

const dirSuffixArb = fc.stringMatching(/^[a-zA-Z0-9._\-]{1,20}$/);

// ── Helpers ──

/**
 * Create a temporary directory and return its path.
 */
async function createTempDir(suffix: string): Promise<string> {
  const tmpRoot = os.tmpdir();
  const dir = path.join(tmpRoot, `sf-cp2-${Date.now()}-${suffix}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Create .specforge/manifest.json in the given directory.
 */
async function createManifest(dir: string): Promise<void> {
  const specforgeDir = path.join(dir, '.specforge');
  await fs.mkdir(specforgeDir, { recursive: true });
  await fs.writeFile(
    path.join(specforgeDir, 'manifest.json'),
    JSON.stringify({ project: 'test', version: '1.0' }),
  );
}

/**
 * Create a mock workflowEngine that records calls and returns success.
 */
function createMockWorkflowEngine() {
  const transitionFull = vi.fn().mockResolvedValue({
    workItemId: 'test-wi',
    currentState: 'intake',
  });
  return { transitionFull };
}

describe('CP-2: sf_state_transition guard idempotency', () => {
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler('sf_state_transition')!;
    expect(handler).toBeDefined();
  });

  // ────────────────────────────────────────────────────────
  // Property 1: guard IS idempotent — absent manifest.json
  // ────────────────────────────────────────────────────────

  it('should always return PROJECT_NOT_INITIALIZED when manifest.json does not exist (idempotent)', async () => {
    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        toStateArb,
        dirSuffixArb,
        fc.nat({ max: 10 }),
        async (workItemId, toState, dirSuffix, extraCalls) => {
          const dir = await createTempDir(dirSuffix);

          try {
            // Call 1 — guard fires, manifest absent
            const result1 = await handler(
              { work_item_id: workItemId, from_state: '', to_state: toState },
              { directory: dir },
              {},
            );

            expect(result1.success).toBe(false);
            expect(result1.error).toBe('PROJECT_NOT_INITIALIZED');
            expect(result1.recovery_action).toBe('execute_startup_flow');

            // Call 2..N — must return exactly the same outcome
            for (let i = 0; i < extraCalls; i++) {
              const resultN = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dir },
                {},
              );

              expect(resultN.success).toBe(false);
              expect(resultN.error).toBe('PROJECT_NOT_INITIALIZED');
              expect(resultN.recovery_action).toBe('execute_startup_flow');
            }
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 2: guard IS idempotent — present manifest.json
  // ────────────────────────────────────────────────────────

  it('should always proceed normally when manifest.json exists (idempotent)', async () => {
    const mockEngine = createMockWorkflowEngine();
    const deps = { workflowEngine: mockEngine };

    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        toStateArb,
        dirSuffixArb,
        fc.nat({ max: 10 }),
        async (workItemId, toState, dirSuffix, extraCalls) => {
          const dir = await createTempDir(dirSuffix);
          await createManifest(dir);

          try {
            mockEngine.transitionFull.mockClear();

            // Call 1 — manifest exists, should proceed
            const result1 = await handler(
              { work_item_id: workItemId, from_state: '', to_state: toState },
              { directory: dir },
              deps,
            );

            expect(result1.success).toBe(true);
            expect(result1.error).toBeUndefined();
            expect(mockEngine.transitionFull).toHaveBeenCalledTimes(1);

            // Call 2..N — must also succeed, each call reaches workflowEngine
            for (let i = 0; i < extraCalls; i++) {
              const resultN = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dir },
                deps,
              );

              expect(resultN.success).toBe(true);
              expect(resultN.error).toBeUndefined();
            }

            // Total calls to workflowEngine = 1 + extraCalls
            expect(mockEngine.transitionFull).toHaveBeenCalledTimes(1 + extraCalls);
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 3: Deterministic — same conditions → same outcome
  // ────────────────────────────────────────────────────────

  it('should produce deterministic results for the same manifest state', async () => {
    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        toStateArb,
        dirSuffixArb,
        fc.nat({ max: 20 }),
        async (workItemId, toState, dirSuffix, callCount) => {
          const dir = await createTempDir(dirSuffix);

          try {
            // Phase 1: No manifest — all calls must return PROJECT_NOT_INITIALIZED
            const resultsWithoutManifest: boolean[] = [];
            for (let i = 0; i < callCount + 1; i++) {
              const r = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dir },
                {},
              );
              resultsWithoutManifest.push(r.success === false && r.error === 'PROJECT_NOT_INITIALIZED');
            }

            // All results must be identical (all PROJECT_NOT_INITIALIZED)
            expect(resultsWithoutManifest.every(Boolean)).toBe(true);
            expect(resultsWithoutManifest.length).toBe(callCount + 1);

            // Phase 2: Add manifest — now all calls must succeed
            await createManifest(dir);
            const mockEngine = createMockWorkflowEngine();
            const deps = { workflowEngine: mockEngine };

            const resultsWithManifest: boolean[] = [];
            for (let i = 0; i < callCount + 1; i++) {
              const r = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dir },
                deps,
              );
              resultsWithManifest.push(r.success === true);
            }

            // All results must be identical (all success)
            expect(resultsWithManifest.every(Boolean)).toBe(true);
            expect(resultsWithManifest.length).toBe(callCount + 1);
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 4: Guard skipped when fromState is non-empty
  // ────────────────────────────────────────────────────────

  it('should skip guard when fromState is non-empty regardless of manifest existence', async () => {
    const fromStateArb = fc.constantFrom(
      'intake',
      'requirements',
      'design',
      'tasks',
      'development',
      'review',
      'verification',
    );

    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        fromStateArb,
        toStateArb,
        dirSuffixArb,
        fc.boolean(),
        async (workItemId, fromState, toState, dirSuffix, createManifestFile) => {
          const dir = await createTempDir(dirSuffix);
          if (createManifestFile) {
            await createManifest(dir);
          }

          try {
            const mockEngine = createMockWorkflowEngine();

            // With non-empty fromState, guard is skipped regardless of manifest
            const result1 = await handler(
              { work_item_id: workItemId, from_state: fromState, to_state: toState },
              { directory: dir },
              { workflowEngine: mockEngine },
            );

            expect(result1.success).toBe(true);
            expect(result1.error).toBeUndefined();
            expect(mockEngine.transitionFull).toHaveBeenCalledTimes(1);

            // Call again — still no guard, still succeeds
            const result2 = await handler(
              { work_item_id: workItemId, from_state: fromState, to_state: toState },
              { directory: dir },
              { workflowEngine: mockEngine },
            );

            expect(result2.success).toBe(true);
            expect(result2.error).toBeUndefined();
            expect(mockEngine.transitionFull).toHaveBeenCalledTimes(2);
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 5: Interleaved — mixed contexts remain independent
  // ────────────────────────────────────────────────────────

  it('should handle interleaved calls across initialized and uninitialized contexts consistently', async () => {
    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        toStateArb,
        dirSuffixArb,
        fc.nat({ max: 5 }),
        async (workItemId, toState, dirSuffix, interleaveCount) => {
          // Create two directories: one with manifest, one without
          const dirWith = await createTempDir(dirSuffix + '-with');
          const dirWithout = await createTempDir(dirSuffix + '-without');
          await createManifest(dirWith);

          const mockEngine = createMockWorkflowEngine();

          try {
            for (let round = 0; round <= interleaveCount; round++) {
              // Call on uninitialized dir — always PROJECT_NOT_INITIALIZED
              const r1 = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dirWithout },
                {},
              );
              expect(r1.success).toBe(false);
              expect(r1.error).toBe('PROJECT_NOT_INITIALIZED');

              // Call on initialized dir — always succeeds
              const r2 = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { directory: dirWith },
                { workflowEngine: mockEngine },
              );
              expect(r2.success).toBe(true);
              expect(r2.error).toBeUndefined();
            }

            // Both contexts must have produced consistent results
            expect(mockEngine.transitionFull).toHaveBeenCalledTimes(interleaveCount + 1);
          } finally {
            await fs.rm(dirWith, { recursive: true, force: true }).catch(() => {});
            await fs.rm(dirWithout, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 6: context.worktree fallback
  // ────────────────────────────────────────────────────────

  it('should use context.worktree when context.directory is not set', async () => {
    await fc.assert(
      fc.asyncProperty(
        workItemIdArb,
        toStateArb,
        dirSuffixArb,
        fc.boolean(),
        async (workItemId, toState, dirSuffix, hasManifest) => {
          const dir = await createTempDir(dirSuffix);

          try {
            if (hasManifest) {
              await createManifest(dir);
              const mockEngine = createMockWorkflowEngine();

              const result = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { worktree: dir },
                { workflowEngine: mockEngine },
              );

              expect(result.success).toBe(true);
              expect(result.error).toBeUndefined();
              expect(mockEngine.transitionFull).toHaveBeenCalledTimes(1);
            } else {
              const result = await handler(
                { work_item_id: workItemId, from_state: '', to_state: toState },
                { worktree: dir },
                {},
              );

              expect(result.success).toBe(false);
              expect(result.error).toBe('PROJECT_NOT_INITIALIZED');
            }
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ────────────────────────────────────────────────────────
  // Property 7: Result independent of call count (pure function of manifest)
  // ────────────────────────────────────────────────────────

  it('should be a pure function of manifest.json existence (independent of call count)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(workItemIdArb, { minLength: 1, maxLength: 50 }),
        dirSuffixArb,
        fc.boolean(),
        async (workItemIds, dirSuffix, hasManifest) => {
          const dir = await createTempDir(dirSuffix);

          try {
            if (hasManifest) {
              await createManifest(dir);
            }

            const mockEngine = hasManifest ? createMockWorkflowEngine() : null;
            const deps = hasManifest ? { workflowEngine: mockEngine! } : {};

            const results: Array<{ success: boolean; error?: string }> = [];

            for (let i = 0; i < workItemIds.length; i++) {
              const r = await handler(
                {
                  work_item_id: workItemIds[i]!,
                  from_state: '',
                  to_state: 'intake',
                },
                { directory: dir },
                deps,
              );
              results.push({ success: r.success, error: r.error });
            }

            if (hasManifest) {
              // All must succeed
              expect(results.every((r) => r.success)).toBe(true);
              expect(mockEngine!.transitionFull).toHaveBeenCalledTimes(workItemIds.length);
            } else {
              // All must be PROJECT_NOT_INITIALIZED
              expect(results.every((r) => !r.success && r.error === 'PROJECT_NOT_INITIALIZED')).toBe(true);
            }

            // Verify no drift: first and last result identical
            expect(results[0]!.success).toBe(results[results.length - 1]!.success);
          } finally {
            await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
