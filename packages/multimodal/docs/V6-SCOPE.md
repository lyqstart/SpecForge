# V6.0 Scope Boundaries - Multimodal Message Layer

## Overview

This document clarifies what is included in V6.0 and what is deferred to P2 (V6.x) for the Multimodal Message Layer.

## V6.0 Scope (P0 Skeleton)

### ✅ Included in V6.0

#### 1. Data Structures and Types

- **UserMessage**: Unified message format with all modality types defined
- **MessageContentItem**: Union type for all content types (text, image, audio, video, file, code, document)
- **BlobRef**: Content-Addressable Storage reference type (`blob://<sha256>`)
- **ModelCapabilities**: Model capability declaration structure
- **ModalityAdapter**: Interface for message adaptation
- **PreparedMessage**: Output of adaptation process

#### 2. Core Functionality

- **Message Creation**: `createTextMessage()` for text-only messages
- **Message Validation**: `validateUserMessage()` for structure validation
- **V6.0 Compliance Check**: `isV6Compliant()` to verify text-only content
- **Text Extraction**: `extractTextContent()` to get text from messages
- **Serialization**: `serializeUserMessage()` and `deserializeUserMessage()`
- **Type Guards**: Predicates for safe content item handling

#### 3. CAS Integration

- **BlobRef Management**: Create, validate, and extract hashes
- **CASClient Interface**: Define storage operations (store, retrieve, exists)
- **Property 9 Verification**: Helpers to verify CAS content addressing
- **SHA-256 Computation**: `computeSHA256()` for hash calculation

#### 4. V6.0 Ingestion

- **V6IngestionSubsystem**: Text-only ingestion implementation
- **Rejection Logic**: Reject non-text with clear error messages
- **Error Codes**: `V6_MULTIMODAL_REJECTED` for non-text content
- **Error Messages**: Indicate P2 requirement for multimodal support

#### 5. Observability

- **Event Schemas**: Define adaptation and rejection events
- **EventRecorder**: Record events to CAS
- **Event Queries**: Query recorded events
- **Event Persistence**: Store events with blob references

#### 6. Correctness Properties

- **Property 9**: CAS Content Addressing (implemented and tested)
- **Property 13**: Modality Adaptation Determinism (interface defined)
- **Property 23**: V6.0 Multimodal Rejection (implemented and tested)

#### 7. Testing

- **Property-Based Tests**: For all three inherited properties
- **Unit Tests**: For all data structures and functions
- **Integration Tests**: For end-to-end flows
- **Type Safety**: Full TypeScript type definitions

### ❌ NOT Included in V6.0

#### 1. Multimodal Ingestion

- ❌ Accepting non-text UserMessages
- ❌ Processing images, audio, video, files, code, documents
- ❌ "Store now, process later" semantics
- ❌ Multimodal content handling

#### 2. Parsers and Extraction

- ❌ OCR (Optical Character Recognition) for images
- ❌ Transcription for audio
- ❌ Document extraction (PDF, DOCX, XLSX)
- ❌ Code parsing and analysis
- ❌ Video frame extraction

#### 3. Derivative Generation

- ❌ Text derivatives from images (OCR output)
- ❌ Text derivatives from audio (transcription)
- ❌ Text derivatives from documents (extraction)
- ❌ Summary generation
- ❌ Metadata extraction

#### 4. Derivative Cache

- ❌ Caching layer for text derivatives
- ❌ Cache invalidation logic
- ❌ Cache performance optimization
- ❌ Distributed cache support

#### 5. Full ModalityAdapter Implementation

- ❌ Concrete adapter implementations
- ❌ Actual adaptation logic
- ❌ Downgrading strategies
- ❌ Model-specific adaptations
- ❌ Fallback mechanisms

#### 6. Advanced Observability

- ❌ Detailed adaptation decision tracking
- ❌ Performance metrics
- ❌ Error analytics
- ❌ Usage patterns analysis
- ❌ Derivative cache statistics

## Enforcement Mechanisms

### 1. Scope Tag

The multimodal module is tagged as `p0` in `.config.kiro`:

```json
{
  "specId": "multimodal",
  "scopeTag": "p0"
}
```

This indicates:
- V6.0 skeleton implementation
- Full implementation requires `scopeTag: "p2"`
- P2 features cannot be enabled in V6.0

### 2. V6.0 Rejection Logic

All non-text UserMessages are rejected:

```typescript
const result = await ingestion.submitMessage({
  content: [{ type: 'image', blob: 'blob://...', mime: 'image/png' }],
});

// Result:
// {
//   success: false,
//   error: 'Multimodal content not supported in V6.0. Full support requires P2 (V6.x).',
//   errorCode: 'V6_MULTIMODAL_REJECTED'
// }
```

### 3. Error Messages

All rejection errors clearly indicate P2 requirement:

```
"Multimodal content not supported in V6.0. Full support requires P2 (V6.x)."
```

This ensures users understand:
- Feature is not available now
- Feature is planned for P2
- They should wait or use text-only for now

### 4. Documentation

All documentation clearly distinguishes V6.0 from P2:

| Component | V6.0 | P2 |
|-----------|------|-----|
| UserMessage Format | ✅ Defined | ✅ Fully implemented |
| Text-Only Ingestion | ✅ Implemented | ✅ Enhanced |
| Multimodal Ingestion | ❌ Rejected | ✅ Accepted |
| Parsers | ❌ Skeleton | ✅ Implemented |
| Derivative Cache | ❌ Skeleton | ✅ Implemented |

