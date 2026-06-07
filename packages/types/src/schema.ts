/**
 * schema.ts — SpecForge v1.1 Zod Schema 定义
 *
 * 本模块从 work-item-types.ts 中提取出所有 Zod schema 定义，
 * 提供集中化的 JSON Schema 校验。
 *
 * 包含：
 * - §4：Work Item JSON schema（WorkItemJsonSchema）
 * - §8：Candidate Manifest schemas（CandidateManifestEntrySchema, CandidateManifestSchema）
 * - §9：Gate Report schema（GateReportSchema）
 * - §10：User Decision schema（UserDecisionSchema）
 * - §2：Spec Manifest schemas（SpecModuleEntrySchema, SpecManifestSchema）
 * - Extension Registry / Request schemas
 * - §13：Evidence schemas（EvidenceManifestEntrySchema, EvidenceManifestSchema）
 *
 * 所有 schema 的枚举引用来自 ./constants.ts。
 */

import { z } from 'zod';
import {
  WI_STATUSES,
  WORKFLOW_PATHS,
  GATE_IDS,
  GATE_TYPES,
  USER_DECISION_STATUSES,
} from './constants.js';

// ---------------------------------------------------------------------------
// §4 work_item.json 最小结构
// ---------------------------------------------------------------------------

/**
 * work_item.json zod schema（§4.4）。
 */
export const WorkItemJsonSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string().regex(/^WI-[0-9]{4}$/, 'Work Item ID must match WI-NNNN'),
  status: z.enum(WI_STATUSES),
  workflow_path: z.enum(WORKFLOW_PATHS).nullable(),
  code_change_allowed: z.boolean(),
  allowed_write_files: z.array(z.object({
    path: z.string(),
    operation: z.enum(['create', 'modify', 'delete']),
  })),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  created_by: z.literal('sf-orchestrator'),
  // 可选扩展字段
  required_files: z.array(z.string()).optional(),
  required_gates: z.array(z.string()).optional(),
  classification: z.string().optional(),
  impact_analysis: z.string().optional(),
  trigger_result: z.string().optional(),
  manifest_hash: z.string().optional(),
  candidate_hash: z.string().optional(),
  gate_summary_hash: z.string().optional(),
  base_spec_version: z.string().optional(),
  merge_status: z.enum(['pending', 'not_applicable', 'merged', 'failed']).optional(),
  verification_status: z.enum(['pending', 'passed', 'failed', 'not_applicable']).optional(),
  close_status: z.enum(['pending', 'passed', 'failed']).optional(),
  blocked_reason: z.string().optional(),
  superseded_by: z.string().optional(),
});

export type WorkItemJson = z.infer<typeof WorkItemJsonSchema>;

// ---------------------------------------------------------------------------
// §8 Candidate Manifest
// ---------------------------------------------------------------------------

/**
 * 单个 Candidate Manifest Entry。
 */
export const CandidateManifestEntrySchema = z.object({
  candidate_path: z.string(),
  target_path: z.string(),
  operation: z.enum(['replace', 'create', 'delete']),
  candidate_hash: z.string(),
  target_base_hash: z.string().optional(),
  spec_type: z.string().optional(),
  module: z.string().nullable().optional(),
});

export type CandidateManifestEntry = z.infer<typeof CandidateManifestEntrySchema>;

/**
 * candidate_manifest.json schema（§8.3）。
 */
export const CandidateManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  workflow_path: z.enum(WORKFLOW_PATHS),
  base_spec_version: z.string(),
  merge_required: z.boolean(),
  entries: z.array(CandidateManifestEntrySchema),
  manifest_hash: z.string().optional(),
});

export type CandidateManifest = z.infer<typeof CandidateManifestSchema>;

// ---------------------------------------------------------------------------
// §9 Gate Report
// ---------------------------------------------------------------------------

/**
 * Gate Report schema（§9.4）。
 * 路径：.specforge/work-items/<WI-ID>/gates/<gate_id>.json
 */
export const GateReportSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  gate_id: z.enum(GATE_IDS),
  gate_type: z.enum(GATE_TYPES),
  required: z.boolean(),
  status: z.enum(['passed', 'failed', 'skipped', 'waived']),
  input_files: z.array(z.string()),
  checks: z.array(z.object({
    check_id: z.string(),
    description: z.string(),
    passed: z.boolean(),
    severity: z.enum(['error', 'warning', 'info']).optional(),
    details: z.string().optional(),
  })),
  blocking_issues: z.array(z.string()),
  warnings: z.array(z.string()),
  waiver_allowed: z.boolean(),
  waiver_required: z.boolean(),
  waiver_ids: z.array(z.string()),
  started_at: z.string().datetime(),
  finished_at: z.string().datetime(),
  runner: z.string(),
});

