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
} from './types.js';
import { isForbiddenTransitionV11 } from './types/state-machine.js';
import { EventPublisher } from './events/EventPublisher.js';
import {
  WorkflowErrorHandler,
  WorkflowStateManager,
  type RetryConfig,
} from './WorkflowErrorHandling.js';

export type EventHandler = (event: WorkflowEvent) => void | Promise<void>;

export interface WorkflowEvent {
  type: 'workflow.created' | 'workflow.started' | 'workflow.state_changed' | 'workflow.gate_executed' | 'workflow.completed' | 'workflow.failed';
  instanceId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

/**
 * Workflow Engine configuration
 */
export interface WorkflowEngineConfig {
  eventPublisher?: EventPublisher;
  errorHandler?: WorkflowErrorHandler;
  stateManager?: WorkflowStateManager;
  retryConfig?: Partial<RetryConfig>;
  /**
   * Optional callback invoked after every successful state transition.
   * Used by daemon-core to persist state to WAL without creating a
   * circular dependency (workflow-runtime → daemon-core).
   */
  onTransition?: (params: {
    workItemId: string;
    fromState: string;
    toState: string;
    workflowType: string;
    evidence?: string;
    actor?: unknown;
  }) => Promise<void>;
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
 * Public so consumers can query before attempting a transition.
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
  private eventPublisher: EventPublisher | undefined;
  private stateManager: WorkflowStateManager;
  private onTransition?: WorkflowEngineConfig['onTransition'];
  private workItemDir?: string;

  /**
   * Create a new WorkflowEngine
   */
  constructor(config?: WorkflowEngineConfig) {
    this.eventPublisher = config?.eventPublisher ?? undefined;
    this.stateManager = config?.stateManager ?? new WorkflowStateManager();
    this.onTransition = config?.onTransition;
  }

  /**
   * Set the EventPublisher for publishing events to the Event Bus
   */
  setEventPublisher(publisher: EventPublisher): void {
    this.eventPublisher = publisher;
  }

  /**
   * Get the EventPublisher instance
   */
  getEventPublisher(): EventPublisher | undefined {
    return this.eventPublisher;
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

    // Publish event to Event Bus if EventPublisher is configured
    if (this.eventPublisher) {
      this.eventPublisher.publishWorkflowStarted(instance, instance.currentState);
    }

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
   * Transition a workflow instance from one state to another.
   *
   * @deprecated v1.1: This method is retained for backward compatibility with
   * existing tests only. Production code MUST use `transitionFull()` which
   * enforces evidence prerequisites, forbidden-transition checks, WAL
   * persistence, and actor/evidence recording through a single unified entry
   * point. This method:
   *   - Does NOT enforce evidence prerequisites
   *   - Does NOT write to WAL
   *   - Does NOT record actor/evidence
   *   - Throws for all critical states (CRITICAL_STATES)
   *
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

    // v1.1: Block critical state transitions through unsynchronized path
    // Critical states MUST go through transitionFull() which enforces evidence
    if (CRITICAL_STATES.has(to)) {
      throw new Error(`Cannot transition to critical state '${to}' via transition() — use transitionFull() with workItemDir`);
    }

    // Perform the transition
    instance.currentState = to;
    instance.updatedAt = new Date();

    // Publish state changed event to Event Bus if EventPublisher is configured
    if (this.eventPublisher) {
      this.eventPublisher.publishStateChanged(instance, from, to, true);
    }

    // Emit state change event
    this.emitEvent({
      type: 'workflow.state_changed',
      instanceId: instance.id,
      timestamp: new Date(),
      data: { from, to },
    });

    return true;
  }

  registerDefinition(def: WorkflowDefinition): void {
    this.workflows.set(def.id, def);
  }

