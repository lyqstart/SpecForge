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
  'rollback_path',
] as const;

export type ValidWorkflowPath = (typeof VALID_WORKFLOW_PATHS)[number];

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
      const effectiveWorkflowPath = workflowPath ?? parsed.workflow_path;
      const evidenceOnly = isEvidenceOnlyCandidateManifest(parsed);

      if (effectiveWorkflowPath === 'code_only_fast_path' && parsed.entries.length > 0) {
        errors.push(
          'CODE_ONLY_ENTRIES_MUST_BE_EMPTY: code_only_fast_path requires candidate_manifest.entries = []'
        );
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
