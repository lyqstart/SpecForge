# Multimodal Message Layer - Quick Reference

## Installation

```bash
bun install @specforge/multimodal
```

## Core Imports

```typescript
// Types
import type { UserMessage, MessageContentItem, BlobRef, ModelCapabilities } from '@specforge/multimodal';

// Message creation and validation
import { createTextMessage, validateUserMessage, isV6Compliant, extractTextContent } from '@specforge/multimodal';

// Serialization
import { serializeUserMessage, deserializeUserMessage } from '@specforge/multimodal';

// Type guards
import { isTextContent, isImageContent, isAudioContent, isVideoContent, isFileContent, isCodeContent, isDocumentContent } from '@specforge/multimodal';

// BlobRef utilities
import { createBlobRef, isBlobRef, extractHash, validateBlobRef, isStrictBlobRef } from '@specforge/multimodal';

// CAS integration
import { computeSHA256, verifyBlobRef } from '@specforge/multimodal';

// Ingestion
import { V6IngestionSubsystem } from '@specforge/multimodal';

// Observability
import { EventRecorder, createEventRecorder } from '@specforge/multimodal';

// Errors
import { BlobNotFoundError } from '@specforge/multimodal';
```

## Common Tasks

### Create a Text Message

```typescript
const message = createTextMessage('Hello, world!');
```

### Validate a Message

```typescript
const validation = validateUserMessage(message);
if (validation.valid) {
  console.log('Valid');
} else {
  console.error('Errors:', validation.errors);
}
```

### Check V6.0 Compliance

```typescript
if (isV6Compliant(message)) {
  console.log('Text-only, V6.0 compliant');
}
```

### Extract Text

```typescript
const text = extractTextContent(message);
```

### Serialize/Deserialize

```typescript
const json = serializeUserMessage(message);
const restored = deserializeUserMessage(json);
```

### Type Guards

```typescript
if (isTextContent(item)) {
  console.log('Text:', item.text);
}

if (isImageContent(item)) {
  console.log('Image:', item.blob);
}
```

### Create BlobRef

```typescript
const ref = createBlobRef('abc123def456...');
```

### Validate BlobRef

```typescript
const validation = validateBlobRef(ref);
if (validation.valid) {
  console.log('Valid BlobRef');
}
```

### Compute SHA-256

```typescript
const content = new TextEncoder().encode('Hello');
const hash = await computeSHA256(content);
```

### Verify BlobRef

```typescript
const isValid = await verifyBlobRef(content, ref);
```

### Submit Message

```typescript
const ingestion = new V6IngestionSubsystem();
const result = await ingestion.submitMessage(message);

if (result.success) {
  console.log('Message ID:', result.messageId);
} else {
  console.error('Error:', result.error);
}
```

### Record Event

```typescript
const recorder = createEventRecorder(casClient);
await recorder.initialize();

const event = {
  schema_version: '1.0',
  eventId: 'evt-123',
  ts: Date.now(),
  category: 'modality',
  action: 'rejection.v6_boundary',
  payload: { /* ... */ },
};

await recorder.recordEvent(event);
```

## Type Reference

### UserMessage

```typescript
interface UserMessage {
  content: MessageContentItem[];
  derivedTexts?: Record<string, string>;
}
```

### MessageContentItem

```typescript
type MessageContentItem =
  | { type: "text"; text: string }
  | { type: "image"; blob: BlobRef; mime: string }
  | { type: "audio"; blob: BlobRef; mime: string }
  | { type: "video"; blob: BlobRef; mime: string }
  | { type: "file"; blob: BlobRef; mime: string; filename: string }
  | { type: "code"; language: string; blob: BlobRef }
  | { type: "document"; blob: BlobRef; mime: string };
```

### BlobRef

```typescript
type BlobRef = `blob://${string}`;
// Format: blob://<sha256-hash> (64 lowercase hex)
```

### ModelCapabilities

```typescript
interface ModelCapabilities {
  modalities: Array<"text" | "image" | "audio" | "video" | "file">;
  maxInputTokens: number;
  supportsTools: boolean;
}
```

### ModalityAdapter

```typescript
interface ModalityAdapter {
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage;
}
```

### PreparedMessage

```typescript
interface PreparedMessage {
  schema_version: "1.0";
  content: MessageContentItem[];
  metadata: PreparedMessageMetadata;
}
```

### SubmitResult

```typescript
interface SubmitResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  messageId?: string;
}
```

### ValidationError

```typescript
interface ValidationError {
  field: string;
  message: string;
  code: string;
}
```

## Error Codes

| Code | Meaning | V6.0 |
|------|---------|------|
| `V6_MULTIMODAL_REJECTED` | Non-text content not supported | ✅ |
| `VALIDATION_ERROR` | Message structure invalid | ✅ |
| `BLOB_NOT_FOUND` | Blob not found in CAS | ✅ |
| `CAS_ERROR` | CAS operation failed | ✅ |

## V6.0 Constraints

- ✅ Text-only messages accepted
- ❌ Non-text content rejected
- ❌ No multimodal ingestion
- ❌ No parsers (OCR, transcription, etc.)
- ❌ No derivative cache

## P2 Features (Coming)

- 🚀 Multimodal ingestion
- 🚀 OCR for images
- 🚀 Transcription for audio
- 🚀 Document extraction
- 🚀 Derivative cache
- 🚀 Full ModalityAdapter implementation

## Testing

### Run All Tests

```bash
bun test packages/multimodal/tests/
```

### Run Property Tests

```bash
bun test packages/multimodal/tests/property/
```

### Run Unit Tests

```bash
bun test packages/multimodal/tests/*.test.ts
```

### Run Integration Tests

```bash
bun test packages/multimodal/tests/integration/
```

## Performance Tips

1. **Batch Operations**: Group multiple operations when possible
2. **Caching**: Cache frequently accessed blobs
3. **Async/Await**: Use async operations to avoid blocking
4. **Streaming**: Use blob references instead of inline content

## Troubleshooting

### "Multimodal content not supported in V6.0"

**Cause**: Submitted non-text content

**Solution**: Use text-only messages or wait for P2

### "BlobRef validation failed"

**Cause**: Invalid BlobRef format

**Solution**: Ensure format is `blob://<64-hex-chars>`

### "Blob not found"

**Cause**: Blob doesn't exist in CAS

**Solution**: Verify blob was stored successfully

## Documentation

- [API Reference](./API.md) - Complete API
- [Usage Guide](./USAGE.md) - Practical patterns
- [Code Examples](./EXAMPLES.md) - Runnable examples
- [Architecture](./ARCHITECTURE.md) - System design
- [V6.0 Scope](./V6-SCOPE.md) - Scope boundaries
- [README](../README.md) - Package overview

## Links

- **Repository**: https://github.com/specforge/specforge
- **Issues**: https://github.com/specforge/specforge/issues
- **Discussions**: https://github.com/specforge/specforge/discussions

## Version

- **Package**: @specforge/multimodal
- **Version**: 1.0.0
- **Status**: V6.0 Skeleton (P0)
- **Last Updated**: 2026-05-16