## User-Facing Behavior

### V6.0 User Experience

#### Scenario 1: Text Message (Supported)

```typescript
const message = createTextMessage('What is the weather?');
const result = await ingestion.submitMessage(message);

// Result: { success: true, messageId: 'msg-123' }
// User: Message submitted successfully ✓
```

#### Scenario 2: Image Message (Not Supported)

```typescript
const message = {
  content: [{ type: 'image', blob: 'blob://...', mime: 'image/png' }],
};
const result = await ingestion.submitMessage(message);

// Result: {
//   success: false,
//   error: 'Multimodal content not supported in V6.0. Full support requires P2 (V6.x).',
//   errorCode: 'V6_MULTIMODAL_REJECTED'
// }
// User: Feature not available in V6.0, coming in P2
```

#### Scenario 3: Mixed Content (Not Supported)

```typescript
const message = {
  content: [
    { type: 'text', text: 'Here is an image:' },
    { type: 'image', blob: 'blob://...', mime: 'image/png' },
  ],
};
const result = await ingestion.submitMessage(message);

// Result: {
//   success: false,
//   error: 'Multimodal content not supported in V6.0. Full support requires P2 (V6.x).',
//   errorCode: 'V6_MULTIMODAL_REJECTED'
// }
// User: Even mixed content is rejected in V6.0
```

## Migration Path to P2

### Step 1: Enable Parsers

When P2 is ready, enable parser services:

```typescript
// P2 implementation
const adapter = new FullModalityAdapter({
  ocrService: new OCRService(),
  transcriptionService: new TranscriptionService(),
  extractionService: new ExtractionService(),
});
```

### Step 2: Implement Derivative Cache

Add caching layer for determinism:

```typescript
// P2 implementation
const cache = new DerivativeCache(casClient);
const adapter = new CachedModalityAdapter(baseAdapter, cache);
```

### Step 3: Update Ingestion

Accept non-text content:

```typescript
// P2 implementation
class P2IngestionSubsystem implements IngestionSubsystem {
  async submitMessage(message: UserMessage): Promise<SubmitResult> {
    // Accept all modality types
    // Use adapter to prepare for target model
    // Store derivatives in cache
    // Record adaptation events
  }
}
```

### Step 4: Update Scope Tag

Change from P0 to P2:

```json
{
  "specId": "multimodal",
  "scopeTag": "p2"
}
```

### Step 5: Release

Release P2 multimodal support as part of V6.x release.

## Backward Compatibility

### V6.0 to P2 Migration

The V6.0 skeleton ensures smooth migration to P2:

1. **No Breaking Changes**: All V6.0 APIs remain unchanged
2. **Additive Only**: P2 adds new functionality, doesn't remove existing
3. **Opt-In**: P2 features are opt-in, V6.0 behavior unchanged
4. **Data Compatibility**: All data structures remain compatible

### Example: Text Message Handling

```typescript
// V6.0
const message = createTextMessage('Hello');
const result = await ingestion.submitMessage(message);
// Result: { success: true, messageId: 'msg-123' }

// P2 (same code, same result)
const message = createTextMessage('Hello');
const result = await ingestion.submitMessage(message);
// Result: { success: true, messageId: 'msg-123' }
```

## Testing V6.0 Boundaries

### Property 23: V6.0 Multimodal Rejection

Property-based test verifies V6.0 boundaries:

```typescript
import { fc } from 'fast-check';

describe('Property 23: V6.0 Multimodal Rejection', () => {
  it('should reject all non-text UserMessages', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({ type: fc.constant('image'), blob: fc.string(), mime: fc.string() }),
            fc.record({ type: fc.constant('audio'), blob: fc.string(), mime: fc.string() }),
            // ... other non-text types
          ),
          { minLength: 1 }
        ),
        (items) => {
          const message = { content: items };
          const result = ingestion.submitMessage(message);
          
          expect(result.success).toBe(false);
          expect(result.errorCode).toBe('V6_MULTIMODAL_REJECTED');
        }
      )
    );
  });
});
```

## FAQ

### Q: Can I use multimodal content in V6.0?

**A**: No. V6.0 only accepts text-only messages. Non-text content is rejected with a clear error message indicating P2 requirement.

### Q: When will multimodal support be available?

**A**: Full multimodal support is planned for P2 (V6.x). The V6.0 skeleton provides the foundation for this.

### Q: Can I work around the V6.0 limitation?

**A**: No. The V6.0 rejection logic is enforced at the ingestion layer. All non-text content is rejected.

### Q: What should I do if I need multimodal support now?

**A**: You have two options:
1. Extract text from your content (e.g., OCR for images) and submit as text
2. Wait for P2 multimodal support in V6.x

### Q: Will my V6.0 code break when P2 is released?

**A**: No. V6.0 code will continue to work unchanged. P2 adds new functionality without breaking existing code.

### Q: How do I prepare for P2?

**A**: The V6.0 skeleton is already P2-ready. No changes needed. When P2 is released, you can opt-in to multimodal features.

## Related Documentation

- [API Reference](./API.md) - Complete API documentation
- [Usage Guide](./USAGE.md) - Practical patterns
- [Code Examples](./EXAMPLES.md) - Runnable examples
- [Architecture](./ARCHITECTURE.md) - System design
- [Requirements](../../.kiro/specs/multimodal/requirements.md) - Full specification
- [Design](../../.kiro/specs/multimodal/design.md) - Design document
