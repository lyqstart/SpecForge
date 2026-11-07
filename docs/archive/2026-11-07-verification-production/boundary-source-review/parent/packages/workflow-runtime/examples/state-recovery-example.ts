/**
 * State Recovery Example
 * Demonstrates workflow state recovery, consistency validation, and crash recovery
 */

import { createEnhancedWorkflowPersistence } from '../src/WorkflowPersistence.js';
import { createStateRecoveryManager } from '../src/StateRecoveryManager.js';
import { createEventLogReader } from '../src/events/EventLogReader.js';
import type { WorkflowInstance } from '../src/types.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

async function runStateRecoveryExample() {
  console.log('=== State Recovery Mechanism Example ===\n');
  
  // Create temporary directory for this example
  const storageDir = await mkdtemp(join(tmpdir(), 'workflow-example-'));
  console.log(`Using storage directory: ${storageDir}`);
  
  try {
    // 1. Create enhanced persistence with state recovery capabilities
    console.log('\n1. Creating enhanced workflow persistence...');
    const persistence = createEnhancedWorkflowPersistence(storageDir);
    await persistence.initialize();
    
    // 2. Create event log reader
    console.log('2. Creating event log reader...');
    const eventLogReader = createEventLogReader(storageDir);
    await eventLogReader.initialize();
    
    // 3. Create state recovery manager
    console.log('3. Creating state recovery manager...');
    const recoveryManager = createStateRecoveryManager(persistence, eventLogReader, {
      validateConsistency: true,
      repairInconsistencies: true,
      maxRecoveryAttempts: 3,
      enableEventReplay: true,
    });
    
    // 4. Create some workflow instances
    console.log('\n4. Creating workflow instances...');
    
    const instances: WorkflowInstance[] = [
      {
        schema_version: '1.0',
        id: 'instance-1',
        workflowId: 'workflow-a',
        currentState: 'processing',
        status: 'running',
        history: [
          {
            type: 'workflow.created',
            instanceId: 'instance-1',
            timestamp: new Date(Date.now() - 30000),
            data: { workflowId: 'workflow-a' },
          },
          {
            type: 'workflow.started',
            instanceId: 'instance-1',
            timestamp: new Date(Date.now() - 20000),
            data: { state: 'initial' },
          },
          {
            type: 'workflow.state_changed',
            instanceId: 'instance-1',
            timestamp: new Date(Date.now() - 10000),
            data: { from: 'initial', to: 'processing' },
          },
        ],
        createdAt: new Date(Date.now() - 30000),
        updatedAt: new Date(Date.now() - 10000),
      },
      {
        schema_version: '1.0',
        id: 'instance-2',
        workflowId: 'workflow-b',
        currentState: 'review',
        status: 'paused',
        history: [
          {
            type: 'workflow.created',
            instanceId: 'instance-2',
            timestamp: new Date(Date.now() - 25000),
            data: { workflowId: 'workflow-b' },
          },
          {
            type: 'workflow.started',
            instanceId: 'instance-2',
            timestamp: new Date(Date.now() - 20000),
            data: { state: 'initial' },
          },
        ],
        createdAt: new Date(Date.now() - 25000),
        updatedAt: new Date(Date.now() - 20000),
      },
      // Instance with inconsistency (empty current state)
      {
        schema_version: '1.0',
        id: 'instance-3',
        workflowId: 'workflow-c',
        currentState: '', // Inconsistent: empty state
        status: 'running',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    
    // Save instances
    for (const instance of instances) {
      await persistence.saveInstance(instance);
      console.log(`  Saved instance: ${instance.id} (${instance.status})`);
    }
    
    // 5. Add some events to event log
    console.log('\n5. Adding events to event log...');
    await eventLogReader.appendEvent({
      projectId: 'example-project',
      action: 'workflow.started',
      payload: {
        instanceId: 'instance-1',
        workflowId: 'workflow-a',
        state: 'initial',
      },
    });
    
    await eventLogReader.appendEvent({
      projectId: 'example-project',
      action: 'workflow.state_changed',
      payload: {
        instanceId: 'instance-1',
        toState: 'processing',
      },
    });
    
    console.log('  Added 2 events to event log');
    
    // 6. Demonstrate state recovery
    console.log('\n6. Demonstrating state recovery...');
    
    // Recover individual instance
    const recoveredInstance = await recoveryManager.recoverState('instance-1');
    console.log(`  Recovered instance-1: ${recoveredInstance?.currentState} (${recoveredInstance?.status})`);
    
    // 7. Demonstrate consistency validation
    console.log('\n7. Demonstrating consistency validation...');
    
    for (const instance of instances) {
      const validation = await recoveryManager.validateInstanceConsistency(instance);
      console.log(`  Instance ${instance.id}: ${validation.isValid ? 'VALID' : 'INVALID'}`);
      if (!validation.isValid) {
        console.log(`    Inconsistencies: ${validation.inconsistencies.length}`);
        for (const inconsistency of validation.inconsistencies) {
          console.log(`    - ${inconsistency.type}: ${inconsistency.description}`);
        }
      }
    }
    
    // 8. Demonstrate crash recovery
    console.log('\n8. Demonstrating crash recovery...');
    const crashRecoveryResult = await recoveryManager.performCrashRecovery();
    
    console.log(`  Recovered ${crashRecoveryResult.recoveredInstances.length} instances`);
    console.log(`  Failed recoveries: ${crashRecoveryResult.failedRecoveries.length}`);
    console.log(`  Repaired inconsistencies: ${crashRecoveryResult.repairedInconsistencies.length}`);
    console.log(`  Recovery time: ${crashRecoveryResult.recoveryTime}ms`);
    
    // 9. Demonstrate recovery statistics
    console.log('\n9. Recovery statistics:');
    const stats = await recoveryManager.getRecoveryStats();
    console.log(`  Total instances: ${stats.totalInstances}`);
    console.log(`  Running instances: ${stats.runningInstances}`);
    console.log(`  Paused instances: ${stats.pausedInstances}`);
    console.log(`  Failed instances: ${stats.failedInstances}`);
    console.log(`  Inconsistency count: ${stats.inconsistencyCount}`);
    console.log(`  Last recovery time: ${stats.lastRecoveryTime?.toISOString() || 'N/A'}`);
    
    // 10. Demonstrate recovery snapshot
    console.log('\n10. Creating recovery snapshot...');
    const snapshot = await recoveryManager.createRecoverySnapshot();
    console.log(`  Snapshot ID: ${snapshot.snapshotId}`);
    console.log(`  Timestamp: ${snapshot.timestamp.toISOString()}`);
    console.log(`  Instance count: ${snapshot.instanceCount}`);
    console.log(`  Inconsistencies: ${snapshot.inconsistencies.length}`);
    
    // 11. Demonstrate recovery from event log only
    console.log('\n11. Demonstrating recovery from event log only...');
    
    // Add event for an instance that doesn't have a file
    await eventLogReader.appendEvent({
      projectId: 'example-project',
      action: 'workflow.started',
      payload: {
        instanceId: 'event-log-only-instance',
        workflowId: 'workflow-d',
        state: 'initial',
      },
    });
    
    // Try to recover this instance
    const eventLogRecovered = await recoveryManager.recoverState('event-log-only-instance');
    if (eventLogRecovered) {
      console.log(`  Successfully recovered from event log: ${eventLogRecovered.id}`);
      console.log(`    Current state: ${eventLogRecovered.currentState}`);
      console.log(`    Status: ${eventLogRecovered.status}`);
    } else {
      console.log('  Failed to recover from event log');
    }
    
    console.log('\n=== Example completed successfully ===');
    
  } finally {
    // Clean up
    console.log(`\nCleaning up temporary directory: ${storageDir}`);
    await rm(storageDir, { recursive: true, force: true });
  }
}

// Run the example
runStateRecoveryExample().catch(error => {
  console.error('Example failed:', error);
  process.exit(1);
});