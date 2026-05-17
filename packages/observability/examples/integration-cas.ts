/**
 * Integration Example: CAS Integration for Large Payloads
 * 
 * This example demonstrates how to use the Content-Addressable Storage (CAS)
 * to efficiently handle large payloads in the observability system.
 * 
 * **Prerequisites**:
 * - Install @specforge/observability
 * - Understand the three-tier mode system
 */

import { 
  CAS, 
  EventLogger, 
  EventBus,
  ModeSwitch,
  Event 
} from '../src/index';

/**
 * Example: Large Payload Handler
 * 
 * Automatically handles large payloads by storing them in CAS
 * and creating blob references in events.
 */
class LargePayloadHandler {
  private cas: CAS;
  private eventLogger: EventLogger;
  private threshold: number; // Default 64 KiB
  
  constructor(cas: CAS, eventLogger: EventLogger, threshold: number = 64 * 1024) {
    this.cas = cas;
    this.eventLogger = eventLogger;
    this.threshold = threshold;
  }
  
  /**
   * Store an event, automatically handling large payloads via CAS
   */
  async storeEvent(event: Event): Promise<Event> {
    // Check if payload exceeds threshold
    if (event.payload && typeof event.payload === 'string') {
      const payloadSize = Buffer.byteLength(event.payload, 'utf8');
      
      if (payloadSize > this.threshold) {
        // Store large payload in CAS
        const blobRef = await this.cas.store(event.payload);
        
        return {
          ...event,
          payload: undefined,
          payloadBlobRef: blobRef
        };
      }
    }
    
    // Payload is small enough, store inline
    return event;
  }
  
  /**
   * Retrieve an event, automatically fetching large payloads from CAS
   */
  async retrieveEvent(event: Event): Promise<Event & { payload?: unknown }> {
    // Check if there's a blob reference
    if (event.payloadBlobRef) {
      const content = await this.cas.retrieve(event.payloadBlobRef);
      return {
        ...event,
        payload: content
      };
    }
    
    return event;
  }
  
  /**
   * Check if a payload would be stored in CAS
   */
  shouldUseCAS(payload: unknown): boolean {
    if (!payload) return false;
    
    const payloadStr = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
    
    return Buffer.byteLength(payloadStr, 'utf8') > this.threshold;
  }
}

/**
 * Example: Session Data Handler
 * 
 * Specialized handler for session data (prompts, responses)
 * which can be very large.
 */
class SessionDataHandler {
  private cas: CAS;
  private eventLogger: EventLogger;
  
  constructor(cas: CAS, eventLogger: EventLogger) {
    this.cas = cas;
    this.eventLogger = eventLogger;
  }
  
  /**
   * Store session data with automatic CAS handling
   */
  async storeSessionEvent(
    projectId: string,
    workItemId: string,
    sessionId: string,
    prompt: string,
    response: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // Store large prompt in CAS if needed
    let promptBlobRef: string | undefined;
    if (prompt.length > 64 * 1024) {
      promptBlobRef = await this.cas.store(prompt);
    }
    
    // Store large response in CAS if needed
    let responseBlobRef: string | undefined;
    if (response.length > 64 * 1024) {
      responseBlobRef = await this.cas.store(response);
    }
    
    // Create event with blob references for large data
    await this.eventLogger.append({
      schema_version: '1.0',
      eventId: `session-${sessionId}-${Date.now()}`,
      ts: Date.now() * 1_000_000,
      monotonicSeq: 0,
      projectId,
      workItemId,
      actor: { id: 'session-handler', name: 'Session Handler', type: 'system' },
      category: 'session',
      action: 'session.completed',
      payload: {
        sessionId,
        promptLength: prompt.length,
        responseLength: response.length,
        metadata
      },
      payloadBlobRef: responseBlobRef // Main content reference
    });
    
    // Also store prompt reference if separate
    if (promptBlobRef) {
      await this.eventLogger.append({
        schema_version: '1.0',
        eventId: `session-${sessionId}-prompt`,
        ts: Date.now() * 1_000_000 + 1,
        monotonicSeq: 1,
        projectId,
        workItemId,
        actor: { id: 'session-handler', name: 'Session Handler', type: 'system' },
        category: 'session',
        action: 'session.prompt.stored',
        payload: { sessionId, promptLength: prompt.length },
        payloadBlobRef: promptBlobRef
      });
    }
  }
  
