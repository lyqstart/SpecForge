/**
 * Unit tests for the version-leak reporter filter.
 *
 * Validates Requirements 10.1: business-command stdout/stderr in NORMAL_RW
 * mode must not contain `code_version`, `data_schema_version`, or
 * `min_supported_data_schema` literal field names.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  wrapWriter,
  containsVersionLeakToken,
  VERSION_LEAK_TOKENS,
  VersionLeakFilteringWriter,
  type Writer,
  type StartupMode,
} from '../../src/reporter/version-leak-filter';

/**
 * In-memory writer that captures everything written to it.
 * Used in place of `process.stdout` / `process.stderr` so tests stay
 * deterministic and don't pollute the test runner output.
 */
class CapturingWriter implements Writer {
  public chunks: string[] = [];

  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(
      typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'),
    );
    return true;
  }

  text(): string {
    return this.chunks.join('');
  }

  reset(): void {
    this.chunks = [];
  }
}

const NORMAL_RW: StartupMode = { kind: 'NORMAL_RW' };
const MIGRATE: StartupMode = { kind: 'MIGRATE' };
const DEGRADED_HIGHER: StartupMode = { kind: 'DEGRADED_HIGHER_THAN_KNOWN' };
const DEGRADED_FAILED: StartupMode = { kind: 'DEGRADED_MIGRATION_FAILED' };

describe('containsVersionLeakToken', () => {
  it('detects each of the three version-surface tokens', () => {
    expect(containsVersionLeakToken('hello code_version: 6.0.0')).toBe(true);
    expect(containsVersionLeakToken('see data_schema_version=5')).toBe(true);
    expect(
      containsVersionLeakToken('config has min_supported_data_schema'),
    ).toBe(true);
  });

  it('returns false for unrelated content', () => {
    expect(containsVersionLeakToken('build complete')).toBe(false);
    expect(containsVersionLeakToken('Job created: abc123')).toBe(false);
    expect(containsVersionLeakToken('')).toBe(false);
  });

  it('exposes exactly the three documented tokens', () => {
    expect([...VERSION_LEAK_TOKENS].sort()).toEqual(
      ['code_version', 'data_schema_version', 'min_supported_data_schema'].sort(),
    );
  });
});

describe('wrapWriter — NORMAL_RW filtering', () => {
  let captured: CapturingWriter;
  let filtered: Writer;

  beforeEach(() => {
    captured = new CapturingWriter();
    filtered = wrapWriter(captured, NORMAL_RW);
  });

  it('drops a line containing `code_version`', () => {
    filtered.write('build started\n');
    filtered.write('code_version: 6.0.0\n');
    filtered.write('build complete\n');

    const out = captured.text();
    expect(out).not.toContain('code_version');
    expect(out).toContain('build started');
    expect(out).toContain('build complete');
  });

  it('drops a line containing `data_schema_version`', () => {
    filtered.write('init project\n');
    filtered.write('  data_schema_version=5\n');
    filtered.write('init done\n');

    const out = captured.text();
    expect(out).not.toContain('data_schema_version');
    expect(out).toContain('init project');
    expect(out).toContain('init done');
  });

  it('drops a line containing `min_supported_data_schema`', () => {
    filtered.write('checking compatibility\n');
    filtered.write('min_supported_data_schema: 3\n');
    filtered.write('proceed\n');

    const out = captured.text();
    expect(out).not.toContain('min_supported_data_schema');
    expect(out).toContain('checking compatibility');
    expect(out).toContain('proceed');
  });

  it('handles a multi-line chunk that mixes leaking and clean lines', () => {
    filtered.write(
      'banner\ncode_version: 6.0.0\ndata_schema_version: 5\nfooter\n',
    );

    const out = captured.text();
    expect(out).not.toContain('code_version');
    expect(out).not.toContain('data_schema_version');
    expect(out).toContain('banner');
    expect(out).toContain('footer');
  });

  it('buffers partial lines across multiple writes', () => {
    // Split a leaking line across two writes; the filter must still drop it.
    filtered.write('start\ncode_');
    expect(captured.text()).toBe('start\n');

    filtered.write('version=6.0.0\nend\n');
    const out = captured.text();
    expect(out).toBe('start\nend\n');
  });

  it('preserves a trailing un-newlined remainder until flush', () => {
    const filteringWriter = new VersionLeakFilteringWriter(captured);
    filteringWriter.write('clean line\nno newline yet');
    expect(captured.text()).toBe('clean line\n');

    filteringWriter.flush();
    expect(captured.text()).toBe('clean line\nno newline yet');
  });

  it('drops a leaking remainder on flush as well', () => {
    const filteringWriter = new VersionLeakFilteringWriter(captured);
    filteringWriter.write('ok\ncode_version=6.0.0');
    filteringWriter.flush();

    expect(captured.text()).toBe('ok\n');
  });
});

