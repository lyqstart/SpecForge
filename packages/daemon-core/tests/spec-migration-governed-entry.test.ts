/**
 * spec-migration-governed-entry.test.ts
 *
 * Proves the Plan B identity fix at the handler boundary: a Work Item can now be
 * legally established on `spec_migration_path` through the governed
 * `sf_state_transition` tool (workflow_type `spec_migration`), which previously
 * failed closed with UNKNOWN_WORKFLOW_PATH / WORKFLOW_TYPE_PATH_CONFLICT because
 * the state machine had no `spec_migration` identity.
 *
 * The remaining reserved paths (architecture_change_path / rollback_path) must
 * still fail closed — this change is scoped to spec_migration only.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/tools/handlers/sf-state-transition.js';
import { getHandler } from '../src/tools/ToolDispatcher.js';

let projectRoot: string;

function mockDeps() {
  const states = new Map<string, string>();
  return {
    projectManager: {
      async getProjectStateManager() {
        return {
          async rebuildFromEventsFile() {
            return { replayed: false };
          },
          async getState(workItemId: string) {
            const current = states.get(workItemId);
            return current ? { current_state: current } : null;
          },
          async transition(workItemId: string, _from: string, to: string) {
            states.set(workItemId, to);
          },
        };
      },
    },
  } as any;
}

async function workItemJson(workItemId: string): Promise<any> {
  const p = path.join(projectRoot, '.specforge', 'work-items', workItemId, 'work_item.json');
  return JSON.parse(await readFile(p, 'utf8'));
}

beforeEach(async () => {
  projectRoot = await mkdtemp(path.join(tmpdir(), 'sf-spec-migration-entry-'));
  // sf_state_transition requires .specforge/manifest.json for a create transition.
  await mkdir(path.join(projectRoot, '.specforge'), { recursive: true });
  await writeFile(
    path.join(projectRoot, '.specforge', 'manifest.json'),
    JSON.stringify({ schema_version: '6.0', project_name: 'entry-fixture' }, null, 2),
    'utf8'
  );
  await mkdir(path.join(projectRoot, '.specforge', 'project'), { recursive: true });
  await writeFile(
    path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'),
    JSON.stringify({ schema_version: '1.0', project_spec_version: 'PSV-0001', modules: [] }, null, 2),
    'utf8'
  );
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe('spec_migration governed entry via sf_state_transition', () => {
  it('creates a Work Item on spec_migration_path with workflow_type spec_migration', async () => {
    const handler = getHandler('sf_state_transition');
    expect(handler).toBeDefined();

    const result = (await handler!(
      {
        work_item_id: 'WI-0007',
        from_state: '',
        to_state: 'created',
        workflow_type: 'spec_migration',
        workflow_path: 'spec_migration_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(true);
    expect(result.workflow_type).toBe('spec_migration');
    expect(result.workflow_path).toBe('spec_migration_path');

    const wi = await workItemJson('WI-0007');
    expect(wi.workflow_type).toBe('spec_migration');
    expect(wi.workflow_path).toBe('spec_migration_path');
  });

  it('accepts spec_migration_path even when only the path is given (registered default)', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0008',
        from_state: '',
        to_state: 'created',
        workflow_path: 'spec_migration_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(true);
    expect(result.workflow_type).toBe('spec_migration');
    expect(result.workflow_path).toBe('spec_migration_path');
  });

  it('still fails closed for the reserved rollback_path without an identity', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0009',
        from_state: '',
        to_state: 'created',
        workflow_path: 'rollback_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNKNOWN_WORKFLOW_PATH');
  });

  it('rejects an incompatible workflow_type/path pair', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0010',
        from_state: '',
        to_state: 'created',
        workflow_type: 'bugfix_spec',
        workflow_path: 'spec_migration_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(false);
    expect(result.code).toBe('WORKFLOW_TYPE_PATH_CONFLICT');
  });
});

describe('architecture_change governed entry via sf_state_transition', () => {
  it('creates a Work Item on architecture_change_path with workflow_type architecture_change', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0021',
        from_state: '',
        to_state: 'created',
        workflow_type: 'architecture_change',
        workflow_path: 'architecture_change_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(true);
    expect(result.workflow_type).toBe('architecture_change');
    expect(result.workflow_path).toBe('architecture_change_path');

    const wi = await workItemJson('WI-0021');
    expect(wi.workflow_type).toBe('architecture_change');
    expect(wi.workflow_path).toBe('architecture_change_path');
  });

  it('resolves the registered default when only architecture_change_path is given (was an active deadlock)', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0022',
        from_state: '',
        to_state: 'created',
        workflow_path: 'architecture_change_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(true);
    expect(result.workflow_type).toBe('architecture_change');
    expect(result.workflow_path).toBe('architecture_change_path');
  });

  it('still fails closed for the reserved rollback_path without an identity', async () => {
    const handler = getHandler('sf_state_transition');
    const result = (await handler!(
      {
        work_item_id: 'WI-0023',
        from_state: '',
        to_state: 'created',
        workflow_path: 'rollback_path',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      mockDeps()
    )) as any;

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNKNOWN_WORKFLOW_PATH');
  });
});
