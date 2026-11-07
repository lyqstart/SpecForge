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

  it.each(['verification_running', 'verification_done'])('keeps a real-style evidence alignment work_log in its archive at %s', async currentState => {
    state = currentState;
    const target = path.join(root, '.specforge/work-items', workItemId, 'evidence/evidence_manifest.json');
    const original = JSON.stringify({ schema_version: '1.0', work_item_id: workItemId,
      entries: Array.from({ length: 22 }, (_, i) => ({ evidence_id: `EV-${i + 1}`, type: 'command_output',
        path: `evidence/source/facts-${i + 1}.txt`, description: 'Retained synthetic evidence identity',
        created_at: '2026-11-07T00:00:00.000Z', status: 'blocked' })) });
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, original);
    const runId = 'verifier-wi0001-manifest-align';
    const content = JSON.stringify({ run_id: runId, work_item_id: workItemId, agent: 'sf-verifier',
      action: 'evidence_manifest_supports_alignment', details: 'Log of already completed Evidence Manifest alignment' });
    const result = await write({ file_type: 'work_log', run_id: runId, content }) as any;
    expect(result.success, JSON.stringify(result)).toBe(true);
    expect(result.path).toBe(`.specforge/archive/agent_runs/${runId}/work_log.md`);
    expect(await fs.readFile(target, 'utf8')).toBe(original);
    expect(await fs.readFile(path.join(root, result.path), 'utf8')).toBe(content);
  });

  it.each(['trigger-result', 'candidate-manifest', 'trace-delta', 'impact-analysis', 'change-classification', 'task-plan', 'merge-report', 'evidence-manifest'])(
    'never treats a work_log topic %s as a canonical artifact selector', async topic => {
      const content = `Completed review of ${topic}; this is an execution log.`;
      const result = await write({ file_type: 'work_log', run_id: topic, content }) as any;
      expect(result.success, JSON.stringify(result)).toBe(true);
      expect(result.path).toBe(`.specforge/archive/agent_runs/${topic}/work_log.md`);
      expect(await fs.readdir(path.join(root, '.specforge/work-items', workItemId))).toEqual(['work_item.json']);
    });

  it('does not invent an empty entries array for an explicit incomplete Evidence Manifest', async () => {
    state = 'verification_running';
    const target = path.join(root, '.specforge/work-items', workItemId, 'evidence/evidence_manifest.json');
    const before = JSON.stringify({ schema_version: '1.0', work_item_id: workItemId,
      entries: [{ evidence_id: 'EV-RETAINED', type: 'command_output', path: 'evidence/source/facts.txt',
        description: 'Existing registered evidence', created_at: '2026-11-07T00:00:00.000Z' }] });
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, before);
    const result = await write({ file_type: 'evidence_manifest', content: JSON.stringify({
      schema_version: '1.0', work_item_id: workItemId, action: 'evidence_manifest_supports_alignment',
    }) }) as any;
    expect(result.success).toBe(false); expect(result.error).toBe('INVALID_ARTIFACT_JSON');
    expect(await fs.readFile(target, 'utf8')).toBe(before);
  });
});
