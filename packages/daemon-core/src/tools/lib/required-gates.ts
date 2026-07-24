/**
 * required-gates.ts — Workflow-to-gate mapping and phase-aware strictness lookup
 *
 * Candidate Gate profiles are phase-aware. A Design-First Work Item may stop
 * after the design candidate without fabricating requirements/tasks/trace
 * artifacts. The same existing Gate IDs are reused; only the required profile
 * changes with candidate_phase.
 */

import type { GateIdV11 } from './gate-runner-v11.js';

export type GatePhaseV11 = 'candidate' | 'merge' | 'post_implementation' | 'close' | 'all';
export type CandidateGatePhaseV11 = 'design' | 'requirements' | 'tasks' | 'full';

type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'contract_change_path'
  | 'rollback_path';

function dedupe(items: GateIdV11[]): GateIdV11[] {
  return Array.from(new Set(items));
}

const commonCandidateGates: GateIdV11[] = ['entry_gate', 'workflow_selection_gate', 'schema_gate'];

const designCandidateGates: GateIdV11[] = [
  ...commonCandidateGates,
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'spec_consistency_gate',
  'contract_integrity_gate',
  'workflow_specific_gate',
];

const fullSpecCandidateGates: GateIdV11[] = [...designCandidateGates, 'trace_gate'];

const investigationCandidateGates: GateIdV11[] = [
  ...commonCandidateGates,
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'workflow_specific_gate',
];

const contractCandidateGates: GateIdV11[] = [
  ...commonCandidateGates,
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'spec_consistency_gate',
  'contract_integrity_gate',
];

function getCandidateGates(
  workflowPath: string,
  candidatePhase: CandidateGatePhaseV11,
  workflowType?: string
): GateIdV11[] {
  if (workflowType === 'investigation') return investigationCandidateGates;
  if (workflowType === 'contract_change' || workflowPath === 'contract_change_path') {
    return contractCandidateGates;
  }
  switch (workflowPath as WorkflowPath) {
    case 'requirement_change_path':
    case 'design_change_path':
    case 'architecture_change_path':
    case 'spec_migration_path':
      if (candidatePhase === 'design' || candidatePhase === 'requirements') {
        return designCandidateGates;
      }
      return fullSpecCandidateGates;

    case 'task_change_path':
      return [
        ...commonCandidateGates,
        'required_files_gate',
        'candidate_manifest_gate',
        'path_policy_gate',
        'contract_integrity_gate',
        'trace_gate',
        'workflow_specific_gate',
      ];

    case 'code_only_fast_path':
      return [...commonCandidateGates, 'path_policy_gate', 'candidate_manifest_gate'];

    case 'rollback_path':
      return commonCandidateGates;

    default:
      return commonCandidateGates;
  }
}

function getLegacyAllGates(workflowPath: string, workflowType?: string): GateIdV11[] {
  if (workflowType === 'investigation') {
    return [
      ...investigationCandidateGates,
      'merge_ready_gate',
      'post_merge_gate',
      'verification_gate',
      'close_gate',
    ];
  }
  if (workflowType === 'contract_change' || workflowPath === 'contract_change_path') {
    return [
      ...contractCandidateGates,
      'merge_ready_gate',
      'post_merge_gate',
      'verification_gate',
      'close_gate',
    ];
  }
  switch (workflowPath as WorkflowPath) {
    case 'requirement_change_path':
    case 'design_change_path':
    case 'architecture_change_path':
    case 'spec_migration_path':
      return [
        ...fullSpecCandidateGates,
        'merge_ready_gate',
        'post_merge_gate',
        'verification_gate',
        'close_gate',
      ];

    case 'task_change_path':
      return [
        ...getCandidateGates(workflowPath, 'full'),
        'merge_ready_gate',
        'post_merge_gate',
        'verification_gate',
        'close_gate',
      ];

    case 'code_only_fast_path':
      return [...getCandidateGates(workflowPath, 'full'), 'verification_gate', 'close_gate'];

    case 'rollback_path':
      return [...commonCandidateGates, 'close_gate'];

    default:
      return commonCandidateGates;
  }
}

/** 返回指定 workflow 路径在指定阶段所需的 Gate 列表。 */
export function getRequiredGates(
  workflowPath: string,
  phase: GatePhaseV11 = 'all',
  candidatePhase: CandidateGatePhaseV11 = 'full',
  workflowType?: string
): GateIdV11[] {
  switch (phase) {
    case 'candidate':
      return dedupe(getCandidateGates(workflowPath, candidatePhase, workflowType));
    case 'merge':
      return ['merge_ready_gate', 'post_merge_gate'];
    case 'post_implementation':
      return ['verification_gate'];
    case 'close':
      return ['close_gate'];
    case 'all':
    default:
      return dedupe(getLegacyAllGates(workflowPath, workflowType));
  }
}

/** 返回指定 Gate 在给定 workflow 路径下的严格度。 */
export function getGateStrictness(gateId: GateIdV11, _workflowPath: string): 'hard' | 'soft' {
  const softGates: GateIdV11[] = ['spec_consistency_gate', 'trace_gate'];

  return softGates.includes(gateId) ? 'soft' : 'hard';
}
