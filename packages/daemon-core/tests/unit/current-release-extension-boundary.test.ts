import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { ExtensionLoader } from '../../src/extensions/ExtensionLoader';

const packageRoot = resolve(__dirname, '../..');
const repositoryRoot = resolve(packageRoot, '../..');

function read(path: string): string {
  return readFileSync(resolve(packageRoot, path), 'utf8');
}

function readRepository(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8');
}

describe('current release extension boundary', () => {
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
    const registered: Array<{ id: string }> = [];
    const loader = new ExtensionLoader();
    loader.setWorkflowEngine({
      registerDefinition(definition: { id: string }) {
        registered.push(definition);
      },
    });

    const result = await loader.loadByType('workflow');

    expect(result.loaded).toBe(true);
    expect(result.count).toBe(1);
    expect(registered.map((definition) => definition.id)).toEqual(['feature_spec']);
  });
});
