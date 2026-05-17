# @specforge/multimodal

Multimodal Message Layer for SpecForge V6 — A foundational framework for handling multi-modal content (images, audio, video, files, code snippets, documents) while enforcing V6.0 scope boundaries.

## Overview

The `@specforge/multimodal` package provides:

- **Unified Message Format**: `UserMessage` with support for all modality types
- **V6.0 Scope Enforcement**: Rejects non-text content with clear P2 indication
- **CAS Integration**: Content-Addressable Storage for efficient blob management
- **Modality Adapter Interface**: Skeleton for future P2 adaptation logic
- **Observability**: Event recording for adaptation and rejection decisions
- **Property-Based Testing**: Validates three inherited Correctness Properties

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

## Key Features

### ✅ V6.0 Skeleton Implementation

- **Framework Established**: All interfaces and data structures defined
- **Scope Boundaries Clear**: V6.0 accepts text-only, rejects non-text with P2 indication
- **Foundation for P2**: Stable base for full multimodal support in V6.x

### ✅ Correctness Properties

Implements three inherited Correctness Properties from V6 architecture:

1. **Property 9: CAS Content Addressing**
   - Deterministic blob references: `blob://<sha256>`
   - Identical content → identical reference
   - Different content → different reference

2. **Property 13: Modality Adaptation Determinism**
   - Same inputs → same outputs
   - Deterministic adaptation decisions
   - Reproducible from inputs alone

3. **Property 23: V6.0 Multimodal Rejection**
   - Non-text content rejected in V6.0
   - Clear error messages indicating P2 requirement
   - No "store now, process later" semantics

### ✅ Type Safety

- **TypeScript-First**: Full type definitions for all interfaces
- **Type Guards**: Predicates for safe content item handling
- **Template Literals**: `BlobRef` type ensures compile-time discrimination

### ✅ Observability

- **Event Recording**: Track adaptation and rejection decisions
- **Event Schemas**: Defined for all modality operations
- **Query Interface**: Search and analyze recorded events

## Documentation

- **[API Reference](./docs/API.md)** — Complete API documentation with all types and functions
- **[Usage Guide](./docs/USAGE.md)** — Practical patterns and common use cases
- **[Code Examples](./docs/EXAMPLES.md)** — 10+ runnable examples for different scenarios
- **[Architecture](../.kiro/specs/multimodal/design.md)** — Design decisions and component diagrams
- **[Requirements](../.kiro/specs/multimodal/requirements.md)** — Full specification

## Core Concepts

### UserMessage

The unified message format for all agent communications:

```typescript
interface UserMessage {
  content: MessageContentItem[];
  derivedTexts?: Record<string, string>;
}

type MessageContentItem =
  | { type: "text"; text: string }
  | { type: "image"; blob: BlobRef; mime: string }
  | { type: "audio"; blob: BlobRef; mime: string }
  | { type: "video"; blob: BlobRef; mime: string }
  | { type: "file"; blob: BlobRef; mime: string; filename: string }
  | { type: "code"; language: string; blob: BlobRef }
  | { type: "document"; blob: BlobRef; mime: string };
```

**V6.0 Constraint**: Only `{ type: "text" }` items are allowed.

### BlobRef

Reference to content in CAS (Content-Addressable Storage):

```typescript
type BlobRef = `blob://${string}`;
// Format: blob://<sha256-hash> (64 lowercase hex characters)
```

### ModalityAdapter

Interface for adapting messages to model capabilities:

```typescript
interface ModalityAdapter {
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage;
}
```

**V6.0 Note**: Skeleton interface only. Full implementation deferred to P2.

### V6IngestionSubsystem

V6.0 ingestion that enforces scope boundaries:

```typescript
const ingestion = new V6IngestionSubsystem();
const result = await ingestion.submitMessage(message);

if (result.success) {
  console.log('Message ID:', result.messageId);
} else {
  console.error('Error:', result.error);
  console.error('Code:', result.errorCode);
}
```

## V6.0 vs P2 Scope

| Component | V6.0 | P2 |
|---|---|---|
| **UserMessage Format** | ✅ Defined | ✅ Fully implemented |
| **Text-Only Ingestion** | ✅ Implemented | ✅ Enhanced |
| **Multimodal Ingestion** | ❌ Rejected | ✅ Accepted |
| **ModalityAdapter** | ✅ Interface | ✅ Full implementation |
| **Parsers** | ❌ Skeleton | ✅ OCR, transcription, extraction |
| **Derivative Cache** | ❌ Skeleton | ✅ Implemented |
| **CAS Integration** | ✅ Points defined | ✅ Fully integrated |
| **Observability** | ✅ Events defined | ✅ Fully recorded |

## Testing

### Run All Tests

```bash
bun test packages/multimodal/tests/
```

### Run Property-Based Tests

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

## Common Patterns

### Creating and Validating Messages

```typescript
import { createTextMessage, validateUserMessage } from '@specforge/multimodal';

