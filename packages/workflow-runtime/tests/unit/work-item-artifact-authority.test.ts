import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkflowEngine } from '../../src/WorkflowEngine.js';

const roots: string[] = [];

async function makeWorkItem(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-artifact-authority-'));
  roots.push(root);
  const wiDir = path.join(root, 'WI-0001');
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify({ allowed_write_files: ['src/index.ts'] }),
  );
  await fs.writeFile(
    path.join(wiDir, 'gates', 'code_permission_release_gate.json'),
    JSON.stringify({ status: 'passed' }),
  );
  return wiDir;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })),
  );
});

describe('Work Item artifact authority', () => {
  it('rejects a root lifecycle placeholder as implementation evidence', async () => {
    const wiDir = await makeWorkItem();
    await fs.writeFile(
      path.join(wiDir, 'tasks.md'),
      '# Tasks\n\nWork Item: WI-0001\n\n> TODO: 由 Agent 填充\n',
    );

    const engine = new WorkflowEngine();
    await expect(
      engine.enforceTransitionEvidencePublic('implementation_ready', wiDir),
    ).rejects.toThrow(/candidates\/tasks\.md/);
  });

  it('prefers the canonical Candidate even when a stale root placeholder exists', async () => {
    const wiDir = await makeWorkItem();
    await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
    await fs.writeFile(
      path.join(wiDir, 'tasks.md'),
      '# Tasks\n\nWork Item: WI-0001\n\n> TODO: 由 Agent 填充\n',
    );
    await fs.writeFile(
      path.join(wiDir, 'candidates', 'tasks.md'),
      '# Tasks\n\n### TASK-WI-0001-001\n\n- **files**: [src/index.ts]\n',
    );

    const engine = new WorkflowEngine();
    await expect(
      engine.enforceTransitionEvidencePublic('implementation_ready', wiDir),
    ).resolves.toBeUndefined();
  });

  it('keeps authored root content as a read-only legacy fallback', async () => {
    const wiDir = await makeWorkItem();
    await fs.writeFile(
      path.join(wiDir, 'tasks.md'),
      '# Tasks\n\n### TASK-WI-0001-001\n\nLegacy authored task.\n',
    );

    const engine = new WorkflowEngine();
    await expect(
      engine.enforceTransitionEvidencePublic('implementation_ready', wiDir),
    ).resolves.toBeUndefined();
  });
});
