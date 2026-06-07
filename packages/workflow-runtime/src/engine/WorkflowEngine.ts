/**
 * Workflow Engine
 * Core engine for loading and executing workflows
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  WorkflowDefinition,
  WorkflowInstance,
  GateDefinition,
  GateResult,
  SimpleGateDefinition,
  CompositeGateDefinition,
} from '../types.js';

export type EventHandler = (event: WorkflowEvent) => void | Promise<void>;

export interface WorkflowEvent {
  type: 'workflow.created' | 'workflow.started' | 'workflow.state_changed' | 'workflow.gate_executed' | 'workflow.completed' | 'workflow.failed';
  instanceId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * v1.1: States that REQUIRE workItemDir for evidence enforcement.
 * Transitioning to any of these states without workItemDir will throw.
 */
const CRITICAL_STATES = new Set([
  'approval_required', 'merge_ready', 'merging', 'post_merge_verified',
  'implementation_ready', 'verification_done', 'closed',
]);

/**
 * v1.1: Check whether a target state requires transition evidence enforcement.
 */
export function requiresTransitionEvidence(targetState: string): boolean {
  return CRITICAL_STATES.has(targetState);
}

/**
 * Workflow Engine
 * Loads workflow definitions and manages workflow instance lifecycle
 */
export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstance> = new Map();
  private eventHandlers: EventHandler[] = [];
  private workItemDir?: string;

  /**
   * Configure the engine with a work item directory for evidence prerequisite checks
   */
  configure(workItemDir: string): void {
    this.workItemDir = workItemDir;
  }

  /**
   * Load a workflow definition into the engine
   * @returns The workflow instance ID (same as workflow definition ID)
   */
  loadWorkflow(definition: WorkflowDefinition): string {
    if (!definition.id) {
      throw new Error('Workflow definition must have an id');
    }
    if (!definition.stateMachine) {
      throw new Error('Workflow definition must have a stateMachine');
    }
    if (!definition.stateMachine.initial) {
      throw new Error('Workflow stateMachine must have an initial state');
    }
    if (!definition.stateMachine.states || Object.keys(definition.stateMachine.states).length === 0) {
      throw new Error('Workflow stateMachine must have at least one state');
    }

    this.workflows.set(definition.id, definition);
    return definition.id;
  }

  /**
   * Get a workflow definition by ID
   */
  getWorkflow(workflowId: string): WorkflowDefinition | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Create a new workflow instance
   */
  createInstance(workflowId: string): WorkflowInstance {
    const definition = this.workflows.get(workflowId);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${workflowId}`);
    }

    const instance: WorkflowInstance = {
      schema_version: '1.0',
      id: uuidv4(),
      workflowId,
      currentState: definition.stateMachine.initial,
      status: 'pending',
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.instances.set(instance.id, instance);

    this.emitEvent({
      type: 'workflow.created',
      instanceId: instance.id,
      timestamp: new Date(),
      data: { workflowId, initialState: instance.currentState },
    });

    return instance;
  }

  /**
   * Get a workflow instance by ID
   */
  getInstance(instanceId: string): WorkflowInstance | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Transition a workflow instance from one state to another
   * @param instanceId The workflow instance ID
   * @param from The current state
   * @param to The target state
   * @returns true if transition was successful, false otherwise
   */
  transition(instanceId: string, from: string, to: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      return false;
    }

    const definition = this.workflows.get(instance.workflowId);
    if (!definition) {
      return false;
    }

    // Validate that 'from' is the current state
    if (instance.currentState !== from) {
      return false;
    }

    // Validate that 'to' is a valid next state
    const currentStateDef = definition.stateMachine.states[instance.currentState];
    if (!currentStateDef) {
      return false;
    }

    // Check if the transition is valid
    if (!this.isValidTransition(currentStateDef, to)) {
      return false;
    }

    // Perform the transition
    instance.currentState = to;
    instance.updatedAt = new Date();

    // Emit state change event
    this.emitEvent({
      type: 'workflow.state_changed',
      instanceId: instance.id,
      timestamp: new Date(),
      data: { from, to },
    });

    return true;
  }

  /**
   * Check if a transition to the target state is valid
   */
  private isValidTransition(stateDef: { next?: string | Record<string, string> }, to: string): boolean {
    if (!stateDef.next) {
      return false;
    }

    if (typeof stateDef.next === 'string') {
      return stateDef.next === to;
    }

    // Dynamic next states (pass/fail branches)
    return Object.values(stateDef.next).includes(to);
  }

  /**
   * Get all workflow instances
   */
  getAllInstances(): WorkflowInstance[] {
    return Array.from(this.instances.values());
  }

  /**
   * Execute a workflow instance
   * Runs from current state until no more transitions
   */
  async execute(instanceId: string, options?: { workItemDir?: string }): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    const definition = this.workflows.get(instance.workflowId);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${instance.workflowId}`);
    }

    // Update status to running
    instance.status = 'running';
    instance.updatedAt = new Date();

    this.emitEvent({
      type: 'workflow.started',
      instanceId: instance.id,
      timestamp: new Date(),
      data: { currentState: instance.currentState },
    });

    // Execute until terminal state or error
    while (instance.status === 'running') {
      const currentStateDef = definition.stateMachine.states[instance.currentState];
      
      if (!currentStateDef) {
        throw new Error(`State not found: ${instance.currentState}`);
      }

      // Execute the gate
      const gateResult = await this.executeGate(currentStateDef.gate);

      // Emit gate execution event
      this.emitEvent({
        type: 'workflow.gate_executed',
        instanceId: instance.id,
        timestamp: new Date(),
        data: { state: instance.currentState, gateResult },
      });

      // Determine next state
      const nextState = this.determineNextState(currentStateDef, gateResult);

      if (!nextState) {
        // No more transitions - workflow completed
        instance.status = 'completed';
        instance.updatedAt = new Date();

        this.emitEvent({
          type: 'workflow.completed',
          instanceId: instance.id,
          timestamp: new Date(),
          data: { finalState: instance.currentState },
        });
        break;
      }

      // Transition to next state
      const oldState = instance.currentState;

      // v1.1: Enforce evidence prerequisites — MANDATORY for critical states
      const wdir = options?.workItemDir ?? this.workItemDir;
      if (CRITICAL_STATES.has(nextState)) {
        if (!wdir) {
          throw new Error(`Cannot transition to '${nextState}': workItemDir is required for critical state transitions`);
        }
        await this.enforceTransitionEvidence(nextState, wdir);
      } else if (wdir) {
        await this.enforceTransitionEvidence(nextState, wdir);
      }

      instance.currentState = nextState;
      instance.updatedAt = new Date();

      this.emitEvent({
        type: 'workflow.state_changed',
        instanceId: instance.id,
        timestamp: new Date(),
        data: { from: oldState, to: nextState },
      });
    }

    return instance;
  }

  /**
   * Execute a single gate and return the result
   */
  async executeGate(gate: GateDefinition): Promise<GateResult> {
    if (gate.type === 'simple') {
      return this.executeSimpleGate(gate);
    } else if (gate.type === 'composite') {
      return this.executeCompositeGate(gate);
    }
    throw new Error(`Unknown gate type: ${(gate as GateDefinition).type}`);
  }

  /**
   * Execute a simple gate
   *
   * CR-4/CR-6: No checkFn — gate cannot verify
   * CR-6 Fix 1: Only required=false auto-waives (severity='soft' no longer auto-waives)
   * v1.1 evidence guard: A gate with severity='soft' but no checkFn must NOT
   * auto-waive — only an explicit required=false allows auto-waiver.
   */
  private async executeSimpleGate(gate: SimpleGateDefinition): Promise<GateResult> {
    if (gate.checkFn) {
      return await gate.checkFn();
    }
    // No checkFn — gate cannot verify
    // v1.1: severity='soft' alone must NOT result in passed=true
    // Only explicitly required=false gates are auto-waived
    if (gate.required === false) {
      return {
        schema_version: '1.0',
        passed: false,
        status: 'not_enabled',
        reason: 'Non-required gate without checkFn — not enabled, no verification performed',
      };
    }
    // All other gates without checkFn (including severity='soft') must fail
    return { schema_version: '1.0', passed: false, reason: 'Required gate has no check function defined — cannot verify, blocked' };
  }

  /**
   * Execute a composite gate
   */
  private async executeCompositeGate(gate: CompositeGateDefinition): Promise<GateResult> {
    const results: GateResult[] = [];

    if (gate.mode === 'sequential') {
      // Sequential execution
      for (const childGate of gate.children) {
        const result = await this.executeGate(childGate);
        results.push(result);

        if (gate.failPolicy === 'fail_fast' && !result.passed) {
          // Fail fast - return immediately on first failure
          return {
            schema_version: '1.0',
            passed: false,
            reason: `Sequential composite gate failed at child gate: ${childGate.id}`,
            details: { results },
          };
        }
      }
    } else {
      // Parallel execution
      const promises = gate.children.map(childGate => this.executeGate(childGate));
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);

      if (gate.failPolicy === 'fail_fast') {
        const failed = results.find(r => !r.passed);
        if (failed) {
          return {
            schema_version: '1.0',
            passed: false,
            reason: `Parallel composite gate failed (fail_fast)`,
            details: { results },
          };
        }
      }
    }

    // Collect all results
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
      return { schema_version: '1.0', passed: true, reason: 'All child gates passed', details: { results } };
    }

    // Some gates failed
    const failedGates = results.filter(r => !r.passed);
    return {
      schema_version: '1.0',
      passed: false,
      reason: `${failedGates.length} of ${gate.children.length} child gates failed`,
      details: { results },
    };
  }

  /**
   * Determine the next state based on gate result
   */
  private determineNextState(
    stateDef: { next?: string | Record<string, string> },
    gateResult: GateResult
  ): string | null {
    if (!stateDef.next) {
      // No next state defined - workflow ends here
      return null;
    }

    if (typeof stateDef.next === 'string') {
      // Static next state
      return stateDef.next;
    }

    // Dynamic next state based on gate result
    if (gateResult.passed && stateDef.next['pass']) {
      return stateDef.next['pass'];
    }
    if (!gateResult.passed && stateDef.next['fail']) {
      return stateDef.next['fail'];
    }

    // Default to no transition if no matching condition
    return null;
  }

  /**
   * Pause a workflow instance
   */
  pause(instanceId: string): WorkflowInstance {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    if (instance.status !== 'running') {
      throw new Error(`Cannot pause workflow instance in status: ${instance.status}`);
    }

    instance.status = 'paused';
    instance.updatedAt = new Date();

    return instance;
  }

  /**
   * Resume a paused workflow instance
   */
  resume(instanceId: string, options?: { workItemDir?: string }): Promise<WorkflowInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    if (instance.status !== 'paused') {
      throw new Error(`Cannot resume workflow instance in status: ${instance.status}`);
    }

    // Resume execution from current state — pass workItemDir through
    return this.execute(instanceId, options);
  }

  /**
   * Subscribe to workflow events
   */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Unsubscribe from workflow events
   */
  offEvent(handler: EventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit an event to all handlers
   */
  private emitEvent(event: WorkflowEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        const result = handler(event);
        if (result instanceof Promise) {
          result.catch(err => console.error('Event handler error:', err));
        }
      } catch (err) {
        console.error('Event handler error:', err);
      }
    }
  }

  /**
   * v1.1: Enforce transition evidence prerequisites.
   * Reads required files from the work item directory and verifies
   * gate/decision STATUS before allowing transitions to specific target states.
   */
  private async enforceTransitionEvidence(targetState: string, workItemDir: string): Promise<void> {
    switch (targetState) {
      case 'approval_required':
        await this.requireFileWithStatus(workItemDir, 'gate_summary.md', undefined);
        await this.requireGateJsonStatus(workItemDir, 'gates/gate_summary_gate.json', 'passed');
        break;
      case 'merge_ready':
        await this.requireUserDecisionApproved(workItemDir);
        break;
      case 'merging':
        await this.requireGateJsonStatus(workItemDir, 'gates/merge_ready_gate.json', 'passed');
        break;
      case 'post_merge_verified':
        await this.requireGateJsonStatus(workItemDir, 'gates/post_merge_gate.json', 'passed');
        break;
      case 'implementation_ready':
        await this.requireFile(workItemDir, 'tasks.md');
        await this.requireAllowedWriteFiles(workItemDir);
        await this.requireGateJsonStatus(workItemDir, 'gates/code_permission_release_gate.json', 'passed');
        break;
      case 'verification_done':
        await this.requireFile(workItemDir, 'verification_report.md');
        await this.requireFile(workItemDir, 'evidence/evidence_manifest.json');
        break;
      case 'closed':
        await this.requireFile(workItemDir, 'changed_files_audit.md');
        await this.requireGateJsonStatus(workItemDir, 'gates/close_gate.json', 'passed');
        break;
    }
  }

  private async requireFile(workItemDir: string, file: string): Promise<void> {
    const fullPath = path.join(workItemDir, file);
    try { await fs.access(fullPath); } catch {
      throw new Error(`Transition evidence prerequisite missing: ${file} (required for target state)`);
    }
  }

  private async requireFileWithStatus(workItemDir: string, file: string, _status: string | undefined): Promise<void> {
    // File existence check — status is checked by gate json
    await this.requireFile(workItemDir, file);
  }

  private async requireGateJsonStatus(workItemDir: string, gateFile: string, expectedStatus: string): Promise<void> {
    const fullPath = path.join(workItemDir, gateFile);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const report = JSON.parse(content);
      if (report.status !== expectedStatus) {
        throw new Error(`Gate ${gateFile} status='${report.status ?? 'undefined'}', expected '${expectedStatus}'`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('status=')) throw err;
      throw new Error(`Transition evidence prerequisite missing: ${gateFile} (required status: ${expectedStatus})`);
    }
  }

  private async requireUserDecisionApproved(workItemDir: string): Promise<void> {
    const fullPath = path.join(workItemDir, 'user_decision.json');
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const ud = JSON.parse(content);
      if (ud.decision_status !== 'approved' && ud.decision_status !== 'waived') {
        throw new Error(`user_decision status='${ud.decision_status ?? 'undefined'}', expected 'approved' or 'waived'`);
      }
      // Check hash not invalidated (if hash field exists)
      if (ud.content_hash && ud.hash_invalidated === true) {
        throw new Error('user_decision content_hash has been invalidated');
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('status=') || err.message.includes('hash'))) throw err;
      throw new Error('Transition evidence prerequisite missing: user_decision.json (required for → merge_ready)');
    }
  }

  private async requireAllowedWriteFiles(workItemDir: string): Promise<void> {
    const fullPath = path.join(workItemDir, 'work_item.json');
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const wi = JSON.parse(content);
      if (!Array.isArray(wi.allowed_write_files) || wi.allowed_write_files.length === 0) {
        throw new Error('work_item.json allowed_write_files is empty or missing');
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('allowed_write_files')) throw err;
      throw new Error('Transition evidence prerequisite missing: work_item.json allowed_write_files');
    }
  }
}