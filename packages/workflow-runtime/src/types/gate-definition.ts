/**
 * Gate Definition Interface
 * Defines the structure for Gate definitions in workflows
 */

/**
 * Gate execution types (how the gate executes its children)
 */
export type GateType = 'simple' | 'composite';

/**
 * Gate kinds (the workflow stage this gate represents)
 * These correspond to the workflow stages: requirements, design, tasks, verification
 */
export type GateKind = 'requirements' | 'design' | 'tasks' | 'verification';

/**
 * Composite Gate execution modes
 */
export type CompositeGateMode = 'sequential' | 'parallel';

/**
 * Composite Gate failure policies
 */
export type FailPolicy = 'fail_fast' | 'collect_all';

/**
 * Gate configuration
 * Contains gate-specific configuration options
 */
export interface GateConfig {
  /** Optional timeout in milliseconds */
  timeout?: number;
  /** Optional retry count */
  retryCount?: number;
  /** Optional retry delay in milliseconds */
  retryDelay?: number;
  /** Optional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Gate dependencies
 * Defines other gates that must complete before this gate can execute
 */
export interface GateDependency {
  /** The ID of the dependent gate */
  gateId: string;
  /** Whether the dependency must pass (true) or just complete (false) */
  required: boolean;
}

/**
 * Base Gate definition fields
 */
export interface BaseGateDefinition {
  schema_version: "1.0";
  /** Unique identifier for the gate */
  id: string;
  /** Human-readable name */
  name: string;
  /** Gate execution type: simple (single) or composite (multiple children) */
  type: GateType;
  /** Gate kind: the workflow stage this gate represents */
  kind?: GateKind;
  /** Gate configuration */
  config?: GateConfig;
  /** Dependencies on other gates */
  dependencies?: GateDependency[];
}

/**
 * Simple Gate definition
 */
export interface SimpleGateDefinition extends BaseGateDefinition {
  type: 'simple';
  /** Optional check function (for in-line definitions) */
  checkFn?: () => Promise<GateResult> | GateResult;
}

/**
 * Composite Gate definition
 */
export interface CompositeGateDefinition extends BaseGateDefinition {
  type: 'composite';
  /** Execution mode: sequential or parallel */
  mode: CompositeGateMode;
  /** Failure policy */
  failPolicy: FailPolicy;
  /** Child gate definitions */
  children: GateDefinition[];
}

/**
 * Gate result interface (forward declaration)
 * Import from gate-result.ts for actual implementation
 */
export type GateResult = import('./gate-result').GateResult;

/**
 * Union of all Gate definitions
 */
export type GateDefinition = SimpleGateDefinition | CompositeGateDefinition;