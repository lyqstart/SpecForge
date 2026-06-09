/**
 * ExtensionSubflow.ts — SpecForge v1.1 Extension Subflow Orchestration
 *
 * Manages the extension subflow lifecycle:
 * - Detecting extension_request.json and spawning subflow
 * - Defining sf-extension agent interface
 * - Generating extension candidates
 * - Resuming main flow after extension registration
 *
 * Requirements: 5.12, 5.13, 5.14, 5.23, 5.24, 5.25
 */

import type { ExtensionRegistryData, ExtensionRequestData } from './ExtensionRegistry.js';

// ---- Types ----

/** Extension subflow state */
export type ExtensionSubflowState =
  | 'not_started'
  | 'requested'
  | 'agent_spawned'
  | 'candidate_generated'
  | 'gate_running'
  | 'gate_passed'
  | 'approved'
  | 'merged'
  | 'completed'
  | 'rejected';

/** Extension candidate produced by sf-extension agent */
export interface ExtensionCandidate {
  schema_version: '1.0';
  work_item_id: string;
  extension_delta_md: string;
  extension_registry_update: Partial<ExtensionRegistryData>;
  generated_at: string;
}

/** Extension agent context passed to sf-extension agent */
export interface ExtensionAgentContext {
  work_item_id: string;
  requested_types: ExtensionRequestData['requested_types'];
  current_registry: ExtensionRegistryData;
  usage_context: string;
}

/** Result of flow resumption check */
export interface FlowResumptionResult {
  canResume: boolean;
  newTypesRegistered: string[];
  errors: string[];
}

// ---- Extension Subflow Scheduler (Task 26.1) ----

/**
 * ExtensionSubflowScheduler — detects extension requests and manages subflow.
 * Requirements: 5.12
 */
export class ExtensionSubflowScheduler {
  private state: ExtensionSubflowState = 'not_started';
  private readonly workItemId: string;
  private currentRequest: ExtensionRequestData | null = null;
  private candidate: ExtensionCandidate | null = null;

  constructor(workItemId: string) {
    this.workItemId = workItemId;
  }

  /** Get current subflow state */
  getState(): ExtensionSubflowState {
    return this.state;
  }

  /** Get current extension request */
  getCurrentRequest(): ExtensionRequestData | null {
    return this.currentRequest;
  }

  /** Get generated candidate */
  getCandidate(): ExtensionCandidate | null {
    return this.candidate;
  }

  /**
   * Detect and start extension subflow from an extension_request.json.
   * Requirement: 5.12
   */
  startSubflow(request: ExtensionRequestData): { started: boolean; error?: string | undefined } {
    if (this.state !== 'not_started') {
      return { started: false, error: `Subflow already in state: ${this.state}` };
    }

    if (request.requested_types.length === 0) {
      return { started: false, error: 'Extension request has no requested types' };
    }

    if (request.work_item_id !== this.workItemId) {
      return { started: false, error: `Work item ID mismatch: expected ${this.workItemId}, got ${request.work_item_id}` };
    }

    this.currentRequest = request;
    this.state = 'requested';
    return { started: true };
  }

  /**
   * Spawn sf-extension agent to handle the extension request.
   * Requirement: 5.12
   */
  spawnAgent(registry: ExtensionRegistryData): ExtensionAgentContext {
    if (this.state !== 'requested' || !this.currentRequest) {
      throw new Error(`Cannot spawn agent in state: ${this.state}`);
    }

    this.state = 'agent_spawned';

    return {
      work_item_id: this.workItemId,
      requested_types: this.currentRequest.requested_types,
      current_registry: registry,
      usage_context: this.currentRequest.requested_types
        .map((t) => `${t.type_id} in ${t.namespace}`)
        .join(', '),
    };
  }

  /**
   * Receive extension candidate from sf-extension agent.
   * Requirements: 5.12, 5.13, 5.14
   */
  receiveCandidate(candidate: ExtensionCandidate): { accepted: boolean; error?: string | undefined } {
    if (this.state !== 'agent_spawned') {
      return { accepted: false, error: `Cannot receive candidate in state: ${this.state}` };
    }

    // Validate candidate has required fields
    if (!candidate.extension_delta_md || candidate.extension_delta_md.trim().length === 0) {
      return { accepted: false, error: 'Candidate missing extension_delta_md' };
    }

    if (!candidate.extension_registry_update || !candidate.extension_registry_update.namespaces) {
      return { accepted: false, error: 'Candidate missing extension_registry_update' };
    }

    this.candidate = candidate;
    this.state = 'candidate_generated';
    return { accepted: true };
  }

  /**
   * Transition to gate running state.
   */
  startGateValidation(): void {
    if (this.state !== 'candidate_generated') {
      throw new Error(`Cannot start gate in state: ${this.state}`);
    }
    this.state = 'gate_running';
  }

