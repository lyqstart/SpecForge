import { z } from 'zod';

export const ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION =
  'atomic_spec_merge_controlled_writes.v1' as const;
export const GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION =
  'git_governance_controlled_writes.v1' as const;

export const AtomicSpecMergeTrustedWriteSchema = z.object({
  path: z.string()
    .regex(/^\.specforge\/project\/.+/)
    .refine(value => !value.includes('\\') && !value.split('/').includes('..')),
  producer: z.literal('sf_v11_merge'),
  work_item_id: z.string().regex(/^WI-\d+$/i),
  project_spec_version: z.string().regex(/^PSV-\d+$/i),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  recorded_at: z.string().min(1),
}).strict();

export const AtomicSpecMergeWriteProvenanceSchema = z.object({
  schema_version: z.literal(ATOMIC_SPEC_MERGE_WRITE_PROVENANCE_SCHEMA_VERSION),
  updated_at: z.string().min(1),
  writes: z.array(AtomicSpecMergeTrustedWriteSchema),
}).strict();

export const GitGovernanceProjectMetadataPathSchema = z.enum([
  '.specforge/project/git_policy.json',
  '.specforge/project/git_ignore_decisions.json',
  '.specforge/project/git_adoption_report.md',
]);

export const GitGovernanceTrustedWriteSchema = z.object({
  path: GitGovernanceProjectMetadataPathSchema,
  producer: z.enum(['sf_git_project_adopt', 'sf_git_ignore_decision_record']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();

export const GitGovernanceWriteProvenanceSchema = z.object({
  schema_version: z.literal(GIT_GOVERNANCE_WRITE_PROVENANCE_SCHEMA_VERSION),
  updated_at: z.string().min(1),
  writes: z.array(GitGovernanceTrustedWriteSchema),
}).strict();

export type AtomicSpecMergeTrustedWrite = z.infer<typeof AtomicSpecMergeTrustedWriteSchema>;
export type AtomicSpecMergeWriteProvenance = z.infer<typeof AtomicSpecMergeWriteProvenanceSchema>;
export type GitGovernanceTrustedWrite = z.infer<typeof GitGovernanceTrustedWriteSchema>;
export type GitGovernanceWriteProvenance = z.infer<typeof GitGovernanceWriteProvenanceSchema>;

export function validateAtomicSpecMergeWriteProvenanceValue(value: unknown): boolean {
  return AtomicSpecMergeWriteProvenanceSchema.safeParse(value).success;
}

export function validateGitGovernanceWriteProvenanceValue(value: unknown): boolean {
  return GitGovernanceWriteProvenanceSchema.safeParse(value).success;
}
