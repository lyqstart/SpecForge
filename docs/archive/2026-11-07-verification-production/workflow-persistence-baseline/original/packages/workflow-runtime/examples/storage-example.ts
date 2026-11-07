/**
 * Workflow Instance Storage Example
 * Demonstrates how to use the workflow instance storage interface
 */

import { createWorkflowInstanceStorage } from '../src/storage/WorkflowInstanceStorage.js';
import type { WorkflowInstance } from '../src/types.js';

async function main() {
  console.log('=== Workflow Instance Storage Example ===\n');

  // Create storage with temporary directory
  const storageDir = './temp-storage-example';
  const storage = createWorkflowInstanceStorage({
    storageDir,
    enableEventReplay: true,
  });

  // Initialize storage
  await storage.initialize();
  console.log(`Storage initialized at: ${storageDir}`);

  // Create a workflow instance
  const instance: WorkflowInstance = {
    schema_version: '1.0',
    id: 'example-instance-1',
    workflowId: 'example-workflow',
    currentState: 'initial',
    status: 'running',
    history: [
      {
        type: 'workflow.created',
        instanceId: 'example-instance-1',
        timestamp: new Date(),
        data: { workflowId: 'example-workflow' },
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // Save the instance
  console.log('\n1. Saving workflow instance...');
  await storage.saveInstance(instance);
  console.log(`   Saved instance: ${instance.id}`);

  // Load the instance
  console.log('\n2. Loading workflow instance...');
  const loaded = await storage.loadInstance(instance.id);
  if (loaded) {
    console.log(`   Loaded instance: ${loaded.id}`);
    console.log(`   Current state: ${loaded.currentState}`);
    console.log(`   Status: ${loaded.status}`);
    console.log(`   Schema version: ${loaded.schema_version}`);
  }

  // Update the instance
  console.log('\n3. Updating workflow instance...');
  if (loaded) {
    loaded.currentState = 'processing';
    loaded.status = 'running';
    loaded.updatedAt = new Date();
    loaded.history.push({
      type: 'workflow.state_changed',
      instanceId: loaded.id,
      timestamp: new Date(),
      data: { from: 'initial', to: 'processing' },
    });

    await storage.saveInstance(loaded);
    console.log(`   Updated instance: ${loaded.id}`);
    console.log(`   New state: ${loaded.currentState}`);
  }

  // List all instances
  console.log('\n4. Listing all instances...');
  const instances = await storage.listInstances();
  console.log(`   Total instances: ${instances.length}`);
  instances.forEach((inst, index) => {
    console.log(`   ${index + 1}. ${inst.id} - ${inst.currentState} (${inst.status})`);
  });

  // Recover state
  console.log('\n5. Recovering instance state...');
  const recovered = await storage.recoverState(instance.id);
  if (recovered) {
    console.log(`   Recovered instance: ${recovered.id}`);
    console.log(`   Current state: ${recovered.currentState}`);
  }

  // Replay events
  console.log('\n6. Replaying events...');
  const replayResult = await storage.replayEvents(instance.id);
  console.log(`   Replayed ${replayResult.replayedEvents} events`);
  console.log(`   Instance state after replay: ${replayResult.instance.currentState}`);

  // Create another instance
  console.log('\n7. Creating another instance...');
  const instance2: WorkflowInstance = {
    schema_version: '1.0',
    id: 'example-instance-2',
    workflowId: 'example-workflow-2',
    currentState: 'initial',
    status: 'pending',
    history: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await storage.saveInstance(instance2);
  console.log(`   Created instance: ${instance2.id}`);

  // List instances again
  const instances2 = await storage.listInstances();
  console.log(`   Total instances now: ${instances2.length}`);

  // Delete an instance
  console.log('\n8. Deleting an instance...');
  const deleted = await storage.deleteInstance(instance2.id, { force: true });
  console.log(`   Deleted instance ${instance2.id}: ${deleted}`);

  // Final list
  const finalInstances = await storage.listInstances();
  console.log(`   Final instance count: ${finalInstances.length}`);

  console.log('\n=== Example completed ===');
  console.log('\nSummary:');
  console.log('- Created workflow instance storage interface');
  console.log('- Implemented save, load, update, delete operations');
  console.log('- Supported instance state recovery and event replay');
  console.log('- All operations include schema_version field (REQ-18)');
}

// Run the example
main().catch(console.error);