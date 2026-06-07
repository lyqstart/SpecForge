/**
 * AgentWorkflowEngine Module
 * Extends WorkflowEngine with Agent system integration
 */

import { WorkflowEngine, type WorkflowEngineConfig } from '../WorkflowEngine.js';
import { 
  WorkflowDefinition, 
  WorkflowInstance, 
  GateDefinition, 
  GateResult,
  SimpleGateDefinition,
  WorkflowState 
} from '../types.js';
import { 
  WorkflowAgentRunner, 
  createWorkflowAgentRunner,
  type AgentRole 
} from '../AgentRunner.js';
import { AgentGateRunner, createAgentGateRunner } from '../gates/AgentGateRunner.js';

/**
 * AgentWorkflowEngine configuration
 */
export interface AgentWorkflowEngineConfig extends WorkflowEngineConfig {
  agentRunner?: WorkflowAgentRunner;
  defaultAgentRole?: AgentRole;
}

/**
 * AgentWorkflowEngine - Workflow engine with Agent system integration
 * Extends WorkflowEngine to support agent-based gate execution
 */
export class AgentWorkflowEngine extends WorkflowEngine {
  private agentRunner: WorkflowAgentRunner;
  private defaultAgentRole: AgentRole;

  /**
   * Create a new AgentWorkflowEngine
   */
  constructor(config?: AgentWorkflowEngineConfig) {
    super(config);
    this.agentRunner = config?.agentRunner ?? createWorkflowAgentRunner();
    this.defaultAgentRole = config?.defaultAgentRole ?? 'general';
  }

  /**
   * Get the agent runner instance
   */
  getAgentRunner(): WorkflowAgentRunner {
    return this.agentRunner;
  }

  /**
   * Set the agent runner instance
   */
  setAgentRunner(agentRunner: WorkflowAgentRunner): void {
    this.agentRunner = agentRunner;
  }

  /**
   * Get the default agent role
   */
  getDefaultAgentRole(): AgentRole {
    return this.defaultAgentRole;
  }

  /**
   * Set the default agent role
   */
  setDefaultAgentRole(role: AgentRole): void {
    this.defaultAgentRole = role;
  }

  /**
   * Execute a single gate with Agent system integration
   * Overrides parent method to support agent-based gates
   */
  override async executeGate(gate: GateDefinition, state?: WorkflowState): Promise<GateResult> {
    // Check if this state requires agent execution
    if (state && this.shouldUseAgentForState(state)) {
      return this.executeAgentGate(gate as SimpleGateDefinition, state);
    }

    // Fall back to parent implementation for non-agent gates
    return super.executeGate(gate);
  }