  /**
   * Record gate result.
   */
  recordGateResult(passed: boolean): void {
    this.state = passed ? 'gate_passed' : 'rejected';
  }

  /**
   * Record user approval.
   */
  recordApproval(): void {
    if (this.state !== 'gate_passed') {
      throw new Error(`Cannot approve in state: ${this.state}`);
    }
    this.state = 'approved';
  }

  /**
   * Record merge completion.
   */
  recordMerge(): void {
    if (this.state !== 'approved') {
      throw new Error(`Cannot merge in state: ${this.state}`);
    }
    this.state = 'merged';
  }

  /**
   * Complete the subflow.
   */
  complete(): void {
    this.state = 'completed';
  }
}

// ---- sf-extension Agent Interface (Task 26.2) ----

/**
 * ExtensionAgent — defines the interface for the sf-extension agent.
 * In production, this would be a separate process/agent.
 * Here we provide the contract and a simulation for testing.
 *
 * Requirements: 5.12, 5.13, 5.14
 */
export class ExtensionAgent {
  /**
   * Generate an extension candidate from the given context.
   * The real agent would:
   * 1. Analyze the type usage context
   * 2. Generate extension_delta.md describing the new type
   * 3. Generate extension_registry_update with the new type definition
   * 4. Submit the candidate back to the Runtime
   *
   * Requirements: 5.13, 5.14
   */
  generateCandidate(context: ExtensionAgentContext): ExtensionCandidate {
    const namespaces = { ...context.current_registry.namespaces };

    // Register each requested type in its namespace
    for (const type of context.requested_types) {
      const ns = type.namespace as keyof typeof namespaces;
      if (namespaces[ns] && !namespaces[ns].includes(type.type_id)) {
        namespaces[ns] = [...namespaces[ns], type.type_id];
      }
    }

    // Generate extension delta markdown
    const deltaLines = [
      '# Extension Delta',
      '',
      `**Work Item**: ${context.work_item_id}`,
      `**Generated At**: ${new Date().toISOString()}`,
      '',
      '## New Types',
      '',
    ];

    for (const type of context.requested_types) {
      deltaLines.push(`### ${type.type_id}`);
      deltaLines.push(`- **Namespace**: ${type.namespace}`);
      deltaLines.push(`- **Context**: ${type.usage_context}`);
      deltaLines.push('');
    }

    return {
      schema_version: '1.0',
      work_item_id: context.work_item_id,
      extension_delta_md: deltaLines.join('\n'),
      extension_registry_update: {
        namespaces,
        updated_by_work_item: context.work_item_id,
        updated_at: new Date().toISOString(),
      },
      generated_at: new Date().toISOString(),
    };
  }
}

// ---- Flow Resumption (Task 28.1) ----

/**
 * FlowResumption — handles resuming the main flow after extension registration.
 * Requirements: 5.23, 5.24, 5.25
 */
export class FlowResumption {
  /**
   * Check if the main flow can be resumed after extension merge.
   * Requirements: 5.23, 5.24
   */
  canResumeMainFlow(params: {
    extensionSubflowState: ExtensionSubflowState;
    registry: ExtensionRegistryData;
    previouslyUnknownTypes: Array<{ namespace: string; typeId: string }>;
  }): FlowResumptionResult {
    const errors: string[] = [];
    const newTypesRegistered: string[] = [];

    // Requirement 5.23: Extension subflow must be completed
    if (params.extensionSubflowState !== 'completed' && params.extensionSubflowState !== 'merged') {
      errors.push(`Extension subflow not completed: state is ${params.extensionSubflowState}`);
    }

    // Requirement 5.24: Reload Extension Registry and verify types registered
    for (const type of params.previouslyUnknownTypes) {
      const ns = type.namespace as keyof typeof params.registry.namespaces;
      const registered = params.registry.namespaces[ns];
      if (registered && registered.includes(type.typeId)) {
        newTypesRegistered.push(type.typeId);
      } else {
        errors.push(`Type '${type.typeId}' not registered in namespace '${type.namespace}' after extension merge`);
      }
    }

    return {
      canResume: errors.length === 0,
      newTypesRegistered,
      errors,
    };
  }

  /**
   * Create agent regeneration request for artifacts using new types.
   * Requirement: 5.25
   */
  createRegenerationRequest(params: {
    workItemId: string;
    newTypes: string[];
    artifactTypes: string[];
  }): {
    work_item_id: string;
    message: string;
    types_to_use: string[];
    target_artifacts: string[];
  } {
    return {
      work_item_id: params.workItemId,
      message: `Extension types registered. Please regenerate artifacts using new types: ${params.newTypes.join(', ')}`,
      types_to_use: params.newTypes,
      target_artifacts: params.artifactTypes,
    };
  }
}
