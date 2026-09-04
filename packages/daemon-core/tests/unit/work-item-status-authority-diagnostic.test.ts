import { describe, expect, it } from 'vitest';

import * as lifecycle from '../../src/tools/lib/work-item-lifecycle-v11';
import { validateWorkItemJson } from '../../src/tools/lib/artifact-schema-validation';

describe('work_item metadata status authority diagnostics', () => {
  it('does not expose a filesystem lifecycle-status mutator', () => {
    expect(lifecycle).not.toHaveProperty('updateWorkItemStatus');
  });

  it('rejects status because StateManager/events.jsonl is authoritative', () => {
    const result = validateWorkItemJson(
      JSON.stringify({
        schema_version: '1.1',
        work_item_id: 'WI-0001',
        status: 'created',
      }),
      'WI-0001',
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'WORK_ITEM_STATUS_FORBIDDEN: work_item.json is metadata only; authoritative state belongs to StateManager/events.jsonl',
    );
  });
});
