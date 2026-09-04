export const WORK_ITEM_METADATA_SCHEMA_VERSION = '1.1' as const;

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

export interface WorkItemMetadataValidationResult {
  valid: boolean;
  errors: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findForbiddenWorkItemDecisionFields(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findForbiddenWorkItemDecisionFields(item, `${prefix}[${index}]`),
    );
  }
  if (!isPlainObject(value)) return [];

  const forbidden = new Set<string>(FORBIDDEN_WORK_ITEM_DECISION_FIELDS);
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = prefix ? `${prefix}.${key}` : key;
    if (forbidden.has(key)) {
      hits.push(childPath);
      continue;
    }
    hits.push(...findForbiddenWorkItemDecisionFields(child, childPath));
  }
  return hits;
}

export function validateCurrentWorkItemMetadataJson(
  content: string,
  expectedWorkItemId: string,
): WorkItemMetadataValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { valid: false, errors: ['INVALID_JSON: content is not valid JSON'] };
  }

  const errors: string[] = [];
  if (!isPlainObject(parsed)) {
    errors.push('INVALID_STRUCTURE: must be a JSON object');
    return { valid: false, errors };
  }

  if (!parsed.work_item_id) {
    errors.push('MISSING_FIELD: work_item_id is required');
  } else if (parsed.work_item_id !== expectedWorkItemId) {
    errors.push(
      `WORK_ITEM_ID_MISMATCH: expected "${expectedWorkItemId}", got "${String(parsed.work_item_id)}"`,
    );
  }

  if (!parsed.schema_version) {
    errors.push('MISSING_FIELD: schema_version is required');
  } else if (parsed.schema_version !== WORK_ITEM_METADATA_SCHEMA_VERSION) {
    errors.push(
      `WORK_ITEM_SCHEMA_VERSION_UNSUPPORTED: expected "${WORK_ITEM_METADATA_SCHEMA_VERSION}", got "${String(parsed.schema_version)}"`,
    );
  }

  if (Object.prototype.hasOwnProperty.call(parsed, 'status')) {
    errors.push(
      'WORK_ITEM_STATUS_FORBIDDEN: work_item.json is metadata only; authoritative state belongs to StateManager/events.jsonl',
    );
  }
  if (parsed.work_item_status_mutation_forbidden) {
    errors.push(
      `WORK_ITEM_STATUS_MUTATION_FORBIDDEN: work_item.json status must not be used as a state synchronization channel: ${String(parsed.work_item_status_mutation_forbidden)}`,
    );
  }

  const forbiddenDecisionFields = findForbiddenWorkItemDecisionFields(parsed);
  if (forbiddenDecisionFields.length > 0) {
    errors.push(
      `WORK_ITEM_CANNOT_CARRY_USER_DECISION: forbidden fields in work_item.json: ${forbiddenDecisionFields.join(', ')}`,
    );
  }
  return { valid: errors.length === 0, errors };
}
