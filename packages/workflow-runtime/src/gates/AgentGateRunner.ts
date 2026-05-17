/**
 * AgentGateRunner Module
 * Executes Gates that require Agent system integration
 */

import { GateRunner } from '../GateRunner.js';
import { SimpleGateDefinition, GateResult, WorkflowContext } from '../types.js';
import { 
  WorkflowAgentRunner, 
  AgentExecutionContext,
  type AgentRole 
} from '../AgentRunner.js';

/**
 * AgentGateRunner - Executes gates that require Agent system integration
 * Integrates with WorkflowAgentRunner to execute agent-based tasks
 */
export class AgentGateRunner extends GateRunner {
  private agentRunner: WorkflowAgentRunner;
  private agentRole: AgentRole;

  /**
   * Create a new AgentGateRunner
   */
  constructor(
    gate: SimpleGateDefinition,
    agentRunner: WorkflowAgentRunner,
    agentRole: AgentRole = 'general',
    context: Record<string, unknown> = {}
  ) {
    super(gate, context);
    this.agentRunner = agentRunner;
    this.agentRole = agentRole;
  }

  /**
   * Execute the agent-based gate check
   * @param context Optional workflow context for gate execution
   */
  async check(context?: WorkflowContext): Promise<GateResult> {
    try {
      this.validateGate();

      if (!context) {
        return this.handleError(
          new Error('Workflow context is required for AgentGateRunner'),
          'agent_gate_execution'
        );
      }
      // Create agent execution context
      const agentContext: AgentExecutionContext = {
        instance: context.instance,
        definition: context.definition,
        currentState: context.instance.currentState,
        previousState: this.getPreviousState(context),
        gateResult: undefined,
        metadata: this.context,
      };

      // Determine agent role if not explicitly set
      const role = this.agentRole === 'general' 
        ? WorkflowAgentRunner.determineAgentRole(context.instance.currentState)
        : this.agentRole;

      // Create prompt based on gate configuration
      const prompt = this.createAgentPrompt(context);

      // Execute agent
      const agentResult = await this.agentRunner.runAgentForState(
        role,
        this.gate.id,
        prompt,
        agentContext
      );

      // Convert agent result to gate result
      return this.convertAgentResultToGateResult(agentResult);
    } catch (error) {
      return this.handleError(error, 'agent_gate_execution');
    }
  }

  /**
   * Get the previous state from workflow history
   */
  private getPreviousState(context: WorkflowContext): string | undefined {
    if (context.instance.history.length === 0) {
      return undefined;
    }

    // Find the last state change event
    const stateChangeEvents = context.instance.history.filter(
      event => event.type === 'workflow.state_changed'
    );

    if (stateChangeEvents.length === 0) {
      return undefined;
    }

    const lastEvent = stateChangeEvents[stateChangeEvents.length - 1];
    const data = lastEvent.data as { from: string; to: string } | undefined;
    return data?.from;
  }

  /**
   * Create agent prompt based on gate configuration and workflow context
   */
  private createAgentPrompt(context: WorkflowContext): string {
    const gate = this.gate as SimpleGateDefinition;
    
    // Use custom prompt from context if available
    if (this.context.prompt) {
      return String(this.context.prompt);
    }

    // Use gate name as default prompt
    const stateName = context.instance.currentState;
    const workflowName = context.definition.displayName;
    
    return `Execute ${gate.name} for workflow "${workflowName}" in state "${stateName}"`;
  }

  /**
   * Convert agent execution result to gate result
   */
  private convertAgentResultToGateResult(agentResult: any): GateResult {
    if (agentResult.success) {
      return {
        schema_version: '1.0',
        passed: true,
        reason: `Agent execution successful: ${agentResult.output || 'Task completed'}`,
        details: {
          agentResult,
          sessionId: agentResult.sessionId,
          duration: agentResult.duration,
        },
      };
    } else {
      return {
        schema_version: '1.0',
        passed: false,
        reason: `Agent execution failed: ${agentResult.error || 'Unknown error'}`,
        details: {
          agentResult,
          sessionId: agentResult.sessionId,
          error: agentResult.error,
        },
      };
    }
  }

  /**
   * Get the agent runner instance
   */
  getAgentRunner(): WorkflowAgentRunner {
    return this.agentRunner;
  }

  /**
   * Get the agent role
   */
  getAgentRole(): AgentRole {
    return this.agentRole;
  }

  /**
   * Set the agent role
   */
  setAgentRole(role: AgentRole): void {
    this.agentRole = role;
  }
}

/**
 * Factory function to create AgentGateRunner
 */
export function createAgentGateRunner(
  gate: SimpleGateDefinition,
  agentRunner: WorkflowAgentRunner,
  agentRole?: AgentRole,
  context?: Record<string, unknown>
): AgentGateRunner {
  return new AgentGateRunner(gate, agentRunner, agentRole, context);
}