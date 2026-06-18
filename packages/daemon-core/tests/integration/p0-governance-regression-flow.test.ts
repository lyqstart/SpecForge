/**
 * p0-governance-regression-flow.test.ts
 *
 * SpecForge v1.1 Post-P0 governance regression tests.
 *
 * Scope:
 * - daemon-core hard governance constraints only;
 * - no real OpenCode conversation;
 * - no model output;
 * - all filesystem state is isolated in a temporary .specforge project.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolDispatcher, type ToolDeps } from '../../src/tools/ToolDispatcher';
import '../../src/tools/index';

type WorkflowPath = 'requirement_change_path' | 'code_only_fast_path';

type FixtureOptions = {
  state?: string;
  workflowPath?: WorkflowPath;
  gateSummaryStatus?: 'passed' | 'failed' | 'passed_with_waiver_required';
};

const DEFAULT_WORKFLOW_PATH: WorkflowPath = 'requirement_change_path';

let projectRoot: string;
let dispatcher: ToolDispatcher;

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

async function readJson<T = any>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
}

async function readJsonIfExists<T = any>(filePath: string): Promise<T | null> {
  try {
    return await readJson<T>(filePath);
  } catch {
    return null;
  }
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

function wiDir(workItemId: string): string {
  return path.join(projectRoot, '.specforge', 'work-items', workItemId);
}

function runtimeStatePath(): string {
  return path.join(projectRoot, '.specforge', 'runtime', 'state.json');
}

function makeGateSummary(workItemId: string, status: string): string {
  const userDecisionLine = status === 'passed'
    ? 'All gates passed. User may approve to proceed to merge.'
    : 'Some hard gates failed. User cannot approve until issues are resolved.';

  return [
    '# Gate Summary',
    '',
    `Work Item: ${workItemId}`,
    `Overall Status: ${status}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Gate Reports',
    '',
    '### required_files_gate',
    '- Type: hard_gate',
    `- Status: ${status === 'failed' ? 'failed' : 'passed'}`,
    '- Required: true',
    '',
    '### candidate_manifest_gate',
    '- Type: hard_gate',
    `- Status: ${status === 'failed' ? 'failed' : 'passed'}`,
    '- Required: true',
    '',
    '### path_policy_gate',
    '- Type: hard_gate',
    '- Status: passed',
    '- Required: true',
    '',
    '## User Decision Required',
    '',
    userDecisionLine,
    '',
  ].join('\n');
}

async function setRuntimeState(workItemId: string, state: string, workflowPath: WorkflowPath = DEFAULT_WORKFLOW_PATH): Promise<void> {
  const now = new Date().toISOString();
  await writeJson(runtimeStatePath(), {
    schema_version: '1.0',
    work_item_id: workItemId,
    current_work_item_id: workItemId,
    current_state: state,
    status: state,
    workflow_type: workflowPath === 'code_only_fast_path' ? 'quick_change' : 'feature_spec',
    workflow_path: workflowPath,
    updated_at: now,
    workItems: [
      {
        work_item_id: workItemId,
        current_state: state,
        status: state,
        workflow_type: workflowPath === 'code_only_fast_path' ? 'quick_change' : 'feature_spec',
        workflow_path: workflowPath,
        updated_at: now,
      },
    ],
    events: [],
  });
}

async function transitionRuntimeState(workItemId: string, fromState: string, toState: string, actor: string, workflowType: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const statePath = runtimeStatePath();
  const now = new Date().toISOString();
  const runtime = (await readJsonIfExists<Record<string, any>>(statePath)) ?? {};
  runtime.work_item_id = workItemId;
  runtime.current_work_item_id = workItemId;
  runtime.current_state = toState;
  runtime.status = toState;
  runtime.workflow_type = workflowType;
  runtime.workflow_path = runtime.workflow_path ?? DEFAULT_WORKFLOW_PATH;
  runtime.updated_at = now;

  if (!Array.isArray(runtime.workItems)) runtime.workItems = [];
  const index = runtime.workItems.findIndex((item: any) => item?.work_item_id === workItemId);
  const nextItem = {
    ...(index >= 0 ? runtime.workItems[index] : {}),
    work_item_id: workItemId,
    current_state: toState,
    status: toState,
    workflow_type: workflowType,
    workflow_path: runtime.workflow_path,
    updated_at: now,
    last_transition_actor: actor,
    last_transition_evidence: metadata?.evidence,
  };
  if (index >= 0) runtime.workItems[index] = nextItem;
  else runtime.workItems.push(nextItem);

  if (!Array.isArray(runtime.events)) runtime.events = [];
  runtime.events.push({
    timestamp: now,
    work_item_id: workItemId,
    from_state: fromState,
    to_state: toState,
    actor,
    ...metadata,
  });

  await writeJson(statePath, runtime);
}

function makeDeps(): ToolDeps {
  return {
    stateManager: {},
    workflowEngine: {
      transitionFull: async (input: Record<string, unknown>) => ({ success: true, ...input }),
    },
    projectManager: {
      getProjectStateManager: async () => ({
        transition: async (
          workItemId: string,
          fromState: string,
          toState: string,
          actor: string,
          workflowType: string,
          metadata: Record<string, unknown> = {},
        ) => {
          await transitionRuntimeState(workItemId, fromState, toState, actor, workflowType, metadata);
          return { success: true };
        },
      }),
    },
    eventLogger: {},
    eventBus: {},
    permissionEngine: {},
    cas: {},
    sessionRegistry: {},
  };
}

async function invoke(tool: string, args: Record<string, unknown>, agent = 'sf-orchestrator'): Promise<any> {
  return dispatcher.dispatch({
    tool,
    args,
    context: {
      directory: projectRoot,
      agent,
      sessionID: `p0-governance-${agent}`,
    },
  });
}

async function createSpecChangingFixture(workItemId: string, options: FixtureOptions = {}): Promise<string> {
  const workflowPath = options.workflowPath ?? DEFAULT_WORKFLOW_PATH;
  const state = options.state ?? 'approval_required';
  const gateSummaryStatus = options.gateSummaryStatus ?? 'passed';
  const dir = wiDir(workItemId);
  const now = new Date().toISOString();

  await fs.mkdir(path.join(projectRoot, '.specforge', 'project'), { recursive: true });
  await writeJson(path.join(projectRoot, '.specforge', 'project', 'spec_manifest.json'), {
    schema_version: '1.0',
    project_spec_version: 'PSV-0000',
  });

  await writeJson(path.join(dir, 'work_item.json'), {
    schema_version: '1.0',
    work_item_id: workItemId,
    status: state,
    workflow_path: workflowPath,
    workflow_type: workflowPath === 'code_only_fast_path' ? 'quick_change' : 'feature_spec',
    code_change_allowed: false,
    allowed_write_files: [],
    created_at: now,
    updated_at: now,
    created_by: 'sf-orchestrator',
  });

  await writeJson(path.join(dir, 'trigger_result.json'), {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: workflowPath,
  });

  await writeText(path.join(dir, 'intake.md'), '# Intake\nAdd a governed feature.\n');
  await writeText(path.join(dir, 'change_classification.md'), '# Change Classification\nrequirement_change_path\n');
  await writeText(path.join(dir, 'impact_analysis.md'), '# Impact Analysis\nProject spec changes required.\n');
  await writeText(path.join(dir, 'tasks.md'), '# Tasks\n- [x] Implement governed feature\n\nallowed_write_files:\n- src/index.ts\n');
  await writeText(path.join(dir, 'trace_delta.md'), '# Trace Delta\nREQ-001 -> TASK-001\n');
  await writeText(path.join(dir, 'verification_report.md'), '# Verification Report\nEvidence reviewed and pass.\n');
  await writeText(path.join(dir, 'changed_files_audit.md'), '# Changed Files Audit\n\n- Status: PASSED\n');
  await writeText(path.join(dir, 'gate_summary.md'), makeGateSummary(workItemId, gateSummaryStatus));

  await writeText(path.join(dir, 'candidates', 'requirements.md'), '# Requirements\n\nREQ-001 governed feature requirement.\n');
  await writeJson(path.join(dir, 'candidate_manifest.json'), {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: workflowPath,
    entries: [
      {
        candidate_path: 'candidates/requirements.md',
        target_path: '.specforge/project/requirements_index.md',
        operation: 'replace',
        type: 'requirements',
      },
    ],
  });

  await writeJson(path.join(dir, 'evidence', 'evidence_manifest.json'), {
    schema_version: '1.0',
    work_item_id: workItemId,
    entries: [
      {
        type: 'test',
        path: 'verification_report.md',
        status: 'passed',
      },
    ],
  });

  await setRuntimeState(workItemId, state, workflowPath);
  return dir;
}

async function approveFixture(workItemId: string): Promise<any> {
  return invoke('sf_user_decision_record', {
    work_item_id: workItemId,
    workflow_path: DEFAULT_WORKFLOW_PATH,
    decision_status: 'approved',
    decision_type: 'user_approved',
    decision_scope: 'full',
    base_spec_version: 'PSV-0000',
  });
}

async function approveAndMergeFixture(workItemId: string): Promise<void> {
  await createSpecChangingFixture(workItemId, { state: 'approval_required', gateSummaryStatus: 'passed' });
  const approval = await approveFixture(workItemId);
  expect(approval.success).toBe(true);

  const merge = await invoke('sf_merge_run', { work_item_id: workItemId });
  expect(merge.success).toBe(true);
  expect(merge.status).toBe('success');

  const mergeReport = await fs.readFile(path.join(wiDir(workItemId), 'merge_report.md'), 'utf-8');
  expect(mergeReport).toMatch(/^Status:\s*success\s*$/m);
  expect(mergeReport).toMatch(/^-\s*Successful:\s*[1-9]\d*\s*$/m);
}

describe('SpecForge v1.1 Post-P0 governance regression flow', () => {
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-p0-governance-'));
    dispatcher = new ToolDispatcher(makeDeps());
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('rejects user_approved when Gate failed', async () => {
    const workItemId = 'WI-9001';
    await createSpecChangingFixture(workItemId, { state: 'gates_failed', gateSummaryStatus: 'failed' });

    const result = await approveFixture(workItemId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_DECISION_GOVERNANCE_REJECTED');
    expect(result.errors.join('\n')).toContain('approval_required');
    expect(result.errors.join('\n')).toContain('gate_summary Overall Status must be passed');
    expect(fsSync.existsSync(path.join(wiDir(workItemId), 'user_decision.json'))).toBe(false);

    const runtime = await readJson(runtimeStatePath());
    expect(runtime.current_state).toBe('gates_failed');
  });

  it('rejects user_approved while gates are still running', async () => {
    const workItemId = 'WI-9002';
    await createSpecChangingFixture(workItemId, { state: 'gates_running', gateSummaryStatus: 'passed' });

    const result = await approveFixture(workItemId);

    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_DECISION_GOVERNANCE_REJECTED');
    expect(result.errors.join('\n')).toContain('current=gates_running');
    expect(fsSync.existsSync(path.join(wiDir(workItemId), 'user_decision.json'))).toBe(false);
  });

  it('records sf-orchestrator only as recorded_by while decided_by remains user and state advances to approved', async () => {
    const workItemId = 'WI-9003';
    await createSpecChangingFixture(workItemId, { state: 'approval_required', gateSummaryStatus: 'passed' });

    const result = await approveFixture(workItemId);

    expect(result.success).toBe(true);
    expect(result.decision_status).toBe('approved');
    expect(result.decision_type).toBe('user_approved');
    expect(result.decided_by).toBe('user');
    expect(result.recorded_by).toBe('sf-orchestrator');
    expect(result.state_auto_advance?.advanced).toBe(true);

    const decision = await readJson(path.join(wiDir(workItemId), 'user_decision.json'));
    expect(decision.decided_by).toBe('user');
    expect(decision.recorded_by).toBe('sf-orchestrator');

    const runtime = await readJson(runtimeStatePath());
    expect(runtime.current_state).toBe('approved');
    expect(runtime.status).toBe('approved');

    const workItem = await readJson(path.join(wiDir(workItemId), 'work_item.json'));
    expect(workItem.status).toBe('approved');
  });

  it('auto-advances gates_running to approval_required after all required gates pass', async () => {
    const workItemId = 'WI-9004';
    await createSpecChangingFixture(workItemId, { state: 'gates_running', gateSummaryStatus: 'passed' });

    const result = await invoke('sf_gate_run', {
      work_item_id: workItemId,
      gate_ids: ['all'],
    });

    expect(result.success).toBe(true);
    expect(result.summary_status).toBe('passed');
    expect(result.state_auto_advance?.advanced).toBe(true);
    expect(result.state_auto_advance?.from_state).toBe('gates_running');
    expect(result.state_auto_advance?.to_state).toBe('approval_required');

    const runtime = await readJson(runtimeStatePath());
    expect(runtime.current_state).toBe('approval_required');
    expect(runtime.workItems[0].current_state).toBe('approval_required');

    const workItem = await readJson(path.join(wiDir(workItemId), 'work_item.json'));
    expect(workItem.status).toBe('approval_required');
  });

  it('rejects code_permission enable before successful merge for spec-changing workflows', async () => {
    const workItemId = 'WI-9005';
    await createSpecChangingFixture(workItemId, { state: 'approved', gateSummaryStatus: 'passed' });
    await writeText(path.join(wiDir(workItemId), 'merge_report.md'), '# Merge Report\n\nStatus: failed\n\n## Summary\n\n- Successful: 0\n');

    const result = await invoke('sf_code_permission', {
      work_item_id: workItemId,
      action: 'enable',
      allowed_write_files: [{ path: 'src/index.ts', operation: 'modify' }],
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).toContain('MERGE_SUCCESS_REQUIRED_BEFORE_CODE_PERMISSION');

    const workItem = await readJson(path.join(wiDir(workItemId), 'work_item.json'));
    expect(workItem.code_change_allowed).toBe(false);
    expect(workItem.allowed_write_files).toEqual([]);
  });

  it('allows code_permission enable only after successful merge for spec-changing workflows', async () => {
    const workItemId = 'WI-9006';
    await approveAndMergeFixture(workItemId);

    const result = await invoke('sf_code_permission', {
      work_item_id: workItemId,
      action: 'enable',
      allowed_write_files: [{ path: 'src/index.ts', operation: 'modify' }],
    });

    expect(result.success).toBe(true);
    expect(result.code_change_allowed).toBe(true);

    const workItem = await readJson(path.join(wiDir(workItemId), 'work_item.json'));
    expect(workItem.code_change_allowed).toBe(true);
    expect(result.allowed_count).toBe(workItem.allowed_write_files.length);

    // v1.1 code permission service intentionally expands one logical write target
    // into normalized relative/absolute paths and create/modify operations.
    // The governance invariant is not "exactly one stored rule"; it is
    // "successful merge is required before any write permission is released".
    expect(workItem.allowed_write_files).toEqual(
      expect.arrayContaining([
        { path: 'src/index.ts', operation: 'create' },
        { path: 'src/index.ts', operation: 'modify' },
      ]),
    );
    expect(
      workItem.allowed_write_files.some((entry: { path: string; operation: string }) =>
        path.isAbsolute(entry.path) &&
        entry.path.replace(/\\/g, '/').endsWith('/src/index.ts') &&
        entry.operation === 'modify',
      ),
    ).toBe(true);
  });

  it('forbids invalidating user_decision after merge success', async () => {
    const workItemId = 'WI-9007';
    await approveAndMergeFixture(workItemId);

    const before = await readJson(path.join(wiDir(workItemId), 'user_decision.json'));
    const result = await invoke('sf_user_decision_record', {
      work_item_id: workItemId,
      action: 'invalidate',
      reason: 'attempted invalidation after merge success',
    });
    const after = await readJson(path.join(wiDir(workItemId), 'user_decision.json'));

    expect(result.success).toBe(false);
    expect(result.error).toBe('USER_DECISION_INVALIDATE_FORBIDDEN_AFTER_MERGE_SUCCESS');
    expect(after.decision_status).toBe('approved');
    expect(after.decision_id).toBe(before.decision_id);
  });

  it('passes close_gate after verification evidence and revoked code permission even when pre-merge hashes changed after merge', async () => {
    const workItemId = 'WI-9008';
    await approveAndMergeFixture(workItemId);

    const enableResult = await invoke('sf_code_permission', {
      work_item_id: workItemId,
      action: 'enable',
      allowed_write_files: [{ path: 'src/index.ts', operation: 'modify' }],
    });
    expect(enableResult.success).toBe(true);

    const revokeResult = await invoke('sf_code_permission', {
      work_item_id: workItemId,
      action: 'revoke',
    });
    expect(revokeResult.success).toBe(true);

    const dir = wiDir(workItemId);
    const manifestPath = path.join(dir, 'candidate_manifest.json');
    const manifest = await readJson<Record<string, any>>(manifestPath);
    manifest.entries = manifest.entries.map((entry: Record<string, any>) => ({ ...entry, normalized: true }));
    manifest.post_merge_normalization_marker = true;
    await writeJson(manifestPath, manifest);
    await writeText(path.join(dir, 'gate_summary.md'), makeGateSummary(workItemId, 'passed') + '\nPost-merge close attempt regenerated this summary.\n');

    await setRuntimeState(workItemId, 'verification_done', DEFAULT_WORKFLOW_PATH);
    const workItemPath = path.join(dir, 'work_item.json');
    const workItem = await readJson<Record<string, any>>(workItemPath);
    workItem.status = 'verification_done';
    workItem.code_change_allowed = false;
    workItem.allowed_write_files = [];
    workItem.code_permission_revoked = true;
    await writeJson(workItemPath, workItem);

    const closeResult = await invoke('sf_close_gate', { work_item_id: workItemId });

    expect(closeResult.success).toBe(true);
    expect(closeResult.state_advanced).toBe(true);
    expect(closeResult.close_gate?.allChecksPassed).toBe(true);

    const finalRuntime = await readJson(runtimeStatePath());
    expect(finalRuntime.current_state).toBe('closed');
    expect(finalRuntime.workItems[0].current_state).toBe('closed');
    expect(finalRuntime.workItems[0].status).toBe('closed');

    const finalWorkItem = await readJson(path.join(dir, 'work_item.json'));
    expect(finalWorkItem.status).toBe('closed');
    expect(finalWorkItem.code_change_allowed).toBe(false);
    expect(finalWorkItem.allowed_write_files).toEqual([]);

    const closeGateReport = await readJson(path.join(dir, 'gates', 'close_gate.json'));
    expect(closeGateReport.status).toBe('passed');
  });
});
