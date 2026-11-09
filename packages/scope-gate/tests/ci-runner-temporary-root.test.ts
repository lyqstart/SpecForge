import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { qualifyTemporaryEnvironment } from '../../../scripts/lib/qualification-environment.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const owned: Array<{ directory: string; parent: string }> = [];
afterEach(() => {
  for (const { directory, parent } of owned.splice(0)) {
    if (
      realpathSync.native(directory) !== directory ||
      path.dirname(directory) !== parent ||
      !path.basename(directory).startsWith('sf-ci-temp-contract-')
    )
      throw new Error('UNOWNED_TEMP_CLEANUP');
    rmSync(directory, { recursive: true, force: true });
  }
});

interface ProbeFixture {
  directory: string;
  legacy: string;
  runner: string;
  report: string;
  capture: string;
  run(selected: string | undefined, phase?: string): SpawnSyncReturns<string>;
}

function fixture(): ProbeFixture {
  const parent = realpathSync.native(tmpdir());
  const directory = mkdtempSync(path.join(parent, 'sf-ci-temp-contract-'));
  owned.push({ directory, parent });
  const legacy = path.join(directory, 'legacy-system');
  const runner = path.join(directory, 'runner space');
  mkdirSync(legacy);
  mkdirSync(runner);
  const report = path.join(directory, 'report');
  const capture = path.join(directory, 'child-environment.json');
  function run(selected: string | undefined, phase = 'lint'): SpawnSyncReturns<string> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TEMP: legacy,
      TMP: legacy,
      TMPDIR: legacy,
      SPECFORGE_CI_REPORT_DIR: report,
      SF_CI_SPAWN_UNIT_PROBE: '1',
      SF_CI_ENV_CAPTURE: capture,
    };
    if (selected === undefined) delete env.RUNNER_TEMP;
    else env.RUNNER_TEMP = selected;
    delete env.NODE_OPTIONS;
    return spawnSync(
      process.execPath,
      [
        '--require',
        path.join(root, 'packages/scope-gate/tests/fixtures/ci-spawn-environment-probe.cjs'),
        path.join(root, 'scripts/run-ci-regression.mjs'),
        phase,
      ],
      { cwd: root, env, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 }
    );
  }
  return { directory, legacy, runner, report, capture, run };
}

describe('CI runner temporary root at the real entrypoint', () => {
  it('propagates the native runner root instead of the inherited system root and records its source', () => {
    const f = fixture();
    const result = f.run(path.join(f.runner, '..', path.basename(f.runner)));
    expect(result.status, result.stderr).toBe(0);
    const canonical = realpathSync.native(f.runner);
    expect(JSON.parse(readFileSync(f.capture, 'utf8'))).toEqual({
      TEMP: canonical,
      TMP: canonical,
      TMPDIR: canonical,
    });
    const context = JSON.parse(readFileSync(path.join(f.report, 'context.json'), 'utf8'));
    expect(context.temporary_directory.selection_source).toBe('RUNNER_TEMP');
    expect(context.temporary_directory.canonical).toBe(canonical);
    expect(context.temporary_directory.requested).toBe(path.resolve(f.runner));
  });

  it.each([undefined, '', '   '])(
    'rejects missing or empty runner root before phase execution: %s',
    (selected) => {
      const f = fixture();
      const result = f.run(selected);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('CI_RUNNER_TEMP_REQUIRED');
      expect(existsSync(f.capture)).toBe(false);
      expect(existsSync(f.report)).toBe(false);
    }
  );

  it('rejects a relative runner root instead of falling back', () => {
    const f = fixture();
    const result = f.run('relative-runner-temp');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('QUALIFICATION_TEMP_NOT_ABSOLUTE');
    expect(existsSync(f.capture)).toBe(false);
    expect(existsSync(f.report)).toBe(false);
  });

  it('does not create a missing runner root or start a phase', () => {
    const f = fixture();
    const missing = path.join(f.directory, 'missing');
    const result = f.run(missing);
    expect(result.status).not.toBe(0);
    expect(existsSync(missing)).toBe(false);
    expect(existsSync(f.capture)).toBe(false);
    expect(existsSync(f.report)).toBe(false);
  });

  it('rejects a file supplied as the runner root', () => {
    const f = fixture();
    const file = path.join(f.directory, 'not-a-directory');
    writeFileSync(file, 'unchanged');
    const result = f.run(file);
    expect(result.status).not.toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('unchanged');
    expect(existsSync(f.capture)).toBe(false);
  });

  it('keeps standalone explicit temporary qualification compatible', () => {
    const f = fixture();
    const qualified = qualifyTemporaryEnvironment(f.legacy);
    expect(qualified.canonical).toBe(realpathSync.native(f.legacy));
    expect(qualified.environment).toEqual({
      TEMP: qualified.canonical,
      TMP: qualified.canonical,
      TMPDIR: qualified.canonical,
    });
  });

  it('still refuses an unknown phase without invoking an external command', () => {
    const f = fixture();
    const result = f.run(f.runner, 'unknown-phase');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('CI_UNKNOWN_REGRESSION_PHASE');
    expect(existsSync(f.capture)).toBe(false);
  });
});
