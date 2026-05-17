/**
 * Integration Example: Adding Event Bus to a New Component
 * 
 * This example demonstrates how to integrate the Event Bus into a new component
 * to achieve Property 2: All cross-layer communication must pass through Event Bus.
 * 
 * **Scenario**: You have a new component (e.g., a custom tool executor) that needs
 * to communicate with other parts of the system via the Event Bus.
 * 
 * **Prerequisites**:
 * - Install @specforge/observability
 * - Understand the Event interface and categories
 */

import { 
  EventBus, 
  Event, 
  EventCategory,
  AgentIdentity 
} from '../src/index';

/**
 * Custom Tool Executor Component
 * 
 * This is an example of a new component that integrates with the Event Bus.
 * All cross-layer communication should go through the Event Bus.
 */
class CustomToolExecutor {
  private eventBus: EventBus;
  private actorId: string;
  private actorName: string;
  
  constructor(eventBus: EventBus, actorId: string = 'custom-executor', actorName: string = 'Custom Executor') {
    this.eventBus = eventBus;
    this.actorId = actorId;
    this.actorName = actorName;
  }
  
  /**
   * Execute a tool and emit events via Event Bus
   */
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const projectId = 'my-project'; // Would typically come from context
    const workItemId = 'workitem-001'; // Would typically come from context
    
    // Emit tool invocation start event
    await this.eventBus.emit({
      projectId,
      workItemId,
      actor: {
        id: this.actorId,
        name: this.actorName,
        type: 'component'
      },
      category: 'tool',
      action: 'tool.invoked',
      payload: {
        toolName,
        args: this.sanitizeArgs(args),
        startTime: Date.now()
      }
    });
    
