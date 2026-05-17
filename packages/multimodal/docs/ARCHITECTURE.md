# Multimodal Message Layer - Architecture Guide

## System Overview

The Multimodal Message Layer is a foundational framework for handling multi-modal content in SpecForge V6. This document describes the architecture, component interactions, and design decisions.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    External Systems                              │
│  (Agents, Workflows, User Interfaces)                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Ingestion Subsystem (V6.0)                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ V6IngestionSubsystem                                     │   │
│  │ - Accepts text-only UserMessages                         │   │
│  │ - Rejects non-text with P2 indication                    │   │
│  │ - Validates message structure                            │   │
│  │ - Records rejection events                               │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ UserMessage  │  │ Modality     │  │ Event        │
│ Types        │  │ Adapter      │  │ Recorder     │
│              │  │              │  │              │
│ - Text       │  │ Interface    │  │ - Record     │
│ - Image      │  │ (Skeleton)   │  │ - Query      │
│ - Audio      │  │              │  │ - Persist    │
│ - Video      │  │ Property 13: │  │              │
│ - File       │  │ Determinism  │  │ Property 9:  │
│ - Code       │  │              │  │ CAS Refs     │
│ - Document   │  │              │  │              │
│              │  │              │  │              │
│ Property 23: │  │              │  │              │
│ V6.0         │  │              │  │              │
│ Rejection    │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  CAS Integration Layer         │
        │  ┌──────────────────────────┐  │
        │  │ BlobRef Management       │  │
        │  │ - Create: blob://<sha256>│  │
        │  │ - Validate format        │  │
        │  │ - Extract hash           │  │
        │  └──────────────────────────┘  │
        │  ┌──────────────────────────┐  │
        │  │ CASClient Interface      │  │
        │  │ - store(content)         │  │
        │  │ - retrieve(ref)          │  │
        │  │ - exists(ref)            │  │
        │  └──────────────────────────┘  │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  Content-Addressable Storage   │
        │  (External CAS Implementation) │
        └────────────────────────────────┘
```

## Data Flow

### Text Message Submission (V6.0 Compliant)

```
User Input
    │
    ▼
createTextMessage()
    │
    ▼
UserMessage { content: [{ type: "text", text: "..." }] }
    │
    ▼
validateUserMessage()
    │
    ├─ Valid? ──▶ Continue
    │
    └─ Invalid? ──▶ Return ValidationError
                        │
                        ▼
                    User sees error
    │
    ▼
V6IngestionSubsystem.submitMessage()
    │
    ├─ isV6Compliant()? ──▶ Yes
    │
    ▼
Process message
    │
    ▼
SubmitResult { success: true, messageId: "..." }
    │
    ▼
User receives messageId
```

### Non-Text Message Submission (V6.0 Rejection)

```
User Input (with image/audio/etc)
    │
    ▼
UserMessage { content: [{ type: "image", blob: "...", mime: "..." }] }
    │
    ▼
V6IngestionSubsystem.submitMessage()
    │
    ├─ isV6Compliant()? ──▶ No
    │
    ▼
Record rejection event
    │
    ▼
SubmitResult {
  success: false,
  error: "Multimodal content not supported in V6.0...",
  errorCode: "V6_MULTIMODAL_REJECTED"
}
    │
    ▼
User sees error + P2 indication
```

### CAS Content Storage (Property 9)

```
Content (bytes)
    │
    ▼
computeSHA256(content)
    │
    ▼
hash = "abc123def456..." (64 hex chars)
    │
    ▼
createBlobRef(hash)
    │
    ▼
BlobRef = "blob://abc123def456..."
    │
    ▼
CASClient.store(content)
    │
    ├─ Compute SHA-256
    │
    ├─ Create blob reference
    │
    ├─ Store in CAS
    │
    ▼
Return BlobRef
    │
    ▼
Use in UserMessage: { type: "image", blob: BlobRef, mime: "..." }
```

## Core Interfaces

### UserMessage

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

**V6.0 Constraint**: Only `{ type: "text" }` items allowed.

### ModalityAdapter (Property 13)

```typescript
interface ModalityAdapter {
  prepareMessageForModel(
    message: UserMessage,
    capabilities: ModelCapabilities,
  ): PreparedMessage;
}

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

