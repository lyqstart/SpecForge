import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { updateWorkItemStatus } from '../../src/tools/lib/work-item-lifecycle-v11';

describe('work_item metadata status authority diagnostics', () => {
  it('rejects critical metadata updates with the current StateManager authority path', async () => {
    const workItemDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'sf-status-authority-diagnostic-'),
    );

    try {
      await fs.writeFile(
        path.join(workItemDir, 'work_item.json'),
        JSON.stringify(
          {
            work_item_id: 'WI-0001',
            status: 'created',
          },
          null,
          2,
        ) + '\n',
        'utf-8',
      );

      let message = '';
      try {
        await updateWorkItemStatus(workItemDir, 'closed');
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toContain('sf_state_transition');
      expect(message).toContain('StateManager.transition()');
      expect(message).not.toContain('WorkflowEngine.transitionFull()');

      const workItem = JSON.parse(
        await fs.readFile(
          path.join(workItemDir, 'work_item.json'),
          'utf-8',
        ),
      );
      expect(workItem.status).toBe('created');
    } finally {
      await fs.rm(workItemDir, { recursive: true, force: true });
    }
  });
});
