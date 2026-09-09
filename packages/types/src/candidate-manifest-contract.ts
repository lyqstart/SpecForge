import { z } from 'zod';
import { WORKFLOW_PATHS } from './constants.js';

export const CANDIDATE_MANIFEST_SCHEMA_VERSION = '1.0' as const;

export const CandidateManifestEntrySchema = z.object({
  candidate_path: z.string().min(1),
  target_path: z.string().min(1),
  operation: z.enum(['replace', 'create', 'delete']),
  type: z.string().min(1).optional(),
  module_id: z.string().min(1).optional(),
  inferred: z.boolean().optional(),
  normalized: z.boolean().optional(),
  candidate_hash: z.string().min(1).optional(),
  target_base_hash: z.string().min(1).optional(),
}).strict();

export const CandidateManifestContractPromotionSchema = z.object({
  from_contract_id: z.string().min(1),
  to_contract_id: z.string().min(1),
  migration_conclusion: z.string().min(1),
  compatibility: z.string().min(1),
}).strict();

export const CandidateManifestSchema = z.object({
  schema_version: z.literal(CANDIDATE_MANIFEST_SCHEMA_VERSION),
  work_item_id: z.string().min(1),
  workflow_path: z.enum(WORKFLOW_PATHS),
  workflow_type: z.string().min(1).optional(),
  candidate_phase: z.enum(['design', 'requirements', 'tasks', 'full']).optional(),
  base_spec_version: z.string().min(1),
  merge_required: z.boolean(),
  merge_applicable: z.boolean().optional(),
  entries: z.array(CandidateManifestEntrySchema),
  manifest_hash: z.string().min(1).optional(),
  no_project_spec_change: z.boolean().optional(),
  project_integration_effect: z.literal('evidence_only').optional(),
  reason: z.string().min(1).optional(),
  project_spec_precondition_sha256: z.string().min(1).optional(),
  repair_evidence_paths: z.array(z.string().min(1)).optional(),
  contract_promotions: z.array(CandidateManifestContractPromotionSchema).optional(),
}).strict();

export type CandidateManifestEntry = z.infer<typeof CandidateManifestEntrySchema>;
export type CandidateManifest = z.infer<typeof CandidateManifestSchema>;

export interface CandidateManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCurrentCandidateManifestValue(
  value: unknown,
  expectedWorkItemId?: string,
): CandidateManifestValidationResult {
  const parsed = CandidateManifestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(issue => {
        const field = issue.path.length > 0 ? issue.path.join('.') : 'candidate_manifest';
        return `${field}: ${issue.message}`;
      }),
    };
  }
  if (expectedWorkItemId && parsed.data.work_item_id !== expectedWorkItemId) {
    return {
      valid: false,
      errors: [`work_item_id: expected ${expectedWorkItemId}, got ${parsed.data.work_item_id}`],
    };
  }
  return { valid: true, errors: [] };
}

export function validateCurrentCandidateManifestJson(
  content: string,
  expectedWorkItemId?: string,
): CandidateManifestValidationResult {
  try {
    return validateCurrentCandidateManifestValue(JSON.parse(content), expectedWorkItemId);
  } catch {
    return { valid: false, errors: ['candidate_manifest: invalid JSON'] };
  }
}
