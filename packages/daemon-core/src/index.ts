/**
 * Daemon Core entry point
 * 
 * This module initializes and starts the Daemon Core process.
 * Can be used as both a library (import Daemon class) and a CLI entry point.
 */

// Library exports
export { Daemon } from './daemon/Daemon';
export { HTTPServer } from './http/HTTPServer';
export { EventBus } from './event-bus/EventBus';
export { StateManager } from './state/StateManager';
export { RecoverySubsystem } from './recovery/RecoverySubsystem';
export { HandshakeManager } from './daemon/HandshakeManager';
export { DaemonConfig } from './daemon/DaemonConfig';
export type { DaemonMode } from './daemon/DaemonConfig';
export { SessionRegistry } from './session/SessionRegistry';
export { ProjectManager } from './project/ProjectManager';
export { ContentAddressableStorage } from './cas/ContentAddressableStorage';
export { WAL } from './wal/WAL';

// v1.1 Runtime Service exports
export {
  isForbiddenTransition,
  isValidV11Transition,
  isAuthorizedAdvancementSubject,
  performResumeCheck,
  WI_STATUSES_V11,
  V11_REQUIRED_FILES,
  checkCloseGateEvidenceRequirements,
  CLOSE_GATE_REQUIRED_EVIDENCE,
} from './tools/lib/state-machine-v11';
export type { WIStatusV11 } from './tools/lib/state-machine-v11';

export {
  runGate,
  runRequiredGates,
  registerGate,
} from './tools/lib/gate-runner-v11';
export type { GateReportV11, GateIdV11, GateStrictness, GateSummaryStatus, GateContext } from './tools/lib/gate-runner-v11';

export {
  executeMerge,
} from './tools/lib/merge-runner-v11';
export type { MergeInput, MergeResult, MergeEntryResult } from './tools/lib/merge-runner-v11';

export {
  checkWrite,
  performChangedFilesAudit,
} from './tools/lib/write-guard-v11';
export type { WriteGuardContext, WriteCheckResult, AuditResult } from './tools/lib/write-guard-v11';

export {
  recordUserDecision,
  invalidateUserDecision,
} from './tools/lib/user-decision-recorder-v11';
export type { UserDecisionV11, UserDecisionStatus } from './tools/lib/user-decision-recorder-v11';

export {
  releaseCodePermission,
  revokeCodePermission,
  checkCodePermission,
} from './tools/lib/code-permission-service-v11';
export type { PermissionState } from './tools/lib/code-permission-service-v11';

export {
  selectWorkflowPath,
  generateTriggerResult,
} from './tools/lib/workflow-path-selector-v11';
export type { WorkflowPath, ChangeClassification, TriggerResult } from './tools/lib/workflow-path-selector-v11';

export {
  createWorkItem,
  initializeClosureFiles,
  updateWorkItemStatus,
} from './tools/lib/work-item-lifecycle-v11';

// Type exports
export type {
  Event,
  ApiResponse,
  ApiError,
  DaemonError as DaemonErrorType,
  HandshakeFile,
  ProjectState,
  WorkItemState,
  AgentIdentity,
  Subscription,
  ConsistencyCheckResult,
  ConsistencyIssue,
  RepairResult,
} from './types';

// CLI entry point (when run directly)
if (typeof require !== 'undefined' && require.main === module) {
  const { Daemon } = require('./daemon/Daemon');

  async function main(): Promise<void> {
    const daemon = new Daemon();

    try {
      await daemon.start();
      console.log('Daemon Core started successfully');
    } catch (error) {
      console.error('Failed to start Daemon Core:', error);
      process.exit(1);
    }
  }

  main();
}

export {
  ProjectSpecStore,
  ProjectSpecStoreError,
  PROJECT_SPEC_STORE_SCHEMA_VERSION,
  INITIAL_PROJECT_SPEC_VERSION,
} from './project/ProjectSpecStore';
export type {
  CandidateManifestV12,
  CandidateMergeEntry,
  CandidateMergeMode,
  CandidateValidationResult,
  NoSpecImpactEvidence,
  ProjectSpecManifestV12,
  ProjectSpecMergeResult,
  ProjectSpecStoreOptions,
  ProjectSpecVersionEventV12,
} from './project/ProjectSpecStore';
export {
  sfWriteGuardPreflight,
  classifyShellWriteRisk,
  checkCloseGateWriteGuard,
  SF_WRITE_GUARD_PREFLIGHT_V12_CONTRACT,
} from './tools/lib/write-guard-preflight-v12';
export type {
  V12WriteGuardPreflightInput,
  V12WriteGuardPreflightResult,
  V12ShellWriteRisk,
  V12WriteGuardAuditEvent,
} from './tools/lib/write-guard-preflight-v12';