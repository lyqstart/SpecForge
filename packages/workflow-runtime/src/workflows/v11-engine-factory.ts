/**
 * v1.1 Workflow Engine Factory
 *
 * Creates a WorkflowEngine pre-loaded with all v1.1 workflow definitions.
 * This is the factory daemon-core should use to get a v1.1-aware engine.
 */

import { WorkflowEngine, type WorkflowEngineConfig } from '../WorkflowEngine.js';
import { V11_WORKFLOW_DEFINITIONS } from './v11-definitions.js';

/**
 * Create a WorkflowEngine with all v1.1 workflow definitions registered.
 *
 * @param config - Optional engine configuration (eventPublisher, onTransition, etc.)
 * @returns A WorkflowEngine ready for v1.1 state transitions
 */
export function createV11WorkflowEngine(config?: WorkflowEngineConfig): WorkflowEngine {
  const engine = new WorkflowEngine(config);

  for (const definition of V11_WORKFLOW_DEFINITIONS) {
    engine.registerDefinition(definition);
  }

  return engine;
}
