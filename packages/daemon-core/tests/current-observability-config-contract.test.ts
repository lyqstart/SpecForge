import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR,
  OBSERVABILITY_CONFIG_SCHEMA_VERSION,
  parseObservabilityConfigDocument,
} from '@specforge/observability';
import { ensureProjectInit } from '../src/tools/lib/sf_project_init_core';
import {
  loadSfObservabilityConfig as loadDaemonConfig,
  shouldRecordObservationByConfig,
} from '../src/observability/observability-config';
import { PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS } from '../src/project/project-schema-descriptors';
import {
  loadSfObservabilityConfig as loadUserlevelConfig,
  shouldCaptureEvent,
  shouldCaptureEventPayload,
} from '../../../setup/userlevel-opencode/tools/lib/sf-observability-config';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const temporaryRoots: string[] = [];

async function createProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'specforge-observability-contract-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('current observability configuration contract', () => {
  it('uses one strict V6 schema and the authoritative three-tier mode', () => {
    expect(OBSERVABILITY_CONFIG_SCHEMA_VERSION).toBe('1.0');
    expect(parseObservabilityConfigDocument({ schema_version: '1.0', mode: 'minimal' })).toEqual({
      schema_version: '1.0',
      mode: 'minimal',
    });
    expect(parseObservabilityConfigDocument({ schema_version: '1.0', mode: 'standard' }).mode).toBe('standard');
    expect(parseObservabilityConfigDocument({ schema_version: '1.0', mode: 'deep' }).mode).toBe('deep');

    expect(() => parseObservabilityConfigDocument({ enabled: true, level: 'replay' })).toThrow();
    expect(() => parseObservabilityConfigDocument({ schema_version: '1.1', recording: {} })).toThrow();
    expect(() =>
      parseObservabilityConfigDocument({ schema_version: '1.0', mode: 'standard', event_blocklist: [] }),
    ).toThrow();

    expect(OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR.id).toBe('project-observability-config');
    expect(PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS).toContain(OBSERVABILITY_CONFIG_SCHEMA_DESCRIPTOR);
    expect(PROJECT_REGISTRATION_SCHEMA_DESCRIPTORS).toHaveLength(4);
  });

  it('keeps project bootstrap and both distributed templates byte-equivalent', async () => {
    const expected = `${JSON.stringify({ schema_version: '1.0', mode: 'standard' }, null, 2)}\n`;
    const rootTemplate = await readFile(
      join(repositoryRoot, 'templates', '.specforge', 'config', 'observability.json'),
      'utf8',
    );
    const userlevelTemplate = await readFile(
      join(repositoryRoot, 'setup', 'userlevel-opencode', 'templates', '.specforge', 'config', 'observability.json'),
      'utf8',
    );
    const projectRoot = await createProjectRoot();
    const result = await ensureProjectInit(projectRoot, 'observability-contract', {
      ensureHostProfile: async () => undefined,
    });
    const initialized = await readFile(
      join(projectRoot, '.specforge', 'config', 'observability.json'),
      'utf8',
    );

    expect(result.success).toBe(true);
    expect(rootTemplate).toBe(expected);
    expect(userlevelTemplate).toBe(expected);
    expect(initialized).toBe(expected);
  });

  it('makes daemon and userlevel consumers derive behavior from the same mode', async () => {
    const projectRoot = await createProjectRoot();
    const configDir = join(projectRoot, '.specforge', 'config');
    await ensureProjectInit(projectRoot, 'observability-consumers', {
      ensureHostProfile: async () => undefined,
    });

    await writeFile(
      join(configDir, 'observability.json'),
      `${JSON.stringify({ schema_version: '1.0', mode: 'deep' })}\n`,
      'utf8',
    );

    expect(loadDaemonConfig(projectRoot).mode).toBe('deep');
    expect(loadUserlevelConfig(projectRoot).mode).toBe('deep');
    expect(loadDaemonConfig(projectRoot).max_inline_payload_bytes).toBe(64 * 1024);
    expect(shouldCaptureEventPayload(loadUserlevelConfig(projectRoot), 'tool.invoked')).toBe(true);

    await writeFile(
      join(configDir, 'observability.json'),
      `${JSON.stringify({ schema_version: '1.0', mode: 'minimal' })}\n`,
      'utf8',
    );
    const daemonMinimal = loadDaemonConfig(projectRoot);
    const userlevelMinimal = loadUserlevelConfig(projectRoot);
    expect(shouldRecordObservationByConfig(daemonMinimal, 'gate', 'gate.checked')).toBe(true);
    expect(shouldRecordObservationByConfig(daemonMinimal, 'handler', 'tool.invoked')).toBe(false);
    expect(shouldCaptureEvent(userlevelMinimal, 'permission.evaluated')).toBe(true);
    expect(shouldCaptureEvent(userlevelMinimal, 'message.updated')).toBe(false);

    await writeFile(
      join(configDir, 'observability.json'),
      `${JSON.stringify({ enabled: true, level: 'replay' })}\n`,
      'utf8',
    );
    expect(loadDaemonConfig(projectRoot).mode).toBe('disabled');
    expect(loadUserlevelConfig(projectRoot).mode).toBe('disabled');
  });
});
