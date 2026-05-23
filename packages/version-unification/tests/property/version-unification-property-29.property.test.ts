/**
 * Property test for unwritable project dir error path.
 *
 * Feature: version-unification, Property 29: Unwritable project dir error path
 * Derived-From: v6-architecture-overview Property 29
 * Validates: Requirements 15.4
 *
 * Property: For any project directory `projectDir` whose underlying writer
 * raises a filesystem permission error (EACCES, EROFS, EPERM) when asked to
 * create a fresh Project_Manifest, `handleProjectManifestMissing`
 *   1. throws a `ManifestUnwritableDirError`,
 *   2. the thrown error's `directoryPath` field equals the input `projectDir`,
 *   3. the thrown error carries `errno` information taken from the underlying
 *      filesystem error (either on the error itself, or on a `cause` chain),
 *   4. the underlying writer was actually invoked with the manifest path
 *      `<projectDir>/.specforge/manifest.json` and the requested
 *      `highestKnown` schema version (i.e. the bootstrap actually attempted
 *      to write before failing — the failure is not synthesized from a
 *      pre-flight check).
 *
 * The test uses an injected mock writer to simulate `EACCES` / `EROFS` /
 * `EPERM` errno values without having to construct a real read-only
 * directory on Windows (which is brittle and slow).
 *
 * As a negative control we additionally assert that non-permission filesystem
 * errors (e.g. `ENOENT`, `EBUSY`, `ENOSPC`) are NOT translated into
 * `ManifestUnwritableDirError` — they propagate as-is so callers can
 * disambiguate.
 *
 * numRuns: 200 (required by task spec)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { handleProjectManifestMissing } from '../../src/bootstrap/project-missing';
import { ManifestUnwritableDirError } from '../../src/manifest/types';
import type { ProjectManifestWriter } from '../../src/manifest/project-manifest-writer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an Error that mimics Node's NodeJS.ErrnoException shape for a given
 * POSIX-style errno code.
 */
function makeErrnoError(code: string, errno: number, syscall = 'open'): Error {
  const err = new Error(`${code}: simulated ${syscall} failure`) as Error & {
    code?: string;
    errno?: number;
    syscall?: string;
    path?: string;
  };
  err.code = code;
  err.errno = errno;
  err.syscall = syscall;
  return err;
}

/**
 * Construct a stub writer that drops in for `typeof ProjectManifestWriter`.
 *
 * The bootstrap handler only calls `writeFresh(path, dsv)`, so we only need
 * to override that one static method. Other static methods we forward to a
 * no-op `Promise.resolve()` to prevent accidental traversal during shrinking.
 */
function makeWriterRejectingWith(
  err: Error,
  capture: { calls: Array<{ path: string; dsv: number }> },
): typeof ProjectManifestWriter {
  // The tests only exercise writeFresh; cast through unknown is the cleanest
  // way to satisfy `typeof ProjectManifestWriter` without depending on the
  // full class shape.
  return {
    writeFresh: async (path: string, dsv: number): Promise<void> => {
      capture.calls.push({ path, dsv });
      throw err;
    },
    writeAfterMigration: async (): Promise<void> => {
      // unused in the bootstrap path; provided to satisfy the type
      return;
    },
    writeDualWrite: async (): Promise<void> => {
      return;
    },
  } as unknown as typeof ProjectManifestWriter;
}

/**
 * Read errno from either the error itself or a `cause` chain.
 *
 * The task description says the error object must carry `errno` "or cause
 * contains errno" — we accept either. The current implementation exposes
 * `.errno` directly on `ManifestUnwritableDirError`, but a future refactor
 * to use `cause: originalError` should still satisfy the property.
 */
function extractErrno(err: ManifestUnwritableDirError): number | undefined {
  if (typeof err.errno === 'number') return err.errno;

  // Walk the cause chain (max 4 hops to bound runtime).
  let current: unknown = (err as Error & { cause?: unknown }).cause;
  for (let i = 0; i < 4 && current != null; i += 1) {
    if (
      typeof current === 'object' &&
      current !== null &&
      'errno' in current &&
      typeof (current as { errno?: unknown }).errno === 'number'
    ) {
      return (current as { errno: number }).errno;
    }
    current =
      typeof current === 'object' && current !== null
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * POSIX errno codes for the three documented "directory not writable" cases
 * that R15.4 must handle, paired with realistic numeric errno values.
 *
 * Numeric errno values come from libuv's mapping (and Linux's <errno.h>),
 * which is what Node uses on every supported platform.
 */
const PERMISSION_CODES = [
  { code: 'EACCES', errno: -13 },
  { code: 'EPERM', errno: -1 },
  { code: 'EROFS', errno: -30 },
] as const;

/** Non-permission errno codes (negative control). */
const NON_PERMISSION_CODES = [
  { code: 'ENOENT', errno: -2 },
  { code: 'EBUSY', errno: -16 },
  { code: 'ENOSPC', errno: -28 },
  { code: 'EMFILE', errno: -24 },
] as const;

function arbitraryProjectDir(): fc.Arbitrary<string> {
  // Plausible cross-platform paths — we never touch the filesystem so any
  // string is fine, but variety helps shrinking find smallest counterexample.
  return fc.oneof(
    fc.constant('/tmp/some-project'),
    fc.constant('/var/lib/specforge/project'),
    fc.constant('C:\\Users\\test\\project'),
    fc.constant('D:\\code\\readonly-fs'),
    fc.constant('/mnt/readonly/project'),
    fc.string({ minLength: 1, maxLength: 32 }).map((s) => `/proj/${s}`),
  );
}

function arbitraryHighestKnown(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 100 });
}