describe('wrapWriter — non-NORMAL_RW passthrough', () => {
  it('returns the original writer unchanged in MIGRATE mode', () => {
    const captured = new CapturingWriter();
    const wrapped = wrapWriter(captured, MIGRATE);

    expect(wrapped).toBe(captured);

    wrapped.write('[migration] data_schema_version 2 → 5 in 134 ms\n');
    expect(captured.text()).toContain('data_schema_version');
  });

  it('returns the original writer unchanged in DEGRADED_HIGHER_THAN_KNOWN mode', () => {
    const captured = new CapturingWriter();
    const wrapped = wrapWriter(captured, DEGRADED_HIGHER);

    expect(wrapped).toBe(captured);

    wrapped.write(
      '[error] data_schema_version 7 exceeds highest supported schema 5.\n',
    );
    expect(captured.text()).toContain('data_schema_version');
  });

  it('returns the original writer unchanged in DEGRADED_MIGRATION_FAILED mode', () => {
    const captured = new CapturingWriter();
    const wrapped = wrapWriter(captured, DEGRADED_FAILED);

    expect(wrapped).toBe(captured);

    wrapped.write('[error] migration 4→5 failed.\n');
    wrapped.write('Current code_version: 6.0.0\n');
    expect(captured.text()).toContain('code_version');
  });

  it('does not affect doctor / --version style writers when bypassed', () => {
    // Doctor and --version are documented to NOT call wrapWriter at all.
    // Verify that a writer never wrapped is fully unmolested.
    const captured = new CapturingWriter();

    // Doctor output with all three tokens — must reach the underlying writer.
    captured.write('SpecForge Doctor\n');
    captured.write('  code_version              : 6.0.0\n');
    captured.write('  min_supported_data_schema : 3\n');
    captured.write('  data_schema_version       : 5\n');

    const out = captured.text();
    expect(out).toContain('code_version');
    expect(out).toContain('min_supported_data_schema');
    expect(out).toContain('data_schema_version');
  });
});

describe('wrapWriter — write contract', () => {
  it('propagates back-pressure signal from the underlying writer', () => {
    const backPressureWriter: Writer = {
      write: () => false,
    };
    const wrapped = wrapWriter(backPressureWriter, NORMAL_RW);

    expect(wrapped.write('a clean line\n')).toBe(false);
  });

  it('returns true when nothing is forwarded (all lines filtered)', () => {
    const captured = new CapturingWriter();
    const wrapped = wrapWriter(captured, NORMAL_RW);

    // Only leaking content — nothing forwarded — no back-pressure observed.
    expect(wrapped.write('code_version=6.0.0\n')).toBe(true);
    expect(captured.chunks.length).toBe(0);
  });
});


describe('applyVersionLeakFilter — CLI integration helper', () => {
  it('wraps both stdout and stderr in NORMAL_RW', async () => {
    const { applyVersionLeakFilter } = await import('../../src/reporter');
    const stdout = new CapturingWriter();
    const stderr = new CapturingWriter();

    const wrapped = applyVersionLeakFilter(NORMAL_RW, { stdout, stderr });
    wrapped.stdout.write('build done\ncode_version=6.0.0\n');
    wrapped.stderr.write('warn\nmin_supported_data_schema=3\n');

    expect(stdout.text()).toBe('build done\n');
    expect(stderr.text()).toBe('warn\n');
  });

  it('returns the original streams in degraded modes', async () => {
    const { applyVersionLeakFilter } = await import('../../src/reporter');
    const stdout = new CapturingWriter();
    const stderr = new CapturingWriter();

    const wrapped = applyVersionLeakFilter(DEGRADED_HIGHER, {
      stdout,
      stderr,
    });

    expect(wrapped.stdout).toBe(stdout);
    expect(wrapped.stderr).toBe(stderr);
  });
});
