import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as currentObservability from '@specforge/observability';
import { recordDaemonObservation } from '../src/observability/observability-recorder';
import {
  getObservationRoot,
  recordSfObservation,
} from '../../../setup/userlevel-opencode/tools/lib/sf-observability';

const temporaryRoots: string[] = [];

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'specforge-observability-owner-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('current diagnostic observability persistent owner', () => {
  it('does not publish inactive duplicate runtime implementations', () => {
    const runtimeExports = currentObservability as Record<string, unknown>;
    expect(runtimeExports.EventLogger).toBeUndefined();
    expect(runtimeExports.CAS).toBeUndefined();
    expect(runtimeExports.QueryAPI).toBeUndefined();
    expect(runtimeExports.AnalystEngine).toBeUndefined();
    expect(runtimeExports.SfAnalyst).toBeUndefined();
    expect(runtimeExports.ModeSwitch).toBeUndefined();
    expect(runtimeExports.EventBus).toBeUndefined();
  });

  it('gives userlevel and daemon recorders disjoint physical roots', () => {
    const projectRoot = createProjectRoot();

    recordSfObservation({
      projectRoot,
      category: 'rpc',
      phase: 'request',
      trace_id: 'userlevel-trace',
      force: true,
    });
    recordDaemonObservation({
      projectRoot,
      category: 'dispatcher',
      phase: 'dispatch',
      trace_id: 'daemon-trace',
      force: true,
    });

    const commonRoot = join(projectRoot, '.specforge', 'logs', 'observability');
    const userlevelRoot = join(commonRoot, 'userlevel');
    const daemonRoot = join(commonRoot, 'daemon');

    expect(getObservationRoot(projectRoot)).toBe(userlevelRoot);
    expect(existsSync(join(userlevelRoot, 'rpc.jsonl'))).toBe(true);
    expect(existsSync(join(userlevelRoot, 'index.jsonl'))).toBe(true);
    expect(existsSync(join(daemonRoot, 'dispatcher.jsonl'))).toBe(true);
    expect(existsSync(join(daemonRoot, 'index.jsonl'))).toBe(true);
    expect(existsSync(join(commonRoot, 'index.jsonl'))).toBe(false);

    expect(readFileSync(join(userlevelRoot, 'index.jsonl'), 'utf8')).toContain(
      '"source":"userlevel"',
    );
    expect(readFileSync(join(daemonRoot, 'index.jsonl'), 'utf8')).toContain(
      '"source":"daemon"',
    );
  });

  it('keeps the userlevel category stream separate from its index stream', () => {
    const projectRoot = createProjectRoot();

    recordSfObservation({
      projectRoot,
      category: 'plugin',
      phase: 'plugin.loaded',
      trace_id: 'plugin-trace',
      force: true,
    });

    const root = getObservationRoot(projectRoot);
    expect(existsSync(join(root, 'plugin.jsonl'))).toBe(true);
    expect(readFileSync(join(root, 'plugin.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
    expect(readFileSync(join(root, 'index.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
  });
});
