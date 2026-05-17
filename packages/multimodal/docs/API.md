# Multimodal Message Layer - API Documentation

## Overview

The `@specforge/multimodal` package provides the foundational framework for handling multi-modal content (images, audio, video, files, code snippets, documents) in SpecForge V6. This is a **P0 skeleton** implementation that establishes interfaces and data structures for V6.0, with full multimodal support deferred to P2 (V6.x).

**Key Constraint**: V6.0 only accepts text-only UserMessages. All non-text content is rejected with a clear error indicating P2 requirement.

## Core Types

### UserMessage

The unified message format for all agent communications in V6.

```typescript
interface UserMessage {
  content: MessageContentItem[];
  derivedTexts?: Record<string, string>;  // For P2: OCR/transcription/summary cache
}
```

**V6.0 Constraint**: Only `{ type: "text" }` items are allowed in submissions.

#### Creating a Text Message

```typescript
import { createTextMessage } from '@specforge/multimodal';

const message = createTextMessage('Hello, world!');
// Result:
// {
//   content: [{ type: 'text', text: 'Hello, world!' }]
// }
```

#### Validating a UserMessage

```typescript
import { validateUserMessage, isV6Compliant } from '@specforge/multimodal';

const message = { content: [{ type: 'text', text: 'Hello' }] };

// Full validation with detailed error information
const validation = validateUserMessage(message);
if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
}

// Quick V6.0 compliance check (text-only)
if (isV6Compliant(message)) {
  console.log('Message is V6.0 compliant');
}
```

#### Extracting Text Content

```typescript
import { extractTextContent } from '@specforge/multimodal';

const message = { content: [{ type: 'text', text: 'Hello' }] };
const text = extractTextContent(message);
// Result: 'Hello'
```

#### Serialization

```typescript
import { serializeUserMessage, deserializeUserMessage } from '@specforge/multimodal';

const message = { content: [{ type: 'text', text: 'Hello' }] };

// Serialize to JSON
const json = serializeUserMessage(message);
// Result: '{"content":[{"type":"text","text":"Hello"}]}'

// Deserialize from JSON
const restored = deserializeUserMessage(json);
// Result: { content: [{ type: 'text', text: 'Hello' }] }
```

### MessageContentItem

Union type representing different content modalities.

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

#### Type Guards

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

const item = { type: 'text', text: 'Hello' };

if (isTextContent(item)) {
  console.log('Text:', item.text);
}

// Get content type
const type = getContentType(item);
// Result: 'text'
```

### BlobRef

Reference to content stored in CAS (Content-Addressable Storage).

```typescript
type BlobRef = `blob://${string}`;
```

**Format**: `blob://<sha256-hash>` where `<sha256-hash>` is a 64-character lowercase hexadecimal string.

#### Creating and Validating BlobRefs

```typescript
import { createBlobRef, isBlobRef, extractHash, validateBlobRef, isStrictBlobRef } from '@specforge/multimodal';

// Create a BlobRef from a SHA-256 hash
const ref = createBlobRef('abc123def456...');
// Result: 'blob://abc123def456...'

// Check if a value is a BlobRef (loose check)
if (isBlobRef(ref)) {
  console.log('Valid BlobRef');
}

// Extract the hash from a BlobRef
const hash = extractHash(ref);
// Result: 'abc123def456...'

// Strict format validation (64 hex characters)
const validation = validateBlobRef(ref);
if (validation.valid) {
  console.log('Strictly valid BlobRef');
} else {
  console.error('Validation failed:', validation.reason);
}

// Type-narrowing predicate
if (isStrictBlobRef(ref)) {
  console.log('BlobRef is strictly valid');
}
```

### ModelCapabilities

Describes which modalities a model supports.

```typescript
interface ModelCapabilities {
  modalities: Array<"text" | "image" | "audio" | "video" | "file">;
  maxInputTokens: number;
  supportsTools: boolean;
}
```

#### Example

```typescript
const gpt4Capabilities: ModelCapabilities = {
  modalities: ["text", "image"],
  maxInputTokens: 128000,
  supportsTools: true,
};

const textOnlyModel: ModelCapabilities = {
  modalities: ["text"],
  maxInputTokens: 4096,
  supportsTools: false,
};
```

## Modality Adapter

The `ModalityAdapter` interface defines how to adapt a UserMessage to a target model's capabilities.

```typescript
interface ModalityAdapter {
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage;
}
```

### PreparedMessage

Output of the modality adaptation process.

```typescript
interface PreparedMessage {
  schema_version: "1.0";
  content: MessageContentItem[];
  metadata: PreparedMessageMetadata;
}

interface PreparedMessageMetadata {
  inputModalities: Modality[];
  downgraded: boolean;
  originalBlobRefs: BlobRef[];
  usedDerivativeBlobRefs: BlobRef[];
  targetModel?: string;
}
```

**V6.0 Note**: In V6.0, the ModalityAdapter is a skeleton interface. Full implementation (with actual adaptation logic and derivative generation) is deferred to P2.

## CAS Integration

### CASClient Interface

```typescript
interface CASClient {
  /**
   * Store content in CAS and return its blob reference.
   * The reference is deterministically derived from the content's SHA-256 hash.
   */
  store(content: Uint8Array): Promise<BlobRef>;

  /**
   * Retrieve content from CAS by its blob reference.
   * Throws BlobNotFoundError if the reference does not exist.
   */
  retrieve(ref: BlobRef): Promise<Uint8Array>;

  /**
   * Check if a blob reference exists in CAS.
   */
  exists(ref: BlobRef): Promise<boolean>;
}
```

### Property 9: CAS Content Addressing

The CAS integration implements **Property 9** from the V6 architecture:

