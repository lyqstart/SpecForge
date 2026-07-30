/**
 * sf_project_init_core.test.ts
 *
 * Regression coverage for bootstrap data-loss defects: ensureProjectInit is
 * called on every project register/sync (e.g. on OpenCode start via
 * HTTPServer). It must create missing system files but preserve files whose
 * existing content is owned by another governance component.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { PersonalPathResolver } from '../../daemon/path-resolver';
import { ProjectManager } from '../../project/ProjectManager';
import { EventBus } from '../../event-bus/EventBus';
import type { StateManager } from '../../state/StateManager';

// Stub host-profile so init stays hermetic and fast (no host scan, no ~/.specforge write).
vi.mock('@specforge/host-profile', () => ({
  scanHostProfile: vi.fn(async () => ({})),
  loadHostProfile: vi.fn(async () => null),
  getHostProfilePath: () => path.join(os.tmpdir(), 'sf-test-host-profile-DOES-NOT-EXIST.json'),
  PROFILE_TTL_MS: 3_600_000,
  SCANNER_VERSION: 'test',
}));

import { ensureProjectInit } from './sf_project_init_core';

describe('ensureProjectInit — extension_registry.json preservation', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-init-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const registryPath = () =>
    path.join(tmp, '.specforge', 'project', 'extension_registry.json');

  it('creates extension_registry.json with an empty contracts block when missing', async () => {
    await ensureProjectInit(tmp, 'regression-project');
    const data = JSON.parse(await fs.readFile(registryPath(), 'utf-8'));
    expect(data.contracts).toBeDefined();
    expect(data.contracts.shared_enums).toEqual([]);
  });

  it('does NOT overwrite a non-empty extension_registry.json on re-init (registered contracts survive)', async () => {
    // First init creates the scaffold.
    await ensureProjectInit(tmp, 'regression-project');

    // Simulate a governed Merge Runner landing a contract into the truth source.
    const merged = JSON.parse(await fs.readFile(registryPath(), 'utf-8'));
    merged.updated_by_work_item = 'WI-0001';
    merged.updated_at = new Date().toISOString();
    merged.contracts.shared_enums.push({
      id: 'GpsStatus',
      owner_module: 'CORE',
      values: ['success', 'denied', 'unavailable'],
      description: 'GPS/location capture result status shared across modules',
    });
    await fs.writeFile(registryPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8');

    // Re-init — mirrors what happens on every project register / OpenCode start.
    await ensureProjectInit(tmp, 'regression-project');

    const after = JSON.parse(await fs.readFile(registryPath(), 'utf-8'));
    expect(after.contracts.shared_enums).toHaveLength(1);
    expect(after.contracts.shared_enums[0].id).toBe('GpsStatus');
    expect(after.updated_by_work_item).toBe('WI-0001');
  });

  it('also preserves registered namespaces on re-init', async () => {
    await ensureProjectInit(tmp, 'regression-project');

    const merged = JSON.parse(await fs.readFile(registryPath(), 'utf-8'));
    merged.namespaces.requirement_types.push('REQ_CUSTOM');
    await fs.writeFile(registryPath(), JSON.stringify(merged, null, 2) + '\n', 'utf-8');

    await ensureProjectInit(tmp, 'regression-project');

    const after = JSON.parse(await fs.readFile(registryPath(), 'utf-8'));
    expect(after.namespaces.requirement_types).toContain('REQ_CUSTOM');
  });
});

describe('ensureProjectInit — .gitignore ownership', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-init-gitignore-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const gitignorePath = () => path.join(tmp, '.specforge', '.gitignore');

  it('creates the bootstrap .gitignore when missing', async () => {
    await ensureProjectInit(tmp, 'regression-project');

    expect(await fs.readFile(gitignorePath(), 'utf-8')).toBe(
      'runtime/\nlogs/\nsessions/\narchive/\ncas/\n'
    );
  });

  it('does not overwrite the ProjectManager-owned managed block on re-init', async () => {
    await ensureProjectInit(tmp, 'regression-project');
    const managed =
      'runtime/\nlogs/\nsessions/\narchive/\ncas/\n\n' +
      '# SpecForge managed (BEGIN)\n' +
      'runtime/\n' +
      '# SpecForge managed (END)\n';
    await fs.writeFile(gitignorePath(), managed, 'utf-8');

    await ensureProjectInit(tmp, 'regression-project');

    expect(await fs.readFile(gitignorePath(), 'utf-8')).toBe(managed);
  });

  it('preserves the managed block across the real init-register-reinit call chain', async () => {
    await ensureProjectInit(tmp, 'regression-project');

    const eventBus = new EventBus();
    const projectManager = new ProjectManager(
      eventBus,
      new PersonalPathResolver(),
      undefined as unknown as StateManager
    );
    try {
      await projectManager.registerProject(tmp);

      let registered = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        registered = await fs.readFile(gitignorePath(), 'utf-8');
        if (registered.includes('# SpecForge managed (END)')) break;
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(registered).toContain('# SpecForge managed (BEGIN)');
      expect(registered).toContain('# SpecForge managed (END)');

      await ensureProjectInit(tmp, 'regression-project');

      expect(await fs.readFile(gitignorePath(), 'utf-8')).toBe(registered);
    } finally {
      projectManager.stop();
      eventBus.stop();
    }
  });
});
