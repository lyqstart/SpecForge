/**
 * @specforge/types - Shared type definitions for SpecForge V6 modules
 *
 * 依据：SpecForge 最终融合标准 v1.1（specforge_final_fused_standard_v1_1_patch1_zh.md）
 *
 * 本包是 SpecForge 的类型真相源，提供：
 * - 目录布局与路径服务（directory-layout.ts）
 * - ID 规则（id-rules.ts，§3）
 * - Work Item 核心类型（work-item-types.ts，§4-§13）
 * - Meta Schema（meta-schema.ts）
 */

// ---- 目录布局与路径服务（§1.5 / §1.6）----
export {
  SPEC_DIR_NAME,
  SPEC_USER_DIR_NAME,
  LAYOUT,
  legacyPaths,
  legacyUserLayoutReadOnly,
  type LayoutKey,
  // 路径构造函数
  resolveProjectPath,
  // 项目级正式规格路径服务（§1.5）
  projectRoot,
  projectSpecManifest,
  projectExtensionRegistry,
  projectRequirementsIndex,
  projectDesignIndex,
  projectArchitecture,
  projectGlossary,
  projectDecisions,
  projectTraceMatrix,
  projectModulesRoot,
  moduleRoot,
  moduleJson,
  moduleRequirements,
  moduleDesign,
  moduleTrace,
  // Work Item 路径服务（§4.2）
  workItemsRoot,
  workItemRoot,
  workItemJson,
  workItemIntake,
  workItemRuntimeLog,
  workItemCandidateManifest,
  workItemCandidatesRoot,
  workItemGatesRoot,
  workItemGateSummary,
  workItemUserDecision,
  workItemVerificationReport,
  workItemMergeReport,
  workItemEvidenceRoot,
  workItemEvidenceManifest,
  // Path Policy（§1.6）
  validatePathPolicy,
  isProjectSpecPath,
  isWorkItemPath,
  isLegacySpecPath,
} from './directory-layout.js';

// ---- Actor Roles — 统一角色枚举 ----
export {
  ACTOR_ROLES,
  type ActorRole,
} from './actor-roles.js';

// ---- ID 规则（§3）----
export {
  MODULE_CODE_PATTERN,
  WI_ID_PATTERN,
  REQ_ID_PATTERN,
  AC_ID_PATTERN,
  DD_ID_PATTERN,
  TASK_ID_PATTERN,
  isValidModuleCode,
  isValidWorkItemId,
  isValidRequirementId,
  isValidAcceptanceCriteriaId,
  isValidDesignDecisionId,
  isValidTaskId,
  extractModuleFromReqId,
  extractModuleFromAcId,
  extractModuleFromDdId,
  extractWiFromTaskId,
} from './id-rules.js';

// ---- Work Item 核心类型（§4-§13）----
export {
  // §5 状态机
  WI_STATUSES,
  FORBIDDEN_TRANSITIONS,
  isForbiddenTransition,
  // §6 workflow_path
  WORKFLOW_PATHS,
  MATCH_RESULT_TYPES,
  // §9 Gate
  GATE_IDS,
  GATE_TYPES,
  GATE_SUMMARY_STATUSES,
  // §10 User Decision
  USER_DECISION_STATUSES,
  // Schemas
  WorkItemJsonSchema,
  CandidateManifestEntrySchema,
  CandidateManifestSchema,
  GateReportSchema,
  UserDecisionSchema,
  SpecModuleEntrySchema,
  SpecManifestSchema,
  ExtensionRegistrySchema,
  ExtensionRequestSchema,
  EvidenceManifestEntrySchema,
  EvidenceManifestSchema,
  // Types
  type WIStatus,
  type WorkflowPath as V11WorkflowPath,
  type MatchResultType,
  type WorkItemJson,
  type CandidateManifestEntry,
  type CandidateManifest,
  type GateId,
  type GateType as V11GateType,
  type GateReport,
  type GateSummaryStatus,
  type UserDecisionStatus,
  type UserDecision,
  type SpecModuleEntry,
  type SpecManifest,
  type ExtensionRegistry,
  type ExtensionRequest,
  type EvidenceManifestEntry,
  type EvidenceManifest,
} from './work-item-types.js';

