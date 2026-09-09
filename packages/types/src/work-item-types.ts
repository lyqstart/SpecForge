/**
 * work-item-types.ts — SpecForge v1.1 Work Item 核心类型定义
 */
import { z } from "zod";
import { ContractRegistrySchema } from "./contract-model.js";
export {
  USER_DECISION_STATUSES,
  UserDecisionSchema,
  type UserDecision,
  type UserDecisionStatus,
} from "./user-decision-contract.js";
export {
  CandidateManifestEntrySchema,
  CandidateManifestSchema,
  type CandidateManifestEntry,
  type CandidateManifest,
} from "./candidate-manifest-contract.js";

export const WI_STATUSES = [
  "created", "intake_ready", "impact_analyzing", "impact_analyzed", "workflow_selected",
  "candidate_preparing", "candidate_prepared", "gates_running", "gates_failed",
  "approval_required", "approved", "merge_ready", "merging", "merged",
  "post_merge_verified", "implementation_ready", "implementation_running",
  "implementation_done", "verification_running", "verification_done", "closed",
  "blocked", "rejected", "superseded",
] as const;
export type WIStatus = (typeof WI_STATUSES)[number];

export const FORBIDDEN_TRANSITIONS: ReadonlyArray<readonly [string, string]> = [
  ["created", "implementation_running"], ["intake_ready", "implementation_running"],
  ["impact_analyzing", "implementation_running"], ["impact_analyzed", "implementation_running"],
  ["workflow_selected", "implementation_running"], ["candidate_prepared", "merging"],
  ["approval_required", "merging"], ["approval_required", "closed"], ["merged", "closed"],
  ["closed", "any"], ["blocked", "closed"], ["rejected", "closed"],
] as const;
export function isForbiddenTransition(from: string, to: string): boolean {
  return FORBIDDEN_TRANSITIONS.some(([f, t]) => (f === from || f === "any") && (t === to || t === "any"));
}

export const WORKFLOW_PATHS = [
  "requirement_change_path", "design_change_path", "architecture_change_path", "task_change_path",
  "code_only_fast_path", "spec_migration_path", "contract_change_path", "rollback_path",
] as const;
export type WorkflowPath = (typeof WORKFLOW_PATHS)[number];

export const MATCH_RESULT_TYPES = [
  "exact_match", "partial_match", "related_match", "conflict_match", "no_match", "spec_gap_match",
] as const;
export type MatchResultType = (typeof MATCH_RESULT_TYPES)[number];

