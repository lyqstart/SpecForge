# Multimodal Message Layer - Code Examples

## Example 1: Creating and Submitting Text Messages

```typescript
import {
  createTextMessage,
  V6IngestionSubsystem,
  isV6Compliant,
} from '@specforge/multimodal';

async function submitUserQuery(query: string) {
  // Create a text message
  const message = createTextMessage(query);

  // Verify V6.0 compliance
  if (!isV6Compliant(message)) {
    throw new Error('Message is not V6.0 compliant');
  }

  // Submit to ingestion
  const ingestion = new V6IngestionSubsystem();
  const result = await ingestion.submitMessage(message);

  if (result.success) {
    console.log(`Message submitted with ID: ${result.messageId}`);
    return result.messageId;
  } else {
    throw new Error(`Submission failed: ${result.error}`);
  }
}

// Usage
const messageId = await submitUserQuery('What is the capital of France?');
```

## Example 2: Handling Multimodal Rejection

```typescript
import {
  V6IngestionSubsystem,
  isV6Compliant,
} from '@specforge/multimodal';

async function handleUserInput(input: any) {
  // Check if input contains non-text content
  if (!isV6Compliant(input)) {
    console.log('⚠️  This message contains non-text content.');
    console.log('📋 V6.0 only supports text messages.');
    console.log('🚀 Full multimodal support is coming in P2 (V6.x).');
    console.log('');
    console.log('Supported in V6.0:');
    console.log('  ✓ Text messages');
    console.log('');
    console.log('Coming in P2:');
    console.log('  • Images (with OCR)');
    console.log('  • Audio (with transcription)');
    console.log('  • Video');
    console.log('  • Documents (with extraction)');
    console.log('  • Code snippets');
    return;
  }

  // Submit text-only message
  const ingestion = new V6IngestionSubsystem();
  const result = await ingestion.submitMessage(input);

  if (result.success) {
    console.log('✓ Message submitted successfully');
  } else {
    console.error('✗ Submission failed:', result.error);
  }
}

// Usage
await handleUserInput({
  content: [{ type: 'text', text: 'Hello, world!' }],
});

await handleUserInput({
  content: [
    { type: 'image', blob: 'blob://abc123...', mime: 'image/png' },
  ],
});
```

## Example 3: Working with CAS and BlobRefs

```typescript
import {
  createBlobRef,
  extractHash,
  validateBlobRef,
  computeSHA256,
  verifyBlobRef,
} from '@specforge/multimodal';

async function storeAndRetrieveContent(content: string) {
  // Convert string to bytes
  const bytes = new TextEncoder().encode(content);

  // Compute SHA-256 hash
  const hash = await computeSHA256(bytes);
  console.log('SHA-256:', hash);

  // Create BlobRef
  const ref = createBlobRef(hash);
  console.log('BlobRef:', ref);

  // Validate the BlobRef format
  const validation = validateBlobRef(ref);
  if (!validation.valid) {
    throw new Error(`Invalid BlobRef: ${validation.reason}`);
  }

  // Verify the BlobRef matches the content
  const isValid = await verifyBlobRef(bytes, ref);
  if (!isValid) {
    throw new Error('BlobRef verification failed');
  }

  console.log('✓ BlobRef is valid and matches content');

  // Extract hash back from BlobRef
  const extractedHash = extractHash(ref);
  console.log('Extracted hash:', extractedHash);
  console.log('Hashes match:', hash === extractedHash);

  return ref;
}

// Usage
const ref = await storeAndRetrieveContent('Hello, SpecForge!');
```

## Example 4: Message Serialization and Deserialization

```typescript
import {
  createTextMessage,
  serializeUserMessage,
  deserializeUserMessage,
  validateUserMessage,
} from '@specforge/multimodal';

async function persistMessage(message: any) {
  // Validate before serialization
  const validation = validateUserMessage(message);
  if (!validation.valid) {
    console.error('Validation errors:');
    for (const error of validation.errors) {
      console.error(`  - ${error.field}: ${error.message}`);
    }
    return;
  }

  // Serialize to JSON
  const json = serializeUserMessage(message);
  console.log('Serialized:', json);

  // Store in database or file
  const stored = json;

  // Later, retrieve and deserialize
  const restored = deserializeUserMessage(stored);
  console.log('Restored:', restored);

  // Verify round-trip
  const reserialized = serializeUserMessage(restored);
  if (json === reserialized) {
    console.log('✓ Round-trip serialization successful');
  }

  return restored;
}

// Usage
const message = createTextMessage('Hello, world!');
const restored = await persistMessage(message);
```