    try {
      // Execute the actual tool logic
      const result = await this.runTool(toolName, args);
      
      // Emit success event
      await this.eventBus.emit({
        projectId,
        workItemId,
        actor: {
          id: this.actorId,
          name: this.actorName,
          type: 'component'
        },
        category: 'tool',
        action: 'tool.completed',
        payload: {
          toolName,
          result: this.sanitizeResult(result),
          duration: Date.now() - (args.startTime as number || Date.now())
        }
      });
      
      return result;
    } catch (error) {
      // Emit failure event
      await this.eventBus.emit({
        projectId,
        workItemId,
        actor: {
          id: this.actorId,
          name: this.actorName,
          type: 'component'
        },
        category: 'tool',
        action: 'tool.failed',
        payload: {
          toolName,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - (args.startTime as number || Date.now())
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Sanitize arguments to remove sensitive data before logging
   */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ['password', 'token', 'secret', 'apiKey'];
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(args)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeArgs(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize result to avoid logging large data
   */
  private sanitizeResult(result: unknown): unknown {
    if (result === null || result === undefined) {
      return result;
    }
    
    if (typeof result === 'string' && result.length > 1000) {
      return `[String(${result.length} chars)]`;
    }
    
    if (Array.isArray(result) && result.length > 100) {
      return `[Array(${result.length} items)]`;
    }
    
    return result;
  }
  
  /**
   * Placeholder for actual tool execution
   */
  private async runTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    // This would be replaced with actual tool execution logic
    console.log(`Executing tool: ${toolName}`, args);
    return { success: true, toolName };
  }
}

/**
 * Custom Workflow Engine Component
 * 
 * Another example: Integrating Event Bus into a workflow engine.
 */
class CustomWorkflowEngine {
  private eventBus: EventBus;
  private projectId: string;
  
  constructor(eventBus: EventBus, projectId: string) {
    this.eventBus = eventBus;
    this.projectId = projectId;
  }
  
  /**
   * Start a new workflow
   */
  async startWorkflow(workItemId: string, workflowName: string, steps: string[]): Promise<void> {
    // Emit workflow started event
    await this.eventBus.emit({
      projectId: this.projectId,
      workItemId,
      actor: {
        id: 'workflow-engine',
        name: 'Workflow Engine',
        type: 'system'
      },
      category: 'workflow',
      action: 'workflow.started',
      payload: {
        workflowName,
        steps,
        startTime: Date.now()
      }
    });
    
    // Execute workflow steps
    for (let i = 0; i < steps.length; i++) {
      await this.executeStep(workItemId, workflowName, steps[i], i);
    }
    
    // Emit workflow completed event
    await this.eventBus.emit({
      projectId: this.projectId,
      workItemId,
      actor: {
        id: 'workflow-engine',
        name: 'Workflow Engine',
        type: 'system'
      },
      category: 'workflow',
      action: 'workflow.completed',
      payload: {
        workflowName,
        stepsCompleted: steps.length,
        duration: Date.now()
      }
    });
  }
  
  /**
   * Execute a single workflow step
   */
  private async executeStep(workItemId: string, workflowName: string, step: string, index: number): Promise<void> {
    // Emit step started event
    await this.eventBus.emit({
      projectId: this.projectId,
      workItemId,
      actor: {
        id: 'workflow-engine',
        name: 'Workflow Engine',
        type: 'system'
      },
      category: 'workflow',
      action: 'workflow.step.started',
      payload: {
        workflowName,
        step,
        stepIndex: index
      }
    });
    
    // ... execute step logic ...
    
    // Emit step completed event
    await this.eventBus.emit({
      projectId: this.projectId,
      workItemId,
      actor: {
        id: 'workflow-engine',
        name: 'Workflow Engine',
        type: 'system'
      },
      category: 'workflow',
      action: 'workflow.step.completed',
      payload: {
        workflowName,
        step,
        stepIndex: index,
        duration: Math.random() * 1000 // Placeholder
      }
    });
  }
}

/**
 * Integration Example: Subscribing to Events
 * 
 * Your component can also subscribe to events from other components.
 */
class EventMonitor {
  private eventBus: EventBus;
  private subscription: AsyncIterator<Event> | null = null;
  
  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }
  
  /**
   * Start monitoring specific event patterns
   */
  async startMonitoring(): Promise<void> {
    // Subscribe to all workflow events
    const eventIterator = this.eventBus.subscribe('workflow.*');
    
    // Process events in a loop
    (async () => {
      for await (const event of eventIterator) {
        console.log(`Received event: ${event.action}`, {
          projectId: event.projectId,
          workItemId: event.workItemId,
          timestamp: event.ts
        });
        
        // Could perform additional processing, alerts, etc.
      }
    })();
  }
  
  /**
   * Stop monitoring
   */
  async stopMonitoring(): Promise<void> {
    // Would implement cleanup logic
  }
}

/**
 * Main demonstration
 */
async function main() {
  console.log('=== Event Bus Integration Example ===\n');
  
  // Create Event Bus instance
  const eventBus = new EventBus();
  
  // Example 1: Using the Custom Tool Executor
  console.log('1. Custom Tool Executor Integration:');
  const executor = new CustomToolExecutor(eventBus, 'my-tool-executor', 'My Tool Executor');
  
  const result = await executor.executeTool('filesystem-write', {
    path: '/example/file.txt',
    content: 'Hello, World!',
    startTime: Date.now()
  });
  console.log('   Tool result:', result);
  console.log('');
  
  // Example 2: Using the Custom Workflow Engine
  console.log('2. Custom Workflow Engine Integration:');
  const workflow = new CustomWorkflowEngine(eventBus, 'demo-project');
  
  await workflow.startWorkflow('workitem-demo', 'deploy-workflow', [
    'checkout',
    'install-deps',
    'build',
    'test',
    'deploy'
  ]);
  console.log('   Workflow completed');
  console.log('');
  
  // Example 3: Mode considerations
  console.log('3. Mode Considerations:');
  console.log('   Current mode:', eventBus.getMode());
  
  // In minimal mode, only certain events are recorded
  eventBus.setMode('minimal');
  await executor.executeTool('git-clone', { repo: 'https://github.com/example/repo' });
  console.log('   Emitted tool event in minimal mode');
  
  // Switch to standard/deep for more detail
  eventBus.setMode('standard');
  console.log('   Switched to standard mode for more detail');
  console.log('');
  
  console.log('=== Integration Example Complete ===');
  console.log('\nKey Takeaways:');
  console.log('• Always emit events through Event Bus for cross-layer communication');
  console.log('• Include projectId, workItemId, and actor in every event');
  console.log('• Use appropriate action names (e.g., tool.invoked, tool.completed)');
  console.log('• Sanitize sensitive data before including in payloads');
  console.log('• Consider mode implications (minimal mode filters events)');
}

// Run the example
main().catch(console.error);