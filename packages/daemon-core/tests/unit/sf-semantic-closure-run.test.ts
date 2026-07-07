/**
 * sf-semantic-closure-run.test.ts — handler tests for semantic closure producer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import handler registration (side-effect)
import '../../src/tools/handlers/sf-semantic-closure-run.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';

async function createWorkItem(projectRoot: string, workItemId: string, traceDeltaMd: string): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify({ work_item_id: workItemId, workflow_path: 'code_only_fast_path' }, null, 2) + '\n',
  );
  await fs.writeFile(path.join(wiDir, 'trace_delta.md'), traceDeltaMd);
  await fs.writeFile(path.join(wiDir, 'verification_report.md'), '# Verification\nEvidence EV-1 passed.');
  await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nMerge Status: not_applicable');
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({ entries: [{ id: 'EV-1', status: 'passed', level: 'L5', type: 'behavioral_e2e' }] }, null, 2) + '\n',
  );
  return wiDir;
}

describe('sf_semantic_closure_run handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-semantic-closure-run-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('registers the internal handler and writes a passing .semantic_closure.json from explicit trace', async () => {
    const workItemId = 'WI-9101';
    const wiDir = await createWorkItem(tmpDir, workItemId, '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1');
    const handler = getHandler('sf_v11_semantic_closure_run');
    expect(handler).toBeDefined();

    const result = await handler!({ work_item_id: workItemId }, { directory: tmpDir }, {} as any);

    expect((result as any).success).toBe(true);
    expect((result as any).source).toBe('trace_delta_chain');
    const manifest = JSON.parse(await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8'));
    expect(manifest.outcomes[0].id).toBe('OUT-1');
    const report = await fs.readFile(path.join(wiDir, 'semantic_closure_report.md'), 'utf-8');
    expect(report).toContain('Semantic Closure Report');
    expect(report).toContain('PASSED');
  });

  it('writes a failing diagnostic manifest instead of guessing when explicit trace is missing', async () => {
    const workItemId = 'WI-9102';
    const wiDir = await createWorkItem(tmpDir, workItemId, '# Trace\nOnly prose, no semantic ids.');
    const handler = getHandler('sf_v11_semantic_closure_run')!;

    const result = await handler({ work_item_id: workItemId }, { directory: tmpDir }, {} as any);

    expect((result as any).success).toBe(false);
    expect((result as any).source).toBe('insufficient_artifacts');
    const manifest = JSON.parse(await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8'));
    expect(manifest.outcomes).toEqual([]);
    const report = await fs.readFile(path.join(wiDir, 'semantic_closure_report.md'), 'utf-8');
    expect(report).toContain('FAILED');
    expect(report).toContain('No curated semantic_closure JSON block');
  });

  it('preserves an existing .semantic_closure.json unless force=true is supplied', async () => {
    const workItemId = 'WI-9103';
    const wiDir = await createWorkItem(tmpDir, workItemId, '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1');
    const existing = { schema_version: '1.0', work_item_id: workItemId, outcomes: [], requirements: [], tasks: [], evidence: [] };
    await fs.writeFile(path.join(wiDir, '.semantic_closure.json'), JSON.stringify(existing, null, 2) + '\n');
    const handler = getHandler('sf_v11_semantic_closure_run')!;

    const result = await handler({ work_item_id: workItemId }, { directory: tmpDir }, {} as any);

    expect((result as any).source).toBe('existing_semantic_closure');
    const manifest = JSON.parse(await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8'));
    expect(manifest.outcomes).toEqual([]);
  });
});
