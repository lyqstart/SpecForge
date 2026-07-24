import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { readWorkflowFacts } from '../../src/tools/handlers/sf-v11-merge';

describe('merge workflow projection', () => {
  let root = '';

  afterEach(async () => {
    if (root) await fs.rm(root, { recursive: true, force: true });
  });

  it('preserves change_request when the candidate manifest only supplies the path', async () => {
    root = path.join(os.tmpdir(), `sf-merge-projection-${Date.now()}-${Math.random()}`);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(
      path.join(root, 'candidate_manifest.json'),
      JSON.stringify({ workflow_path: 'requirement_change_path', entries: [] })
    );
    await fs.writeFile(
      path.join(root, 'work_item.json'),
      JSON.stringify({
        workflow_type: 'change_request',
        workflow_path: 'requirement_change_path',
      })
    );

    const facts = await readWorkflowFacts(root);
    expect(facts).toMatchObject({
      workflowPath: 'requirement_change_path',
      workflowType: 'change_request',
    });
  });
});
