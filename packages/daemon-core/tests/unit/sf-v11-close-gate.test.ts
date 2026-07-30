/**
 * sf-v11-close-gate.test.ts — Close Gate handler integration test.
 *
 * The fixture now includes `.semantic_closure.json` because close_gate requires
 * semantic OUT -> REQ -> DD -> TASK -> EV closure before it can close.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Import handler registration (side-effect)
import '../../src/tools/handlers/sf-v11-close-gate.js';
import { getHandler } from '../../src/tools/ToolDispatcher.js';
import type { SemanticClosureManifest } from '../../src/tools/lib/semantic-closure-core.js';
import { captureSemanticClosureProvenance } from '../../src/tools/lib/semantic-closure-provenance.js';

function semanticClosure(workItemId: string): SemanticClosureManifest {
  return {
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
      { id: 'TASK-1', requirement_refs: ['REQ-1'], design_refs: ['DD-1'], evidence_refs: ['EV-1'] },
    ],
    evidence: [
      {
        id: 'EV-1',
        status: 'passed',
        level: 'L5',
        evidence_type: 'behavioral_e2e',
        supports: ['OUT-1', 'REQ-1', 'TASK-1'],
      },
    ],
    project_integration: { status: 'not_applicable' },
  };
}

type MockStateDeps = {
  projectManager: {
    getProjectStateManager: () => Promise<{
      rebuildFromEventsFile: () => Promise<void>;
      getState: () => Promise<{ current_state: string }>;
      transition: (
        workItemId: string,
        fromState: string,
        toState: string,
        actorRole: string,
        workflowType: string,
        payload: unknown
      ) => Promise<{
        source: string;
        workItemId: string;
        previousState: string;
        currentState: string;
        timestamp: string;
      }>;
    }>;
  };
  __transitions: Array<{
    fromState: string;
    toState: string;
    actorRole: string;
    workflowType: string;
  }>;
};

function createMockDeps(initialState = 'verification_done'): MockStateDeps {
  let currentState = initialState;
  const transitions: MockStateDeps['__transitions'] = [];

  return {
    __transitions: transitions,
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => {},
        getState: async () => ({ current_state: currentState }),
        transition: async (workItemId, fromState, toState, actorRole, workflowType) => {
          transitions.push({ fromState, toState, actorRole, workflowType });
          currentState = toState;
          return {
            source: 'StateManager',
            workItemId,
            previousState: fromState,
            currentState: toState,
            timestamp: new Date().toISOString(),
          };
        },
      }),
    },
  };
}

async function createMinimalWorkItem(
  projectRoot: string,
  workItemId: string,
  opts?: {
    status?: string;
    codeChangeAllowed?: boolean;
    allowedWriteFiles?: Array<{ path: string; operation: string }>;
    includeSemanticClosure?: boolean;
  }
): Promise<string> {
  const wiDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
  await fs.mkdir(wiDir, { recursive: true });
  await fs.mkdir(path.join(wiDir, 'evidence'), { recursive: true });
  await fs.mkdir(path.join(wiDir, 'gates'), { recursive: true });

  const workItem = {
    work_item_id: workItemId,
    status: opts?.status ?? 'verification_done',
    code_change_allowed: opts?.codeChangeAllowed ?? false,
    code_permission_revoked: !(opts?.codeChangeAllowed ?? false),
    allowed_write_files: opts?.allowedWriteFiles ?? [],
    workflow_path: 'code_only_fast_path',
    actual_changed_files: [{ path: 'src/main.ts', operation: 'modify' }],
    updated_at: new Date().toISOString(),
  };
  await fs.writeFile(path.join(wiDir, 'work_item.json'), JSON.stringify(workItem, null, 2) + '\n');

  await fs.writeFile(path.join(wiDir, 'intake.md'), '# Intake\nMinimal.');
  await fs.writeFile(path.join(wiDir, 'change_classification.md'), '# CC\ncode_only');
  await fs.writeFile(path.join(wiDir, 'impact_analysis.md'), '# IA\nLow impact');
  await fs.writeFile(
    path.join(wiDir, 'trigger_result.json'),
    JSON.stringify({
      work_item_id: workItemId,
      workflow_path: 'code_only_fast_path',
      triggered: true,
      classification: {
        requirement_changed: false,
        acceptance_criteria_changed: false,
        business_rule_changed: false,
        user_visible_behavior_changed: false,
        data_semantics_changed: false,
        design_changed: false,
        module_boundary_changed: false,
        api_contract_changed: false,
        architecture_changed: false,
        unknowns: [],
      },
    }) + '\n'
  );
  await fs.writeFile(path.join(wiDir, 'tasks.md'), '# Tasks\n- [x] TASK-1 Done');
  await fs.writeFile(
    path.join(wiDir, 'trace_delta.md'),
    '# Trace\nOUT-1 -> REQ-1 -> DD-1 -> TASK-1 -> EV-1'
  );
  await fs.writeFile(
    path.join(wiDir, 'candidate_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [],
      workflow_path: 'code_only_fast_path',
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'gate_summary.md'),
    '# Gate Summary\n\n- Overall Status: passed\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'verification_report.md'),
    '# Verification Report\n\nEvidence EV-1 passed.'
  );
  await fs.writeFile(
    path.join(wiDir, 'merge_report.md'),
    '# Merge Report\n\nStatus: not_applicable'
  );
  await fs.writeFile(
    path.join(wiDir, 'changed_files_audit.md'),
    '# Changed Files Audit\n\n- Status: PASSED\nAll files in scope.'
  );
  await fs.writeFile(
    path.join(wiDir, 'evidence', 'evidence_manifest.json'),
    JSON.stringify({
      work_item_id: workItemId,
      entries: [{ id: 'EV-1', type: 'behavioral_e2e', status: 'passed' }],
    }) + '\n'
  );
  await fs.writeFile(
    path.join(wiDir, 'user_decision.json'),
    JSON.stringify({
      decision_status: 'approved',
      workflow_path: 'code_only_fast_path',
      timestamp: new Date().toISOString(),
    }) + '\n'
  );

  if (opts?.includeSemanticClosure !== false) {
    const closure = semanticClosure(workItemId);
    closure.provenance = await captureSemanticClosureProvenance({
      workItemDir: wiDir,
      source: 'test_fixture',
      manifest: closure,
    });
    await fs.writeFile(
      path.join(wiDir, '.semantic_closure.json'),
      JSON.stringify(closure, null, 2) + '\n'
    );
  }

  return wiDir;
}

describe('sf_close_gate handler', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-close-gate-handler-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should be registered in the handler table', () => {
    const handler = getHandler('sf_close_gate');
    expect(handler).toBeDefined();
  });

  it('should reject when work_item_id is missing', async () => {
    const handler = getHandler('sf_close_gate')!;
    const result = await handler({}, { directory: tmpDir }, {} as any);
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('work_item_id');
  });

  it('should reject when authoritative state is not verification_done', async () => {
    const workItemId = 'wi-wrong-state';
    await createMinimalWorkItem(tmpDir, workItemId, { status: 'implementation_running' });
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps('implementation_running') as any
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('verification_done');
  });

  it('should revoke code_permission if still active before close checks', async () => {
    const workItemId = 'wi-revoke-perm';
    await createMinimalWorkItem(tmpDir, workItemId, {
      codeChangeAllowed: true,
      allowedWriteFiles: [{ path: 'src/main.ts', operation: 'modify' }],
    });
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );
    expect((result as any).code_permission_revoked).toBe(true);
    const wiPath = path.join(tmpDir, '.specforge', 'work-items', workItemId, 'work_item.json');
    const wi = JSON.parse(await fs.readFile(wiPath, 'utf-8'));
    expect(wi.code_change_allowed).toBe(false);
    expect(wi.allowed_write_files).toEqual([]);
  });

  it('should fail close when semantic closure is missing', async () => {
    const workItemId = 'wi-missing-semantic';
    await createMinimalWorkItem(tmpDir, workItemId, { includeSemanticClosure: false });
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('close_file__semantic_closure_json');
  });

  it('should write close_gate evidence on success', async () => {
    const workItemId = 'wi-close-success';
    await createMinimalWorkItem(tmpDir, workItemId);
    const handler = getHandler('sf_close_gate')!;
    const deps = createMockDeps();
    const result = await handler({ work_item_id: workItemId }, { directory: tmpDir }, deps as any);
    expect((result as any).success, JSON.stringify(result, null, 2)).toBe(true);

    const gateJsonPath = path.join(
      tmpDir,
      '.specforge',
      'work-items',
      workItemId,
      'gates',
      'close_gate.json'
    );
    const gateJson = JSON.parse(await fs.readFile(gateJsonPath, 'utf-8'));
    expect(gateJson.status).toBe('passed');
    expect(gateJson.gate_id).toBe('close_gate');
    expect(
      gateJson.checks.some((check: any) => check.check_id === 'close_semantic_closure_valid')
    ).toBe(true);
    expect(
      deps.__transitions.some(t => t.fromState === 'verification_done' && t.toState === 'closed')
    ).toBe(true);

    const closeMdPath = path.join(tmpDir, '.specforge', 'work-items', workItemId, 'close_gate.md');
    const closeMd = await fs.readFile(closeMdPath, 'utf-8');
    expect(closeMd).toContain('Close Gate Evidence');
    expect(closeMd).toContain(workItemId);
  });

  it('recomputes an existing passed changed-files audit without invalidating closure provenance', async () => {
    const workItemId = 'wi-close-preserve-audit';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);
    await fs.writeFile(
      path.join(wiDir, 'write_guard_log.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        path: 'src/main.ts',
        operation: 'modify',
        actor: 'sf-executor',
        allowed: true,
        violations: [],
        tool: 'sf_safe_bash',
      }) + '\n'
    );
    const auditPath = path.join(wiDir, 'changed_files_audit.md');
    const auditBeforeClose = await fs.readFile(auditPath, 'utf-8');

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );

    expect((result as any).success, JSON.stringify(result, null, 2)).toBe(true);
    expect((result as any).changed_files_audit?.passed).toBe(true);
    expect(await fs.readFile(auditPath, 'utf-8')).toBe(auditBeforeClose);
  });

  it('persists and blocks on a newly failing recomputed audit', async () => {
    const workItemId = 'wi-close-new-audit-failure';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);
    await fs.writeFile(
      path.join(wiDir, 'write_guard_log.jsonl'),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        path: '.specforge/project/architecture.md',
        operation: 'modify',
        actor: 'sf-executor',
        allowed: true,
        violations: [],
        tool: 'sf_safe_bash',
      }) + '\n'
    );
    const auditPath = path.join(wiDir, 'changed_files_audit.md');

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );

    expect((result as any).success).toBe(false);
    expect((result as any).changed_files_audit?.passed).toBe(false);
    expect(await fs.readFile(auditPath, 'utf-8')).toContain('- Status: FAILED');
  });

  it('blocks close when a Git-governed Work Item has a failed formal version gate', async () => {
    const workItemId = 'wi-formal-failed';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);
    await fs.writeFile(
      path.join(wiDir, 'git_context.json'),
      JSON.stringify({
        schema_version: '1.0',
        work_item_id: workItemId,
        git_enabled: true,
        branch_name: 'feature/formal-failed',
        base_branch: 'main',
        base_commit: 'deadbeef',
      }),
    );
    await fs.writeFile(
      path.join(wiDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify({ gate_id: 'formal_version_gate', status: 'failed' }),
    );

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('close_formal_version_gate');
    const closeReport = JSON.parse(
      await fs.readFile(path.join(wiDir, 'gates', 'close_gate.json'), 'utf-8'),
    );
    expect(
      closeReport.checks.find(
        (check: { check_id: string }) => check.check_id === 'close_formal_version_gate',
      )?.passed,
    ).toBe(false);
  });

  it('recovers a proven-invalid prior closure through a compensating state event', async () => {
    const workItemId = 'wi-invalid-close-recovery';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId, { status: 'closed' });
    await fs.writeFile(
      path.join(wiDir, 'gates', 'close_gate.json'),
      JSON.stringify({ gate_id: 'close_gate', status: 'passed' }),
    );
    await fs.writeFile(
      path.join(wiDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify({ gate_id: 'formal_version_gate', status: 'failed' }),
    );

    const handler = getHandler('sf_close_gate')!;
    const deps = createMockDeps('closed');
    const result = await handler(
      {
        work_item_id: workItemId,
        action: 'recover_invalid_closure',
        recovery_reason: 'Formal Version Gate failed before the prior close event.',
        confirm_invalid_closure_recovery: true,
      },
      { directory: tmpDir, agent: 'sf-orchestrator' },
      deps as any,
    );

    expect((result as any).success, JSON.stringify(result, null, 2)).toBe(true);
    expect((result as any).state_auto_advance.from_state).toBe('closed');
    expect((result as any).state_auto_advance.to_state).toBe('implementation_ready');
    expect(
      deps.__transitions.some(
        transition =>
          transition.fromState === 'closed' &&
          transition.toState === 'implementation_ready' &&
          transition.actorRole === 'close_gate',
      ),
    ).toBe(true);

    const recovery = JSON.parse(
      await fs.readFile(path.join(wiDir, 'closure_recovery.json'), 'utf-8'),
    );
    expect(recovery.status).toBe('applied');
    expect(recovery.invalidity_reasons).toContain('formal_version_gate_status=failed');
    expect(recovery.prior_evidence.close_gate_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('refuses invalid-closure recovery without explicit confirmation', async () => {
    const workItemId = 'wi-invalid-close-unconfirmed';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId, { status: 'closed' });
    await fs.writeFile(
      path.join(wiDir, 'gates', 'close_gate.json'),
      JSON.stringify({ gate_id: 'close_gate', status: 'passed' }),
    );
    await fs.writeFile(
      path.join(wiDir, 'gates', 'formal_version_gate.json'),
      JSON.stringify({ gate_id: 'formal_version_gate', status: 'failed' }),
    );

    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      {
        work_item_id: workItemId,
        action: 'recover_invalid_closure',
        recovery_reason: 'Formal Version Gate failed before the prior close event.',
      },
      { directory: tmpDir },
      createMockDeps('closed') as any,
    );

    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('CONFIRMATION_REQUIRED');
  });

  it('should fail when required evidence files are missing', async () => {
    const workItemId = 'wi-missing-evidence';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId);
    await fs.rm(path.join(wiDir, 'verification_report.md'));
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );
    expect((result as any).success).toBe(false);
    expect((result as any).error).toContain('verification_report.md not found');
    expect((result as any).code_permission_revoked).toBe(false);
  });

  it('should still write close_gate.json on failure for diagnostics', async () => {
    const workItemId = 'wi-fail-evidence';
    const wiDir = await createMinimalWorkItem(tmpDir, workItemId, {
      includeSemanticClosure: false,
    });
    const handler = getHandler('sf_close_gate')!;
    const result = await handler(
      { work_item_id: workItemId },
      { directory: tmpDir },
      createMockDeps() as any
    );
    expect((result as any).success).toBe(false);
    expect((result as any).evidence_path).toContain('close_gate.json');

    const gateJsonPath = path.join(wiDir, 'gates', 'close_gate.json');
    const gateJson = JSON.parse(await fs.readFile(gateJsonPath, 'utf-8'));
    expect(gateJson.status).toBe('failed');
  });
});