**Determinism Requirement (Property 13)**:
- Same `(message, capabilities)` input → Same `PreparedMessage` output
- Enables reproducible adaptation decisions
- Supports observability and debugging

### CASClient (Property 9)

```typescript
interface CASClient {
  store(content: Uint8Array): Promise<BlobRef>;
  retrieve(ref: BlobRef): Promise<Uint8Array>;
  exists(ref: BlobRef): Promise<boolean>;
}

type BlobRef = `blob://${string}`;
// Format: blob://<sha256-hash> (64 lowercase hex)
```

**Content Addressing (Property 9)**:
- `store(content)` returns `blob://<sha256(content)>`
- Identical content → Identical reference
- Different content → Different reference
- Deterministic addressing enables deduplication

### IngestionSubsystem

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

**V6.0 Implementation**:
- Accepts text-only messages
- Rejects non-text with `errorCode: "V6_MULTIMODAL_REJECTED"`
- Records rejection events for observability

## Correctness Properties

### Property 9: CAS Content Addressing

**Requirement**: For all content c, `store(c).id == "blob://" + sha256(c)`

**Implementation**:
1. Compute SHA-256 hash of content
2. Create BlobRef: `blob://<hash>`
3. Store in CAS with deterministic addressing
4. Retrieve using same reference

**Verification**:
```typescript
const content = new TextEncoder().encode("Hello");
const hash = await computeSHA256(content);
const ref = createBlobRef(hash);
const isValid = await verifyBlobRef(content, ref);
// isValid === true
```

**Testing**:
- Property-based test generates random content
- Verifies identical content → identical reference
- Verifies different content → different reference
- Minimum 1000 iterations

### Property 13: Modality Adaptation Determinism

**Requirement**: For all `(message, capabilities)` pairs, `prepareMessageForModel(message, capabilities)` is deterministic.

**Implementation**:
1. ModalityAdapter interface defines contract
2. Metadata includes all adaptation decisions
3. Same inputs → Same outputs
4. Enables reproducible adaptation

**Verification**:
```typescript
const msg1 = createTextMessage("Hello");
const caps = { modalities: ["text"], maxInputTokens: 4096, supportsTools: false };

const result1 = adapter.prepareMessageForModel(msg1, caps);
const result2 = adapter.prepareMessageForModel(msg1, caps);

// result1 === result2 (deep equality)
```

**Testing**:
- Property-based test generates random `(message, capabilities)` pairs
- Verifies identical inputs produce identical outputs
- Tests with mocked adapter implementations
- Minimum 100 iterations

### Property 23: V6.0 Multimodal Rejection

**Requirement**: All non-text UserMessages are rejected in V6.0 with explicit error.

**Implementation**:
1. V6IngestionSubsystem checks `isV6Compliant(message)`
2. Non-text messages rejected with `errorCode: "V6_MULTIMODAL_REJECTED"`
3. Error message indicates P2 requirement
4. No "store now, process later" semantics

**Verification**:
```typescript
const textMsg = createTextMessage("Hello");
const imageMsg = { content: [{ type: "image", blob: "blob://...", mime: "image/png" }] };

const result1 = await ingestion.submitMessage(textMsg);
// result1.success === true

const result2 = await ingestion.submitMessage(imageMsg);
// result2.success === false
// result2.errorCode === "V6_MULTIMODAL_REJECTED"
```

**Testing**:
- Property-based test generates UserMessages with mixed modality content
- Verifies all non-text messages are rejected
- Verifies text-only messages are accepted
- Tests all non-text types: image, audio, video, file, code, document
- Minimum 100 iterations

## Integration Points

### With Ingestion Subsystem

The multimodal module provides:
- `UserMessage` type for unified message format
- `V6IngestionSubsystem` for V6.0 text-only ingestion
- Rejection logic with clear error messages
- Event recording for observability

### With CAS (Content-Addressable Storage)

The multimodal module:
- Defines `BlobRef` type for content references
- Provides `CASClient` interface for storage operations
- Implements Property 9 verification helpers
- Supports deterministic blob addressing

### With Observability

The multimodal module:
- Defines event schemas for adaptation decisions
- Provides `EventRecorder` for event persistence
- Records rejection events with full context
- Enables querying and analysis of modality decisions

