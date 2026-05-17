/**
 * Debug script - exactly mimic what the test does
 */
import * as fc from 'fast-check';
import { StateManager } from './src/state/StateManager';
import { Event } from './src/types';

async function test() {
  const testProjectPath = 'test-project-path';
  const stateManager = new StateManager(testProjectPath);
  await stateManager.initialize();
  
  // Test with the exact counterexample
  const events: Event[] = [
    { 
      eventId: '!', 
      ts: 0, 
      projectId: 'test-project-path', 
      action: 'workItem.updated', 
      payload: { key: '', value: 0 }, 
      metadata: { schemaVersion: '1.0', source: 'daemon' } 
    }
  ];
  
  // Rebuild twice like the test does
  const state1 = await stateManager.rebuildFromEvents(events);
  const state2 = await stateManager.rebuildFromEvents(events);
  
  console.log('state1:', JSON.stringify(state1));
  console.log('state2:', JSON.stringify(state2));
  console.log('state1.lastEventId:', state1.lastEventId, 'type:', typeof state1.lastEventId);
  console.log('state2.lastEventId:', state2.lastEventId, 'type:', typeof state2.lastEventId);
  console.log('state1.lastEventTs:', state1.lastEventTs, 'type:', typeof state1.lastEventTs);
  console.log('state2.lastEventTs:', state2.lastEventTs, 'type:', typeof state2.lastEventTs);
  
  // Now run 100 iterations
  for (let i = 0; i < 100; i++) {
    const s1 = await stateManager.rebuildFromEvents(events);
    const s2 = await stateManager.rebuildFromEvents(events);
    
    if (s1.lastEventId !== s2.lastEventId || s1.lastEventTs !== s2.lastEventTs) {
      console.log(`Iteration ${i} FAILED!`);
      console.log('s1:', JSON.stringify(s1));
      console.log('s2:', JSON.stringify(s2));
      process.exit(1);
    }
  }
  
  console.log('All 100 iterations passed');
}

test().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});