# Multimodal Message Layer - Usage Guide

## Quick Start

### Installation

```bash
bun install @specforge/multimodal
```

### Basic Usage

```typescript
import {
  createTextMessage,
  V6IngestionSubsystem,
  isV6Compliant,
} from '@specforge/multimodal';

// Create a text message
const message = createTextMessage('Hello, SpecForge!');

// Check V6.0 compliance
if (isV6Compliant(message)) {
  console.log('Message is V6.0 compliant');
}

// Submit to ingestion
const ingestion = new V6IngestionSubsystem();
const result = await ingestion.submitMessage(message);

if (result.success) {
  console.log('Message submitted:', result.messageId);
} else {
  console.error('Submission failed:', result.error);
}
```

## Common Patterns

### Pattern 1: Creating and Validating Messages

```typescript
import {
  createTextMessage,
  validateUserMessage,
  extractTextContent,
} from '@specforge/multimodal';

// Create a message
const message = createTextMessage('What is the weather today?');

// Validate it
const validation = validateUserMessage(message);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
  process.exit(1);
}

// Extract text for processing
const text = extractTextContent(message);
console.log('Processing:', text);
```

### Pattern 2: Handling V6.0 Rejection

In V6.0, any non-text content is rejected. Here's how to handle it gracefully:

```typescript
import {
  V6IngestionSubsystem,
  isV6Compliant,
} from '@specforge/multimodal';

const ingestion = new V6IngestionSubsystem();

// User attempts to submit an image
const userMessage = {
  content: [
    {
      type: 'image',
      blob: 'blob://abc123...',
      mime: 'image/png',
    },
  ],
};

// Check compliance before submission
if (!isV6Compliant(userMessage)) {
  console.log('This message contains non-text content.');
  console.log('Full multimodal support is available in P2 (V6.x).');
  console.log('For now, please submit text-only messages.');
  process.exit(1);
}

// Or let ingestion handle it
const result = await ingestion.submitMessage(userMessage);
if (!result.success) {
  if (result.errorCode === 'V6_MULTIMODAL_REJECTED') {
    console.log('Multimodal content not supported in V6.0');
    console.log('Error:', result.error);
  }
}
```

### Pattern 3: Working with BlobRefs

```typescript
import {
  createBlobRef,
  extractHash,
  validateBlobRef,
  isStrictBlobRef,
} from '@specforge/multimodal';

// Create a BlobRef from a SHA-256 hash
const hash = 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f';
const ref = createBlobRef(hash);
console.log('BlobRef:', ref);
// Output: blob://dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f

// Extract the hash back
const extractedHash = extractHash(ref);
console.log('Hash:', extractedHash);

// Validate format
const validation = validateBlobRef(ref);
if (validation.valid) {
  console.log('BlobRef is valid');
} else {
  console.error('Invalid BlobRef:', validation.reason);
}

// Type-safe narrowing
if (isStrictBlobRef(ref)) {
  // Now TypeScript knows ref is a valid BlobRef
  console.log('Strictly valid:', ref);
}
```

### Pattern 4: CAS Integration

```typescript
import {
  computeSHA256,
  verifyBlobRef,
  createBlobRef,
} from '@specforge/multimodal';

// Compute SHA-256 of content
const content = new TextEncoder().encode('Hello, world!');
const hash = await computeSHA256(content);
console.log('SHA-256:', hash);

// Create a BlobRef
const ref = createBlobRef(hash);

// Verify the BlobRef matches the content
const isValid = await verifyBlobRef(content, ref);
console.log('Verification:', isValid ? 'passed' : 'failed');
```

### Pattern 5: Message Serialization

```typescript
import {
  createTextMessage,
  serializeUserMessage,
  deserializeUserMessage,
} from '@specforge/multimodal';

// Create a message
const message = createTextMessage('Hello, world!');

// Serialize to JSON
const json = serializeUserMessage(message);
console.log('Serialized:', json);

// Store in database or send over network
const stored = json;

// Deserialize back
const restored = deserializeUserMessage(stored);
console.log('Restored:', restored);

// Verify it's the same
console.log('Equal:', JSON.stringify(message) === JSON.stringify(restored));
```

### Pattern 6: Type Guards for Content Items

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

const items = [
  { type: 'text', text: 'Hello' },
  { type: 'image', blob: 'blob://abc...', mime: 'image/png' },
  { type: 'code', language: 'typescript', blob: 'blob://def...' },
];

for (const item of items) {
  if (isTextContent(item)) {
    console.log('Text:', item.text);
  } else if (isImageContent(item)) {
    console.log('Image:', item.blob);
  } else if (isCodeContent(item)) {
    console.log('Code:', item.language);
  } else {
    console.log('Other:', getContentType(item));
  }
}
```

### Pattern 7: Observability Events

```typescript
import {
  EventRecorder,
  createEventRecorder,
} from '@specforge/multimodal';

// Create and initialize recorder
const recorder = createEventRecorder(casClient);
await recorder.initialize();

