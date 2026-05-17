/**
 * SpecForge Self-Healing Subsystem
 *
 * Implements automated diagnosis and repair capabilities for SpecForge V6.
 * V6.0 focuses on the Diagnose phase; full loop (Propose/Approve/Apply/Verify)
 * is deferred to V6.x (P2).
 *
 * @module @specforge/self-healing
 */

// Re-export core types from internal modules
export type {
  HealingPhase,
  HealingState,
  HealingStateHistoryEntry,
  BlockedStateDetails,
  DiagnosisReportRef,
} from './healing-state'

export type {
  ConfidenceLevel,
  RiskTier,
  EvidenceSource,
  DiagnosticEvidence,
  RecommendedAction,
  DiagnosisReport,
} from './diagnosis-report'

// Re-export factory functions
export {
  createHealingState,
  serializeHealingState,
  deserializeHealingState,
  transitionHealingState,
  getCurrentPhase,
  isBlocked,
  hasReachedIterationLimit,
  getLastHistoryEntry,
  validateHealingStateInvariants,
} from './healing-state'

export {
  createDiagnosisReport,
  createDiagnosticEvidence,
  createRecommendedAction,
  serializeDiagnosisReport,
  deserializeDiagnosisReport,
  validateDiagnosisReport,
  getActionsByRiskTier,
  getDiagnosisReportSummary,
} from './diagnosis-report'

// Core type definitions (for backward compatibility)
export type { HealingPhase as HealingPhaseType } from './healing-state'
export type { RiskTier as RiskTierType } from './diagnosis-report'
export type { ConfidenceLevel as ConfidenceLevelType } from './diagnosis-report'

// Core interfaces
export interface SelfHealingStateMachine {
  /**
   * Trigger a self-healing attempt for a work item
   * @param params - Trigger parameters
   * @returns Trigger result
   */
  trigger(params: {
    workItemId: string;
    triggerType: 'gate_failure' | 'user_request';
    errorType?: string;
    context?: Record<string, unknown>;
  }): Promise<TriggerResult>;

  /**
   * Perform diagnosis analysis for a work item
   * @param workItemId - Work item ID
   * @returns Diagnosis report
   */
  diagnose(workItemId: string): Promise<DiagnosisReport>;

  /**
   * Get current healing state for a work item
   * @param workItemId - Work item ID
   * @returns Current healing state
   */
  getState(workItemId: string): Promise<HealingState>;

  // P2 stub methods (throw "not implemented" in V6.0)
  propose(workItemId: string): Promise<Proposal>;
  approve(workItemId: string, approval: Approval): Promise<void>;
  apply(workItemId: string): Promise<ApplyResult>;
  verify(workItemId: string): Promise<VerifyResult>;
}

// Supporting types for state machine
export interface TriggerResult {
  success: boolean;
  newState: HealingState;
  reason?: string;
}

export interface Proposal {
  schema_version: '1.0';
  workItemId: string;
  actions: RecommendedAction[];
  estimatedImpact: 'low' | 'medium' | 'high';
  rollbackPlan?: string;
}

export interface Approval {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: number;
  comments?: string;
}

export interface ApplyResult {
  success: boolean;
  appliedActions: string[];
  rollbackPointId?: string;
  errors?: string[];
}

export interface VerifyResult {
  success: boolean;
  verifiedAt: number;
  issues?: string[];
  requiresRollback?: boolean;
}

// Built-in allowed error types (V6.0)
export const BUILTIN_ALLOWED_TYPES = [
  'requirements.missing_section',
  'design.missing_section',
  'tasks.missing_section',
  'markdown.format_error',
  'yaml.syntax_error',
  'link.broken_internal',
  'artifact.missing_file',
  'task.dependency_cycle',
] as const

// Built-in excluded error types (never allowed for auto-healing)
export const BUILTIN_EXCLUDED_TYPES = [
  'code.logic_error',
  'permission.access_denied',
  'security.violation',
  'data.loss_risk',
  'network.connectivity',
  'external.resource_required',
] as const

// Configuration types
export interface AllowedListConfig {
  schema_version: '1.0';
  allowedTypes: string[];
  excludedTypes: string[];
  source: 'builtin' | 'user' | 'project';
  mergedFrom?: Array<'builtin' | 'user' | 'project'>;
}

export interface RiskTierRulesConfig {
  schema_version: '1.0';
  rules: Array<{
    id: string;
    pattern: RepairActionPattern;
    tier: 'L1' | 'L2' | 'L3';
    description: string;
    enabled: boolean;
  }>;
}

export interface RepairActionPattern {
  type: 'add' | 'modify' | 'delete';
  target: 'file' | 'section' | 'content';
  scope: 'single' | 'multiple';
  impact: 'cosmetic' | 'behavioral' | 'security';
}

// Event types
export type HealingEventAction = 
  | 'heal.triggered'
  | 'heal.diagnosing'
  | 'heal.diagnosed'
  | 'heal.blocked'
  | 'heal.proposed'    // P2
  | 'heal.approved'    // P2
  | 'heal.applying'    // P2
  | 'heal.applied'     // P2
  | 'heal.verifying'   // P2
  | 'heal.verified'    // P2
  | 'heal.rollback';   // P2

export interface HealingEvent {
  schema_version: '1.0';
  eventId: string;
  ts: number;
  projectId: string;
  workItemId: string;
  actor: AgentIdentity | null;
  category: 'heal';
  action: HealingEventAction;
  payload?: {
    triggerType?: string;
    errorType?: string;
    iteration?: number;
    riskTier?: 'L1' | 'L2' | 'L3';
    diagnosisReportRef?: string;  // blob://<sha256>
    rollbackPointId?: string;     // P2
  };
  payloadBlobRef?: string;  // For large evidence collections
}

export interface AgentIdentity {
  type: 'user' | 'agent' | 'system';
  id: string;
  name?: string;
}

// Utility types
export type BuiltinAllowedType = typeof BUILTIN_ALLOWED_TYPES[number];
export type BuiltinExcludedType = typeof BUILTIN_EXCLUDED_TYPES[number];
