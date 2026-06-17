/**
 * artifact-schema-validation.ts — v1.1 JSON Artifact Schema Validation
 *
 * Validates JSON artifacts before they are written to disk.
 * Invalid artifacts are REJECTED — they MUST NOT fall to disk.
 *
 * Validates:
 * - work_item.json: legal JSON + work_item_id match + required fields
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

export type ValidWorkflowPath = typeof VALID_WORKFLOW_PATHS[number];

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate work_item.json content.
 * Must be legal JSON with required fields and matching work_item_id.
 */
export function validateWorkItemJson(
  content: string,
  expectedWorkItemId: string,
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
      errors.push(`WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`);
    }

    if (!parsed.schema_version) {
      errors.push('MISSING_FIELD: schema_version is required');
    }

    if (parsed.status === undefined) {
      errors.push('MISSING_FIELD: status is required');
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
  expectedWorkItemId: string,
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
      errors.push(`WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`);
    }

    if (!parsed.workflow_path) {
      errors.push('MISSING_FIELD: workflow_path is required');
    } else if (!VALID_WORKFLOW_PATHS.includes(parsed.workflow_path as ValidWorkflowPath)) {
      errors.push(
        `INVALID_WORKFLOW_PATH: "${parsed.workflow_path}" is not a valid v1.1 workflow_path. ` +
        `Valid values: ${VALID_WORKFLOW_PATHS.join(', ')}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate candidate_manifest.json content.
 * Must be legal JSON with work_item_id, entries array.
 * For code_only_fast_path: entries MUST be [].
 */
export function validateCandidateManifestJson(
  content: string,
  expectedWorkItemId: string,
  workflowPath?: string,
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
      errors.push(`WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`);
    }

    if (!Array.isArray(parsed.entries)) {
      errors.push('MISSING_FIELD: entries must be an array');
    } else {
      // Check code_only_fast_path constraint
      const effectiveWorkflowPath = workflowPath ?? parsed.workflow_path;
      if (effectiveWorkflowPath === 'code_only_fast_path' && parsed.entries.length > 0) {
        errors.push(
          'CODE_ONLY_ENTRIES_MUST_BE_EMPTY: code_only_fast_path requires candidate_manifest.entries = []'
        );
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
  expectedWorkItemId: string,
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
      errors.push(`WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${parsed.work_item_id}"`);
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
  workflowPath?: string,
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
