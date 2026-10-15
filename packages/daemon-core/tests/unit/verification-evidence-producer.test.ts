import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import '../../src/tools/handlers/sf-artifact-write.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

describe('controlled verification evidence producer', () => {
  let root: string;
  const workItemId = 'WI-9001';
  let state = 'implementation_ready';
  const deps = {
    projectManager: { getProjectStateManager: async () => ({ getState: async () => ({ current_state: state }) }) },
  };

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-evidence-producer-'));
    state = 'implementation_ready';
    const wi = path.join(root, '.specforge', 'work-items', workItemId);
    await fs.mkdir(wi, { recursive: true });
    await fs.writeFile(path.join(wi, 'work_item.json'), JSON.stringify({
      schema_version: '1.1', work_item_id: workItemId, workflow_path: 'feature_spec_path',
      workflow_type: 'feature_spec', code_change_allowed: false, code_permission_revoked: true,
    }));
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const write = (overrides: Record<string, unknown> = {}, agent = 'sf-verifier') =>
    getHandler('sf_artifact_write')!({ work_item_id: workItemId,
      file_type: 'verification_evidence', artifact_name: 'chrome-M1.jsonl',
      content_encoding: 'utf8', content: '{"observed":"board visible"}\n', ...overrides,
    }, { directory: root, agent }, deps as any);

  it('records immutable independent bytes with Runtime hash and time', async () => {
    const result = await write() as any;
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.path).toBe(`.specforge/work-items/${workItemId}/evidence/source/chrome-M1.jsonl`);
    expect(result.sha256).toBe(createHash('sha256').update('{"observed":"board visible"}\n').digest('hex'));
    expect(Date.parse(result.recorded_at)).toBeLessThanOrEqual(Date.now());
    expect((await write() as any).error).toBe('VERIFICATION_EVIDENCE_ALREADY_EXISTS');
  });

  it('rejects wrong owner, traversal, and frozen evidence without writing', async () => {
    expect((await write({}, 'sf-executor') as any).success).toBe(false);
    expect((await write({ artifact_name: '../escape.txt' }) as any).error).toBe('VERIFICATION_EVIDENCE_NAME_INVALID');
    state = 'closed';
    expect((await write() as any).error).toBe('VERIFICATION_EVIDENCE_STATE_FROZEN');
  });
});