## Example 5: Type-Safe Content Item Handling

```typescript
import {
  isTextContent,
  isImageContent,
  isAudioContent,
  isVideoContent,
  isFileContent,
  isCodeContent,
  isDocumentContent,
  getContentType,
} from '@specforge/multimodal';

function processContentItem(item: any) {
  if (isTextContent(item)) {
    console.log('📝 Text:', item.text);
    return item.text;
  }

  if (isImageContent(item)) {
    console.log('🖼️  Image:', item.blob, `(${item.mime})`);
    return `[Image: ${item.blob}]`;
  }

  if (isAudioContent(item)) {
    console.log('🔊 Audio:', item.blob, `(${item.mime})`);
    return `[Audio: ${item.blob}]`;
  }

  if (isVideoContent(item)) {
    console.log('🎬 Video:', item.blob, `(${item.mime})`);
    return `[Video: ${item.blob}]`;
  }

  if (isFileContent(item)) {
    console.log('📄 File:', item.filename, `(${item.blob})`);
    return `[File: ${item.filename}]`;
  }

  if (isCodeContent(item)) {
    console.log('💻 Code:', item.language);
    return `[Code: ${item.language}]`;
  }

  if (isDocumentContent(item)) {
    console.log('📋 Document:', item.blob, `(${item.mime})`);
    return `[Document: ${item.blob}]`;
  }

  console.log('❓ Unknown:', getContentType(item));
  return '[Unknown]';
}

// Usage
const items = [
  { type: 'text', text: 'Hello' },
  { type: 'image', blob: 'blob://abc...', mime: 'image/png' },
  { type: 'code', language: 'typescript', blob: 'blob://def...' },
];

for (const item of items) {
  processContentItem(item);
}
```

## Example 6: Observability and Event Recording

```typescript
import {
  EventRecorder,
  createEventRecorder,
} from '@specforge/multimodal';

async function recordMultimodalRejection(
  rejectedModalities: string[],
  casClient: any,
) {
  // Create and initialize event recorder
  const recorder = createEventRecorder(casClient);
  await recorder.initialize();

  // Create rejection event
  const event = {
    schema_version: '1.0',
    eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ts: Date.now(),
    category: 'modality',
    action: 'rejection.v6_boundary',
    payload: {
      rejectedModalities,
      errorCode: 'V6_MULTIMODAL_REJECTED',
      message: `Multimodal content (${rejectedModalities.join(', ')}) not supported in V6.0`,
    },
  };

  // Record the event
  const result = await recorder.recordEvent(event);

  if (result.success) {
    console.log('✓ Rejection event recorded:', result.eventBlobRef);
  } else {
    console.error('✗ Failed to record event:', result.error);
  }

  // Query recent rejection events
  const events = await recorder.queryEvents({
    action: 'rejection.v6_boundary',
    limit: 5,
  });

  console.log(`Found ${events.count} rejection events:`);
  for (const evt of events.events) {
    console.log(`  - ${evt.eventId}: ${evt.payload.message}`);
  }
}

// Usage
await recordMultimodalRejection(['image', 'audio'], casClient);
```

## Example 7: Building a Message Validation Pipeline

```typescript
import {
  validateUserMessage,
  isV6Compliant,
  extractTextContent,
} from '@specforge/multimodal';

async function validateAndProcessMessage(input: any) {
  console.log('Step 1: Validate message structure');
  const validation = validateUserMessage(input);
  if (!validation.valid) {
    console.error('✗ Validation failed:');
    for (const error of validation.errors) {
      console.error(`  - ${error.field}: ${error.message}`);
    }
    return null;
  }
  console.log('✓ Message structure is valid');

  console.log('Step 2: Check V6.0 compliance');
  if (!isV6Compliant(input)) {
    console.error('✗ Message contains non-text content');
    console.error('  V6.0 only supports text messages');
    return null;
  }
  console.log('✓ Message is V6.0 compliant');

  console.log('Step 3: Extract text content');
  const text = extractTextContent(input);
  console.log(`✓ Extracted text: "${text}"`);

  console.log('Step 4: Process text');
  const processed = text.toUpperCase();
  console.log(`✓ Processed: "${processed}"`);

  return processed;
}

// Usage
const result = await validateAndProcessMessage({
  content: [{ type: 'text', text: 'hello, world!' }],
});
```

## Example 8: Error Handling and Recovery

