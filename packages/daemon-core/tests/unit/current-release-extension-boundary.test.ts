import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExtensionLoader } from '../../src/extensions/ExtensionLoader';

const pathFixture = vi.hoisted(() => ({ userRoot: '' }));

vi.mock('@specforge/types/user-level-paths', () => ({
  resolveSpecForgeUserPath: (...segments: string[]) =>
    [pathFixture.userRoot, ...segments].filter(Boolean).join('/'),
}));

const packageRoot = resolve(__dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');
const temporaryRoots: string[] = [];

function read(path: string): string {
  return readFileSync(resolve(packageRoot, path), 'utf8');
}

function readRepository(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('current release extension boundary', () => {
  afterEach(() => {
    pathFixture.userRoot = '';
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not retain the removed runtime PluginLoader branch in the Daemon', () => {
    const loader = read('src/extensions/ExtensionLoader.ts');
    const daemon = read('src/daemon/Daemon.ts');
    const index = read('src/extensions/index.ts');

    expect(loader).not.toContain("import('@specforge/plugin-loader')");
    expect(loader).not.toContain('createPluginLoader');
    expect(loader).not.toContain("case 'plugin'");
    expect(loader).not.toContain('loadPlugins()');
    expect(index).not.toContain("from '@specforge/plugin-loader'");
    expect(daemon).not.toContain('plugin: false');
  });

  it('loads only feature_spec and exposes no removed workflow routes or hardcoded definition exports', () => {
    const loader = read('src/extensions/ExtensionLoader.ts');
    const orchestrator = readRepository('setup/userlevel-opencode/agents/sf-orchestrator.md');
    const workflowRuntimeIndex = readRepository('packages/workflow-runtime/src/index.ts');
    const removedWorkflowSkills = [
      'sf-workflow-architecture-change',
      'sf-workflow-bugfix-spec',
      'sf-workflow-change-request',
      'sf-workflow-contract-change',
      'sf-workflow-design-first',
      'sf-workflow-investigation',
      'sf-workflow-ops-task',
      'sf-workflow-quick-change',
      'sf-workflow-refactor',
      'sf-workflow-spec-migration',
    ];

    expect(loader).toContain("const CURRENT_WORKFLOW_FILE = 'feature_spec.json'");
    expect(loader).not.toContain('readdir(builtinDir)');
    expect(loader).not.toContain("filter((f: string) => f.endsWith('.json'))");
    expect(orchestrator).toContain('| `feature_spec`');
    for (const skill of removedWorkflowSkills) {
      expect(orchestrator).not.toContain(skill);
    }
    expect(workflowRuntimeIndex).not.toContain('V11_WORKFLOW_DEFINITIONS');
    expect(workflowRuntimeIndex).not.toContain('createV11WorkflowEngine');
    expect(workflowRuntimeIndex).not.toContain("from './workflows/v11-definitions.js'");
  });

  it('registers exactly the current feature_spec definition at the Daemon runtime boundary', async () => {
    const registered: Array<{ id: string; schema_version: string }> = [];
    const loader = new ExtensionLoader();
    loader.setWorkflowEngine({
      registerDefinition(definition: { id: string; schema_version: string }) {
        registered.push(definition);
      },
    });

    const result = await loader.loadByType('workflow');

    expect(result.loaded).toBe(true);
    expect(result.count).toBe(1);
    expect(registered.map((definition) => definition.id)).toEqual(['feature_spec']);
    expect(registered.map((definition) => definition.schema_version)).toEqual(['2.0']);
  });

  it('fails closed when the current release artifact uses another workflow schema version', async () => {
    const userRoot = mkdtempSync(resolve(tmpdir(), 'specforge-current-workflow-schema-'));
    temporaryRoots.push(userRoot);
    pathFixture.userRoot = userRoot;
    const workflowDirectory = resolve(userRoot, 'workflows', 'builtin');
    mkdirSync(workflowDirectory, { recursive: true });
    const definition = JSON.parse(
      readRepository('configs/workflows/builtin/feature_spec.json'),
    ) as Record<string, unknown>;
    definition.schema_version = '1.0';
    writeFileSync(
      resolve(workflowDirectory, 'feature_spec.json'),
      JSON.stringify(definition),
      'utf8',
    );

    const loader = new ExtensionLoader();
    const result = await loader.loadByType('workflow');

    expect(result.loaded).toBe(false);
    expect(result.error?.message).toContain(
      'Current workflow schema mismatch: expected 2.0, received 1.0',
    );
  });
});