const message = createTextMessage('Hello, world!');
const validation = validateUserMessage(message);

if (validation.valid) {
  console.log('Message is valid');
}
```

### Handling V6.0 Rejection

```typescript
import { V6IngestionSubsystem } from '@specforge/multimodal';

const ingestion = new V6IngestionSubsystem();
const result = await ingestion.submitMessage(message);

if (!result.success && result.errorCode === 'V6_MULTIMODAL_REJECTED') {
  console.log('Multimodal content not supported in V6.0');
  console.log('Full support coming in P2 (V6.x)');
}
```

### Working with BlobRefs

```typescript
import { createBlobRef, validateBlobRef, extractHash } from '@specforge/multimodal';

const ref = createBlobRef('abc123...');
const validation = validateBlobRef(ref);
const hash = extractHash(ref);
```

### Recording Events

```typescript
import { EventRecorder, createEventRecorder } from '@specforge/multimodal';

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

## Error Handling

### ValidationError

Detailed validation error information:

```typescript
interface ValidationError {
  field: string;
  message: string;
  code: string;
}
```

### BlobNotFoundError

Thrown when retrieving non-existent blob from CAS:

```typescript
import { BlobNotFoundError } from '@specforge/multimodal';

try {
  await casClient.retrieve('blob://nonexistent');
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.error('Blob not found');
  }
}
```

## Architecture

The multimodal module integrates with:

- **Ingestion Subsystem**: Accepts/rejects UserMessages
- **CAS (Content-Addressable Storage)**: Stores blob content
- **Event Bus**: Records adaptation and rejection events
- **Observability**: Tracks modality decisions

See [Architecture](../.kiro/specs/multimodal/design.md) for detailed component diagrams.

## Migration to P2

When P2 multimodal support becomes available:

1. **Scope Tag Update**: Change from `p0` to `p2`
2. **Parser Integration**: Activate OCR, transcription, extraction
3. **Adapter Implementation**: Provide concrete implementations
4. **Ingestion Enhancement**: Accept non-text content
5. **Derivative Cache**: Enable caching for determinism

The V6.0 skeleton ensures these changes can be made without breaking existing code.

## Performance

- **Message Serialization**: O(n) where n = content items
- **CAS Operations**: O(1) for reference creation, O(n) for blob storage
- **Validation**: O(n) for structure validation
- **Event Recording**: Async, non-blocking

## Troubleshooting

### "Multimodal content not supported in V6.0"

This error occurs when submitting non-text content. Solutions:

1. Extract text from images (available in P2)
2. Wait for P2 multimodal support
3. Use text-only messages for now

### "BlobRef validation failed"

Check that BlobRef format is `blob://<64-hex-chars>`:

```typescript
const validation = validateBlobRef(ref);
if (!validation.valid) {
  console.error('Reason:', validation.reason);
}
```

### "Blob not found"

Verify the blob was stored successfully before referencing:

```typescript
const exists = await casClient.exists(ref);
if (!exists) {
  console.error('Blob does not exist in CAS');
}
```

## Contributing

Contributions are welcome! Please:

1. Read the [Architecture](../.kiro/specs/multimodal/design.md)
2. Follow the [Requirements](../.kiro/specs/multimodal/requirements.md)
3. Add tests for new functionality
4. Ensure all tests pass: `bun test`

## License

SpecForge V6 — See LICENSE file in repository root.

## Related Packages

- `@specforge/daemon-core` — Core daemon functionality
- `@specforge/configuration` — Configuration management
- `@specforge/observability` — Observability infrastructure
- `@specforge/scope-gate` — Scope boundary enforcement

## Support

For issues, questions, or suggestions:

1. Check the [Documentation](./docs/)
2. Review [Examples](./docs/EXAMPLES.md)
3. See [Architecture](../.kiro/specs/multimodal/design.md)
4. File an issue in the repository

## Roadmap

### V6.0 (Current)
- ✅ Framework skeleton
- ✅ V6.0 scope enforcement
- ✅ CAS integration points
- ✅ Observability events
- ✅ Property-based tests

### P2 (V6.x)
- 🚀 Full multimodal ingestion
- 🚀 OCR, transcription, extraction
- 🚀 Derivative cache
- 🚀 Modality adaptation implementation
- 🚀 Advanced observability

---

**Version**: 1.0.0  
**Status**: V6.0 Skeleton (P0)  
**Last Updated**: 2026-05-16