```typescript
import {
  V6IngestionSubsystem,
  validateUserMessage,
  BlobNotFoundError,
} from '@specforge/multimodal';

async function robustMessageSubmission(message: any) {
  try {
    // Step 1: Validate
    const validation = validateUserMessage(message);
    if (!validation.valid) {
      throw new Error(
        `Validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
      );
    }

    // Step 2: Submit
    const ingestion = new V6IngestionSubsystem();
    const result = await ingestion.submitMessage(message);

    if (!result.success) {
      if (result.errorCode === 'V6_MULTIMODAL_REJECTED') {
        throw new Error(
          'Multimodal content not supported in V6.0. Please use text-only messages.',
        );
      }
      throw new Error(`Submission failed: ${result.error}`);
    }

    console.log(`✓ Message submitted: ${result.messageId}`);
    return result.messageId;
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      console.error('✗ Blob not found in CAS:', error.message);
      console.error('  Please ensure the blob was stored before referencing it');
    } else if (error instanceof Error) {
      console.error('✗ Error:', error.message);
    } else {
      console.error('✗ Unknown error:', error);
    }
    return null;
  }
}

// Usage
const messageId = await robustMessageSubmission({
  content: [{ type: 'text', text: 'Hello' }],
});
```

## Example 9: Batch Processing Messages

```typescript
import {
  createTextMessage,
  V6IngestionSubsystem,
  isV6Compliant,
} from '@specforge/multimodal';

async function batchSubmitMessages(queries: string[]) {
  const ingestion = new V6IngestionSubsystem();
  const results = [];

  for (const query of queries) {
    try {
      const message = createTextMessage(query);

      if (!isV6Compliant(message)) {
        results.push({
          query,
          success: false,
          error: 'Not V6.0 compliant',
        });
        continue;
      }

      const result = await ingestion.submitMessage(message);
      results.push({
        query,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    } catch (error) {
      results.push({
        query,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`Batch processing complete:`);
  console.log(`  ✓ Successful: ${successful}`);
  console.log(`  ✗ Failed: ${failed}`);

  return results;
}

// Usage
const queries = [
  'What is the capital of France?',
  'How do I use the multimodal API?',
  'Tell me about SpecForge V6',
];

const results = await batchSubmitMessages(queries);
for (const result of results) {
  if (result.success) {
    console.log(`✓ "${result.query}" → ${result.messageId}`);
  } else {
    console.log(`✗ "${result.query}" → ${result.error}`);
  }
}
```

## Example 10: Integration with External Systems

```typescript
import {
  createTextMessage,
  V6IngestionSubsystem,
  EventRecorder,
  createEventRecorder,
} from '@specforge/multimodal';

async function integrateWithExternalSystem(
  externalInput: any,
  casClient: any,
) {
  // Initialize components
  const ingestion = new V6IngestionSubsystem();
  const eventRecorder = createEventRecorder(casClient);
  await eventRecorder.initialize();

  // Convert external input to UserMessage
  const message = createTextMessage(externalInput.text);

  // Submit to ingestion
  const result = await ingestion.submitMessage(message);

  if (result.success) {
    // Record success event
    console.log(`✓ Message submitted: ${result.messageId}`);

    // Notify external system
    await notifyExternalSystem({
      status: 'success',
      messageId: result.messageId,
      timestamp: Date.now(),
    });
  } else {
    // Record rejection event
    const event = {
      schema_version: '1.0',
      eventId: `evt-${Date.now()}`,
      ts: Date.now(),
      category: 'modality',
      action: 'rejection.v6_boundary',
      payload: {
        rejectedModalities: [],
        errorCode: result.errorCode || 'UNKNOWN',
        message: result.error || 'Unknown error',
      },
    };

    await eventRecorder.recordEvent(event);

    // Notify external system
    await notifyExternalSystem({
      status: 'failed',
      error: result.error,
      timestamp: Date.now(),
    });
  }
}

async function notifyExternalSystem(notification: any) {
  // Implementation depends on external system
  console.log('Notifying external system:', notification);
}

// Usage
await integrateWithExternalSystem(
  { text: 'Hello from external system' },
  casClient,
);
```

## Running Examples

To run these examples:

```bash
# Create a test file
cat > test-examples.ts << 'EOF'
// Paste any example code here
EOF

# Run with bun
bun run test-examples.ts
```

## Related Documentation

- [API Reference](./API.md) - Complete API documentation
- [Usage Guide](./USAGE.md) - Practical patterns and best practices
- [Architecture](../../.kiro/specs/multimodal/design.md) - Design decisions
- [Requirements](../../.kiro/specs/multimodal/requirements.md) - Full specification
