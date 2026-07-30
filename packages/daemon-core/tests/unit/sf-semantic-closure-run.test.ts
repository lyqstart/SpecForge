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
import { renderVerificationReport } from '../../src/tools/lib/sf_artifact_write_core.js';

function verificationPayload() {
  return {
    conclusion: 'pass',
    test_matrix: {
      L1_unit: 'pass',
      L2_integration: 'pass',
      L3_pbt: 'not_applicable',
      L4_e2e: 'pass',
      L5_smoke: 'pass',
      L6_regression: 'not_applicable',
      L7_performance: 'not_applicable',
      L8_security: 'not_applicable',
      L9_compatibility: 'not_applicable',
      L10_uat: 'not_applicable',
    },
    verification_commands: [
      { command: 'bun test', status: 'pass', output_summary: '1 pass, 0 fail' },
    ],
    acceptance_criteria: [{ req_id: 'REQ-1', name: 'works', status: 'pass', evidence: 'EV-1' }],
    e2e_tests: [{ name: 'lifecycle', status: 'pass', evidence: 'EV-1' }],
    side_effects: 'none',
    summary: 'verified',
    semantic_closure: {},
  };
}

async function createWorkItem(
  projectRoot: string,
  workItemId: string,
  traceDeltaMd: string
): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'candidates'), { recursive: true });
  await fs.writeFile(
    path.join(wiDir, 'work_item.json'),
    JSON.stringify({ work_item_id: workItemId, workflow_path: 'code_only_fast_path' }, null, 2) +
      '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'trace_delta.md'),
    '# Trace Delta\n\nTrace Impact: none\n\nReason: Not yet analyzed\n',
  );
  await fs.writeFile(path.join(wiDir, 'candidates', 'trace_delta.md'), traceDeltaMd);
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    renderVerificationReport(JSON.stringify(verificationPayload()))!
  );
  await fs.writeFile(path.join(wiDir, 'merge_report.md'), '# Merge\nStatus: not_applicable');
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify(
      { entries: [{ id: 'EV-1', status: 'passed', level: 'L5', type: 'behavioral_e2e' }] },
      null,
      2
    ) + '\n'
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
    const wiDir = await createWorkItem(
      tmpDir,
      workItemId,
      '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1'
    );
    const handler = getHandler('sf_v11_semantic_closure_run');
    expect(handler).toBeDefined();

    const result = await handler!({ work_item_id: workItemId }, { directory: tmpDir }, {} as any);

    expect((result as any).success).toBe(true);
    expect((result as any).source).toBe('trace_delta_chain');
    const manifest = JSON.parse(
      await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8')
    );
    expect(manifest.outcomes[0].id).toBe('OUT-1');
    expect(manifest.provenance.contract_id).toBe('semantic-closure/v1');
    expect(manifest.provenance.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'candidates/trace_delta.md' }),
      ]),
    );
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
    const manifest = JSON.parse(
      await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8')
    );
    expect(manifest.outcomes).toEqual([]);
    const report = await fs.readFile(path.join(wiDir, 'semantic_closure_report.md'), 'utf-8');
    expect(report).toContain('FAILED');
    expect(report).toContain('Preferred recovery: call sf_semantic_closure_run');
    expect(report).toContain('Knowledge Graph is not a Semantic Closure data source');
  });

  it('preserves an existing .semantic_closure.json unless force=true is supplied', async () => {
    const workItemId = 'WI-9103';
    const wiDir = await createWorkItem(
      tmpDir,
      workItemId,
      '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1'
    );
    const existing = {
      schema_version: '1.0',
      work_item_id: workItemId,
      outcomes: [],
      requirements: [],
      tasks: [],
      evidence: [],
    };
    await fs.writeFile(
      path.join(wiDir, '.semantic_closure.json'),
      JSON.stringify(existing, null, 2) + '\n'
    );
    const handler = getHandler('sf_v11_semantic_closure_run')!;

    const result = await handler({ work_item_id: workItemId }, { directory: tmpDir }, {} as any);

    expect((result as any).source).toBe('existing_semantic_closure');
    expect((result as any).success).toBe(false);
    expect((result as any).provenance_errors[0]).toContain('PROVENANCE_MISSING');
    const manifest = JSON.parse(
      await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8')
    );
    expect(manifest.outcomes).toEqual([]);
  });

  it('accepts the preferred typed semantic_closure argument without Markdown format inference', async () => {
    const workItemId = 'WI-9104';
    const wiDir = await createWorkItem(tmpDir, workItemId, '# Trace\nNo legacy chain required.');
    const semanticClosure = {
      schema_version: '1.0',
      work_item_id: workItemId,
      outcomes: [{ id: 'OUT-1', requirement_refs: ['REQ-1'], required_evidence_refs: ['EV-1'] }],
      requirements: [
        {
          id: 'REQ-1',
          type: 'MUST',
          outcome_refs: ['OUT-1'],
          design_refs: ['DD-1'],
          task_refs: ['TASK-1'],
          required_evidence_refs: ['EV-1'],
        },
      ],
      design_decisions: [{ id: 'DD-1', requirement_refs: ['REQ-1'], task_refs: ['TASK-1'] }],
      tasks: [
        {
          id: 'TASK-1',
          requirement_refs: ['REQ-1'],
          design_refs: ['DD-1'],
          evidence_refs: ['EV-1'],
        },
      ],
      evidence: [
        {
          id: 'EV-1',
          status: 'passed',
          level: 'L5',
          evidence_type: 'behavioral_e2e',
          supports: ['OUT-1', 'REQ-1', 'DD-1', 'TASK-1'],
        },
      ],
      project_integration: { status: 'not_applicable' },
    };
    await fs.writeFile(
      path.join(wiDir, 'evidence', 'evidence_manifest.json'),
      JSON.stringify(
        {
          entries: [
            {
              id: 'EV-1',
              status: 'passed',
              level: 'L5',
              type: 'behavioral_e2e',
              supports: ['OUT-1', 'REQ-1', 'DD-1', 'TASK-1'],
            },
          ],
        },
        null,
        2
      ) + '\n'
    );

    const result = await getHandler('sf_v11_semantic_closure_run')!(
      { work_item_id: workItemId, semantic_closure: semanticClosure },
      { directory: tmpDir },
      {} as any
    );

    expect((result as any).success).toBe(true);
    expect((result as any).source).toBe('tool_argument');
    expect((result as any).contract_id).toBe('semantic-closure/v1');
    const manifest = JSON.parse(
      await fs.readFile(path.join(wiDir, '.semantic_closure.json'), 'utf-8')
    );
    expect(manifest.provenance.source).toBe('tool_argument');
  });

  it('rejects an incomplete verification report before writing semantic closure artifacts', async () => {
    const workItemId = 'WI-9106';
    const wiDir = await createWorkItem(
      tmpDir,
      workItemId,
      '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1'
    );
    await fs.writeFile(
      path.join(wiDir, 'verification_report.md'),
      [
        '# Verification',
        '```json',
        JSON.stringify({
          conclusion: 'pass',
          test_results: [{ command: 'bun test', passed: true }],
          acceptance_criteria: [{ id: 'AC-1', status: 'pass', evidence_ref: 'EV-1' }],
          side_effects: 'none',
          summary: 'verified',
        }),
        '```',
      ].join('\n')
    );

    const result = await getHandler('sf_v11_semantic_closure_run')!(
      { work_item_id: workItemId },
      { directory: tmpDir },
      {} as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('VERIFICATION_INPUT_CONTRACT_INVALID');
    expect((result as any).verification_contract_id).toBe('verification-report/v1');
    expect((result as any).validation_errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('test_matrix'),
        expect.stringContaining('verification_commands'),
        expect.stringContaining('e2e_tests'),
      ])
    );
    await expect(fs.access(path.join(wiDir, '.semantic_closure.json'))).rejects.toThrow();
    await expect(fs.access(path.join(wiDir, 'semantic_closure_report.md'))).rejects.toThrow();
  });

  it('refuses to regenerate closure after verification inputs are frozen', async () => {
    const workItemId = 'WI-9105';
    await createWorkItem(tmpDir, workItemId, '# Trace\nNo chain.');
    const deps = {
      projectManager: {
        getProjectStateManager: async () => ({
          rebuildFromEventsFile: async () => ({ replayed: false }),
          getState: async () => ({ current_state: 'verification_done' }),
        }),
      },
    };

    const result = await getHandler('sf_v11_semantic_closure_run')!(
      {
        work_item_id: workItemId,
        semantic_closure: { outcomes: [] },
      },
      { directory: tmpDir },
      deps as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toBe('SEMANTIC_CLOSURE_INPUTS_FROZEN');

    const inferredResult = await getHandler('sf_v11_semantic_closure_run')!(
      { work_item_id: workItemId },
      { directory: tmpDir },
      deps as any
    );
    expect((inferredResult as any).success).toBe(false);
    expect((inferredResult as any).error).toBe('SEMANTIC_CLOSURE_INPUTS_FROZEN');
    await expect(
      fs.access(path.join(tmpDir, '.specforge', 'work-items', workItemId, '.semantic_closure.json'))
    ).rejects.toThrow();
  });
});
