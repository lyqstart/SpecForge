/**
 * artifact-schema-validation.ts — v1.1 JSON Artifact Schema Validation
 *
 * Validates JSON artifacts before they are written to disk.
 * Invalid artifacts are REJECTED — they MUST NOT fall to disk.
 *
 * Validates:
 * - work_item.json: legal JSON + work_item_id match + metadata-only boundary
 * - trigger_result.json: legal JSON + workflow_path enum + work_item_id
 * - candidate_manifest.json: legal JSON + work_item_id + entries structure
 *   + code_only_fast_path → entries must be []
 * - evidence/evidence_manifest.json: legal JSON + work_item_id + entries array
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { ModuleContractFileSchema, resolveSpecModuleIdentity } from '@specforge/types';
import {
  normalizeImpactScope,
  validateImpactScopeFieldKinds,
  type ImpactScope,
} from './impact-analysis.js';

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * v1.1 固定 workflow_path 枚举 (§6.4)
 */
export const VALID_WORKFLOW_PATHS = [
  'requirement_change_path',
  'design_change_path',
  'architecture_change_path',
  'task_change_path',
  'code_only_fast_path',
  'spec_migration_path',
  'contract_change_path',
  'rollback_path',
] as const;

export type ValidWorkflowPath = (typeof VALID_WORKFLOW_PATHS)[number];

export function resolveCanonicalCandidateWorkflowPath(
  manifestWorkflowPath: unknown,
  canonicalWorkflowPath: unknown
): ValidWorkflowPath {
  const canonical = String(canonicalWorkflowPath ?? '').trim();
  if (!VALID_WORKFLOW_PATHS.includes(canonical as ValidWorkflowPath)) {
    throw new Error(
      `CANDIDATE_MANIFEST_CANONICAL_WORKFLOW_PATH_INVALID: "${canonical || 'missing'}"`
    );
  }
  const manifestValue = String(manifestWorkflowPath ?? '').trim();
  if (!manifestValue || manifestValue === 'unknown') {
    return canonical as ValidWorkflowPath;
  }
  if (!VALID_WORKFLOW_PATHS.includes(manifestValue as ValidWorkflowPath)) {
    throw new Error(`CANDIDATE_MANIFEST_WORKFLOW_PATH_INVALID: "${manifestValue}"`);
  }
  if (manifestValue !== canonical) {
    throw new Error(
      `CANDIDATE_MANIFEST_WORKFLOW_PATH_CONFLICT: manifest=${manifestValue}; canonical=${canonical}`
    );
  }
  return canonical as ValidWorkflowPath;
}

export const VALID_CANDIDATE_PHASES = ['design', 'requirements', 'tasks', 'full'] as const;
export type ValidCandidatePhase = (typeof VALID_CANDIDATE_PHASES)[number];

const CLASSIFICATION_BOOLEAN_FIELDS = [
  'requirement_changed',
  'acceptance_criteria_changed',
  'business_rule_changed',
  'user_visible_behavior_changed',
  'data_semantics_changed',
  'design_changed',
  'module_boundary_changed',
  'api_contract_changed',
  'architecture_changed',
  'data_model_changed',
  'module_contract_changed',
] as const;

/**
 * work_item.json is WI metadata only.
 * It must never carry approval/user-decision fields.
 */
export const FORBIDDEN_WORK_ITEM_DECISION_FIELDS = [
  'decision_status',
  'decision_type',
  'user_response_quote',
  'auto_approval_policy_id',
  'approved',
  'approval',
  'approval_status',
  'user_decision',
  'user_decision_id',
  'decision_id',
  'decided_by',
  'decision_scope',
  'waivers',
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findForbiddenWorkItemDecisionFields(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenWorkItemDecisionFields(item, `${prefix}[${index}]`)
    );
  }

  if (!isPlainObject(value)) return [];

  const forbidden = new Set<string>(FORBIDDEN_WORK_ITEM_DECISION_FIELDS as readonly string[]);
  const hits: string[] = [];

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (forbidden.has(key)) {
      hits.push(path);
      continue;
    }
    hits.push(...findForbiddenWorkItemDecisionFields(child, path));
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate work_item.json content.
 * Must be legal JSON with required fields and matching work_item_id.
 */