function arbitraryPermissionErrno(): fc.Arbitrary<{ code: string; errno: number }> {
  return fc.constantFrom(...PERMISSION_CODES);
}

function arbitraryNonPermissionErrno(): fc.Arbitrary<{ code: string; errno: number }> {
  return fc.constantFrom(...NON_PERMISSION_CODES);
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 29: Unwritable project dir error path', () => {
  describe('Permission errors translate to ManifestUnwritableDirError (R15.4)', () => {
    it(
      'Property: any unwritable projectDir input causes handler to throw ManifestUnwritableDirError carrying dir + errno',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            arbitraryProjectDir(),
            arbitraryHighestKnown(),
            arbitraryPermissionErrno(),
            async (projectDir, highestKnown, { code, errno }) => {
              const capture: { calls: Array<{ path: string; dsv: number }> } = { calls: [] };
              const fsErr = makeErrnoError(code, errno);
              const writer = makeWriterRejectingWith(fsErr, capture);
              const logged: string[] = [];

              let caught: unknown;
              try {
                await handleProjectManifestMissing({
                  projectDir,
                  highestKnown,
                  writer,
                  log: (msg) => logged.push(msg),
                });
              } catch (err) {
                caught = err;
              }

              // Invariant 1: the handler must have thrown.
              expect(caught).toBeDefined();

              // Invariant 2: it must be a ManifestUnwritableDirError.
              expect(caught).toBeInstanceOf(ManifestUnwritableDirError);

              const unwritable = caught as ManifestUnwritableDirError;

              // Invariant 3: dir field is populated and equals input.
              expect(typeof unwritable.directoryPath).toBe('string');
              expect(unwritable.directoryPath).toBe(projectDir);

              // Invariant 4: errno is exposed (either on the error or via cause).
              const recoveredErrno = extractErrno(unwritable);
              expect(typeof recoveredErrno).toBe('number');
              expect(recoveredErrno).toBe(errno);

              // Invariant 5: the writer was invoked exactly once with the
              // expected manifest path and dsv (proves the failure is real,
              // not synthesised from a pre-flight check).
              expect(capture.calls).toHaveLength(1);
              expect(capture.calls[0]!.path).toBe(`${projectDir}/.specforge/manifest.json`);
              expect(capture.calls[0]!.dsv).toBe(highestKnown);

              // Invariant 6: no info-level "manifest created" log lines on
              // the failure path (R15.3 only fires on success).
              expect(logged).toEqual([]);
            },
          ),
          { numRuns: 200 },
        );
      },
    );

    it(
      'Property: thrown error preserves enough context for entry point to print dir + errno (R15.4 outer contract)',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            arbitraryProjectDir(),
            arbitraryPermissionErrno(),
            async (projectDir, { code, errno }) => {
              const capture: { calls: Array<{ path: string; dsv: number }> } = { calls: [] };
              const writer = makeWriterRejectingWith(makeErrnoError(code, errno), capture);

              let caught: unknown;
              try {
                await handleProjectManifestMissing({
                  projectDir,
                  highestKnown: 1,
                  writer,
                  log: () => undefined,
                });
              } catch (err) {
                caught = err;
              }

              expect(caught).toBeInstanceOf(ManifestUnwritableDirError);
              const unwritable = caught as ManifestUnwritableDirError;

              // Message contains directory path so the entry point's plain
              // `console.error(err.message)` still surfaces the dir.
              expect(unwritable.message).toContain(projectDir);

              // Recoverable errno (whether inline or via cause).
              expect(extractErrno(unwritable)).toBe(errno);
            },
          ),
          { numRuns: 200 },
        );
      },
    );
  });

  describe('Non-permission errors are NOT translated (negative control)', () => {
    it(
      'Property: ENOENT/EBUSY/ENOSPC/EMFILE bubble up unchanged, never as ManifestUnwritableDirError',
      async () => {
        await fc.assert(
          fc.asyncProperty(
            arbitraryProjectDir(),
            arbitraryHighestKnown(),
            arbitraryNonPermissionErrno(),
            async (projectDir, highestKnown, { code, errno }) => {
              const capture: { calls: Array<{ path: string; dsv: number }> } = { calls: [] };
              const original = makeErrnoError(code, errno);
              const writer = makeWriterRejectingWith(original, capture);

              let caught: unknown;
              try {
                await handleProjectManifestMissing({
                  projectDir,
                  highestKnown,
                  writer,
                  log: () => undefined,
                });
              } catch (err) {
                caught = err;
              }

              expect(caught).toBeDefined();
              // Must NOT be re-wrapped as ManifestUnwritableDirError —
              // only EACCES/EPERM/EROFS map to that type per R15.4.
              expect(caught).not.toBeInstanceOf(ManifestUnwritableDirError);
              // The original errno-carrying error is preserved as-is.
              expect(caught).toBe(original);
            },
          ),
          { numRuns: 200 },
        );
      },
    );
  });
});
