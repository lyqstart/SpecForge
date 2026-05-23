/**
 * Unit tests for `runVersionCommand` (task 12.2 — version-unification).
 *
 * Validates the contract from Requirement 10.2:
 *   - Success: stdout receives `${getCodeVersion()}\n`, stderr is silent, exit 0.
 *   - Failure: stderr receives a diagnostic line, stdout is silent, exit ≠ 0.
 *
 * Tests inject a `VersionProvider` via `_setVersionProvider` so success and
 * failure branches can be exercised deterministically without filesystem
 * coupling.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetVersionProvider,
  _setVersionProvider,
  runVersionCommand,
  type VersionCommandWriter,
} from '../../src/commands/version';

interface CapturedWriter extends VersionCommandWriter {
  stdout: string[];
  stderr: string[];
}

function makeWriter(): CapturedWriter {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    write: (line) => {
      stdout.push(line);
    },
    writeErr: (line) => {
      stderr.push(line);
    },
  };
}

describe('runVersionCommand (R10.2)', () => {
  afterEach(() => {
    _resetVersionProvider();
  });

  describe('success path', () => {
    it('writes `${getCodeVersion()}\\n` to stdout, leaves stderr empty, returns 0', async () => {
      _setVersionProvider(() => '6.0.0-test');
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).toBe(0);
      expect(writer.stdout).toEqual(['6.0.0-test\n']);
      expect(writer.stderr).toEqual([]);
    });

    it('handles an async version provider returning a Promise', async () => {
      _setVersionProvider(async () => {
        await Promise.resolve();
        return '6.0.0-async';
      });
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).toBe(0);
      expect(writer.stdout).toEqual(['6.0.0-async\n']);
      expect(writer.stderr).toEqual([]);
    });

    it('emits exactly one stdout line (no extra padding, no leading prefix)', async () => {
      _setVersionProvider(() => '0.1.0');
      const writer = makeWriter();

      await runVersionCommand(writer);

      const joined = writer.stdout.join('');
      expect(joined).toBe('0.1.0\n');
      // No prose prefix like "SpecForge CLI v" leaks into the version output.
      expect(joined).not.toMatch(/SpecForge|CLI|v/);
    });
  });

  describe('failure path', () => {
    it('returns non-zero exit code and writes diagnostic to stderr when provider throws', async () => {
      const cause = new Error('repo root package.json missing');
      _setVersionProvider(() => {
        throw cause;
      });
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).not.toBe(0);
      expect(writer.stdout).toEqual([]);
      expect(writer.stderr).toHaveLength(1);
      const diagnostic = writer.stderr[0]!;
      expect(diagnostic).toMatch(/^specforge: failed to determine code version:/);
      expect(diagnostic).toContain('repo root package.json missing');
      expect(diagnostic.endsWith('\n')).toBe(true);
    });

    it('returns non-zero exit code when an async provider rejects', async () => {
      _setVersionProvider(async () => {
        throw new Error('package.json invalid version');
      });
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).not.toBe(0);
      expect(writer.stdout).toEqual([]);
      expect(writer.stderr.join('')).toContain('package.json invalid version');
    });

    it('treats an empty version string as a failure (no silent success)', async () => {
      _setVersionProvider(() => '');
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).not.toBe(0);
      expect(writer.stdout).toEqual([]);
      expect(writer.stderr).toHaveLength(1);
      expect(writer.stderr[0]).toMatch(/empty/);
    });

    it('does not call writer.write when the failure path is hit', async () => {
      _setVersionProvider(() => {
        throw new Error('boom');
      });
      let stdoutCalls = 0;
      let stderrCalls = 0;
      const writer: VersionCommandWriter = {
        write: () => {
          stdoutCalls += 1;
        },
        writeErr: () => {
          stderrCalls += 1;
        },
      };

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).not.toBe(0);
      expect(stdoutCalls).toBe(0);
      expect(stderrCalls).toBe(1);
    });
  });

  describe('default provider integration', () => {
    it('returns 0 and prints a semver-like string when delegated to @specforge/version-unification', async () => {
      // Do NOT override the provider — exercise the real bridge to
      // version-unification's getCodeVersion(), which reads the repo root
      // package.json. This validates that the dynamic import wiring works
      // end-to-end and produces a valid semver string.
      const writer = makeWriter();

      const exitCode = await runVersionCommand(writer);

      expect(exitCode).toBe(0);
      expect(writer.stderr).toEqual([]);
      expect(writer.stdout).toHaveLength(1);
      const out = writer.stdout[0]!;
      expect(out.endsWith('\n')).toBe(true);
      expect(out.trim()).toMatch(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/);
    });
  });
});
