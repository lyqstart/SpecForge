/**
 * CLI reporter layer — public surface.
 *
 * Currently exports the version-leak filter (task 12.5 of
 * `version-unification`). Future reporter concerns (formatting, mode-aware
 * routing, etc.) should live alongside.
 */

export {
  wrapWriter,
  containsVersionLeakToken,
  VersionLeakFilteringWriter,
  VERSION_LEAK_TOKENS,
  NORMAL_RW_KIND,
  type Writer,
  type StartupMode,
} from './version-leak-filter';

import { wrapWriter, type StartupMode, type Writer } from './version-leak-filter';

/**
 * Apply the version-leak reporter filter to the process's stdout/stderr.
 *
 * Returns a `{ stdout, stderr }` pair to be used by business-command
 * handlers in place of `process.stdout` / `process.stderr` directly. Doctor
 * and `--version` entry points must NOT route their writes through this —
 * they own the version surface concern and need to print the literal field
 * values.
 *
 * Wiring this into the actual CLI dispatcher is the responsibility of
 * task 15.1 (`integrate startup decision into plugin / cli entry`); this
 * function is the contract that 15.1 will call.
 *
 * @see Requirement 10.1
 */
export function applyVersionLeakFilter(
  mode: StartupMode,
  streams: { stdout: Writer; stderr: Writer } = {
    stdout: process.stdout,
    stderr: process.stderr,
  },
): { stdout: Writer; stderr: Writer } {
  return {
    stdout: wrapWriter(streams.stdout, mode),
    stderr: wrapWriter(streams.stderr, mode),
  };
}