  /**
   * Retrieve full session data
   */
  async getFullSession(sessionId: string, projectId: string): Promise<{
    prompt: string | null;
    response: string | null;
    metadata: Record<string, unknown>;
  } | null> {
    // Query for session events
    const events = await this.eventLogger.getEvents({
      projectId,
      action: 'session.completed'
    });
    
    let prompt: string | null = null;
    let response: string | null = null;
    let metadata: Record<string, unknown> = {};
    
    for await (const event of events) {
      if ((event.payload as any)?.sessionId === sessionId) {
        metadata = (event.payload as any)?.metadata || {};
        
        // Retrieve response from CAS if blob ref exists
        if (event.payloadBlobRef) {
          response = await this.cas.retrieve(event.payloadBlobRef) as string;
        }
      }
    }
    
    // Try to find prompt
    const promptEvents = await this.eventLogger.getEvents({
      projectId,
      action: 'session.prompt.stored'
    });
    
    for await (const event of promptEvents) {
      if ((event.payload as any)?.sessionId === sessionId && event.payloadBlobRef) {
        prompt = await this.cas.retrieve(event.payloadBlobRef) as string;
        break;
      }
    }
    
    return { prompt, response, metadata };
  }
}

/**
 * Example: Artifact Storage Handler
 * 
 * Handles large artifacts like generated files, images, etc.
 */
class ArtifactStorageHandler {
  private cas: CAS;
  private eventLogger: EventLogger;
  
  constructor(cas: CAS, eventLogger: EventLogger) {
    this.cas = cas;
    this.eventLogger = eventLogger;
  }
  
  /**
   * Store a large artifact
   */
  async storeArtifact(
    projectId: string,
    workItemId: string,
    artifactId: string,
    artifactType: string,
    content: Uint8Array | string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    // Store in CAS
    const blobRef = await this.cas.store(content);
    
    // Log storage event
    await this.eventLogger.append({
      schema_version: '1.0',
      eventId: `artifact-${artifactId}`,
      ts: Date.now() * 1_000_000,
      monotonicSeq: 0,
      projectId,
      workItemId,
      actor: { id: 'artifact-handler', name: 'Artifact Handler', type: 'system' },
      category: 'system',
      action: 'artifact.stored',
      payload: {
        artifactId,
        artifactType,
        size: typeof content === 'string' ? content.length : content.length,
        metadata
      },
      payloadBlobRef: blobRef
    });
    
    return blobRef;
  }
  
  /**
   * Retrieve an artifact
   */
  async retrieveArtifact(blobRef: string): Promise<Uint8Array | string | null> {
    return this.cas.retrieve(blobRef);
  }
  
  /**
   * Check if artifact exists
   */
  async artifactExists(blobRef: string): Promise<boolean> {
    return this.cas.exists(blobRef);
  }
}

/**
 * Example: CAS with Mode Switching
 * 
 * Demonstrates how CAS integrates with the three-tier mode system.
 */
class ModeAwareCASHandler {
  private cas: CAS;
  private eventLogger: EventLogger;
  private modeSwitch: ModeSwitch;
  
  constructor(cas: CAS, eventLogger: EventLogger, modeSwitch: ModeSwitch) {
    this.cas = cas;
    this.eventLogger = eventLogger;
    this.modeSwitch = modeSwitch;
  }
  
  /**
   * Store event with mode-aware payload handling
   */
  async storeModeAwareEvent(
    projectId: string,
    workItemId: string,
    category: string,
    action: string,
    payload: unknown
  ): Promise<void> {
    const mode = this.modeSwitch.getMode();
    let finalPayload = payload;
    let blobRef: string | undefined;
    
    // In minimal mode, don't store payload at all
    if (mode === 'minimal') {
      finalPayload = { _mode: 'minimal', _filtered: true };
    }
    // In standard mode, store large payloads in CAS
    else if (mode === 'standard') {
      const payloadStr = JSON.stringify(payload);
      if (payloadStr.length > 64 * 1024) {
        blobRef = await this.cas.store(payloadStr);
        finalPayload = { _mode: 'standard', _storedInCAS: true };
      }
    }
    // In deep mode, always store in CAS
    else if (mode === 'deep') {
      const payloadStr = JSON.stringify(payload);
      blobRef = await this.cas.store(payloadStr);
      finalPayload = { _mode: 'deep', _storedInCAS: true };
    }
    
    await this.eventLogger.append({
      schema_version: '1.0',
      eventId: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ts: Date.now() * 1_000_000,
      monotonicSeq: 0,
      projectId,
      workItemId,
      actor: { id: 'mode-handler', name: 'Mode Handler', type: 'system' },
      category: category as any,
      action,
      payload: finalPayload,
      payloadBlobRef: blobRef
    });
  }
}

/**
 * Main demonstration
 */
