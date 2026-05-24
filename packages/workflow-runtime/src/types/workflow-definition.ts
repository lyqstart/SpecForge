/**
 * Workflow Definition Interface
 * Defines the structure for workflow definitions
 */

import type { GateDefinition } from './gate-definition';
import type { WorkflowState } from './state-machine';

export type WorkflowKind =
  | 'feature_spec'
  | 'bugfix_spec'
  | 'feature_spec_design_first'
  | 'quick_change'
  | 'change_request'
  | 'refactor'
  | 'ops_task'
  | 'investigation';

export interface GateRef {
  gateName: string;
  tool: string;
}

export interface ArtifactDefinition {
  name: string;
  path: string;
  required: boolean;
}

export interface WorkflowDefinitionFile {
  id: WorkflowKind;
  displayName: string;
  intentKeywords: string[];
  stateMachine: {
    initial: string;
    states: Record<string, {
      agent: string | null;
      skills: string[];
      produces: string | null;
      gate: {
        tool: string;
        composite?: {
          mode: 'sequential' | 'parallel';
          failPolicy: 'fail_fast' | 'collect_all';
          children: GateRef[];
        };
      } | null;
      next: { onPass: string; onFail: string; onBlocked?: string };
      retry?: { maxAttempts: number; onExhausted: 'blocked' | 'debugger' };
    }>;
  };
  artifacts: ArtifactDefinition[];
}

/**
 * Workflow definition
 * Contains all necessary metadata and structure for workflow execution
 */
export interface WorkflowDefinition {
  /** Schema version for serialization compatibility */
  schema_version: "1.0";
  /** Unique identifier for the workflow */
  id: string;
  /** Human-readable name of the workflow */
  name: string;
  /** Version identifier for the workflow definition */
  version: string;
  /** List of gate definitions in the workflow */
  gates: GateDefinition[];
  /** Initial state identifier */
  initialState: string;
  /** Mapping of state IDs to their state definitions */
  states: Record<string, WorkflowState>;
}