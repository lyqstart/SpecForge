/**
 * required-gates.ts — Workflow-to-gate mapping and phase-aware strictness lookup
 *
 * v1.1.3 / v1.14 minimal executable model:
 * - Keep existing v1.1 Gate IDs.
 * - Add phase-aware selection so candidate gates do not require post-implementation evidence.
 * - Preserve the old one-argument getRequiredGates(workflowPath) behavior via phase='all'.
 */

import type { GateIdV11 } from './gate-runner-v11.js';

export type GatePhaseV11 = 'candidate' | 'merge' | 'post_implementation' | 'close' | 'all';

type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'rollback_path';

function dedupe(items: GateIdV11[]): GateIdV11[] {
  return Array.from(new Set(items));
}

const commonCandidateGates: GateIdV11[] = [
  'entry_gate',
  'workflow_selection_gate',
  'schema_gate',
  'gate_summary_gate',
];

const specCandidateGates: GateIdV11[] = [
  'required_files_gate',
  'candidate_manifest_gate',
  'path_policy_gate',
  'spec_consistency_gate',
  'trace_gate',
];

function getCandidateGates(workflowPath: string): GateIdV11[] {
  switch (workflowPath as WorkflowPath) {
    case 'requirement_change_path':
    case 'design_change_path':
    case 'architecture_change_path':
    case 'spec_migration_path':
      return [...commonCandidateGates, ...specCandidateGates];

    case 'task_change_path':
      return [...commonCandidateGates, 'required_files_gate', 'candidate_manifest_gate', 'path_policy_gate', 'trace_gate'];

    case 'code_only_fast_path':
      // Candidate phase MUST NOT require verification_report/evidence_manifest.
      // Verification is a post-implementation concern.
      return [...commonCandidateGates, 'path_policy_gate', 'candidate_manifest_gate'];

    case 'rollback_path':
      return [...commonCandidateGates];

    default:
      return commonCandidateGates;
  }
}

function getLegacyAllGates(workflowPath: string): GateIdV11[] {
  switch (workflowPath as WorkflowPath) {
    case 'requirement_change_path':
    case 'design_change_path':
    case 'architecture_change_path':
    case 'spec_migration_path':
      return [...commonCandidateGates, ...specCandidateGates];

    case 'task_change_path':
      return [...commonCandidateGates, 'required_files_gate', 'candidate_manifest_gate', 'path_policy_gate', 'trace_gate'];

    case 'code_only_fast_path':
      return [...commonCandidateGates, 'path_policy_gate', 'candidate_manifest_gate', 'verification_gate'];

    case 'rollback_path':
      return [...commonCandidateGates];

    default:
      return commonCandidateGates;
  }
}

/** 返回指定 workflow 路径在指定阶段所需的 Gate 列表。 */
export function getRequiredGates(workflowPath: string, phase: GatePhaseV11 = 'all'): GateIdV11[] {
  switch (phase) {
    case 'candidate':
      return dedupe(getCandidateGates(workflowPath));
    case 'merge':
      return ['merge_ready_gate', 'post_merge_gate'];
    case 'post_implementation':
      return ['verification_gate'];
    case 'close':
      return ['close_gate'];
    case 'all':
    default:
      // Preserve legacy behavior for existing callers that have not adopted phase-aware gates.
      return dedupe(getLegacyAllGates(workflowPath));
  }
}

/** 返回指定 Gate 在给定 workflow 路径下的严格度。 */
export function getGateStrictness(
  gateId: GateIdV11,
  _workflowPath: string,
): 'hard' | 'soft' {
  const softGates: GateIdV11[] = [
    'spec_consistency_gate',
    'trace_gate',
    'workflow_specific_gate',
    'extension_gate',
  ];

  if (softGates.includes(gateId)) return 'soft';
  return 'hard';
}