async function main() {
  console.log('=== CAS Integration Example ===\n');
  
  // Initialize components
  const cas = new CAS();
  const eventLogger = new EventLogger();
  await eventLogger.initialize();
  const eventBus = new EventBus();
  const modeSwitch = new ModeSwitch();
  
  // Example 1: Basic CAS usage
  console.log('1. Basic CAS Usage:');
  
  // Store some content
  const smallContent = 'Hello, World!';
  const smallRef = await cas.store(smallContent);
  console.log(`   Stored small content: ${smallRef}`);
  
  // Retrieve it
  const retrieved = await cas.retrieve(smallRef);
  console.log(`   Retrieved: ${retrieved}`);
  
  // Check if exists
  const exists = await cas.exists(smallRef);
  console.log(`   Exists: ${exists}`);
  console.log('');
  
  // Example 2: Large payload handling
  console.log('2. Large Payload Handler:');
  const handler = new LargePayloadHandler(cas, eventLogger);
  
  const largePayload = 'x'.repeat(100000); // 100KB
  console.log(`   Payload size: ${largePayload.length} bytes`);
  console.log(`   Should use CAS: ${handler.shouldUseCAS(largePayload)}`);
  
  const testEvent: Event = {
    schema_version: '1.0',
    eventId: 'test-event',
    ts: Date.now() * 1_000_000,
    monotonicSeq: 0,
    projectId: 'demo',
    workItemId: 'work-1',
    actor: { id: 'test', name: 'Test', type: 'agent' },
    category: 'test',
    action: 'test.action',
    payload: largePayload
  };
  
  const storedEvent = await handler.storeEvent(testEvent);
  console.log(`   Has blob ref: ${!!storedEvent.payloadBlobRef}`);
  console.log('');
  
  // Example 3: Session data handling
  console.log('3. Session Data Handler:');
  const sessionHandler = new SessionDataHandler(cas, eventLogger);
  
  const longPrompt = 'System: You are a helpful assistant.\n\n' + 'User: '.repeat(10000);
  const longResponse = 'Here is a detailed response...\n'.repeat(5000);
  
  await sessionHandler.storeSessionEvent(
    'demo-project',
    'workitem-1',
    'session-123',
    longPrompt,
    longResponse,
    { model: 'claude-3', tokens: 15000 }
  );
  console.log('   Stored large session data');
  
  // Retrieve it
  const session = await sessionHandler.getFullSession('session-123', 'demo-project');
  console.log(`   Retrieved prompt length: ${session?.prompt?.length || 0}`);
  console.log(`   Retrieved response length: ${session?.response?.length || 0}`);
  console.log('');
  
  // Example 4: Artifact storage
  console.log('4. Artifact Storage:');
  const artifactHandler = new ArtifactStorageHandler(cas, eventLogger);
  
  // Simulate a large generated file
  const generatedCode = `
// Generated code file
function main() {
  ${Array(1000).fill('  console.log("line");').join('\n')}
}
  `.repeat(100);
  
  const artifactRef = await artifactHandler.storeArtifact(
    'demo-project',
    'workitem-1',
    'generated-main-js',
    'javascript',
    generatedCode,
    { generatedAt: Date.now(), source: 'code-generator' }
  );
  console.log(`   Stored artifact: ${artifactRef}`);
  
  // Retrieve it
  const retrievedArtifact = await artifactHandler.retrieveArtifact(artifactRef);
  console.log(`   Retrieved size: ${(retrievedArtifact as string).length} bytes`);
  console.log('');
  
  // Example 5: Mode-aware handling
  console.log('5. Mode-Aware CAS Handler:');
  const modeHandler = new ModeAwareCASHandler(cas, eventLogger, modeSwitch);
  
  // Test with different modes
  for (const mode of ['minimal', 'standard', 'deep'] as const) {
    modeSwitch.setMode(mode);
    const testPayload = { data: 'x'.repeat(100000), timestamp: Date.now() };
    
    await modeHandler.storeModeAwareEvent(
      'demo-project',
      'workitem-mode',
      'test',
      'test.event',
      testPayload
    );
    console.log(`   Mode '${mode}': Event stored successfully`);
  }
  console.log('');
  
  // Example 6: CAS statistics
  console.log('6. CAS Statistics:');
  // Note: In a real implementation, CAS would track these metrics
  console.log('   Total stored items: ~5');
  console.log('   Total storage size: ~500KB (estimated)');
  console.log('');
  
  // Example 7: Deleting from CAS
  console.log('7. CAS Delete:');
  const tempRef = await cas.store('Temporary data to delete');
  console.log(`   Created temporary blob: ${tempRef}`);
  
  const tempExistsBefore = await cas.exists(tempRef);
  console.log(`   Exists before delete: ${tempExistsBefore}`);
  
  await cas.delete(tempRef);
  
  const tempExistsAfter = await cas.exists(tempRef);
  console.log(`   Exists after delete: ${tempExistsAfter}`);
  console.log('');
  
  console.log('=== CAS Integration Example Complete ===');
  console.log('\nKey Takeaways:');
  console.log('• CAS efficiently stores large content with content-addressable references');
  console.log('• Large payloads (>64KB) are automatically stored in CAS');
  console.log('• Three-tier mode system determines when to use CAS');
  console.log('• CAS blob references follow format: "blob://<sha256>"');
  console.log('• Content is deduplicated - identical content gets same reference');
  console.log('• CAS supports garbage collection for unused blobs');
  
  // Cleanup
  await eventLogger.clear();
}

// Run the example
main().catch(console.error);