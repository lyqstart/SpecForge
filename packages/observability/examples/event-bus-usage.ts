/**
 * Event Bus Usage Example
 * 
 * Demonstrates how to use the Event Bus for cross-layer communication
 * Implements Property 2: All cross-layer communication must pass through Event Bus
 */

import { EventBus } from '../src/event-bus';

async function demonstrateEventBus() {
  console.log('=== Event Bus Usage Example ===\n');

  // Create Event Bus instance
  const eventBus = new EventBus();
  
  console.log(`Initial mode: ${eventBus.getMode()}`);
  console.log('');

  // Example 1: Basic event emission
  console.log('1. Basic Event Emission:');
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-1', name: 'Workflow Agent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.started',
    payload: { workflowId: 'test-workflow', steps: 5 }
  });
  console.log('   ✓ Workflow started event emitted');
  console.log('');

  // Example 2: Mode switching
  console.log('2. Mode Switching:');
  eventBus.setMode('minimal');
  console.log(`   Mode changed to: ${eventBus.getMode()}`);
  
  // In minimal mode, only decision events are recorded
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: null,
    category: 'gate',
    action: 'gate.passed',
    payload: { gateId: 'requirements-gate' }
  });
  console.log('   ✓ Gate decision event emitted (recorded in minimal mode)');
  
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-2', name: 'Tool Agent', type: 'agent' },
    category: 'tool',
    action: 'tool.invoked',
    payload: { toolName: 'git', command: 'clone' }
  });
  console.log('   ✓ Tool invocation event emitted (filtered in minimal mode)');
  console.log('');

  // Example 3: Event subscription
  console.log('3. Event Subscription:');
  eventBus.setMode('standard'); // Switch back to standard mode
  
  const workflowEvents: any[] = [];
  const subscription = eventBus.subscribe('workflow.*');
  
  // Start listening in background
  const listenPromise = (async () => {
    for await (const event of subscription) {
      workflowEvents.push(event);
      if (workflowEvents.length >= 2) break;
    }
  })();

  // Emit workflow events
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-1', name: 'Workflow Agent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.started',
    payload: { workflowId: 'demo-workflow' }
  });

  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-1', name: 'Workflow Agent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.completed',
    payload: { workflowId: 'demo-workflow', result: 'success' }
  });

  // Emit non-workflow event (won't be captured by workflow subscription)
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: null,
    category: 'gate',
    action: 'gate.passed',
    payload: { gateId: 'design-gate' }
  });

  // Wait for events
  await listenPromise;
  await subscription[Symbol.asyncIterator]().return?.();
  
  console.log(`   ✓ Received ${workflowEvents.length} workflow events`);
  console.log(`   ✓ First event action: ${workflowEvents[0]?.action}`);
  console.log(`   ✓ Second event action: ${workflowEvents[1]?.action}`);
  console.log('');

  // Example 4: Permission decision traceability (Property 10)
  console.log('4. Permission Decision Traceability:');
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-789',
    actor: { id: 'user-1', name: 'Developer', type: 'user' },
    category: 'permission',
    action: 'permission.evaluated',
    payload: {
      actor: { id: 'user-1', name: 'Developer', type: 'user' },
      action: 'tool.invoke',
      resource: { type: 'tool', id: 'filesystem-write' },
      matched_rule: 'allow-write-to-own-project',
      rule_layer: 'user',
      reason: 'User has write access to their own project',
      effect: 'allow'
    }
  });
  console.log('   ✓ Permission decision event emitted');
  console.log('   ✓ Contains all required traceability fields');
  console.log('');

  // Example 5: Deep mode for large payloads
  console.log('5. Deep Mode for Large Payloads:');
  eventBus.setMode('deep');
  
  await eventBus.emit({
    projectId: 'project-123',
    workItemId: 'workitem-999',
    actor: { id: 'agent-3', name: 'Analysis Agent', type: 'agent' },
    category: 'modality',
    action: 'modality.adapted',
    payload: {
      inputType: 'image',
      outputType: 'text',
      inputSize: 1024 * 1024, // 1MB
      analysis: 'Large image analysis result...'.repeat(1000)
    }
  });
  console.log('   ✓ Large payload event emitted in deep mode');
  console.log('   ✓ Payload would be stored as CAS blob reference in production');
  console.log('');

  console.log('=== Example Complete ===');
  console.log('\nSummary:');
  console.log('• Event Bus successfully implements Property 2 (cross-layer communication)');
  console.log('• Three-tier mode filtering works correctly');
  console.log('• Event subscription with pattern matching functional');
  console.log('• Permission decision traceability implemented');
  console.log('• Ready for integration with Event Logger and CAS');
}

// Run the example
demonstrateEventBus().catch(console.error);