export type GateReport = z.infer<typeof GateReportSchema>;

// ---------------------------------------------------------------------------
// §10 User Decision
// ---------------------------------------------------------------------------

/**
 * User Decision schema（§10.2）。
 * 路径：.specforge/work-items/<WI-ID>/user_decision.json
 */
export const UserDecisionSchema = z.object({
  schema_version: z.literal('1.0'),
  decision_id: z.string(),
  work_item_id: z.string(),
  workflow_path: z.enum(WORKFLOW_PATHS),
  base_spec_version: z.string(),
  candidate_manifest_path: z.string(),
  manifest_hash: z.string(),
  candidate_hash: z.string(),
  gate_summary_path: z.string(),
  gate_summary_hash: z.string(),
  decision_status: z.enum(USER_DECISION_STATUSES),
  decision_type: z.enum(['auto_approved', 'user_approved', 'waived', 'rejected']),
  decided_by: z.string(),
  decided_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  decision_scope: z.string(),
  waivers: z.array(z.object({
    waiver_id: z.string(),
    gate_id: z.string(),
    reason: z.string(),
    risk: z.string(),
    expires_at: z.string().datetime().optional(),
    follow_up_wi: z.string().optional(),
  })),
});

export type UserDecision = z.infer<typeof UserDecisionSchema>;

// ---------------------------------------------------------------------------
// §2 spec_manifest.json
// ---------------------------------------------------------------------------

/**
 * spec_manifest.json 中的单个模块描述。
 */
export const SpecModuleEntrySchema = z.object({
  name: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/, 'Module code must be MODULE_CODE'),
  path: z.string(),
  module_file: z.string(),
  requirements: z.string(),
  design: z.string(),
  trace: z.string(),
});

export type SpecModuleEntry = z.infer<typeof SpecModuleEntrySchema>;

/**
 * spec_manifest.json schema（§2.3）。
 */
export const SpecManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  project_spec_version: z.string(),
  project_name: z.string(),
  project: z.object({
    extension_registry: z.string(),
    requirements_index: z.string(),
    design_index: z.string(),
    architecture: z.string(),
    glossary: z.string(),
    decisions: z.string(),
    trace_matrix: z.string(),
  }),
  modules: z.array(SpecModuleEntrySchema),
  last_merged_work_item: z.string().optional(),
  last_merged_at: z.string().datetime().optional(),
});

export type SpecManifest = z.infer<typeof SpecManifestSchema>;

// ---------------------------------------------------------------------------
// v1.1 Patch 1: extension_registry.json
// ---------------------------------------------------------------------------

/**
 * extension_registry.json schema。
 * 路径：.specforge/project/extension_registry.json
 */
export const ExtensionRegistrySchema = z.object({
  schema_version: z.literal('1.0'),
  project_spec_version: z.string(),
  namespaces: z.object({
    requirement_types: z.array(z.string()),
    design_types: z.array(z.string()),
    task_types: z.array(z.string()),
    verification_types: z.array(z.string()),
    gate_types: z.array(z.string()),
  }),
  updated_by_work_item: z.string().nullable(),
  updated_at: z.string().datetime().nullable(),
});

export type ExtensionRegistry = z.infer<typeof ExtensionRegistrySchema>;

/**
 * extension_request.json schema。
 * 路径：.specforge/work-items/<WI-ID>/extension_request.json
 */
export const ExtensionRequestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  requested_by_agent: z.string(),
  requested_namespace: z.string(),
  requested_key: z.string(),
  reason: z.string(),
  blocking_current_flow: z.boolean(),
  created_at: z.string().datetime(),
});

export type ExtensionRequest = z.infer<typeof ExtensionRequestSchema>;

// ---------------------------------------------------------------------------
// §13 Evidence
// ---------------------------------------------------------------------------

/**
 * Evidence Manifest entry。
 */
export const EvidenceManifestEntrySchema = z.object({
  evidence_id: z.string(),
  type: z.enum([
    'test_output',
    'build_log',
    'review_record',
    'screenshot',
    'command_output',
    'write_guard_log',
    'changed_files_audit',
    'gate_report',
    'merge_report',
    'other',
  ]),
  path: z.string(),
  description: z.string(),
  hash: z.string().optional(),
  created_at: z.string().datetime(),
});

export type EvidenceManifestEntry = z.infer<typeof EvidenceManifestEntrySchema>;

/**
 * evidence_manifest.json schema（§13.4）。
 */
export const EvidenceManifestSchema = z.object({
  schema_version: z.literal('1.0'),
  work_item_id: z.string(),
  entries: z.array(EvidenceManifestEntrySchema),
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
