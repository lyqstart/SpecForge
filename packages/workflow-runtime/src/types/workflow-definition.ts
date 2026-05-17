/**
 * Workflow Definition Interface
 * Defines the structure for workflow definitions
 */

import type { GateDefinition } from './gate-definition';
import type { WorkflowState } from './state-machine';

/**
 * Artifact definition
 */
export interface ArtifactDefinition {
  id: string;
  type: string;
  content: string;
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