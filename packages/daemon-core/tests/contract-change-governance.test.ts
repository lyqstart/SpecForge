import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { selectWorkflowPath } from '../src/tools/lib/impact-analysis';
import { getRequiredGates } from '../src/tools/lib/required-gates';
import { FINAL_TRANSITIONS, WORKFLOW_TYPE_TO_PATH } from '../src/tools/lib/state_machine';
import { transitionWithEvidence } from '../src/tools/lib/state-coordinator-v11';

const registryOnly = {
  requirement_changed: false,
  acceptance_criteria_changed: false,
  business_rule_changed: false,
  user_visible_behavior_changed: false,
  data_semantics_changed: false,
  design_changed: false,
  module_boundary_changed: false,
  api_contract_changed: true,
  architecture_changed: false,
  contract_registry_only: true,
  unknowns: [],
};

describe('contract_change lightweight governance', () => {
  it('selects the lightweight path only from an explicit conflict-free classification', () => {
    expect(selectWorkflowPath(registryOnly)).toBe('contract_change_path');
    expect(selectWorkflowPath({ ...registryOnly, design_changed: true })).toBe(
      'design_change_path'
    );
    expect(selectWorkflowPath({ ...registryOnly, unknowns: ['consumer impact unknown'] })).toBe(
      'requirement_change_path'
    );
  });

  it('retains the full merge/approval gates while requiring all three core governance gates', () => {
    const gates = getRequiredGates('contract_change_path', 'candidate', 'full', 'contract_change');
    expect(gates).toContain('required_files_gate');
    expect(gates).toContain('candidate_manifest_gate');
    expect(gates).toContain('path_policy_gate');
    expect(gates).toContain('schema_gate');
    expect(gates).toContain('spec_consistency_gate');
    expect(gates).toContain('contract_integrity_gate');
    expect(gates).toContain('trace_gate');
    expect(gates).not.toContain('workflow_specific_gate');
  });

  it('has a no-implementation workflow definition and registered state identity', () => {
    const repoRoot = fs.existsSync(path.join(process.cwd(), 'configs'))
      ? process.cwd()
      : path.resolve(process.cwd(), '..', '..');
    const workflow = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, 'configs', 'workflows', 'builtin', 'contract_change.json'),
        'utf-8'
      )
    );
    expect(WORKFLOW_TYPE_TO_PATH.contract_change).toBe('contract_change_path');
    expect(FINAL_TRANSITIONS.get('intake_ready')).toContain('candidate_preparing');
    expect(workflow.stateMachine.states.intake_ready.next).toBe('candidate_preparing');
    expect(workflow.stateMachine.states.post_merge_verified.next.pass).toBe('verification_running');
    expect(
      Object.keys(workflow.stateMachine.states).some(state => state.startsWith('implementation'))
    ).toBe(false);
  });

  it('does not open the intake shortcut to other workflow types', async () => {
    const workItemDir = path.join(os.tmpdir(), `sf-contract-transition-${Date.now()}`);
    await expect(
      transitionWithEvidence({
        deps: {
          projectManager: {
            getProjectStateManager: async () => ({
              transition: async () => undefined,
            }),
          },
        },
        projectRoot: os.tmpdir(),
        workItemId: 'WI-0001',
        workItemDir,
        fromState: 'intake_ready',
        toState: 'candidate_preparing',
        workflowType: 'feature_spec',
        actorRole: 'sf-orchestrator',
        evidence: 'test',
      })
    ).rejects.toThrow('reserved for workflow_type=contract_change');
  });
});