// ---- Meta Schema（向后兼容）----
export {
  WI_STATUSES as LEGACY_WI_STATUSES,
  WORKFLOW_PATHS as LEGACY_WORKFLOW_PATHS,
  MATCH_RESULT_TYPES as LEGACY_MATCH_RESULT_TYPES,
  WORKFLOW_TYPES,
  STAGE_TYPES,
  WorkItemMetaSchema,
  ModuleCodeSchema,
  WorkItemIdSchema,
  RequirementIdSchema,
  AcceptanceCriteriaIdSchema,
  DesignDecisionIdSchema,
  TaskIdSchema,
  isForbiddenTransition as isLegacyForbiddenTransition,
  type WIStatus as LegacyWIStatus,
  type WorkflowPath as LegacyWorkflowPath,
  type MatchResultType as LegacyMatchResultType,
  type WorkflowType,
  type StageType,
  type WorkItemMeta,
} from './meta-schema.js';

// ---- Constants — 常量与枚举（§5-§10）----
export {
  // 版本常量
  SCHEMA_VERSION,
  // §5 状态机
  WI_STATUSES as ConstWIStatuses,
  FORBIDDEN_TRANSITIONS as ConstForbiddenTransitions,
  isForbiddenTransition as isConstForbiddenTransition,
  // §6 workflow_path
  WORKFLOW_PATHS as ConstWorkflowPaths,
  MATCH_RESULT_TYPES as ConstMatchResultTypes,
  // §9 Gate
  GATE_IDS as ConstGateIds,
  GATE_TYPES as ConstGateTypes,
  GATE_SUMMARY_STATUSES as ConstGateSummaryStatuses,
  // §10 User Decision
  USER_DECISION_STATUSES as ConstUserDecisionStatuses,
  // Types
  type WIStatus as ConstWIStatus,
  type WorkflowPath as ConstWorkflowPath,
  type MatchResultType as ConstMatchResultType,
  type GateId as ConstGateId,
  type GateType as ConstGateType,
  type GateSummaryStatus as ConstGateSummaryStatus,
  type UserDecisionStatus as ConstUserDecisionStatus,
} from './constants.js';

// ---- Schema — Zod Schema 定义（§2-§13）----
export {
  // §4 Work Item JSON
  WorkItemJsonSchema as SchemaWorkItemJsonSchema,
  // §8 Candidate Manifest
  CandidateManifestEntrySchema as SchemaCandidateManifestEntrySchema,
  CandidateManifestSchema as SchemaCandidateManifestSchema,
  // §9 Gate Report
  GateReportSchema as SchemaGateReportSchema,
  // §10 User Decision
  UserDecisionSchema as SchemaUserDecisionSchema,
  // §2 Spec Manifest
  SpecModuleEntrySchema as SchemaSpecModuleEntrySchema,
  SpecManifestSchema as SchemaSpecManifestSchema,
  // Extension Registry / Request
  ExtensionRegistrySchema as SchemaExtensionRegistrySchema,
  ExtensionRequestSchema as SchemaExtensionRequestSchema,
  // §13 Evidence
  EvidenceManifestEntrySchema as SchemaEvidenceManifestEntrySchema,
  EvidenceManifestSchema as SchemaEvidenceManifestSchema,
  // Types
  type WorkItemJson as SchemaWorkItemJson,
  type CandidateManifestEntry as SchemaCandidateManifestEntry,
  type CandidateManifest as SchemaCandidateManifest,
  type GateReport as SchemaGateReport,
  type UserDecision as SchemaUserDecision,
  type SpecModuleEntry as SchemaSpecModuleEntry,
  type SpecManifest as SchemaSpecManifest,
  type ExtensionRegistry as SchemaExtensionRegistry,
  type ExtensionRequest as SchemaExtensionRequest,
  type EvidenceManifestEntry as SchemaEvidenceManifestEntry,
  type EvidenceManifest as SchemaEvidenceManifest,
} from './schema.js';