> For all binary or text content c, the blob reference id obtained by storing this content in CAS satisfies `id == "blob://" + sha256(c)`; two `store(c)` operations on identical content produce the same id; `store` operations on different content produce different ids.

#### Verification Helpers

```typescript
import { computeSHA256, verifyBlobRef } from '@specforge/multimodal';

// Compute SHA-256 hash of content
const content = new TextEncoder().encode('Hello, world!');
const hash = await computeSHA256(content);
// Result: 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f'

// Verify that a BlobRef matches the content
const ref = createBlobRef(hash);
const isValid = await verifyBlobRef(content, ref);
// Result: true
```

## Ingestion Subsystem

### V6IngestionSubsystem

The V6.0 ingestion implementation that enforces the multimodal scope boundary.

```typescript
interface IngestionSubsystem {
  submitMessage(message: UserMessage): Promise<SubmitResult>;
}

interface SubmitResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  messageId?: string;
}
```

#### Usage

```typescript
import { V6IngestionSubsystem } from '@specforge/multimodal';

const ingestion = new V6IngestionSubsystem();

// Text-only message (V6.0 compliant)
const textMessage = { content: [{ type: 'text', text: 'Hello' }] };
const result1 = await ingestion.submitMessage(textMessage);
// Result: { success: true, messageId: '...' }

// Non-text message (rejected in V6.0)
const imageMessage = {
  content: [{ type: 'image', blob: 'blob://abc123...', mime: 'image/png' }],
};
const result2 = await ingestion.submitMessage(imageMessage);
// Result: {
//   success: false,
//   error: 'Multimodal content not supported in V6.0. Full support requires P2 (V6.x).',
//   errorCode: 'V6_MULTIMODAL_REJECTED'
// }
```

## Observability

### EventRecorder

Records adaptation and rejection events for observability.

```typescript
class EventRecorder {
  constructor(cas: CASClient);
  
  async initialize(): Promise<void>;
  
  async recordEvent(event: ModalityAdaptationEvent | MultimodalRejectionEvent): Promise<RecordingResult>;
  
  async queryEvents(filter: EventQueryFilter): Promise<QueryResult>;
}
```

#### Event Types

```typescript
interface ModalityAdaptationEvent {
  schema_version: "1.0";
  eventId: string;
  ts: number;
  category: "modality";
  action: "adaptation.decision";
  payload: {
    inputModalities: string[];
    targetModel: string;
    downgraded: boolean;
    usedDerivativeBlobRef?: string;
    originalBlobRefs: string[];
  };
}

interface MultimodalRejectionEvent {
  schema_version: "1.0";
  eventId: string;
  ts: number;
  category: "modality";
  action: "rejection.v6_boundary";
  payload: {
    rejectedModalities: string[];
    errorCode: "V6_MULTIMODAL_REJECTED";
    message: string;
  };
}
```

#### Usage

```typescript
import { EventRecorder, createEventRecorder } from '@specforge/multimodal';

const recorder = createEventRecorder(casClient);
await recorder.initialize();

// Record a rejection event
const event: MultimodalRejectionEvent = {
  schema_version: "1.0",
  eventId: 'evt-123',
  ts: Date.now(),
  category: 'modality',
  action: 'rejection.v6_boundary',
  payload: {
    rejectedModalities: ['image'],
    errorCode: 'V6_MULTIMODAL_REJECTED',
    message: 'Multimodal content not supported in V6.0',
  },
};

const result = await recorder.recordEvent(event);
if (result.success) {
  console.log('Event recorded:', result.eventBlobRef);
}
```

## Error Handling

### ValidationError

Detailed validation error information.

```typescript
interface ValidationError {
  field: string;
  message: string;
  code: string;
}
```

### BlobNotFoundError

Thrown when attempting to retrieve a non-existent blob from CAS.

```typescript
import { BlobNotFoundError } from '@specforge/multimodal';

try {
  await casClient.retrieve('blob://nonexistent');
} catch (error) {
  if (error instanceof BlobNotFoundError) {
    console.error('Blob not found:', error.message);
  }
}
```

## V6.0 Scope Boundaries

### What's Included in V6.0

- ✅ UserMessage data structure with all modality types defined
- ✅ ModelCapabilities interface
- ✅ ModalityAdapter interface (skeleton)
- ✅ CAS integration points and blob reference handling
- ✅ V6.0 rejection logic for non-text content
- ✅ Observability event schemas
- ✅ Property 9 (CAS Content Addressing) verification
- ✅ Property 13 (Modality Adaptation Determinism) interface
- ✅ Property 23 (V6.0 Multimodal Rejection) implementation

### What's Deferred to P2

- ❌ Full ModalityAdapter implementation with actual adaptation logic
- ❌ Multimodal ingestion (only text-only ingestion in V6.0)
- ❌ Basic parsers (OCR, transcription, document extraction)
- ❌ Derivative cache for text derivatives
- ❌ Actual acceptance of non-text UserMessages

## Migration Path to P2

When P2 multimodal support is implemented, the following changes will be made:

1. **ModalityAdapter Implementation**: Concrete implementations with actual adaptation logic
2. **Parser Integration**: OCR, transcription, and document extraction services
3. **Derivative Cache**: Caching layer for text derivatives to ensure determinism
4. **Ingestion Enhancement**: Accept and process non-text UserMessages
5. **Scope Tag Update**: Change from `scopeTag: "p0"` to `scopeTag: "p2"`

The V6.0 skeleton ensures these changes can be made without architectural modifications.

## Related Documentation

- [Usage Guide](./USAGE.md) - Practical examples and common patterns
- [Examples](./EXAMPLES.md) - Code examples for different scenarios
- [Architecture](../../.kiro/specs/multimodal/design.md) - Detailed design decisions
- [Requirements](../../.kiro/specs/multimodal/requirements.md) - Full requirements specification
