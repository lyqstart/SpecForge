import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import type { IPathResolver } from '../../src/daemon/path-resolver';
import type { StateManager } from '../../src/state/StateManager';

type ModuleFixture = {
  module_code: string;
  content?: Record<string, unknown>;
  omit?: boolean;
};

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

describe('current project module schema boundary', () => {
  let root: string;
  let runtimeRoot: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'specforge-current-modules-'));
    runtimeRoot = await mkdtemp(join(tmpdir(), 'specforge-current-modules-runtime-'));
    const pathResolver = {
      resolveProjectRuntimeDir: () => join(runtimeRoot, 'runtime'),
      resolveDaemonJsonPath: () => join(runtimeRoot, 'daemon.json'),
    } as IPathResolver;
    manager = new ProjectManager(new EventBus(), pathResolver, {} as StateManager);
  });

  afterEach(async () => {
    manager.stop();
    await rm(root, { recursive: true, force: true });
    await rm(runtimeRoot, { recursive: true, force: true });
  });

  async function writeCurrentProject(modules: ModuleFixture[]): Promise<void> {
    const projectDir = join(root, '.specforge', 'project');
    const configDir = join(root, '.specforge', 'config');
    await mkdir(projectDir, { recursive: true });
    await mkdir(configDir, { recursive: true });
    await writeFile(join(projectDir, 'spec_manifest.json'), JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'multi-module-project',
      default_module: modules[0]?.module_code,
      modules: modules.map(({ module_code }) => ({
        module_code,
        path: `.specforge/project/modules/${module_code}`,
        module_file: `.specforge/project/modules/${module_code}/module.json`,
        requirements: `.specforge/project/modules/${module_code}/requirements.md`,
        design: `.specforge/project/modules/${module_code}/design.md`,
        trace: `.specforge/project/modules/${module_code}/trace.md`,
      })),
      project: {},
    }));
    await writeFile(join(configDir, 'project.json'), JSON.stringify({ schema_version: '1.0' }));
    await writeFile(
      join(configDir, 'observability.json'),
      JSON.stringify({ schema_version: '1.0', mode: 'standard' }),
    );
    await writeFile(join(projectDir, 'extension_registry.json'), JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      namespaces: {},
      contracts: {},
    }));

    for (const module of modules) {
      if (module.omit) continue;
      const moduleDir = join(projectDir, 'modules', module.module_code);
      await mkdir(moduleDir, { recursive: true });
      await writeFile(join(moduleDir, 'module.json'), JSON.stringify(
        module.content ?? {
          schema_version: '1.0',
          module_code: module.module_code,
          status: 'active',
        },
      ));
    }
  }

  it('registers only after validating every module declared by the manifest', async () => {
    await writeCurrentProject([{ module_code: 'CORE' }, { module_code: 'API' }]);

    const context = await manager.registerProject(root);

    expect(context.isFullyRegistered).toBe(true);
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(true);
  });

  it('blocks before runtime creation when any declared module file is missing', async () => {
    await writeCurrentProject([
      { module_code: 'CORE' },
      { module_code: 'API', omit: true },
    ]);

    await expect(manager.registerProject(root)).rejects.toThrow('project-module-API:FILE_REQUIRED');
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects a legacy module identity without rewriting its bytes', async () => {
    const legacy = JSON.stringify({ schema_version: '1.0', module_id: 'API', status: 'active' });
    await writeCurrentProject([
      { module_code: 'CORE' },
      { module_code: 'API', content: JSON.parse(legacy) as Record<string, unknown> },
    ]);
    const modulePath = join(root, '.specforge', 'project', 'modules', 'API', 'module.json');

    await expect(manager.registerProject(root)).rejects.toThrow('project-module-API:VALIDATION_FAILED');
    expect(await readFile(modulePath, 'utf8')).toBe(legacy);
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects an unversioned module document before runtime creation', async () => {
    await writeCurrentProject([
      { module_code: 'CORE' },
      { module_code: 'API', content: { module_code: 'API', status: 'active' } },
    ]);

    await expect(manager.registerProject(root)).rejects.toThrow('project-module-API:SCHEMA_ID_MISSING');
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects a module whose canonical identity disagrees with its manifest path', async () => {
    await writeCurrentProject([
      { module_code: 'CORE' },
      {
        module_code: 'API',
        content: { schema_version: '1.0', module_code: 'OTHER', status: 'active' },
      },
    ]);

    await expect(manager.registerProject(root)).rejects.toThrow('project-module-API:VALIDATION_FAILED');
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects duplicate or non-canonical module declarations before runtime creation', async () => {
    await writeCurrentProject([{ module_code: 'CORE' }, { module_code: 'CORE' }]);

    await expect(manager.registerProject(root)).rejects.toThrow('project-spec-manifest:VALIDATION_FAILED');
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects a manifest module path that does not derive from canonical module_code', async () => {
    await writeCurrentProject([{ module_code: 'CORE' }, { module_code: 'API' }]);
    const manifestPath = join(root, '.specforge', 'project', 'spec_manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      modules: Array<Record<string, unknown>>;
    };
    manifest.modules[1]!.module_file = '.specforge/project/modules/OTHER/module.json';
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(manager.registerProject(root)).rejects.toThrow('project-spec-manifest:VALIDATION_FAILED');
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });
});
