import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ProjectManager } from '../../src/project/ProjectManager';
import { EventBus } from '../../src/event-bus/EventBus';
import type { IPathResolver } from '../../src/daemon/path-resolver';
import type { StateManager } from '../../src/state/StateManager';

async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(() => true).catch(() => false);
}

const CORE_MODULE_ENTRY = {
  module_code: 'CORE',
  path: '.specforge/project/modules/CORE',
  module_file: '.specforge/project/modules/CORE/module.json',
  requirements: '.specforge/project/modules/CORE/requirements.md',
  design: '.specforge/project/modules/CORE/design.md',
  trace: '.specforge/project/modules/CORE/trace.md',
};

describe('current project layout boundary', () => {
  let root: string;
  let runtimeRoot: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'specforge-current-project-'));
    runtimeRoot = await mkdtemp(join(tmpdir(), 'specforge-current-runtime-'));
    const pathResolver = {
      resolveProjectRuntimeDir: () => join(runtimeRoot, 'runtime'),
      resolveDaemonJsonPath: () => join(runtimeRoot, 'daemon.json'),
    } as IPathResolver;
    manager = new ProjectManager(
      new EventBus(),
      pathResolver,
      {} as StateManager,
    );
  });

  afterEach(async () => {
    manager.stop();
    await rm(root, { recursive: true, force: true });
    await rm(runtimeRoot, { recursive: true, force: true });
  });

  it('registers only from the authoritative current Project Spec manifest', async () => {
    const currentManifest = join(root, '.specforge', 'project', 'spec_manifest.json');
    await mkdir(join(root, '.specforge', 'project'), { recursive: true });
    await mkdir(join(root, '.specforge', 'config'), { recursive: true });
    await writeFile(currentManifest, JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'current-project',
      default_module: 'CORE',
      modules: [CORE_MODULE_ENTRY],
      project: {},
    }));
    await mkdir(join(root, '.specforge', 'project', 'modules', 'CORE'), { recursive: true });
    await writeFile(
      join(root, '.specforge', 'project', 'modules', 'CORE', 'module.json'),
      JSON.stringify({ schema_version: '1.0', module_code: 'CORE', status: 'active' }),
    );
    await writeFile(
      join(root, '.specforge', 'config', 'project.json'),
      JSON.stringify({ schema_version: '1.0' }),
    );
    await writeFile(
      join(root, '.specforge', 'config', 'observability.json'),
      JSON.stringify({ schema_version: '1.0', mode: 'standard' }),
    );
    await writeFile(
      join(root, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        namespaces: {},
        contracts: {},
      }),
    );

    const context = await manager.registerProject(root);

    expect(context.isFullyRegistered).toBe(true);
    expect(await exists(join(root, '.specforge', 'manifest.json'))).toBe(false);
  });

  it('fails before runtime creation when authoritative project config is missing', async () => {
    const currentManifest = join(root, '.specforge', 'project', 'spec_manifest.json');
    await mkdir(join(root, '.specforge', 'project'), { recursive: true });
    await writeFile(currentManifest, JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'missing-config-project',
      default_module: 'CORE',
      modules: [CORE_MODULE_ENTRY],
      project: {},
    }));
    await mkdir(join(root, '.specforge', 'config'), { recursive: true });
    await writeFile(
      join(root, '.specforge', 'config', 'observability.json'),
      JSON.stringify({ schema_version: '1.0', mode: 'standard' }),
    );

    await expect(manager.registerProject(root)).rejects.toThrow(
      'PROJECT_SCHEMA_PRECHECK_BLOCKED',
    );
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('fails before runtime creation when the authoritative Project Registry is missing', async () => {
    const currentManifest = join(root, '.specforge', 'project', 'spec_manifest.json');
    await mkdir(join(root, '.specforge', 'project'), { recursive: true });
    await mkdir(join(root, '.specforge', 'config'), { recursive: true });
    await writeFile(currentManifest, JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'missing-registry-project',
      default_module: 'CORE',
      modules: [CORE_MODULE_ENTRY],
      project: {},
    }));
    await writeFile(
      join(root, '.specforge', 'config', 'project.json'),
      JSON.stringify({ schema_version: '1.0' }),
    );
    await writeFile(
      join(root, '.specforge', 'config', 'observability.json'),
      JSON.stringify({ schema_version: '1.0', mode: 'standard' }),
    );

    await expect(manager.registerProject(root)).rejects.toThrow(
      'PROJECT_SCHEMA_PRECHECK_BLOCKED',
    );
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('fails before runtime creation and preserves an invalid observability policy', async () => {
    await mkdir(join(root, '.specforge', 'project'), { recursive: true });
    await mkdir(join(root, '.specforge', 'config'), { recursive: true });
    await writeFile(join(root, '.specforge', 'project', 'spec_manifest.json'), JSON.stringify({
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      project_name: 'invalid-observability-project',
      default_module: 'CORE',
      modules: [CORE_MODULE_ENTRY],
      project: {},
    }));
    await writeFile(
      join(root, '.specforge', 'config', 'project.json'),
      JSON.stringify({ schema_version: '1.0' }),
    );
    await writeFile(
      join(root, '.specforge', 'project', 'extension_registry.json'),
      JSON.stringify({
        schema_version: '1.0',
        project_spec_version: 'PSV-0001',
        namespaces: {},
        contracts: {},
      }),
    );
    const policyPath = join(root, '.specforge', 'config', 'observability.json');
    const invalidBytes = JSON.stringify({ enabled: true, level: 'replay' });
    await writeFile(policyPath, invalidBytes);

    await expect(manager.registerProject(root)).rejects.toThrow(
      'project-observability-config',
    );
    expect(await readFile(policyPath, 'utf8')).toBe(invalidBytes);
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('rejects an old root manifest without writing current project state', async () => {
    const oldManifest = join(root, '.specforge', 'manifest.json');
    await mkdir(join(root, '.specforge'), { recursive: true });
    await writeFile(oldManifest, JSON.stringify({ schema_version: '6.0' }));
    const originalBytes = await readFile(oldManifest, 'utf8');

    await expect(manager.registerProject(root)).rejects.toThrow('UNSUPPORTED_PROJECT_LAYOUT');

    expect(await readFile(oldManifest, 'utf8')).toBe(originalBytes);
    expect(await exists(join(root, '.specforge', 'project', 'spec_manifest.json'))).toBe(false);
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('does not auto-repair an incomplete current directory', async () => {
    await mkdir(join(root, '.specforge'), { recursive: true });

    await expect(manager.registerProject(root)).rejects.toThrow('PROJECT_NOT_INITIALIZED');

    expect(await exists(join(root, '.specforge', 'manifest.json'))).toBe(false);
    expect(await exists(join(runtimeRoot, 'runtime'))).toBe(false);
  });

  it('keeps init, transition, and Doctor on the current project layout only', async () => {
    const repositoryRoot = join(process.cwd(), '..', '..');
    const initSource = await readFile(
      join(repositoryRoot, 'packages/daemon-core/src/tools/lib/sf_project_init_core.ts'),
      'utf8',
    );
    const transitionSource = await readFile(
      join(repositoryRoot, 'packages/daemon-core/src/tools/handlers/sf-state-transition.ts'),
      'utf8',
    );
    const doctorSources = await Promise.all([
      readFile(
        join(repositoryRoot, 'packages/daemon-core/src/tools/lib/sf_doctor_core.ts'),
        'utf8',
      ),
      readFile(
        join(repositoryRoot, 'setup/userlevel-opencode/tools/lib/sf_doctor_core.ts'),
        'utf8',
      ),
    ]);

    expect(initSource).not.toContain('ensureRootManifest');
    expect(initSource).not.toContain("'manifest.json': (name, now)");
    expect(transitionSource).toMatch(
      /SPEC_DIR_NAME,\s*"project",\s*"spec_manifest\.json"/,
    );
    expect(transitionSource).toContain('UNSUPPORTED_PROJECT_LAYOUT');
    for (const doctorSource of doctorSources) {
      expect(doctorSource).not.toContain('assertCompatibility');
      expect(doctorSource).not.toContain('CompatibilityResult');
      expect(doctorSource).not.toContain('install_mode');
    }
  });

  it('does not expose the unused ProjectSpecStore as a second Project Registry owner', async () => {
    const repositoryRoot = join(process.cwd(), '..', '..');
    const daemonIndex = await readFile(
      join(repositoryRoot, 'packages/daemon-core/src/index.ts'),
      'utf8',
    );

    expect(daemonIndex).not.toContain('ProjectSpecStore');
    expect(await exists(
      join(repositoryRoot, 'packages/daemon-core/src/project/ProjectSpecStore.ts'),
    )).toBe(false);
    expect(await exists(
      join(repositoryRoot, 'scripts/run-v12-project-spec-store-slice.ps1'),
    )).toBe(false);
  });
});
