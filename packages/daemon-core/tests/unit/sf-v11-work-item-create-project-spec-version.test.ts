/**
 * Regression coverage for authoritative Project Spec version binding in the
 * legacy sf_v11_work_item_create production entry point.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getHandler } from '../../src/tools/ToolDispatcher';
import '../../src/tools/handlers/sf-v11-work-item-create';

async function writeAuthoritativeManifest(
  projectRoot: string,
  projectSpecVersion: string,
): Promise<void> {
  const projectDir = path.join(projectRoot, '.specforge', 'project');
  await fs.mkdir(projectDir, { recursive: true });
  await fs.writeFile(
    path.join(projectDir, 'spec_manifest.json'),
    JSON.stringify(
      {
        schema_version: '1.0',
        project_spec_version: projectSpecVersion,
        modules: [],
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

function makeDeps() {
  const transition = vi.fn().mockResolvedValue(undefined);
  const getProjectStateManager = vi.fn().mockResolvedValue({ transition });
  return {
    deps: {
      projectManager: { getProjectStateManager },
    },
    transition,
  };
}

describe('sf_v11_work_item_create - authoritative Project Spec version binding', () => {
  let projectRoot: string;
  let handler: (...args: any[]) => Promise<any>;

  beforeAll(() => {
    handler = getHandler('sf_v11_work_item_create')!;
    expect(handler).toBeDefined();
  });

  beforeEach(async () => {
    projectRoot = path.join(
      os.tmpdir(),
      `sf-v11-create-psv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('writes candidate_manifest.base_spec_version from authoritative PSV-0002', async () => {
    await writeAuthoritativeManifest(projectRoot, 'PSV-0002');
    const { deps, transition } = makeDeps();

    const result = await handler(
      {
        work_item_id: 'WI-0003',
        user_request: 'Validate authoritative Project Spec version binding.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps,
    );

    expect(result.success).toBe(true);
    expect(transition).toHaveBeenCalledTimes(1);

    const candidateManifest = JSON.parse(
      await fs.readFile(
        path.join(
          projectRoot,
          '.specforge',
          'work-items',
          'WI-0003',
          'candidate_manifest.json',
        ),
        'utf-8',
      ),
    );
    expect(candidateManifest.base_spec_version).toBe('PSV-0002');
    const workItem = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, '.specforge', 'work-items', 'WI-0003', 'work_item.json'),
        'utf-8',
      ),
    );
    expect(workItem.workflow_type).toBe('feature_spec');
  });

  it('rejects built-not-enabled workflow identities before creating a WI directory', async () => {
    await writeAuthoritativeManifest(projectRoot, 'PSV-0002');
    const { deps, transition } = makeDeps();
    const classification = {
      requirement_changed: true,
      acceptance_criteria_changed: true,
      business_rule_changed: false,
      user_visible_behavior_changed: true,
      data_semantics_changed: false,
      design_changed: false,
      module_boundary_changed: false,
      api_contract_changed: false,
      architecture_changed: false,
      data_model_changed: false,
      module_contract_changed: false,
      unknowns: [],
      workflow_type: 'bugfix_spec',
    };

    const result = await handler(
      {
        work_item_id: 'WI-0005',
        user_request: 'Must use the current workflow identity.',
        classification,
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNSUPPORTED_CURRENT_RELEASE_WORKFLOW');
    expect(transition).not.toHaveBeenCalled();
    await expect(
      fs.access(path.join(projectRoot, '.specforge', 'work-items', 'WI-0005')),
    ).rejects.toBeTruthy();
  });

  it('hard-stops before creating a WI directory when spec authority is unavailable', async () => {
    const { deps, transition } = makeDeps();

    const result = await handler(
      {
        work_item_id: 'WI-0004',
        user_request: 'This creation must fail closed.',
      },
      { directory: projectRoot, agent: 'sf-orchestrator' },
      deps,
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('PROJECT_SPEC_VERSION_UNAVAILABLE');
    expect(result.hard_stop).toBe(true);
    expect(transition).not.toHaveBeenCalled();
    await expect(
      fs.access(
        path.join(projectRoot, '.specforge', 'work-items', 'WI-0004'),
      ),
    ).rejects.toBeTruthy();
  });
});
