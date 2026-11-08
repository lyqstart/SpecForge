/**
 * Workflow Instance Interface
 * Defines the structure for workflow instances
 */

/**
 * Basic workflow event structure (used in WorkflowInstance history)
 */
export interface WorkflowEventData {
  type: string;
  instanceId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Workflow instance status
 */
export type WorkflowInstanceStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * Workflow instance
 */
export interface WorkflowInstance {
  schema_version: "1.0";
  id: string;
  workflowId: string;
  currentState: string;
  status: WorkflowInstanceStatus;
  history: WorkflowEventData[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  instance: WorkflowInstance;
  definition: import('./workflow-definition').WorkflowDefinition;
}