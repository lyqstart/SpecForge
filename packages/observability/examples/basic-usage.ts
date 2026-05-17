/**
 * Basic usage example for @specforge/observability
 */

import { EventBus, CAS, EventLogger, QueryAPI, AnalystEngine, ModeSwitch } from '../src/index';

async function main() {
  console.log('=== SpecForge Observability Module Demo ===\n');

  // Initialize components
  const eventBus = new EventBus();
  const cas = new CAS();
  const eventLogger = new EventLogger();
  const queryAPI = new QueryAPI();
  const analystEngine = new AnalystEngine();
  const modeSwitch = new ModeSwitch();

  console.log('1. Mode Configuration:');
  console.log(`   Current mode: ${modeSwitch.getMode()}`);
  
  // Switch to minimal mode
  modeSwitch.setMode('minimal');
  console.log(`   Switched to: ${modeSwitch.getMode()}`);

  // Switch back to standard mode
  modeSwitch.setMode('standard');
  console.log(`   Switched to: ${modeSwitch.getMode()}\n`);

  console.log('2. Event Bus Demo:');
  await eventBus.emit({
    schema_version: '1.0',
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-1', name: 'Test Agent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.started',
    payload: { workflowName: 'test-workflow', version: '1.0' }
  });

  console.log('\n3. CAS Demo:');
  const content = 'Hello, Observability!';
  const blobRef = await cas.store(content);
  console.log(`   Stored content: "${content}"`);
  console.log(`   Blob reference: ${blobRef}`);

  console.log('\n4. Event Logger Demo:');
  await eventLogger.append({
    schema_version: '1.0',
    eventId: 'demo-event-1',
    ts: Date.now() * 1000000,
    monotonicSeq: 1,
    projectId: 'project-123',
    workItemId: 'workitem-456',
    actor: { id: 'agent-1', name: 'Test Agent', type: 'agent' },
    category: 'workflow',
    action: 'workflow.completed',
    payload: { result: 'success', duration: 1500 }
  });

  console.log('\n5. Query API Demo:');
  const events = await queryAPI.queryEvents({
    projectId: 'project-123',
    limit: 5
  });
  console.log(`   Found ${events.length} events`);

  console.log('\n6. Analyst Engine Demo:');
  const analysis = await analystEngine.analyzeGateFailures('workitem-456', {
    start: Date.now() - 3600000,
    end: Date.now()
  });
  console.log(`   Analyzed scenario: ${analysis.scenario}`);
  console.log(`   Confidence: ${analysis.confidence}`);

  console.log('\n=== Demo Complete ===');
}

// Run the demo
main().catch(console.error);