export function validateWorkItemJson(
  content: string,
  expectedWorkItemId: string
): SchemaValidationResult {
  const errors: string[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('INVALID_STRUCTURE: must be a JSON object');
  } else {
    if (!parsed.work_item_id) {
      errors.push('MISSING_FIELD: work_item_id is required');
    } else if (parsed.work_item_id !== expectedWorkItemId) {
      errors.push(
        `WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`
      );
    }

    if (!parsed.schema_version) {
      errors.push('MISSING_FIELD: schema_version is required');
    }

    if (Object.prototype.hasOwnProperty.call(parsed, 'status')) {
      errors.push(
        'WORK_ITEM_STATUS_FORBIDDEN: work_item.json is metadata only; authoritative state belongs to StateManager/events.jsonl'
      );
    }

    if (parsed.work_item_status_mutation_forbidden) {
      errors.push(
        `WORK_ITEM_STATUS_MUTATION_FORBIDDEN: work_item.json status must not be used as a state synchronization channel: ${parsed.work_item_status_mutation_forbidden}`
      );
    }

    const forbiddenDecisionFields = findForbiddenWorkItemDecisionFields(parsed);
    if (forbiddenDecisionFields.length > 0) {
      errors.push(
        `WORK_ITEM_CANNOT_CARRY_USER_DECISION: forbidden fields in work_item.json: ${forbiddenDecisionFields.join(', ')}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate trigger_result.json content.
 * Must be legal JSON with workflow_path from the v1.1 fixed enum.
 */
export function validateTriggerResultJson(
  content: string,
  expectedWorkItemId: string
): SchemaValidationResult {
  const errors: string[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('INVALID_STRUCTURE: must be a JSON object');
  } else {
    if (!parsed.work_item_id) {
      errors.push('MISSING_FIELD: work_item_id is required');
    } else if (parsed.work_item_id !== expectedWorkItemId) {
      errors.push(
        `WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`
      );
    }
    if (!parsed.workflow_path) {
      errors.push('MISSING_FIELD: workflow_path is required');
    } else if (!VALID_WORKFLOW_PATHS.includes(parsed.workflow_path as ValidWorkflowPath)) {
      errors.push(
        `INVALID_WORKFLOW_PATH: "${parsed.workflow_path}" is not a valid v1.1 workflow_path. ` +
          `Valid values: ${VALID_WORKFLOW_PATHS.join(', ')}`
      );
    }
    if (Object.prototype.hasOwnProperty.call(parsed, 'unknowns')) {
      errors.push(
        'TOP_LEVEL_UNKNOWNS_FORBIDDEN: trigger_result.json must keep unknowns only at classification.unknowns'
      );
    }
    if (!isPlainObject(parsed.classification)) {
      errors.push('INVALID_CLASSIFICATION: classification must be a JSON object');
    } else {
      for (const field of CLASSIFICATION_BOOLEAN_FIELDS) {
        if (typeof parsed.classification[field] !== 'boolean') {
          errors.push(`INVALID_CLASSIFICATION_FIELD: classification.${field} must be boolean`);
        }
      }
      if (!Array.isArray(parsed.classification.unknowns)) {
        errors.push('INVALID_CLASSIFICATION_FIELD: classification.unknowns must be an array');
      }
      if (
        parsed.classification.contract_registry_only !== undefined &&
        typeof parsed.classification.contract_registry_only !== 'boolean'
      ) {
        errors.push(
          'INVALID_CLASSIFICATION_FIELD: classification.contract_registry_only must be boolean when present'
        );
      }
    }

    if (!isPlainObject(parsed.impact_scope)) {
      errors.push('INVALID_IMPACT_SCOPE: impact_scope must be a JSON object');
    } else {
      const requiredFields = [
        'affected_modules',
        'architecture_refs',
        'data_model_refs',
        'design_refs',
        'project_contract_refs',
        'module_contract_refs',
        'planned_code_paths',
      ] as const;
      let arraysValid = true;
      for (const field of requiredFields) {
        const value = parsed.impact_scope[field];
        if (!Array.isArray(value)) {
          arraysValid = false;
          errors.push(`INVALID_IMPACT_SCOPE_FIELD: impact_scope.${field} must be an array`);
          continue;
        }
        for (const [index, item] of value.entries()) {
          if (typeof item !== 'string' || !item.trim()) {
            arraysValid = false;
            errors.push(
              `INVALID_IMPACT_SCOPE_ITEM: impact_scope.${field}[${index}] must be a non-empty string`
            );
          }
        }
      }
      if (arraysValid) {
        const normalized = normalizeImpactScope(
          parsed.impact_scope as Partial<ImpactScope>
        );
        errors.push(...validateImpactScopeFieldKinds(normalized));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function isEvidenceOnlyCandidateManifest(parsed: Record<string, unknown>): boolean {
  return (
    parsed.no_project_spec_change === true ||
    String(parsed.project_integration_effect ?? '')
      .trim()
      .toLowerCase() === 'evidence_only'
  );
}

/**
 * Validate candidate_manifest.json content.
 * Must be legal JSON with work_item_id, entries array.
 * For code_only_fast_path: entries MUST be [].
 */
export function validateCandidateManifestJson(
  content: string,
  expectedWorkItemId: string,
  workflowPath?: string
): SchemaValidationResult {
  const errors: string[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('INVALID_STRUCTURE: must be a JSON object');
  } else {
    if (!parsed.work_item_id) {
      errors.push('MISSING_FIELD: work_item_id is required');
    } else if (parsed.work_item_id !== expectedWorkItemId) {
      errors.push(
        `WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`
      );
    }

    if (!parsed.workflow_path) {
      errors.push('MISSING_FIELD: workflow_path is required');
    } else if (!VALID_WORKFLOW_PATHS.includes(parsed.workflow_path as ValidWorkflowPath)) {
      errors.push(
        `INVALID_WORKFLOW_PATH: "${parsed.workflow_path}" is not a valid candidate_manifest workflow_path. ` +
          `Valid values: ${VALID_WORKFLOW_PATHS.join(', ')}`
      );
    } else if (workflowPath && parsed.workflow_path !== workflowPath) {
      errors.push(
        `WORKFLOW_PATH_MISMATCH: candidate_manifest.workflow_path="${parsed.workflow_path}" does not match canonical workflow_path="${workflowPath}"`
      );
    }
    if (
      parsed.candidate_phase !== undefined &&
      !VALID_CANDIDATE_PHASES.includes(parsed.candidate_phase as ValidCandidatePhase)
    ) {
      errors.push(
        `INVALID_CANDIDATE_PHASE: "${parsed.candidate_phase}" is invalid. ` +
          `Valid values: ${VALID_CANDIDATE_PHASES.join(', ')}`
      );
    }

    if (!Array.isArray(parsed.entries)) {
      errors.push('MISSING_FIELD: entries must be an array');
    } else {
      const effectiveWorkflowPath = parsed.workflow_path;
if (Object.prototype.hasOwnProperty.call(parsed, 'contract_promotions')) {
  if (!Array.isArray(parsed.contract_promotions)) {
    errors.push('CONTRACT_PROMOTIONS_MUST_BE_ARRAY: contract_promotions must be an array');
  } else {
    const seenFrom = new Set<string>();
    const seenTo = new Set<string>();
    for (const [index, promotion] of parsed.contract_promotions.entries()) {
      if (!isPlainObject(promotion)) {
        errors.push(
          `CONTRACT_PROMOTION_INVALID_ENTRY: contract_promotions[${index}] must be an object`
        );
        continue;
      }
      const from = String(promotion.from_contract_id ?? '').trim();
      const to = String(promotion.to_contract_id ?? '').trim();
      const migration = String(promotion.migration_conclusion ?? '').trim();
      const compatibility = String(promotion.compatibility ?? '').trim();
      if (!from) {
        errors.push(
          `CONTRACT_PROMOTION_FROM_REQUIRED: contract_promotions[${index}].from_contract_id is required`
        );
      }
      if (!to) {
        errors.push(
          `CONTRACT_PROMOTION_TO_REQUIRED: contract_promotions[${index}].to_contract_id is required`
        );
      }
      if (from && to && from === to) {
        errors.push(
          `CONTRACT_PROMOTION_IDS_MUST_DIFFER: contract_promotions[${index}] from/to IDs must differ`
        );
      }
      if (!migration) {
        errors.push(
          `CONTRACT_PROMOTION_MIGRATION_REQUIRED: contract_promotions[${index}].migration_conclusion is required`
        );
      }
      if (!compatibility) {
        errors.push(
          `CONTRACT_PROMOTION_COMPATIBILITY_REQUIRED: contract_promotions[${index}].compatibility is required`
        );
      }
      if (from) {
        if (seenFrom.has(from)) {
          errors.push(
            `CONTRACT_PROMOTION_DUPLICATE_FROM: from_contract_id "${from}" appears more than once`
          );
        }
        seenFrom.add(from);
      }
      if (to) {
        if (seenTo.has(to)) {
          errors.push(
            `CONTRACT_PROMOTION_DUPLICATE_TO: to_contract_id "${to}" appears more than once`
          );
        }
        seenTo.add(to);
      }
    }
    if (
      parsed.contract_promotions.length > 0 &&
      effectiveWorkflowPath !== 'architecture_change_path'
    ) {
      errors.push(
        'CONTRACT_PROMOTION_WORKFLOW_PATH_INVALID: contract_promotions require architecture_change_path'
      );
    }
  }
}
      const evidenceOnly = isEvidenceOnlyCandidateManifest(parsed);

      if (effectiveWorkflowPath === 'code_only_fast_path' && parsed.entries.length > 0) {
        errors.push(
          'CODE_ONLY_ENTRIES_MUST_BE_EMPTY: code_only_fast_path requires candidate_manifest.entries = []'
        );
      }

      if (effectiveWorkflowPath === 'contract_change_path') {
        if (parsed.entries.length === 0) {
          errors.push(
            'CONTRACT_CHANGE_REGISTRY_ENTRY_REQUIRED: contract_change_path requires an extension_registry candidate'
          );
        }
        for (const [index, entry] of parsed.entries.entries()) {
          const target = String(entry?.target_path ?? '').replace(/\\/g, '/');
          if (target !== '.specforge/project/extension_registry.json') {
            errors.push(
              `CONTRACT_CHANGE_TARGET_FORBIDDEN: entries[${index}] must target only .specforge/project/extension_registry.json`
            );
          }
        }
      }

      if (evidenceOnly) {
        if (parsed.no_project_spec_change !== true) {
          errors.push(
            'EVIDENCE_ONLY_PROJECT_CHANGE_FLAG_REQUIRED: evidence_only requires no_project_spec_change = true'
          );
        }
        if (
          String(parsed.project_integration_effect ?? '')
            .trim()
            .toLowerCase() !== 'evidence_only'
        ) {
          errors.push(
            'EVIDENCE_ONLY_INTEGRATION_EFFECT_REQUIRED: no_project_spec_change requires project_integration_effect = evidence_only'
          );
        }
        if (parsed.entries.length > 0) {
          errors.push(
            'EVIDENCE_ONLY_ENTRIES_MUST_BE_EMPTY: evidence_only requires candidate_manifest.entries = []'
          );
        }
        if (Object.prototype.hasOwnProperty.call(parsed, 'candidate_artifacts')) {
          errors.push(
            'EVIDENCE_ONLY_CANDIDATE_ARTIFACTS_FORBIDDEN: evidence_only keeps Work Item evidence outside candidate_manifest merge authority'
          );
        }
        if (parsed.merge_required !== false) {
          errors.push(
            'EVIDENCE_ONLY_MERGE_REQUIRED_FALSE: evidence_only requires merge_required = false'
          );
        }
        if (parsed.merge_applicable !== false) {
          errors.push(
            'EVIDENCE_ONLY_MERGE_APPLICABLE_FALSE: evidence_only requires merge_applicable = false'
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate evidence/evidence_manifest.json content.
 * Must be legal JSON with work_item_id and entries array.
 */

export function validateModuleDefinitionCandidateJson(
  content: string,
  expectedModuleCode: string
): SchemaValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }
  if (!isPlainObject(parsed)) {
    return { valid: false, errors: ['MODULE_DEFINITION_SCHEMA_INVALID: <root>: must be an object'] };
  }
  const errors: string[] = [];
  const expected = String(expectedModuleCode ?? '').trim().toUpperCase();
  const identity = resolveSpecModuleIdentity(parsed);
  const declaredModuleCode =
    typeof parsed.module_code === 'string' ? parsed.module_code.trim().toUpperCase() : '';
  if (!identity.valid || !identity.moduleCode) {
    errors.push(
      `MODULE_DEFINITION_IDENTITY_INVALID: ${identity.errors.join('; ') || 'module_code is required'}`
    );
  } else if (identity.moduleCode !== expected) {
    errors.push(
      `MODULE_DEFINITION_MODULE_MISMATCH: candidate path module=${expected}; module_code=${identity.moduleCode}`
    );
  }
  if (!declaredModuleCode || declaredModuleCode !== expected) {
    errors.push(
      `MODULE_DEFINITION_CANONICAL_MODULE_CODE_REQUIRED: module_code must be exactly ${expected}`
    );
  }
  if (!Array.isArray(parsed.code_paths)) {
    errors.push(
      'MODULE_DEFINITION_CODE_PATHS_MUST_BE_ARRAY: code_paths must be one flat string[]; grouped production/config/test objects are not canonical'
    );
  } else {
    const normalized: string[] = [];
    for (const [index, value] of parsed.code_paths.entries()) {
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(
          `MODULE_DEFINITION_CODE_PATH_INVALID: code_paths[${index}] must be a non-empty string`
        );
        continue;
      }
      normalized.push(value.trim());
    }
    if (new Set(normalized).size !== normalized.length) {
      errors.push('MODULE_DEFINITION_CODE_PATHS_DUPLICATE: code_paths must not contain duplicates');
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate a Module Contract Candidate against the one canonical Runtime schema.
 * Candidate writing is stricter than legacy reading: no extra top-level or
 * registry keys are accepted, and the path Module must equal owner_module.
 */
export function validateModuleContractCandidateJson(
  content: string,
  expectedOwnerModule: string
): SchemaValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, errors: ['MODULE_CONTRACT_SCHEMA_INVALID: <root>: must be an object'] };
  }

  const record = parsed as Record<string, unknown>;
  const topKeys = Object.keys(record).sort();
  const expectedTopKeys = ['contracts', 'owner_module', 'schema_version'];
  if (JSON.stringify(topKeys) !== JSON.stringify(expectedTopKeys)) {
    return {
      valid: false,
      errors: [
        `MODULE_CONTRACT_SCHEMA_INVALID: <root>: top-level keys must be exactly ${expectedTopKeys.join(', ')}`,
      ],
    };
  }

  const contracts = record.contracts;
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) {
    return { valid: false, errors: ['MODULE_CONTRACT_SCHEMA_INVALID: contracts: required object'] };
  }
  const registryKeys = Object.keys(contracts as Record<string, unknown>).sort();
  const expectedRegistryKeys = ['extension_points', 'invariants', 'public_interfaces', 'shared_enums'];
  if (JSON.stringify(registryKeys) !== JSON.stringify(expectedRegistryKeys)) {
    return {
      valid: false,
      errors: [
        `MODULE_CONTRACT_SCHEMA_INVALID: contracts: keys must be exactly ${expectedRegistryKeys.join(', ')}`,
      ],
    };
  }

  const schema = ModuleContractFileSchema.safeParse(parsed);
  if (!schema.success) {
    return {
      valid: false,
      errors: schema.error.issues.map(
        issue =>
          `MODULE_CONTRACT_SCHEMA_INVALID: ${issue.path.join('.') || '<root>'}: ${issue.message}`
      ),
    };
  }

  const expected = expectedOwnerModule.trim().toUpperCase();
  const actual = schema.data.owner_module.trim().toUpperCase();
  if (actual !== expected) {
    return {
      valid: false,
      errors: [
        `MODULE_CONTRACT_OWNER_MISMATCH: candidate path owner=${expected}; owner_module=${actual}`,
      ],
    };
  }

  return { valid: true, errors: [] };
}

export function validateEvidenceManifestJson(
  content: string,
  expectedWorkItemId: string
): SchemaValidationResult {
  const errors: string[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push('INVALID_STRUCTURE: must be a JSON object');
  } else {
    if (!parsed.work_item_id) {
      errors.push('MISSING_FIELD: work_item_id is required');
    } else if (parsed.work_item_id !== expectedWorkItemId) {
      errors.push(
        `WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`
      );
    }

    if (!Array.isArray(parsed.entries)) {
      errors.push('MISSING_FIELD: entries must be an array');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Dispatch validation based on artifact filename.
 * Returns null if no schema validation is needed for this file type.
 */
export function validateArtifactJson(
  filename: string,
  content: string,
  workItemId: string,
  workflowPath?: string
): SchemaValidationResult | null {
  const normalizedFilename = filename.replace(/\\/g, '/');
  const moduleDefinitionCandidate = /(?:^|\/)candidates\/project\/modules\/([^/]+)\/module\.candidate\.json$/i.exec(normalizedFilename);
  if (moduleDefinitionCandidate?.[1]) {
    return validateModuleDefinitionCandidateJson(content, moduleDefinitionCandidate[1]);
  }
  const moduleContractCandidate = /(?:^|\/)candidates\/project\/modules\/([^/]+)\/contracts\.candidate\.json$/i.exec(normalizedFilename);
  if (moduleContractCandidate?.[1]) {
    return validateModuleContractCandidateJson(content, moduleContractCandidate[1]);
  }

  switch (filename) {
    case 'work_item.json':
      return validateWorkItemJson(content, workItemId);
    case 'trigger_result.json':
      return validateTriggerResultJson(content, workItemId);
    case 'candidate_manifest.json':
      return validateCandidateManifestJson(content, workItemId, workflowPath);
    case 'evidence_manifest.json':
      return validateEvidenceManifestJson(content, workItemId);
    default:
      return null; // No schema validation for other files (md files, etc.)
  }
}