export const WorkItemJsonSchema = z.object({
  schema_version: z.literal("1.1"),
  work_item_id: z.string().regex(/^WI-[0-9]{4}$/, "Work Item ID must match WI-NNNN"),
  workflow_path: z.enum(WORKFLOW_PATHS).nullable().optional(),
  workflow_type: z.string().optional(),
  code_change_allowed: z.boolean().optional(),
  allowed_write_files: z.array(z.object({ path: z.string(), operation: z.enum(["create", "modify", "delete"]) })).optional(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
  created_by: z.string().optional(),
  required_files: z.array(z.string()).optional(),
  required_gates: z.array(z.string()).optional(),
  classification: z.string().optional(),
  impact_analysis: z.string().optional(),
  trigger_result: z.string().optional(),
  manifest_hash: z.string().optional(),
  candidate_hash: z.string().optional(),
  gate_summary_hash: z.string().optional(),
  base_spec_version: z.string().optional(),
  merge_status: z.enum(["pending", "not_applicable", "merged", "failed"]).optional(),
  verification_status: z.enum(["pending", "passed", "failed", "not_applicable"]).optional(),
  close_status: z.enum(["pending", "passed", "failed"]).optional(),
  superseded_by: z.string().optional(),
}).passthrough();
export type WorkItemJson = z.infer<typeof WorkItemJsonSchema>;

export const GATE_IDS = [
  "entry_gate", "workflow_selection_gate", "required_files_gate", "candidate_manifest_gate",
  "path_policy_gate", "schema_gate", "spec_consistency_gate", "contract_integrity_gate",
  "trace_gate", "workflow_specific_gate", "gate_summary_gate", "merge_ready_gate",
  "post_merge_gate", "verification_gate", "formal_version_gate", "close_gate",
] as const;
export type GateId = (typeof GATE_IDS)[number];
export const GATE_TYPES = ["hard_gate", "soft_gate"] as const;
export type GateType = (typeof GATE_TYPES)[number];
export const GateReportSchema = z.object({
  schema_version: z.literal("1.0"), work_item_id: z.string(), gate_id: z.enum(GATE_IDS),
  gate_type: z.enum(GATE_TYPES), required: z.boolean(),
  status: z.enum(["passed", "failed", "skipped", "waived"]), input_files: z.array(z.string()),
  checks: z.array(z.object({
    check_id: z.string(), description: z.string(), passed: z.boolean(),
    severity: z.enum(["error", "warning", "info"]).optional(), details: z.string().optional(),
  })),
  blocking_issues: z.array(z.string()), warnings: z.array(z.string()), waiver_allowed: z.boolean(),
  waiver_required: z.boolean(), waiver_ids: z.array(z.string()), started_at: z.string().datetime(),
  finished_at: z.string().datetime(), runner: z.string(),
});
export type GateReport = z.infer<typeof GateReportSchema>;

export const GATE_SUMMARY_STATUSES = [
  "passed", "passed_with_waiver_required", "failed", "blocked", "expired", "invalidated",
] as const;
export type GateSummaryStatus = (typeof GATE_SUMMARY_STATUSES)[number];

export const SpecModuleEntrySchema = z.object({
  module_code: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/, "Module code must be MODULE_CODE"),
  path: z.string(), module_file: z.string(), requirements: z.string(), design: z.string(),
  contracts: z.string().optional(), trace: z.string(), code_paths: z.array(z.string().min(1)).optional(),
});
export type SpecModuleEntry = z.infer<typeof SpecModuleEntrySchema>;

export const SpecManifestSchema = z.object({
  schema_version: z.literal("1.0"),
  project_spec_version: z.string().regex(/^PSV-[0-9]{4,}$/, "Invalid Project Spec Version"),
  project_name: z.string(),
  project: z.object({
    extension_registry: z.string(), requirements_index: z.string(), design_index: z.string(),
    architecture: z.string(), data_model: z.string().optional(), glossary: z.string(), decisions: z.string(),
    trace_matrix: z.string(),
  }),
  default_module: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/, "Default module must be MODULE_CODE").optional(),
  modules: z.array(SpecModuleEntrySchema), last_merged_work_item: z.string().optional(),
  last_merged_at: z.string().datetime().optional(),
});
export type SpecManifest = z.infer<typeof SpecManifestSchema>;

export const ExtensionRegistrySchema = z.object({
  schema_version: z.literal("1.0"), project_spec_version: z.string(),
  namespaces: z.object({
    requirement_types: z.array(z.string()), design_types: z.array(z.string()), task_types: z.array(z.string()),
    verification_types: z.array(z.string()), gate_types: z.array(z.string()),
  }),
  updated_by_work_item: z.string().nullable(), updated_at: z.string().datetime().nullable(),
  contracts: ContractRegistrySchema.optional(),
});
export type ExtensionRegistry = z.infer<typeof ExtensionRegistrySchema>;

export const ExtensionRequestSchema = z.object({
  schema_version: z.literal("1.0"), work_item_id: z.string(), requested_by_agent: z.string(),
  requested_namespace: z.string(), requested_key: z.string(), reason: z.string(),
  blocking_current_flow: z.boolean(), created_at: z.string().datetime(),
});
export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

export const EvidenceManifestEntrySchema = z.object({
  evidence_id: z.string(),
  type: z.enum(["test_output", "build_log", "review_record", "screenshot", "command_output", "write_guard_log", "changed_files_audit", "gate_report", "merge_report", "other"]),
  path: z.string(), description: z.string(), hash: z.string().optional(), created_at: z.string().datetime(),
});
export type EvidenceManifestEntry = z.infer<typeof EvidenceManifestEntrySchema>;
export const EvidenceManifestSchema = z.object({
  schema_version: z.literal("1.0"), work_item_id: z.string(), entries: z.array(EvidenceManifestEntrySchema),
});
export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
