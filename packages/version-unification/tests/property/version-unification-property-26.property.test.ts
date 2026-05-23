/**
 * Property test for user-manifest-missing bootstrap behavior.
 *
 * Feature: version-unification, Property 26: User-manifest-missing bootstrap behavior
 * Derived-From: v6-architecture-overview Property 26
 * Validates: Requirements 14.1, 14.2
 *
 * Property: For any expectedPath P and any installerCommand I, invoking
 * `handleUserManifestMissing({ expectedPath: P, installerCommand: I, print })`:
 *   1. (R14.1) calls `print` at least once,
 *   2. (R14.1) the concatenated print output contains the literal string P,
 *   3. (R14.1) the concatenated print output contains the literal string I,
 *   4. (R14.2) returns `{ exitCode: 0 }`,
 *   5. (R14.2) does NOT perform any filesystem write operation
 *      (`fs.writeFile`, `fs.appendFile`, `fs.writeFileSync`, `fs.appendFileSync`,
 *      `fs.promises.writeFile`, `fs.promises.appendFile` all remain uncalled).
 *
 * numRuns: 200
 *
 * Strategy:
 *   - Spy on every fs write surface ONCE for the whole describe block via
 *     vi.spyOn at module level; each iteration asserts call counts are 0.
 *   - `print` is a fresh `vi.fn()` per iteration so per-iteration call records
 *     are isolated.
 *   - Inputs are arbitrary strings (including empty, unicode, control chars,
 *     long strings) — `expectedPath` and `installerCommand` are treated as
 *     opaque labels by the bootstrap handler, so we exercise them broadly.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { handleUserManifestMissing } from '../../src/bootstrap/user-missing';

describe('Property 26: User-manifest-missing bootstrap behavior', () => {
  // -------------------------------------------------------------------------
  // FS write spies — install once per `it`, restored in afterEach.
  // -------------------------------------------------------------------------

  let writeFileSpy: ReturnType<typeof vi.spyOn>;
  let appendFileSpy: ReturnType<typeof vi.spyOn>;
  let writeFileSyncSpy: ReturnType<typeof vi.spyOn>;
  let appendFileSyncSpy: ReturnType<typeof vi.spyOn>;
  let promisesWriteFileSpy: ReturnType<typeof vi.spyOn>;
  let promisesAppendFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub every fs write surface with a no-op; if the handler ever calls one,
    // the spy records the call (we then assert the count is 0).
    writeFileSpy = vi
      .spyOn(fs, 'writeFile')
      .mockImplementation(((_p: unknown, _d: unknown, cb: unknown) => {
        if (typeof cb === 'function') (cb as (err: null) => void)(null);
      }) as never);
    appendFileSpy = vi
      .spyOn(fs, 'appendFile')
      .mockImplementation(((_p: unknown, _d: unknown, cb: unknown) => {
        if (typeof cb === 'function') (cb as (err: null) => void)(null);
      }) as never);
    writeFileSyncSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation((() => undefined) as never);
    appendFileSyncSpy = vi
      .spyOn(fs, 'appendFileSync')
      .mockImplementation((() => undefined) as never);
    promisesWriteFileSpy = vi
      .spyOn(fsPromises, 'writeFile')
      .mockImplementation((async () => undefined) as never);
    promisesAppendFileSpy = vi
      .spyOn(fsPromises, 'appendFile')
      .mockImplementation((async () => undefined) as never);
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
    appendFileSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
    appendFileSyncSpy.mockRestore();
    promisesWriteFileSpy.mockRestore();
    promisesAppendFileSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Arbitraries
  // -------------------------------------------------------------------------

  /**
   * `expectedPath` and `installerCommand` are emitted verbatim by the handler.
   * fc.string() generates arbitrary unicode strings including empty, control
   * chars, surrogates, long strings — exercising the "literal substring"
   * invariant broadly. We cap length to keep concatenated output bounded.
   */
  const arbExpectedPath = fc.string({ minLength: 0, maxLength: 256 });
  const arbInstallerCommand = fc.string({ minLength: 0, maxLength: 256 });

  // -------------------------------------------------------------------------
  // Property
  // -------------------------------------------------------------------------

  it(
    'Property: any expectedPath/installerCommand → print contains both literals, no fs writes, exit 0',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbExpectedPath,
          arbInstallerCommand,
          async (expectedPath, installerCommand) => {
            // Fresh print spy per iteration so call records don't leak.
            const captured: string[] = [];
            const print = vi.fn((msg: string) => {
              captured.push(msg);
            });

            const result = await handleUserManifestMissing({
              expectedPath,
              installerCommand,
              print,
            });

            // Invariant 4 (R14.2): exit code is exactly 0.
            expect(result).toEqual({ exitCode: 0 });

            // Invariant 1 (R14.1): print is called at least once.
            expect(print.mock.calls.length).toBeGreaterThanOrEqual(1);

            // Invariants 2, 3 (R14.1): output contains both literals verbatim.
            const combined = captured.join('\n');
            expect(combined.includes(expectedPath)).toBe(true);
            expect(combined.includes(installerCommand)).toBe(true);

            // Invariant 5 (R14.2): no project data is modified — every fs
            // write surface remained uncalled across the entire invocation.
            expect(writeFileSpy).not.toHaveBeenCalled();
            expect(appendFileSpy).not.toHaveBeenCalled();
            expect(writeFileSyncSpy).not.toHaveBeenCalled();
            expect(appendFileSyncSpy).not.toHaveBeenCalled();
            expect(promisesWriteFileSpy).not.toHaveBeenCalled();
            expect(promisesAppendFileSpy).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});
