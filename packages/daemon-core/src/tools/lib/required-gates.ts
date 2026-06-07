/**
 * required-gates.ts — Workflow-to-gate mapping and strictness lookup
 *
 * Extracted from gate-runner-v11.ts (TASK-3).
 *
 * Standalone: no internal module dependencies (only type import from gate-runner-v11).
 */

import type { GateIdV11 } from './gate-runner-v11.js';

type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'rollback_path';

/**
 * 返回指定 workflow 路径所需的 Gate 列表。
 */
export function getRequiredGates(workflowPath: string): GateIdV11[] {
  const common: GateIdV11[] = [
    'entry_gate',
    'workflow_selection_gate',
    'schema_gate',
    'gate_summary_gate',
  ];

  switch (workflowPath as WorkflowPath) {
    case 'requirement_change_path':
      return [...common, 'required_files_gate', 'spec_consistency_gate', 'trace_gate'];
    case 'design_change_path':
      return [...common, 'required_files_gate', 'spec_consistency_gate', 'trace_gate'];
    case 'architecture_change_path':
      return [...common, 'required_files_gate', 'spec_consistency_gate', 'trace_gate'];
    case 'task_change_path':
      return [...common, 'required_files_gate', 'trace_gate'];
    case 'code_only_fast_path':
      return [...common, 'path_policy_gate', 'candidate_manifest_gate', 'verification_gate'];
    case 'spec_migration_path':
      return [...common, 'required_files_gate', 'spec_consistency_gate', 'trace_gate'];
    case 'rollback_path':
      return [...common];
    default:
      return common;
  }
}

/**
 * 返回指定 Gate 在给定 workflow 路径下的严格度。
 */
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

  if (softGates.includes(gateId)) {
    return 'soft';
  }

  return 'hard';
}