### With Future P2 Components

The V6.0 skeleton enables P2 to add:
- **Parsers**: OCR, transcription, document extraction
- **Derivative Cache**: Text derivatives for determinism
- **Full Adapter**: Concrete ModalityAdapter implementations
- **Multimodal Ingestion**: Accept and process non-text content

## Design Decisions

### ADR-MM-001: V6.0 Skeleton-Only Approach

**Decision**: Implement only framework skeleton in V6.0, defer full functionality to P2.

**Rationale**:
- Aligns with V6.0 scope boundaries
- Enforces Property 23 (V6.0 Multimodal Rejection)
- Provides stable foundation for P2
- Reduces V6.0 complexity and risk

**Alternatives Considered**:
- Partial implementation (risk of incomplete behavior)
- No framework (would require architectural changes for P2)

### ADR-MM-002: Deterministic Adaptation Interface

**Decision**: Define ModalityAdapter with deterministic `prepareMessageForModel()`.

**Rationale**:
- Enforces Property 13 (Modality Adaptation Determinism)
- Provides clear contract for P2 implementation
- Enables testing independent of actual parsers

**Alternatives Considered**:
- Non-deterministic adaptation (violates architectural property)
- Tight coupling with specific parsers (reduces flexibility)

### ADR-MM-003: CAS-First Blob Reference Design

**Decision**: All non-text content uses CAS blob references from day one.

**Rationale**:
- Enforces Property 9 (CAS Content Addressing)
- Consistent with V6 architecture
- Enables efficient storage and retrieval
- Prevents inline data bloat

**Alternatives Considered**:
- Inline base64 encoding (bloats events, violates requirements)
- Hybrid approach (inconsistent, harder to migrate)

## Testing Strategy

### Property-Based Tests

1. **Property 9 Test**: CAS Content Addressing
   - Generate random content
   - Verify deterministic addressing
   - Verify collision properties
   - Minimum 1000 iterations

2. **Property 13 Test**: Modality Adaptation Determinism
   - Generate random `(message, capabilities)` pairs
   - Verify deterministic output
   - Test edge cases
   - Minimum 100 iterations

3. **Property 23 Test**: V6.0 Multimodal Rejection
   - Generate mixed modality messages
   - Verify rejection of non-text
   - Verify acceptance of text-only
   - Minimum 100 iterations

### Unit Tests

- UserMessage validation
- ModelCapabilities structure
- ModalityAdapter interface
- CAS integration
- V6.0 rejection logic
- Observability events

### Integration Tests

- End-to-end text message flow
- Multimodal rejection flow
- CAS storage and retrieval
- Event recording and querying
- Cross-module integration

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Create UserMessage | O(n) | n = content items |
| Validate UserMessage | O(n) | n = content items |
| Compute SHA-256 | O(m) | m = content size |
| Create BlobRef | O(1) | String formatting |
| Validate BlobRef | O(1) | Regex matching |
| Store in CAS | O(m) | m = content size |
| Retrieve from CAS | O(m) | m = content size |
| Record event | O(1) | Async, non-blocking |
| Query events | O(k) | k = matching events |

## Migration Path to P2

### Phase 1: Parser Integration
- Implement OCR for images
- Implement transcription for audio
- Implement extraction for documents

### Phase 2: Derivative Cache
- Implement caching layer
- Ensure determinism (Property 13)
- Support cache invalidation

### Phase 3: Full Adapter Implementation
- Implement ModalityAdapter with actual logic
- Support all modality types
- Handle downgrading gracefully

### Phase 4: Multimodal Ingestion
- Update V6IngestionSubsystem to accept non-text
- Integrate with parsers and cache
- Record adaptation events

### Phase 5: Scope Tag Update
- Change from `scopeTag: "p0"` to `scopeTag: "p2"`
- Update documentation
- Release as P2 feature

## Related Documentation

- [API Reference](./API.md) - Complete API documentation
- [Usage Guide](./USAGE.md) - Practical patterns
- [Code Examples](./EXAMPLES.md) - Runnable examples
- [Requirements](../../.kiro/specs/multimodal/requirements.md) - Full specification
- [Design](../../.kiro/specs/multimodal/design.md) - Design document
