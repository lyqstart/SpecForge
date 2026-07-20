import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolDispatcher, type ToolDeps } from '../src/tools/ToolDispatcher';
import '../src/tools/index';
import {
  isCandidateFrozenState,
  isCandidateGovernancePath,
} from '../src/tools/lib/candidate-freeze-v11';
import { executeMerge } from '../src/tools/lib/merge-runner-v11';

let projectRoot: string;
let currentState: string;
let transitionFailure: boolean;
let dispatcher: ToolDispatcher;

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8');
}

function makeDeps(): ToolDeps {
  return {
    stateManager: {},
    workflowEngine: {},
    projectManager: {
      getProjectStateManager: async () => ({
        rebuildFromEventsFile: async () => ({ replayed: false }),
        getState: async () => ({ current_state: currentState }),
        transition: async (
          _workItemId: string,
          fromState: string,
          toState: string,
        ) => {
          if (transitionFailure) throw new Error('injected transition failure');
          if (currentState !== fromState) {
            throw new Error(`optimistic state mismatch: ${currentState} != ${fromState}`);
          }
          currentState = toState;
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

async function invoke(
  tool: string,
  args: Record<string, unknown>,
  agent = 'sf-orchestrator',
): Promise<any> {
  return dispatcher.dispatch({
    tool,
    args,
    context: { directory: projectRoot, agent, sessionID: 'candidate-approval-test' },
  });
}

describe('Candidate / approval / state governance', () => {
  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-candidate-approval-'));
    currentState = 'approved';
    transitionFailure = false;
    dispatcher = new ToolDispatcher(makeDeps());
  });

  afterEach(async () => {
    await fs.rm(projectRoot, { recursive: true, force: true });
  });

  it('uses one explicit candidate freeze policy', () => {
    for (const state of [
      'gates_running',
      'approval_required',
      'approved',
      'merge_ready',
      'merging',
    ]) {
      expect(isCandidateFrozenState(state)).toBe(true);
    }
    expect(isCandidateFrozenState('candidate_preparing')).toBe(false);
    expect(isCandidateFrozenState('gates_failed')).toBe(false);
    expect(isCandidateGovernancePath('candidates/project/requirements.md')).toBe(true);
    expect(isCandidateGovernancePath('candidate_manifest.json')).toBe(true);
    expect(isCandidateGovernancePath('gate_summary.md')).toBe(true);
  });

  it('denies controlled Candidate writes from the authoritative approved state', async () => {
    const result = await invoke('sf_artifact_write', {
      work_item_id: 'WI-9900',
      file_type: 'candidate_manifest',
      content: JSON.stringify({
        schema_version: '1.0',
        work_item_id: 'WI-9900',
        workflow_type: 'feature_spec',
        workflow_path: 'requirement_change_path',
        entries: [],
      }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('CANDIDATE_FROZEN');
    expect(result.current_state).toBe('approved');
  });

  it('atomically invalidates approval, records gate hashes, blocks, and recovers', async () => {
    const workItemId = 'WI-9901';
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(workItemDir, 'work_item.json'), {
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    });
    await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      entries: [],
    });
    await fs.mkdir(path.join(workItemDir, 'candidates'), { recursive: true });
    await fs.writeFile(path.join(workItemDir, 'candidates', 'requirements.md'), '# Candidate\n');
    await fs.mkdir(path.join(workItemDir, 'gates'), { recursive: true });
    await writeJson(path.join(workItemDir, 'gates', 'requirements_gate.json'), {
      status: 'passed',
    });
    await fs.writeFile(path.join(workItemDir, 'gate_summary.md'), 'Overall Status: passed\n');
    await writeJson(path.join(workItemDir, 'user_decision.json'), {
      schema_version: '1.0',
      decision_id: 'UD-WI-9901-1',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      candidate_manifest_path: 'candidate_manifest.json',
      manifest_hash: 'sha256:manifest',
      candidate_hash: 'sha256:candidate',
      gate_summary_path: 'gate_summary.md',
      gate_summary_hash: 'sha256:summary',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'user',
      decided_at: new Date().toISOString(),
      decision_scope: 'full',
      waivers: [],
    });

    const invalidated = await invoke('sf_user_decision_record', {
      work_item_id: workItemId,
      action: 'invalidate',
      reason: 'Candidate must be regenerated against repaired Project Spec',
    });
    expect(invalidated.success).toBe(true);
    expect(currentState).toBe('blocked');

    const decision = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'user_decision.json'), 'utf-8'),
    );
    expect(decision.decision_status).toBe('invalidated');
    expect(decision.previous_decision_status).toBe('approved');
    expect(decision.invalidation_reason).toContain('regenerated');

    const audit = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'approval_invalidation.json'), 'utf-8'),
    );
    expect(audit.gate_evidence_status).toBe('invalidated');
    expect(audit.invalidated_gate_evidence.map((entry: any) => entry.path)).toEqual([
      'gates/requirements_gate.json',
      'gate_summary.md',
    ]);

    const recovered = await invoke('sf_user_decision_record', {
      work_item_id: workItemId,
      action: 'recover_after_invalidation',
    });
    expect(recovered.success).toBe(true);
    expect(currentState).toBe('candidate_preparing');
  });

  it('rejects generic approved to blocked transition', async () => {
    const result = await invoke('sf_state_transition', {
      work_item_id: 'WI-9902',
      from_state: 'approved',
      to_state: 'blocked',
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      use_v11_state_machine: true,
    });
    expect(result.success).toBe(false);
    expect(result.code).toBe('APPROVAL_INVALIDATION_ACTION_REQUIRED');
  });

  it('restores the decision and invalidation record when state transition fails', async () => {
    const workItemId = 'WI-9904';
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    await writeJson(path.join(workItemDir, 'work_item.json'), {
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
    });
    await writeJson(path.join(workItemDir, 'candidate_manifest.json'), {
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      entries: [],
    });
    await fs.writeFile(path.join(workItemDir, 'gate_summary.md'), 'Overall Status: passed\n');
    await writeJson(path.join(workItemDir, 'user_decision.json'), {
      schema_version: '1.0',
      decision_id: 'UD-WI-9904-1',
      work_item_id: workItemId,
      workflow_path: 'requirement_change_path',
      base_spec_version: 'PSV-0001',
      candidate_manifest_path: 'candidate_manifest.json',
      manifest_hash: 'sha256:manifest',
      candidate_hash: 'sha256:candidate',
      gate_summary_path: 'gate_summary.md',
      gate_summary_hash: 'sha256:summary',
      decision_status: 'approved',
      decision_type: 'user_approved',
      decided_by: 'user',
      decided_at: new Date().toISOString(),
      decision_scope: 'full',
      waivers: [],
    });
    transitionFailure = true;

    const result = await invoke('sf_user_decision_record', {
      work_item_id: workItemId,
      action: 'invalidate',
      reason: 'exercise atomic rollback',
    });
    expect(result.success).toBe(false);
    expect(currentState).toBe('approved');
    const decision = JSON.parse(
      await fs.readFile(path.join(workItemDir, 'user_decision.json'), 'utf-8'),
    );
    expect(decision.decision_status).toBe('approved');
    await expect(
      fs.access(path.join(workItemDir, 'approval_invalidation.json')),
    ).rejects.toThrow();
  });

  it('reports all merge preflight blockers before writing Project Spec', async () => {
    const workItemId = 'WI-9903';
    const workItemDir = path.join(projectRoot, '.specforge', 'work-items', workItemId);
    const projectDir = path.join(projectRoot, '.specforge', 'project');
    await writeJson(path.join(projectDir, 'spec_manifest.json'), {
      schema_version: '1.0',
      project_spec_version: 'PSV-0001',
      modules: [],
    });
    const manifestPath = path.join(workItemDir, 'candidate_manifest.json');
    await writeJson(manifestPath, {
      schema_version: '1.0',
      work_item_id: workItemId,
      workflow_type: 'feature_spec',
      workflow_path: 'requirement_change_path',
      project_spec_precondition_sha256: 'sha256:stale',
      entries: [
        {
          type: 'requirements',
          module_id: 'NEW',
          candidate_path: 'candidates/project/modules/NEW/requirements.md',
          target_path: '.specforge/project/modules/NEW/requirements.md',
          operation: 'replace',
          inferred: false,
          normalized: true,
        },
      ],
    });

    const result = await executeMerge({
      projectRoot,
      workItemId,
      workItemDir,
      candidateManifestPath: manifestPath,
      userDecisionPath: path.join(workItemDir, 'user_decision.json'),
    });
    const errors = result.errors.join('\n');
    expect(result.success).toBe(false);
    expect(errors).toContain('PROJECT_SPEC_PRECONDITION_STALE');
    expect(errors).toContain('Only architecture_change_path or spec_migration_path');
    expect(errors).toContain('user_decision');
    expect(errors).toContain('Candidate file does not exist');
    const specManifest = JSON.parse(
      await fs.readFile(path.join(projectDir, 'spec_manifest.json'), 'utf-8'),
    );
    expect(specManifest.project_spec_version).toBe('PSV-0001');
  });
});