  async transitionFull(input: {
    workItemId: string;
    fromState: string;
    toState: string;
    evidence?: string;
    workflowType?: string;
    transitionContext?: Record<string, unknown>;
    actor?: unknown;
    /** CR-6 Fix 2: work item directory for evidence prerequisite checks */
    workItemDir?: string;
  }): Promise<{
    workItemId: string;
    previousState: string;
    currentState: string;
    timestamp: string;
  }> {
    const { workItemId, fromState, toState, evidence, workflowType, actor, workItemDir } = input;

    if (fromState === '') {
      // v1.1: WI creation — only allowed to initial state 'created'
      if (toState !== 'created') {
        throw new Error(`Cannot create WI directly to '${toState}' — creation only allowed to 'created' state`);
      }

      const workflowId = workflowType || 'feature_spec';
      const definition = this.workflows.get(workflowId);
      if (!definition) {
        throw new Error(`Unknown workflow type: ${workflowId}`);
      }

      const instance: WorkflowInstance = {
        schema_version: '1.0',
        id: workItemId,
        workflowId,
        currentState: toState,
        status: 'pending',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.instances.set(workItemId, instance);

      this.emitEvent({
        type: 'workflow.created',
        instanceId: workItemId,
        timestamp: new Date(),
        data: { workflowType: workflowId, toState, evidence },
      });

      // Persist new work item creation to WAL
      if (this.onTransition) {
        await this.onTransition({
          workItemId,
          fromState: '',
          toState,
          workflowType: workflowId,
          ...(evidence !== undefined && { evidence }),
          ...(actor !== undefined && { actor }),
        });
      }

      return {
        workItemId,
        previousState: '',
        currentState: toState,
        timestamp: new Date().toISOString(),
      };
    }

    // v1.1 forbidden transition check — enforced before workflow definition validation
    if (isForbiddenTransitionV11(fromState as import('./types/state-machine.js').WIStatusV11, toState)) {
      throw new Error(`Forbidden transition (v1.1): ${fromState} → ${toState}`);
    }

    const instance = this.instances.get(workItemId);
    if (!instance) {
      throw new Error(`Work item not found: ${workItemId}`);
    }

    if (instance.currentState !== fromState) {
      throw new Error(`State mismatch: expected ${fromState}, actual ${instance.currentState}`);
    }

    const definition = this.workflows.get(instance.workflowId);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${instance.workflowId}`);
    }

    const currentStateDef = definition.stateMachine.states[instance.currentState];
    if (!currentStateDef || !this.isValidTransition(currentStateDef, toState)) {
      throw new Error(`Invalid transition: ${instance.currentState} → ${toState}`);
    }

    // v1.1: Enforce evidence prerequisites — MANDATORY for critical states
    if (CRITICAL_STATES.has(toState)) {
      if (!workItemDir) {
        throw new Error(`Cannot transition to '${toState}': workItemDir is required for critical state transitions`);
      }
      await this.enforceTransitionEvidence(toState, workItemDir);
    } else if (workItemDir) {
      await this.enforceTransitionEvidence(toState, workItemDir);
    }

    const previousState = instance.currentState;
    instance.currentState = toState;
    instance.updatedAt = new Date();

    this.emitEvent({
      type: 'workflow.state_changed',
      instanceId: workItemId,
      timestamp: new Date(),
      data: { from: previousState, to: toState, evidence, actor },
    });

    // Persist to WAL via daemon-core callback (WAL-first guarantee)
    if (this.onTransition) {
      await this.onTransition({
        workItemId,
        fromState: previousState,
        toState,
        workflowType: instance.workflowId,
        ...(evidence !== undefined && { evidence }),
        ...(actor !== undefined && { actor }),
      });
    }

    return {
      workItemId,
      previousState,
      currentState: toState,
      timestamp: new Date().toISOString(),
    };
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
   * v1.1: Enforce transition evidence prerequisites.
   * Reads required files from the work item directory and verifies
   * gate/decision STATUS before allowing transitions to specific target states.
   *
   * Upgraded from file-existence-only to actual gate/decision status checks.
   * Public so external consumers (e.g. tests, daemon-core) can call directly.
   */
  async enforceTransitionEvidence(targetState: string, workItemDir: string): Promise<void> {
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

  /**
   * v1.1: Public access to the unified evidence enforcement.
   * Consumers (e.g. tests) can call this directly.
   */
  async enforceTransitionEvidencePublic(targetState: string, workItemDir: string): Promise<void> {
    return this.enforceTransitionEvidence(targetState, workItemDir);
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

      // Handle gate: null gate → auto-pass (no gate to run)
      const hasGate = currentStateDef.gate != null;
      let gateResult: GateResult;

      if (hasGate) {
        // Publish gate started event
        if (this.eventPublisher) {
          this.eventPublisher.publishGateStarted(
            instance,
            instance.currentState,
            currentStateDef.gate!.id,
            currentStateDef.gate!.type
          );
        }

        gateResult = await this.executeGate(currentStateDef.gate!);

        // Publish gate completed event
        if (this.eventPublisher) {
          this.eventPublisher.publishGateCompleted(
            instance,
            instance.currentState,
            currentStateDef.gate!.id,
            currentStateDef.gate!.type,
            gateResult
          );
        }
      } else {
        gateResult = { schema_version: '1.0', passed: true, reason: 'No gate defined' };
      }

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

        // Publish workflow completed event to Event Bus if EventPublisher is configured
        if (this.eventPublisher) {
          this.eventPublisher.publishWorkflowCompleted(instance, instance.currentState);
        }

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

      // Publish state changed event to Event Bus if EventPublisher is configured
      if (this.eventPublisher) {
        this.eventPublisher.publishStateChanged(instance, oldState, nextState, gateResult.passed);
      }

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
   * v1.1 GateResult semantics:
   *   passed=true  → only when a real check function verified and approved
   *   passed=false + status='not_enabled' → gate not configured (required=false, no checkFn)
   *   passed=false + (no status) → gate failed or missing checkFn for required gate
   *
   * For state progression, determineNextState() treats status='not_enabled' as
   * a waivable result that follows the 'pass' branch.
   */
  private async executeSimpleGate(gate: SimpleGateDefinition): Promise<GateResult> {
    if (gate.checkFn) {
      const result = await gate.checkFn();
      // v1.1: Set status if not already set by checkFn
      if (!result.status) {
        result.status = result.passed ? 'passed' : 'failed';
      }
      return result;
    }
    // No checkFn — gate cannot verify
    // v1.1: required=false + no checkFn → not_enabled (NOT passed)
    if (gate.required === false) {
      return {
        schema_version: '1.0',
        passed: false,
        status: 'not_enabled',
        reason: 'Non-required gate without checkFn — not enabled, no verification performed',
      };
    }
    // All other gates without checkFn (including severity='soft') must fail
    return { schema_version: '1.0', passed: false, status: 'blocked', reason: 'Required gate has no check function defined — cannot verify, blocked' };
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

        // v1.1: Only passed=true counts — not_enabled does NOT waive in composite
        if (gate.failPolicy === 'fail_fast' && !result.passed) {
          return {
            schema_version: '1.0',
            passed: false,
            status: 'failed',
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
            status: 'failed',
            reason: `Parallel composite gate failed (fail_fast)`,
            details: { results },
          };
        }
      }
    }

    // v1.1: All child gates must have passed=true — not_enabled does NOT count as passed
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
      return { schema_version: '1.0', passed: true, status: 'passed', reason: 'All child gates passed', details: { results } };
    }

    // Some gates failed or not_enabled
    const failedGates = results.filter(r => !r.passed);
    const notEnabledGates = results.filter(r => r.status === 'not_enabled');
    const summaryParts: string[] = [];
    if (failedGates.length > 0) summaryParts.push(`${failedGates.length} failed`);
    if (notEnabledGates.length > 0) summaryParts.push(`${notEnabledGates.length} not_enabled`);
    return {
      schema_version: '1.0',
      passed: false,
      status: failedGates.some(r => r.status !== 'not_enabled') ? 'failed' : 'not_enabled',
      reason: `${summaryParts.join(', ')} of ${gate.children.length} child gates`,
      details: { results },
    };
  }

  /**
   * Determine the next state based on gate result
   *
   * v1.1 rules:
   *   - No gate + string next → proceed (agent-only states)
   *   - Has gate + { pass, fail } → branch on gateResult
   *   - Has gate + string next + gate passed/waivable → proceed
   *   - Has gate + string next + gate failed → THROW (gate result must be consumed)
   */
  protected determineNextState(
    stateDef: { next?: string | Record<string, string>; gate?: unknown },
    gateResult: GateResult
  ): string | null {
    if (!stateDef.next) {
      // No next state defined - workflow ends here
      return null;
    }

    const hasGate = stateDef.gate != null;
    const isWaivable = gateResult.status === 'not_enabled';
    const gateOk = gateResult.passed || isWaivable;

    if (typeof stateDef.next === 'string') {
      // String next — no branch
      if (hasGate && !gateOk) {
        // v1.1: Gate exists but failed — cannot blindly proceed via string next
        throw new Error(`Gate '${(stateDef.gate as { id?: string }).id ?? 'unknown'}' failed (passed=${gateResult.passed}, status=${gateResult.status ?? 'undefined'}) but state only defines string next — gate result is unconsumed. Use { pass, fail } branching or remove the gate.`);
      }
      // No gate or gate passed → proceed
      return stateDef.next;
    }

    // Dynamic next state based on gate result (object with pass/fail branches)
    if (gateOk && stateDef.next['pass']) {
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
  pause(instanceId: string, reason?: string): WorkflowInstance {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    // Use WorkflowStateManager to pause the instance
    const pausedInstance = this.stateManager.pause(instance, reason);

    // Update our instances map
    this.instances.set(instanceId, pausedInstance);

    // Publish workflow paused event to Event Bus if EventPublisher is configured
    if (this.eventPublisher) {
      this.eventPublisher.publishWorkflowPaused(pausedInstance, reason);
    }

    return pausedInstance;
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

    // Publish workflow resumed event to Event Bus if EventPublisher is configured
    if (this.eventPublisher) {
      this.eventPublisher.publishWorkflowResumed(instance);
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
  protected emitEvent(event: WorkflowEvent): void {
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
}