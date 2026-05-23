/**
 * `specforge --version` subcommand handler.
 *
 * Implements task 12.2 of the `version-unification` spec. The single source
 * of truth for `code_version` at runtime is
 * `@specforge/version-unification`'s `getCodeVersion()`; this file MUST NOT
 * embed a literal version string anywhere (Requirement 5.2 / CI guard).
 *
 * Output contract (Requirement 10.2):
 *   - Success: stdout receives exactly `${getCodeVersion()}\n`,
 *              stderr is silent, exit code is 0.
 *   - Failure: stderr receives a single diagnostic line that names the
 *              underlying error, stdout is silent, exit code is non-zero.
 *
 * The handler accepts an injectable writer pair so the orchestrator (CLI
 * entry) can route output to `process.stdout` / `process.stderr` while
 * tests can capture lines into arrays without monkey-patching globals.
 *
 * @see Requirements 10.2
 * @see design.md §"Doctor / --version 输出格式"
 */

/**
 * Writer pair used by `runVersionCommand`. Each method receives the raw
 * line — including any trailing newline — and is expected to forward it
 * to its underlying sink without further formatting.
 *
 * The shape matches what `process.stdout.write` / `process.stderr.write`
 * expose, but is narrowed to plain string input so tests stay simple.
 */
export interface VersionCommandWriter {
  write: (line: string) => void;
  writeErr: (line: string) => void;
}

/**
 * Internal version provider seam.
 *
 * The default implementation dynamically imports `@specforge/version-unification`
 * to bridge the CLI's CommonJS module graph to the ESM-only
 * version-unification package. Tests substitute this provider via
 * `_setVersionProvider` to drive both success and failure branches without
 * mutating module-level state in version-unification itself.
 *
 * @internal
 */
type VersionProvider = () => Promise<string> | string;

const defaultVersionProvider: VersionProvider = async () => {
  const mod = await import('@specforge/version-unification');
  return mod.getCodeVersion();
};

let activeVersionProvider: VersionProvider = defaultVersionProvider;

/**
 * Override the version provider for a single test. Always pair with
 * `_resetVersionProvider` in the matching `afterEach` to avoid leaking
 * state across test files.
 *
 * @internal — exported for tests under `packages/cli/tests/`
 */
export function _setVersionProvider(provider: VersionProvider): void {
  activeVersionProvider = provider;
}

/**
 * Restore the production version provider.
 *
 * @internal — exported for tests under `packages/cli/tests/`
 */
export function _resetVersionProvider(): void {
  activeVersionProvider = defaultVersionProvider;
}

/**
 * Execute the `--version` subcommand.
 *
 * Returns the process exit code rather than calling `process.exit`
 * directly so the CLI entry point can compose this with other lifecycle
 * concerns (flushing streams, shutting down clients) before exiting.
 *
 * @param writer where to emit the success line and any diagnostic line
 * @returns `0` on success, `1` on internal failure
 */
export async function runVersionCommand(writer: VersionCommandWriter): Promise<number> {
  try {
    const codeVersion = await activeVersionProvider();
    if (typeof codeVersion !== 'string' || codeVersion.length === 0) {
      throw new Error('version provider returned an empty value');
    }
    writer.write(`${codeVersion}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writer.writeErr(`specforge: failed to determine code version: ${message}\n`);
    return 1;
  }
}
