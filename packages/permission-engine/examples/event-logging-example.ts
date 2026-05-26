/**
 * Example: Permission Event Logging
 * 
 * Demonstrates how the Permission Engine logs permission decisions
 * as required by Property 10: Permission Decision Traceability
 */

import { PermissionEngine } from '../src/index';
import { EventLogger } from '../src/services/event-logger';

async function runExample() {
  console.log('=== Permission Engine Event Logging Example ===\n');

  // Create a permission engine with event logging enabled
  const engine = new PermissionEngine({
    eventLoggingEnabled: true,
    projectId: 'example-project-123',
    strictMode: false
  });

  console.log('1. Testing permission checks with event logging:');
  console.log('-----------------------------------------------');

  // Test 1: Permission denied due to hard rule violation
  console.log('\nTest 1: Hard rule violation (gate bypass attempt)');
  const result1 = await engine.checkPermission(
    'agent-executor-001',
    'gate.bypass',
    { type: 'gate', id: 'main-gate', path: '/gates/main' }
  );
  console.log(`Result: ${result1 ? 'ALLOWED' : 'DENIED'}`);
  
  // Test 2: Permission allowed (no hard rule violation)
  console.log('\nTest 2: Normal file read (should be allowed)');
  const result2 = await engine.checkPermission(
    'agent-reviewer-001',
    'file.read',
    { type: 'file', path: '/tmp/readme.txt', id: 'readme-file' }
  );
  console.log(`Result: ${result2 ? 'ALLOWED' : 'DENIED'}`);

  // Test 3: Another hard rule violation
  console.log('\nTest 3: Verification forgery attempt');
  const result3 = await engine.checkPermission(
    'agent-validator-001',
    'verification.forge',
    { type: 'verification', id: 'signature-verification' },
    { sessionId: 'session-xyz', ipAddress: '192.168.1.100' }
  );
  console.log(`Result: ${result3 ? 'ALLOWED' : 'DENIED'}`);

  console.log('\n2. Testing hard rule conflict detection:');
  console.log('----------------------------------------');

  // Test configuration validation with hard rule conflicts
  const conflictingConfig = {
    rules: [
      { action: 'gate.bypass', resource: '*', effect: 'allow' },
      { action: 'file.read', resource: 'file:/tmp/*', effect: 'allow' }
    ]
  };

  const isValid = await engine.validatePermissionConfig(conflictingConfig);
  console.log(`Configuration valid: ${isValid ? 'YES' : 'NO'}`);

  console.log('\n3. Testing permission denied events (authentication failures):');
  console.log('--------------------------------------------------------------');

  // Log a permission denied event (simulating authentication failure)
  await engine.logPermissionDenied({
    actor: {
      id: 'unknown',
      remoteIdentity: 'openclaw-client-001'
    },
    action: 'tool.execute',
    resource: {
      type: 'tool',
      id: 'dangerous-tool-001'
    },
    reason: 'Missing Bearer Token',
    layer: 'auth',
    details: {
      httpStatus: 401,
      requiredScopes: ['tool.execute'],
      clientIp: '203.0.113.45'
    }
  });

  console.log('\n4. Event Logger Information:');
  console.log('---------------------------');
  
  const eventLogger = engine.getEventLogger();
  console.log(`Event logging enabled: ${eventLogger.isEnabled()}`);
  console.log(`Project ID: ${engine.getConfig().projectId}`);

  // Clean up
  await engine.cleanup();

  console.log('\n=== Example Complete ===');
  console.log('\nAll permission decisions have been logged according to:');
  console.log('- Property 10: Permission Decision Traceability');
  console.log('- Requirement 1.3: Six-field event logging');
  console.log('- Requirement 7.3: Complete decision traceability');
  console.log('\nEvents would be written to: ./specforge/observability/events.jsonl');
}

// Run the example
runExample().catch(console.error);