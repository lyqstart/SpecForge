import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { WorkflowEngine as PublicWorkflowEngine } from '../../src/WorkflowEngine.js';
import { WorkflowEngine as EngineModuleWorkflowEngine } from '../../src/engine/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('current WorkflowEngine owner', () => {
  it('projects the same canonical engine through every package entry', () => {
    expect(EngineModuleWorkflowEngine).toBe(PublicWorkflowEngine);
  });

  it('rejects non-current Work Item metadata before permission evidence is consumed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-current-workflow-engine-owner-'));
    roots.push(root);
    const workItemDir = path.join(root, 'WI-0001');
    await fs.mkdir(path.join(workItemDir, 'candidates'), { recursive: true });
    await fs.mkdir(path.join(workItemDir, 'gates'), { recursive: true });
    await fs.writeFile(
      path.join(workItemDir, 'work_item.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-0001',
        allowed_write_files: [{ path: 'src/current.ts', operation: 'modify' }],
      }),
    );
    await fs.writeFile(path.join(workItemDir, 'candidates', 'tasks.md'), '# Tasks\n\n### TASK-WI-0001-001\n');
    await fs.writeFile(
      path.join(workItemDir, 'gates', 'code_permission_release_gate.json'),
      JSON.stringify({ status: 'passed' }),
    );

    const engine = new PublicWorkflowEngine();
    await expect(
      engine.enforceTransitionEvidencePublic('implementation_ready', workItemDir),
    ).rejects.toThrow('WORK_ITEM_METADATA_INVALID: WI-0001');
  });
});
