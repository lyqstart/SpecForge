import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { inspectVerificationEvidenceIntegrity } from '../../src/tools/lib/verification-evidence-integrity.js';

describe('verification evidence integrity', () => {
  let projectRoot: string;
  let workItemDir: string;
  const workItemId = 'WI-0001';

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-evidence-integrity-'));
    workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await fs.mkdir(path.join(workItemDir, 'evidence'), { recursive: true });
    await fs.mkdir(path.join(projectRoot, '.specforge', 'runtime'), { recursive: true });
    await fs.writeFile(path.join(workItemDir, 'verification_report.md'),
      '```json\n{"timestamp":"2026-10-15T08:20:00Z"}\n```\n');
    await fs.writeFile(path.join(projectRoot, '.specforge', 'runtime', 'events.jsonl'),
      JSON.stringify({ schema_version: '1.0', eventId: 'close-fixture', monotonicSeq: 1, actor: 'test', category: 'state', projectId: workItemId, action: 'state.transition', ts: Date.parse('2026-10-15T07:48:37Z'), payload: { to_state: 'closed' } }) + '\n');
  });
  afterEach(async () => { await fs.rm(projectRoot, { recursive: true, force: true }); });

  const inspect = (closed = false) => inspectVerificationEvidenceIntegrity({
    projectRoot, workItemDir, workItemId, closed, now: new Date('2026-10-15T08:30:00Z'),
  });

  it('proves self-referential manual acceptance and post-close reported time are invalid', async () => {
    await fs.writeFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
      timestamp: '2026-10-15T08:18:00Z', entries: [{ evidence_id: 'EV-101', status: 'passed',
        level: 'L5', evidence_type: 'manual_acceptance', path: `.specforge/work-items/${workItemId}/verification_report.md` }],
    }));
    const result = await inspect(true);
    expect(result.invalidity_reasons).toContain('verification_report_timestamp_after_close');
    expect(result.invalidity_reasons).toContain('evidence_manifest_timestamp_after_close');
    expect(result.invalidity_reasons).toContain('manual_acceptance_source_self_referential_or_outside:EV-101');
    expect(result.report_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('accepts independent content-bound evidence with plausible time', async () => {
    const bytes = Buffer.from('Chrome screenshot and operation log\n');
    await fs.writeFile(path.join(workItemDir, 'evidence', 'browser.txt'), bytes);
    await fs.writeFile(path.join(workItemDir, 'verification_report.md'),
      '```json\n{"timestamp":"2026-10-15T07:40:00Z"}\n```\n');
    await fs.writeFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
      timestamp: '2026-10-15T07:41:00Z', entries: [{ evidence_id: 'EV-101', status: 'passed',
        level: 'L5', evidence_type: 'manual_acceptance', path: 'evidence/browser.txt',
        sha256: createHash('sha256').update(bytes).digest('hex') }],
    }));
    expect((await inspect(true)).invalidity_reasons).toEqual([]);
    await fs.writeFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
      timestamp: '2026-10-15T07:41:00Z', entries: [{ evidence_id: 'EV-101', status: 'passed',
        level: 'L5', evidence_type: 'manual_acceptance', path: 'evidence/browser.txt',
        sha256: createHash('sha256').update(bytes).digest('hex'), hash: '0'.repeat(64) }],
    }));
    expect((await inspect(true)).invalidity_reasons).toContain('manual_acceptance_source_hash_mismatch:EV-101');
    await fs.writeFile(path.join(workItemDir, 'evidence', 'evidence_manifest.json'), JSON.stringify({
      timestamp: '2026-10-15T07:41:00Z', entries: [{ evidence_id: 'EV-101', status: 'passed',
        level: 'L5', evidence_type: 'manual_acceptance', path: 'evidence/browser.txt',
        hash: createHash('sha256').update(bytes).digest('hex') }],
    }));
    expect((await inspect(true)).invalidity_reasons).toEqual([]);
    await fs.writeFile(path.join(workItemDir, 'evidence', 'browser.txt'), 'drift');
    expect((await inspect(true)).invalidity_reasons).toContain('manual_acceptance_source_hash_mismatch:EV-101');
  });
});
