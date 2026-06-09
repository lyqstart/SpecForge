/**
 * v11/index.ts — SpecForge v1.1 Runtime module barrel export
 *
 * Re-exports all v1.1 runtime components.
 */

// Path Service and Policy (Round 1)
export { PathService, SPEC_DIR_NAME } from './runtime/PathService.js';
export { PathPolicy, type ValidationResult, type DetailedValidationResult, type PathCaller, type WriteOperation } from './runtime/PathPolicy.js';

// JSON Parser (Round 1)
export { JsonParser, type ParseResult } from './runtime/JsonParser.js';

// Runtime Init (Round 1)
export { RuntimeInit, createEmptySpecManifest, createEmptyExtensionRegistry, type InitResult } from './runtime/RuntimeInit.js';

// State Machine (Round 2)
export {
  StateMachine,
  WORK_ITEM_STATES,
  isForbiddenTransition,
  type WorkItemState,
  type AuthorizedCaller,
  type StateTransitionRecord,
  type TransitionResult,
  type WorkItemMetadata,
} from './runtime/StateMachine.js';

// Gate Runner (Round 3)
export {
  GateRunner,
  type V11GateReport,
  type GateCheckResult,
  type GateSummaryResult,
  type GateDefinition,
  type GateExecutionResult,
} from './runtime/GateRunner.js';

// User Decision Recorder (Round 3)
export {
  UserDecisionRecorder,
  type UserDecisionRecord,
} from './runtime/UserDecisionRecorder.js';

// Merge Runner (Round 3)
export {
  MergeRunner,
  type V11ManifestEntry,
  type V11CandidateManifest,
  type V11MergeParams,
  type V11MergeResult,
  type V11MergedFile,
  type V11MergeReportParams,
  type CandidateEntry,
  type CandidateManifest,
  type MergedFile,
  type MergeResult,
  type MergePreconditionResult,
} from './runtime/MergeRunner.js';

// Write Guard (Round 4)
export {
  WriteGuard,
  CodePermissionService,
  ChangedFilesAudit,
  type ToolType,
  type WriteContext,
  type WritePermission,
  type EscapedWriteIncident,
  type WriteCheckResult,
} from './runtime/WriteGuard.js';

// Extension Registry (Round 5)
export {
  ExtensionRegistry,
  ExtensionGate,
  type ExtensionRegistryData,
  type ExtensionRequestData,
  type ArtifactType,
} from './runtime/ExtensionRegistry.js';

// Close Gate (Cross-cutting)
export {
  CloseGate,
  type CloseCheck,
  type CloseValidationResult,
  type FileSystemValidationParams,
} from './runtime/CloseGate.js';

// Extension Subflow (Round 5)
export {
  ExtensionSubflowScheduler,
  ExtensionAgent,
  FlowResumption,
  type ExtensionSubflowState,
  type ExtensionCandidate,
  type ExtensionAgentContext,
  type FlowResumptionResult,
} from './runtime/ExtensionSubflow.js';

// Runtime (Cross-cutting)
export {
  Runtime,
  type RuntimeConfig,
  type RuntimeComponents,
} from './runtime/Runtime.js';
