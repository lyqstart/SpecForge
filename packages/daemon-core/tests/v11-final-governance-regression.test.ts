import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FINAL_STATES,
  FINAL_TRANSITIONS,
  WORKFLOW_PATH_DEFAULT_TYPE,
  WORKFLOW_TYPE_TO_PATH,
  assertFinalWorkflowState,
  isValidTransition,
  resolveWorkflowTypeForPath,
} from '../src/tools/lib/state_machine';

function packageRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, 'src', 'tools'))) return cwd;
  const fromRepo = path.join(cwd, 'packages', 'daemon-core');
  if (existsSync(path.join(fromRepo, 'src', 'tools'))) return fromRepo;
  throw new Error(`Cannot locate packages/daemon-core from cwd=${cwd}`);
}

const ROOT = packageRoot();

function source(relativePath: string): string {
  const filePath = path.join(ROOT, relativePath);
  expect(existsSync(filePath), `missing source file: ${relativePath}`).toBe(true);
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function expectSourceContains(relativePath: string, needles: string[]): void {
  const text = source(relativePath);
  for (const needle of needles) {
    expect(text, `${relativePath} must contain ${needle}`).toContain(needle);
  }
}

function expectSourceNotContains(relativePath: string, needles: string[]): void {
  const text = source(relativePath);
  for (const needle of needles) {
    expect(text, `${relativePath} must not contain ${needle}`).not.toContain(needle);
  }
}

describe('v1.1.3 final governance regression coverage', () => {
  describe('state authority and final state machine', () => {
    it('keeps the exact final governance state set and excludes legacy mainline states', () => {
      expect(FINAL_STATES).toEqual([
        'created',
        'intake_ready',
        'impact_analyzing',
        'impact_analyzed',
        'workflow_selected',
        'candidate_preparing',
        'candidate_prepared',
        'gates_running',
        'gates_failed',
        'approval_required',
        'approved',
        'merge_ready',
        'merging',
        'merged',
        'post_merge_verified',
        'implementation_ready',
        'implementation_running',
        'implementation_done',
        'verification_running',
        'verification_done',
        'closed',
        'blocked',
        'rejected',
        'superseded',
      ]);

      for (const legacyState of [
        'development',
        'review',
        'implementation',
        'done',
        'completed',
        'intake',
        'requirements',
        'design',
      ]) {
        expect(FINAL_STATES).not.toContain(legacyState as never);
        expect(() => assertFinalWorkflowState(legacyState)).toThrow(
          /LEGACY_OR_UNKNOWN_STATE_NOT_ALLOWED/,
        );
      }
    });

    it('preserves the complete quick_change/code_only happy path through closed', () => {
      const expectedChain = [
        'created',
        'intake_ready',
        'impact_analyzing',
        'impact_analyzed',
        'workflow_selected',
        'candidate_preparing',
        'candidate_prepared',
        'gates_running',
        'approval_required',
        'approved',
        'merge_ready',
        'merging',
        'merged',
        'post_merge_verified',
        'implementation_ready',
        'implementation_running',
        'implementation_done',
        'verification_running',
        'verification_done',
        'closed',
      ];

      for (let i = 0; i < expectedChain.length - 1; i += 1) {
        expect(
          isValidTransition(expectedChain[i], expectedChain[i + 1], 'quick_change'),
          `${expectedChain[i]} -> ${expectedChain[i + 1]} should be valid`,
        ).toBe(true);
      }

      expect(FINAL_TRANSITIONS.get('closed')).toEqual([]);
    });

    it('does not allow sf_state_transition to call workflowEngine.transitionFull', () => {
      const transition = source('src/tools/handlers/sf-state-transition.ts');
      expect(transition).not.toMatch(/workflowEngine\.transitionFull\s*\(/);
      expect(transition).toContain('workflow_engine_transition_full_used: false');
      expect(transition).toContain('state_authority: "StateManager"');
    });

    it('documents StateManager/events as authoritative and work_item.json as metadata', () => {
      expectSourceContains('src/tools/lib/state-coordinator-v11.ts', [
        'StateManager / events.jsonl is the authoritative state source',
        'runtime/state.json is a projection cache',
        'work_item.json is WI metadata and must not drive governance state',
        'MUST NOT call workflowEngine.transitionFull()',
      ]);
    });

    it('sf_doctor reports ProjectStateManager/events authority instead of legacy deps.stateManager truth', () => {
      expectSourceContains('src/tools/handlers/sf-doctor.ts', [
        'projectManager',
        'projectStateManager',
        'StateManager/events',
        'authoritative_append_only_source',
        'projection_cache',
        'metadata_not_state_source',
        'legacyStateManager',
      ]);
    });
  });

  describe('workflow_type / workflow_path final rules', () => {
    it('keeps workflow_type/path compatibility strict and default mapping narrow', () => {
      expect(WORKFLOW_TYPE_TO_PATH.quick_change).toBe('code_only_fast_path');
      expect(WORKFLOW_TYPE_TO_PATH.bugfix_spec).toBe('requirement_change_path');
      expect(WORKFLOW_PATH_DEFAULT_TYPE.code_only_fast_path).toBe('quick_change');

      expect(resolveWorkflowTypeForPath('code_only_fast_path', 'quick_change')).toBe(
        'quick_change',
      );
      expect(resolveWorkflowTypeForPath('code_only_fast_path', 'bugfix_spec')).toBeUndefined();
      expect(resolveWorkflowTypeForPath('requirement_change_path', 'bugfix_spec')).toBe(
        'bugfix_spec',
      );
      expect(resolveWorkflowTypeForPath('code_only_fast_path')).toBe('quick_change');
    });

    it('state transition handler fails closed instead of silently overriding incompatible explicit workflow_type', () => {
      expectSourceContains('src/tools/handlers/sf-state-transition.ts', [
        'WORKFLOW_TYPE_PATH_CONFLICT',
        'resolveWorkflowTypeForTransition',
        'isWorkflowTypeCompatibleWithPath',
        'Expected path for',
      ]);
    });
  });

  describe('approval boundary and artifact authority', () => {
    it('decision handler requires top-level user_response_quote and auto_approval_policy_id', () => {
      expectSourceContains('src/tools/handlers/sf-v11-decision.ts', [
        'USER_APPROVED_REQUIRES_EXPLICIT_USER_RESPONSE_QUOTE',
        'USER_APPROVAL_EVIDENCE_REQUIRED',
        'AUTO_APPROVED_REQUIRES_POLICY_ID',
        'AUTO_APPROVAL_POLICY_REQUIRED',
        'user_response_quote',
        'auto_approval_policy_id',
      ]);
    });

    it('setup wrapper exposes approval evidence fields explicitly', () => {
      const wrapperPath = path.join(
        ROOT,
        '..',
        '..',
        'setup',
        'userlevel-opencode',
        'tools',
        'sf_user_decision_record.ts',
      );
      expect(existsSync(wrapperPath), 'missing setup/userlevel wrapper').toBe(true);
      const text = readFileSync(wrapperPath, 'utf8').replace(/\r\n/g, '\n');
      expect(text).toContain('user_response_quote');
      expect(text).toContain('auto_approval_policy_id');
      expect(text).toContain('comments');
      expect(text).toContain('reason');
    });

    it('artifact validation forbids work_item.json from carrying approval or state mutation authority', () => {
      expectSourceContains('src/tools/lib/artifact-schema-validation.ts', [
        'WORK_ITEM_CANNOT_CARRY_USER_DECISION',
        'WORK_ITEM_STATUS_MUTATION_FORBIDDEN',
        'decision_status',
        'decision_type',
        'user_response_quote',
        'auto_approval_policy_id',
        'user_decision',
        'decision_id',
        'decided_by',
        'decision_scope',
        'waivers',
      ]);

      expectSourceContains('src/tools/handlers/sf-artifact-write.ts', [
        'validateArtifactJson',
        'findForbiddenWorkItemDecisionFields',
        'INVALID_ARTIFACT_JSON',
      ]);
    });
  });

  describe('merge, code permission, verification, and close gate governance', () => {
    it('merge runner owns code_only_fast_path not_applicable transition from approved to merged', () => {
      expectSourceContains('src/tools/handlers/sf-v11-merge.ts', [
        'not_applicable',
        'merge_not_applicable',
        'approved',
        'merge_ready',
        'merging',
        'merged',
        'merge_runner',
        'sf_v11_merge',
      ]);
    });

    it('code permission service advances post_merge_verified to implementation_running without code_only skip', () => {
      expectSourceContains('src/tools/handlers/sf-v11-code-permission.ts', [
        'post_merge_verified',
        'implementation_ready',
        'implementation_running',
        'code_permission_service',
      ]);
      expectSourceNotContains('src/tools/handlers/sf-v11-code-permission.ts', [
        "reason: 'code_only_fast_path'",
        'reason: "code_only_fast_path"',
      ]);
    });

    it('close gate fails fast on authoritative state mismatch before artifact checks', () => {
      const closeGate = source('src/tools/handlers/sf-v11-close-gate.ts');
      const mismatchIndex = closeGate.indexOf('AUTHORITATIVE_STATE_MISMATCH');
      expect(mismatchIndex).toBeGreaterThanOrEqual(0);
      expect(closeGate).toContain('current_state_not_verification_done');
      expect(closeGate).toContain('expected_state: "verification_done"');
      expect(closeGate).toContain('state_advanced: false');

      const verificationMissingIndex = closeGate.indexOf('verification_report.md not found');
      if (verificationMissingIndex >= 0) {
        expect(mismatchIndex).toBeLessThan(verificationMissingIndex);
      }
    });
  });

  describe('final regression report guardrails', () => {
    it('keeps the v1.1.3 validation report in docs/reports', () => {
      const reportPath = path.join(
        ROOT,
        '..',
        '..',
        'docs',
        'reports',
        'specforge-v1.1.3-daemon-state-control-plane-test-report.md',
      );
      expect(existsSync(reportPath), 'missing v1.1.3 state-control validation report').toBe(
        true,
      );
      const report = readFileSync(reportPath, 'utf8').replace(/\r\n/g, '\n');
      expect(report).toContain('S5b');
      expect(report).toContain('S6');
      expect(report).toContain('373ab4233364c47f0bc2b886bfb1a9aa02d1ac31');
    });
  });
});
