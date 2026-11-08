/**
 * impact-analysis.ts — workflow selection + Trigger Result.
 */
import type { ChangeClassification } from './change-classification.js';
import { canUseCodeOnlyFastPath } from './change-classification.js';
import type { MatchResultType } from './trigger-result.js';

export type WorkflowPath =
  | 'requirement_change_path'
  | 'design_change_path'
  | 'architecture_change_path'
  | 'task_change_path'
  | 'code_only_fast_path'
  | 'spec_migration_path'
  | 'contract_change_path'
  | 'rollback_path';

export interface ImpactScope {
  affected_modules: string[];
  architecture_refs: string[];
  data_model_refs: string[];
  design_refs: string[];
  project_contract_refs: string[];
  module_contract_refs: string[];
  planned_code_paths: string[];
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))).sort();
}

export function normalizeImpactScope(value?: Partial<ImpactScope> | null): ImpactScope {
  const scope = value ?? {};
  return {
    affected_modules: strings(scope.affected_modules),
    architecture_refs: strings(scope.architecture_refs),
    data_model_refs: strings(scope.data_model_refs),
    design_refs: strings(scope.design_refs),
    project_contract_refs: strings(scope.project_contract_refs),
    module_contract_refs: strings(scope.module_contract_refs),
    planned_code_paths: strings(scope.planned_code_paths),
  };
}

export const IMPACT_SCOPE_REFERENCE_FIELDS = [
  'architecture_refs',
  'data_model_refs',
  'design_refs',
  'project_contract_refs',
  'module_contract_refs',
] as const;

export type ImpactScopeReferenceField = (typeof IMPACT_SCOPE_REFERENCE_FIELDS)[number];

export function validateImpactScopeFieldKinds(scope: ImpactScope): string[] {
  const errors: string[] = [];
  const moduleCodes = new Set(
    scope.affected_modules.map(value => String(value ?? '').trim().toUpperCase()).filter(Boolean)
  );
  for (const field of IMPACT_SCOPE_REFERENCE_FIELDS) {
    for (const value of scope[field]) {
      const normalized = String(value ?? '').trim();
      if (!normalized) continue;
      if (moduleCodes.has(normalized.toUpperCase())) {
        errors.push(
          `IMPACT_SCOPE_MODULE_CODE_USED_AS_REFERENCE: impact_scope.${field} contains Module code "${normalized}". Module codes belong only in affected_modules; *_refs require formal governance IDs.`
        );
      }
    }
  }
  return errors;
}

export function assertImpactScopeFieldKinds(scope: ImpactScope): void {
  const errors = validateImpactScopeFieldKinds(scope);
  if (errors.length > 0) {
    throw new Error(`IMPACT_SCOPE_FIELD_KIND_INVALID: ${errors.join('; ')}`);
  }
}

export function selectWorkflowPath(classification: ChangeClassification): WorkflowPath {
  const contractRegistryOnly =
    classification.contract_registry_only === true &&
    classification.api_contract_changed === true &&
    classification.requirement_changed === false &&
    classification.acceptance_criteria_changed === false &&
    classification.business_rule_changed === false &&
    classification.user_visible_behavior_changed === false &&
    classification.data_semantics_changed === false &&
    classification.design_changed === false &&
    classification.module_boundary_changed === false &&
    classification.architecture_changed === false &&
    classification.data_model_changed !== true &&
    classification.module_contract_changed !== true &&
    classification.unknowns.length === 0;
  if (contractRegistryOnly) return 'contract_change_path';

  if (classification.unknowns.length > 0) {
    if (
      classification.requirement_changed ||
      classification.acceptance_criteria_changed ||
      classification.business_rule_changed ||
      classification.unknowns.some(u => /requirement|acceptance|business/i.test(u))
    ) return 'requirement_change_path';
    if (
      classification.architecture_changed ||
      classification.module_boundary_changed ||
      classification.unknowns.some(u => /architecture|module boundary/i.test(u))
    ) return 'architecture_change_path';
    if (
      classification.design_changed ||
      classification.data_model_changed === true ||
      classification.module_contract_changed === true ||
      classification.unknowns.some(u => /design|data model|contract/i.test(u))
    ) return 'design_change_path';
    return 'requirement_change_path';
  }

  // A user/business requirement change owns the WI even when it cascades into
  // Architecture/Data/Design changes; Impact Scope decides which Candidates are required.
  if (
    classification.requirement_changed ||
    classification.acceptance_criteria_changed ||
    classification.business_rule_changed
  ) return 'requirement_change_path';

  if (classification.architecture_changed || classification.module_boundary_changed) {
    return 'architecture_change_path';
  }

  if (
    classification.design_changed ||
    classification.api_contract_changed ||
    classification.data_semantics_changed ||
    classification.data_model_changed === true ||
    classification.module_contract_changed === true
  ) return 'design_change_path';

  if (classification.user_visible_behavior_changed) return 'task_change_path';
  if (canUseCodeOnlyFastPath(classification)) return 'code_only_fast_path';
  return 'task_change_path';
}

export interface TriggerResult {
  schema_version: '1.0';
  work_item_id: string;
  workflow_path: WorkflowPath;
  classification: ChangeClassification;
  match_results: Array<{
    spec_type: string;
    spec_path: string;
    match_type: MatchResultType;
  }>;
  impact_scope: ImpactScope;
  selected_at: string;
}

export function generateTriggerResult(
  workItemId: string,
  classification: ChangeClassification,
  matchResults: TriggerResult['match_results'],
  impactScope?: Partial<ImpactScope> | null,
): TriggerResult {
  const normalizedImpactScope = normalizeImpactScope(impactScope);
  assertImpactScopeFieldKinds(normalizedImpactScope);
  return {
    schema_version: '1.0',
    work_item_id: workItemId,
    workflow_path: selectWorkflowPath(classification),
    classification,
    match_results: matchResults,
    impact_scope: normalizedImpactScope,
    selected_at: new Date().toISOString(),
  };
}
