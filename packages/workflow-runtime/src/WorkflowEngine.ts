/**
 * Workflow Engine
 * Core engine for loading and executing workflows
 */

import { v4 as uuidv4 } from 'uuid';
import {
  WorkflowDefinition,
  WorkflowInstance,
  GateDefinition,
  GateResult,
  SimpleGateDefinition,
  CompositeGateDefinition,
} from './types.js';
import { EventPublisher } from './events/EventPublisher.js';
import {
  WorkflowErrorHandler,
  WorkflowStateManager,
  GateExecutionError,
  GateErrorType,
  createErrorHandler,
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
  private errorHandler: WorkflowErrorHandler;
  private stateManager: WorkflowStateManager;

  /**
   * Create a new WorkflowEngine
   */
  constructor(config?: WorkflowEngineConfig) {
    this.eventPublisher = config?.eventPublisher ?? undefined;
    this.errorHandler = config?.errorHandler ?? createErrorHandler(config?.retryConfig);
    this.stateManager = config?.stateManager ?? new WorkflowStateManager();
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
  async execute(instanceId: string): Promise<WorkflowInstance> {
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

      // Publish gate started event
      if (this.eventPublisher) {
        this.eventPublisher.publishGateStarted(
          instance,
          instance.currentState,
          currentStateDef.gate.id,
          currentStateDef.gate.type
        );
      }

      // Execute the gate
      const gateResult = await this.executeGate(currentStateDef.gate);

      // Publish gate completed event
      if (this.eventPublisher) {
        this.eventPublisher.publishGateCompleted(
          instance,
          instance.currentState,
          currentStateDef.gate.id,
          currentStateDef.gate.type,
          gateResult
        );
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
   */
  private async executeSimpleGate(gate: SimpleGateDefinition): Promise<GateResult> {
    if (gate.checkFn) {
      return await gate.checkFn();
    }
    // Default pass for gates without check function
    return { schema_version: '1.0', passed: true, reason: 'No check function defined, default pass' };
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
  resume(instanceId: string): Promise<WorkflowInstance> {
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

    // Resume execution from current state
    return this.execute(instanceId);
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
}