  /**
   * Determine if a state should use agent execution
   */
  private shouldUseAgentForState(state: WorkflowState): boolean {
    // Check if state has an agent specified
    if (state.agent && state.agent !== 'none') {
      return true;
    }

    // Check if state has skills that require agents
    if (state.skills && state.skills.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Execute a gate using the Agent system
   */
  private async executeAgentGate(gate: SimpleGateDefinition, state: WorkflowState): Promise<GateResult> {
    // Determine agent role
    const agentRole = this.determineAgentRoleForState(state);

    // Create agent gate runner
    const agentGateRunner = createAgentGateRunner(
      gate,
      this.agentRunner,
      agentRole,
      { state }
    );

    // Get current instance context
    const instance = this.getCurrentInstance();
    const definition = this.getCurrentWorkflow();

    if (!instance || !definition) {
      throw new Error('No active workflow instance or definition found');
    }

    const context = {
      instance,
      definition,
    };

    // Execute agent gate
    return agentGateRunner.check(context);
  }

  /**
   * Determine agent role for a state
   */
  private determineAgentRoleForState(state: WorkflowState): AgentRole {
    // Use state's agent field if specified
    if (state.agent && state.agent !== 'none') {
      return state.agent as AgentRole;
    }

    // Try to determine from state name
    const stateName = this.getStateName(state);
    if (stateName) {
      return WorkflowAgentRunner.determineAgentRole(stateName);
    }

    // Fall back to default
    return this.defaultAgentRole;
  }

  /**
   * Get state name from workflow definition
   */
  private getStateName(state: WorkflowState): string | undefined {
    const definition = this.getCurrentWorkflow();
    if (!definition) {
      return undefined;
    }

    // Find the state in the workflow definition
    for (const [name, stateDef] of Object.entries(definition.stateMachine.states)) {
      if (stateDef === state) {
        return name;
      }
    }

    return undefined;
  }

  /**
   * Get the current workflow instance (helper method)
   */
  private getCurrentInstance(): WorkflowInstance | undefined {
    // This is a simplified implementation
    // In a real implementation, you would track the current instance
    const instances = this.getAllInstances();
    return instances.length > 0 ? instances[0] : undefined;
  }

  /**
   * Get the current workflow definition (helper method)
   */
  private getCurrentWorkflow(): WorkflowDefinition | undefined {
    const instance = this.getCurrentInstance();
    if (!instance) {
      return undefined;
    }
    return this.getWorkflow(instance.workflowId);
  }

  /**
   * Create a specialized gate runner for agent-based gates
   * This can be used by external code to create agent gate runners
   */
  createAgentGateRunner(
    gate: SimpleGateDefinition,
    agentRole?: AgentRole,
    context?: Record<string, unknown>
  ): AgentGateRunner {
    return createAgentGateRunner(
      gate,
      this.agentRunner,
      agentRole ?? this.defaultAgentRole,
      context
    );
  }

  /**
   * Execute workflow with enhanced agent integration
   * Overrides parent method to use agent-based gate execution
   */
  override async execute(instanceId: string): Promise<WorkflowInstance> {
    const instance = this.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Workflow instance not found: ${instanceId}`);
    }

    const definition = this.getWorkflow(instance.workflowId);
    if (!definition) {
      throw new Error(`Workflow definition not found: ${instance.workflowId}`);
    }

    // Update status to running
    instance.status = 'running';
    instance.updatedAt = new Date();

    // Emit workflow started event
    this.emitEvent({
      type: 'workflow.started',
      instanceId: instance.id,
      timestamp: new Date(),
      data: { currentState: instance.currentState },
    });

    // Execute until terminal state or error
    while (instance.status === 'running') {
      const currentStateName = instance.currentState;
      const currentStateDef = definition.stateMachine.states[currentStateName];
      
      if (!currentStateDef) {
        throw new Error(`State not found: ${currentStateName}`);
      }

      // Publish gate started event
      const eventPublisher = this.getEventPublisher();
      if (eventPublisher) {
        eventPublisher.publishGateStarted(
          instance,
          currentStateName,
          currentStateDef.gate.id,
          currentStateDef.gate.type
        );
      }

      // Execute the gate with agent integration
      const gateResult = await this.executeGate(currentStateDef.gate, currentStateDef);

      // Publish gate completed event
      if (eventPublisher) {
        eventPublisher.publishGateCompleted(
          instance,
          currentStateName,
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
        data: { state: currentStateName, gateResult },
      });

      // Determine next state
      const nextState = this.determineNextState(currentStateDef, gateResult);

      if (!nextState) {
        // No more transitions - workflow completed
        instance.status = 'completed';
        instance.updatedAt = new Date();

        // Publish workflow completed event
        if (eventPublisher) {
          eventPublisher.publishWorkflowCompleted(instance, currentStateName);
        }

        this.emitEvent({
          type: 'workflow.completed',
          instanceId: instance.id,
          timestamp: new Date(),
          data: { finalState: currentStateName },
        });
        break;
      }

      // Transition to next state
      const oldState = currentStateName;
      instance.currentState = nextState;
      instance.updatedAt = new Date();

      // Publish state changed event
      if (eventPublisher) {
        eventPublisher.publishStateChanged(instance, oldState, nextState, gateResult.passed);
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
   * Determine the next state based on gate result
   * Re-implemented from parent for compatibility
   */
  protected override determineNextState(
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
}

/**
 * Create a new AgentWorkflowEngine
 */
export function createAgentWorkflowEngine(config?: AgentWorkflowEngineConfig): AgentWorkflowEngine {
  return new AgentWorkflowEngine(config);
}