# Requirements Document: Multimodal Message Layer

## Introduction

This specification defines the **Multimodal Message Layer** module for SpecForge V6. The Multimodal module handles ingestion, storage, and adaptation of multi-modal content (images, audio, video, files, code snippets, documents) for AI agent interactions, while enforcing V6.0 scope boundaries that limit full multimodal support to P2.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0 skeleton** specification, meaning it establishes the foundational framework required for V6.0 release, with full multimodal support deferred to P2 (V6.x). The skeleton ensures that P2 capabilities can be built on a stable foundation without architectural changes.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 9: CAS Content Addressing
*For all* binary or text content c, the blob reference id obtained by storing this content in CAS satisfies `id == "blob://" + sha256(c)`; two `store(c)` operations on identical content produce the same id; `store` operations on different content produce different ids (collision probability equals SHA-256 theoretical value).

**Validates: Requirements 30.9, 5.6, 14.2**

### Property 13: Modality Adaptation Determinism
*For all* input pairs `(userMessage, modelCapabilities)` (with userMessage blob references fixed), the output decision of `prepareMessageForModel(userMessage, modelCapabilities)` (whether to use original blob or text derivative, which derivative blob id to use) is deterministic; identical inputs must produce identical outputs.

**Validates: Requirements 30.13, 14.5**

### Property 23: V6.0 Multimodal Rejection
*For all* UserMessage m submitted in V6.0, if `m.content` contains any non-text elements (image / audio / video / file / code / document), THEN the Ingestion subsystem must reject the submission and return an explicit error; there must be no "receive now, process later" state.

**Validates: Requirements 14.7, 14.8**

## Requirements

### Requirement 1: Multimodal Message Framework Skeleton

**User Story:** As a V6.0 architect, I want the multimodal message framework skeleton to be established, so that P2 full multimodal support can be built on a stable foundation without architectural changes.

#### Acceptance Criteria

1. THE Multimodal_Module SHALL define the unified `UserMessage` format with `content` as an array supporting element types: `text`, `image`, `audio`, `video`, `file`, `code`, `document`.
2. THE Multimodal_Module SHALL define the `ModelCapabilities` structure declaring which modalities a model supports.
3. THE Multimodal_Module SHALL define the `ModalityAdapter` interface with `prepareMessageForModel(userMessage, modelCapabilities)` method signature.
4. THE Multimodal_Module SHALL define CAS integration points for blob storage of multimodal content.
5. THE Multimodal_Module SHALL define observability events for modality adaptation decisions (input modality, target model, whether downgraded, derivative blob reference used).
6. THE Multimodal_Module SHALL implement Property 9 (CAS Content Addressing) for all blob storage operations.
7. THE Multimodal_Module SHALL implement Property 13 (Modality Adaptation Determinism) for the adaptation interface.
8. THE Multimodal_Module SHALL implement Property 23 (V6.0 Multimodal Rejection) by rejecting any non-text UserMessage submissions in V6.0.

### Requirement 2: V6.0 Scope Boundary Enforcement

**User Story:** As a release manager, I want V6.0 to clearly enforce the multimodal scope boundary, so that users understand what functionality is available now versus what requires P2.

#### Acceptance Criteria

1. THE Multimodal_Module SHALL clearly document that V6.0 only provides the multimodal framework skeleton; full multimodal support belongs to P2 (V6.x).
2. THE Multimodal_Module SHALL reject any UserMessage containing non-text elements (image/audio/video/file/code/document) with an explicit error message indicating P2 requirement.
3. THE Multimodal_Module SHALL NOT allow "store now, process later" semantics for multimodal content in V6.0.
4. THE Multimodal_Module SHALL ensure that P2 full multimodal support depends on the V6.0 skeleton framework; if V6.0 framework is not implemented per REQ-14.1 to REQ-14.6, P2 capabilities must not be enabled.
5. THE Multimodal_Module SHALL implement the skeleton with `scopeTag: "p0"` and document that full implementation requires `scopeTag: "p2"`.

### Requirement 3: CAS Integration for Future Multimodal Support

**User Story:** As a future P2 developer, I want the V6.0 skeleton to properly integrate with CAS, so that P2 multimodal features can store and retrieve content efficiently.

#### Acceptance Criteria

1. THE Multimodal_Module SHALL integrate with CAS (Content-Addressable Storage) for all blob references in UserMessage structures.
2. THE Multimodal_Module SHALL ensure all original modality data is stored in CAS, with blob references circulating in UserMessage instead of inline bytes.
3. THE Multimodal_Module SHALL define interfaces for future P2 basic parsers:
   - PDF/DOCX/XLSX: Text extraction
   - Images: OCR text derivatives
   - Audio: Transcription text derivatives (via external services)
4. THE Multimodal_Module SHALL define caching interfaces for text derivatives (OCR/transcription/summary) to support Property 13 determinism.
5. THE Multimodal_Module SHALL implement Property 9 verification for all CAS operations.

## Glossary

- **UserMessage**: Unified message format in V6. `content` is an array with element types: `text`, `image`, `audio`, `video`, `file`, `code`, `document`.
- **ModelCapabilities**: Structure declaring which modalities a model supports (text/image/audio/video/file etc.).
- **Modality Adaptation**: The `prepareMessageForModel()` function that downgrades UserMessage to model-acceptable form based on ModelCapabilities: uses original blob if natively supported, uses text derivative (OCR/transcription/summary) if not supported.
- **CAS**: Content-Addressable Storage, storing blobs by their SHA-256 hash as address.
- **Blob Reference**: Reference to content in CAS, format: `"blob://<sha256>"`.
- **Text Derivative**: Text representation of non-text content (OCR text from images, transcription from audio, summary from documents).
- **P0 Skeleton**: V6.0 foundational framework that establishes interfaces and data structures without full implementation.
- **P2 Full Support**: V6.x complete multimodal capabilities including ingestion, parsing, and adaptation of all modality types.
- **Deterministic Adaptation**: Property that identical inputs (same blob references + same capabilities) produce identical adaptation decisions.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 9 Test**: Verify CAS content addressing properties (identical content → identical SHA-256, different content → different SHA-256)
2. **Property 13 Test**: Verify modality adaptation determinism (same inputs → same outputs)
3. **Property 23 Test**: Verify V6.0 multimodal rejection (non-text UserMessages are rejected with clear error)

### Unit Tests

1. UserMessage format validation tests
2. ModelCapabilities structure tests
3. ModalityAdapter interface contract tests
4. CAS integration tests for blob reference handling
5. V6.0 rejection logic tests (error messages, boundary enforcement)
6. Scope tag validation tests (P0 vs P2 behavior)

### Integration Tests

1. End-to-end UserMessage submission and rejection flow
2. CAS storage and retrieval integration
3. Observability event recording for adaptation decisions
4. Cross-module integration with Ingestion subsystem
5. Error handling and user feedback for rejected multimodal content

## Notes

- This spec implements the **multimodal** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0 skeleton** scope boundary: establish framework and interfaces without full P2 implementation.
- V6.0 must reject actual multimodal content submissions; only text-only UserMessages are allowed.
- The skeleton must be complete enough that P2 implementation can build on it without architectural changes.
- All persistent structures must include `schema_version` field for future migration support.
- Error messages for rejected multimodal content must clearly indicate P2 requirement.