// Record a rejection event
const rejectionEvent = {
  schema_version: '1.0',
  eventId: 'evt-' + Date.now(),
  ts: Date.now(),
  category: 'modality',
  action: 'rejection.v6_boundary',
  payload: {
    rejectedModalities: ['image', 'audio'],
    errorCode: 'V6_MULTIMODAL_REJECTED',
    message: 'Multimodal content not supported in V6.0',
  },
};

const result = await recorder.recordEvent(rejectionEvent);
if (result.success) {
  console.log('Event recorded:', result.eventBlobRef);
}

// Query events
const events = await recorder.queryEvents({
  action: 'rejection.v6_boundary',
  limit: 10,
});

console.log('Found events:', events.count);
for (const event of events.events) {
  console.log('Event:', event);
}
```

## Error Handling

### Handling Validation Errors

```typescript
import { validateUserMessage } from '@specforge/multimodal';

const message = { content: [] }; // Invalid: empty content

const validation = validateUserMessage(message);
if (!validation.valid) {
  for (const error of validation.errors) {
    console.error(`${error.field}: ${error.message} (${error.code})`);
  }
}
```

### Handling CAS Errors

```typescript
import { BlobNotFoundError } from '@specforge/multimodal';

try {
  const content = await casClient.retrieve('blob://nonexistent');
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.error('Blob not found:', error.message);
  } else {
    console.error('CAS error:', error);
  }
}
```

### Handling Ingestion Errors

```typescript
import { V6IngestionSubsystem } from '@specforge/multimodal';

const ingestion = new V6IngestionSubsystem();
const result = await ingestion.submitMessage(message);

if (!result.success) {
  switch (result.errorCode) {
    case 'V6_MULTIMODAL_REJECTED':
      console.error('Multimodal content not supported in V6.0');
      break;
    case 'VALIDATION_ERROR':
      console.error('Message validation failed');
      break;
    default:
      console.error('Unknown error:', result.error);
  }
}
```

## Testing

### Unit Testing with Vitest

```typescript
import { describe, it, expect } from 'vitest';
import {
  createTextMessage,
  isV6Compliant,
  validateUserMessage,
} from '@specforge/multimodal';

describe('UserMessage', () => {
  it('should create a text message', () => {
    const message = createTextMessage('Hello');
    expect(message.content).toHaveLength(1);
    expect(message.content[0].type).toBe('text');
  });

  it('should validate V6.0 compliance', () => {
    const message = createTextMessage('Hello');
    expect(isV6Compliant(message)).toBe(true);
  });

  it('should reject non-text messages', () => {
    const message = {
      content: [
        { type: 'image', blob: 'blob://abc...', mime: 'image/png' },
      ],
    };
    expect(isV6Compliant(message)).toBe(false);
  });

  it('should validate message structure', () => {
    const message = createTextMessage('Hello');
    const validation = validateUserMessage(message);
    expect(validation.valid).toBe(true);
  });
});
```

### Property-Based Testing

The package includes property-based tests for the three inherited Correctness Properties:

- **Property 9**: CAS Content Addressing
- **Property 13**: Modality Adaptation Determinism
- **Property 23**: V6.0 Multimodal Rejection

Run them with:

```bash
bun test packages/multimodal/tests/property/
```

## Performance Considerations

### Message Serialization

For large messages, consider:

1. **Streaming**: Use blob references instead of inline content
2. **Caching**: Cache serialized messages to avoid repeated serialization
3. **Compression**: Compress JSON before storage/transmission

### CAS Operations

1. **Batch Operations**: Group multiple `store()` calls when possible
2. **Caching**: Cache frequently accessed blobs
3. **Async/Await**: Use async operations to avoid blocking

## Migration to P2

When P2 multimodal support becomes available:

1. **Update Scope Tag**: Change from `p0` to `p2` in `.config.kiro`
2. **Enable Parsers**: Activate OCR, transcription, and extraction services
3. **Implement Adapters**: Provide concrete ModalityAdapter implementations
4. **Accept Non-Text**: Update ingestion to accept all modality types

The V6.0 skeleton ensures these changes can be made without breaking existing code.

## Troubleshooting

### "Multimodal content not supported in V6.0"

This error occurs when submitting non-text content in V6.0. Solutions:

1. **Extract text**: Convert images to text using OCR (available in P2)
2. **Wait for P2**: Full multimodal support is coming in V6.x
3. **Use text-only**: Submit text-only messages for now

### "BlobRef validation failed"

This error occurs when a BlobRef has an invalid format. Check:

1. **Format**: Must be `blob://<64-hex-chars>`
2. **Hash**: SHA-256 hash must be exactly 64 lowercase hexadecimal characters
3. **Prefix**: Must start with `blob://`

### "Blob not found"

This error occurs when retrieving a non-existent blob from CAS. Check:

1. **Existence**: Verify the blob was stored successfully
2. **Reference**: Ensure the BlobRef is correct
3. **Storage**: Check that CAS is properly initialized

## Related Documentation

- [API Reference](./API.md) - Complete API documentation
- [Examples](./EXAMPLES.md) - Code examples for different scenarios
- [Architecture](../../.kiro/specs/multimodal/design.md) - Design decisions
- [Requirements](../../.kiro/specs/multimodal/requirements.md) - Full specification
