# Requirements Document: OpenCode Adapter

## Introduction

This specification defines the **OpenCode Adapter** module for SpecForge V6. The OpenCode Adapter is the LLM Kernel adapter layer that isolates OpenCode-specific concepts and behaviors, providing a clean abstraction interface to the Daemon Core while absorbing OpenCode version changes.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 4: Adapter Encapsulation
*For all* public API surfaces exported from the `Adapter/OpenCodeAdapter` directory and Tool Context field sets, their type signatures and runtime data must **not** contain OpenCode-specific concepts (including but not limited to OpenCode's `ctx`, `callID`, plugin hook shape, internal event schema). Even if the Adapter fails to fully absorb OpenCode behavior changes, the concept isolation obligation takes precedence (prefer returning "unsupported" errors over leakage).

**Validates: Requirements 30.4, 8.5, 8.6, 8.7, 22.3**

### Property 12: Adapter Version Alignment
*For all* OpenCode versions v observed at startup and `OpenCodeAdapter.compatibleKernelRange` interval R, if v ∉ R, THEN Daemon must refuse to bind to that OpenCode instance and record an `adapter.version_mismatch` event; conversely if v ∈ R, binding succeeds.

**Validates: Requirements 30.12, 8.4**

## Requirements

### Requirement 1: LLM Kernel Adapter Interface Implementation

**User Story:** As an architecture maintainer, I want OpenCode version changes to affect only one isolation layer (REQ-8), so that V6's coupling to OpenCode's internal behavior evolution is minimized.

#### Acceptance Criteria

1. THE OpenCode_Adapter SHALL implement the `LLMKernelAdapter` abstract interface defined in the parent spec, containing at least: `spawnAgent`, `getSession`, `cancelSession`, `sendPrompt`, `subscribeEvents`, `getCapabilities`.
2. THE OpenCode_Adapter SHALL be the only LLMKernelAdapter implementation in V6.0.
3. THE OpenCode_Adapter SHALL allow future extension to other Adapters (e.g., `ClaudeCodeAdapter`), but these are not within V6.0 scope.
4. THE OpenCode_Adapter SHALL have a version corresponding to a major OpenCode version; when OpenCode major version upgrades, Adapter must explicitly upgrade version number.
5. WHEN OpenCode external behavior changes (e.g., event schema changes, tool hook parameter changes), THE OpenCode_Adapter SHALL absorb those changes; Daemon core and other modules must not be aware of these changes.
6. IF OpenCode_Adapter fails to fully absorb an OpenCode behavior change, THEN THE OpenCode_Adapter SHALL still prevent OpenCode-specific concepts from leaking to Daemon core or Tool Context (concept isolation obligation takes precedence over change absorption obligation).
7. THE Adapter_Layer SHALL not leak OpenCode-specific concepts (e.g., OpenCode's `ctx`, `callID` structures) to Daemon core or Tool Context.

### Requirement 2: Version Alignment and Compatibility Enforcement

**User Story:** As a system administrator, I want clear version compatibility checking between OpenCode Adapter and OpenCode itself, so that incompatible combinations are detected early and prevented.

#### Acceptance Criteria

1. THE OpenCode_Adapter SHALL declare a `compatibleKernelRange` property specifying the compatible OpenCode major version range (e.g., "opencode ^1.14").
2. WHEN Daemon starts, THE OpenCode_Adapter SHALL detect the running OpenCode version.
3. IF detected OpenCode version is outside `compatibleKernelRange`, THEN THE OpenCode_Adapter SHALL refuse to bind to that OpenCode instance and record an `adapter.version_mismatch` event.
4. THE OpenCode_Adapter SHALL provide clear error messages guiding users to either upgrade the Adapter or downgrade OpenCode to achieve compatibility.
5. WHERE multiple OpenCode versions are installed, THE OpenCode_Adapter SHALL attempt to bind to the highest compatible version within `compatibleKernelRange`.

### Requirement 3: Concept Isolation and Abstraction

**User Story:** As a Daemon core developer, I want a clean abstraction layer that hides OpenCode implementation details, so that Daemon core remains stable regardless of OpenCode internal changes.

#### Acceptance Criteria

1. THE OpenCode_Adapter SHALL translate all OpenCode-specific data structures (plugin hook parameters, event payloads, tool call contexts) into Daemon-neutral representations before passing them to Daemon core.
2. THE OpenCode_Adapter SHALL not expose any OpenCode-specific types or interfaces in its public API.
3. WHERE OpenCode introduces new capabilities not covered by the current Adapter version, THE OpenCode_Adapter SHALL either:
   - Absorb the change transparently if it can be mapped to existing Daemon concepts
   - Return "unsupported" errors for affected operations while maintaining concept isolation
4. THE OpenCode_Adapter SHALL maintain a translation layer for:
   - OpenCode session management → Daemon Session Registry
   - OpenCode tool calls → Daemon Tool Context
   - OpenCode events → Daemon Event Bus events
   - OpenCode capabilities → Daemon ModelCapabilities
5. ALL translation logic SHALL be contained within the OpenCodeAdapter module; no translation code shall exist in Daemon core or other modules.

### Requirement 4: Thin Plugin Integration

**User Story:** As a Thin Plugin developer, I want clear integration points with the OpenCode Adapter, so that the Thin Plugin can efficiently forward events and receive commands.

#### Acceptance Criteria

1. THE OpenCode_Adapter SHALL provide a well-defined protocol for Thin Plugin to report OpenCode events to Daemon.
2. THE OpenCode_Adapter SHALL handle session binding from Thin Plugin events (first-contact binding strategy).
3. THE OpenCode_Adapter SHALL support Thin Plugin's on-demand Daemon startup mechanism.
4. THE OpenCode_Adapter SHALL provide event subscription mechanisms for Thin Plugin to receive commands from Daemon.
5. WHERE Thin Plugin and OpenCode Adapter versions mismatch, THE OpenCode_Adapter SHALL provide graceful degradation or clear error messages.

## Glossary

- **LLM Kernel Adapter**: Abstract interface defining `spawnAgent`, `getSession`, `cancelSession`, `sendPrompt`, `subscribeEvents`, `getCapabilities` six methods. V6.0's only implementation is OpenCodeAdapter.
- **OpenCodeAdapter**: LLMKernelAdapter implementation targeting OpenCode, version aligned with a specific OpenCode major version.
- **Adapter Encapsulation**: Architectural principle that OpenCode-specific concepts (`ctx`, `callID`, plugin hook shape, internal event schema) must be contained within the Adapter layer and not leak to Daemon core or Tool Context.
- **Concept Isolation Obligation**: The Adapter's responsibility to prevent OpenCode concept leakage, taking precedence over change absorption when conflicts arise.
- **Compatible Kernel Range**: Version range specification declaring which OpenCode major versions an Adapter supports.
- **Thin Plugin**: Minimal OpenCode plugin deployed in `.opencode/` directory, whose sole responsibility is to report OpenCode runtime events to Daemon and start Daemon when needed.
- **First-Contact Binding**: Session identity strategy where Daemon pre-generates `spawnIntentId` and registers pending record, then Thin Plugin/Adapter binds real `sessionId` on first event arrival.
- **Daemon-Neutral Representation**: Data structures and interfaces that contain no OpenCode-specific concepts, used for communication between Adapter and Daemon core.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 4 Test**: Verify Adapter Encapsulation - no OpenCode-specific concepts leak to Daemon core or Tool Context
2. **Property 12 Test**: Verify Adapter Version Alignment - incompatible OpenCode versions are rejected with proper events

### Unit Tests

1. LLM Kernel Adapter interface implementation tests (all six methods)
2. Version compatibility tests (range checking, error messages)
3. Concept translation tests (OpenCode → Daemon-neutral conversion)
4. Thin Plugin integration tests (event reporting, session binding)
5. Error handling tests (unsupported features, version mismatches)

### Integration Tests

1. End-to-end OpenCode ↔ Adapter ↔ Daemon communication
2. Version compatibility scenarios (compatible, incompatible, edge cases)
3. Thin Plugin ↔ Adapter event flow
4. Session lifecycle management (creation, binding, termination)
5. Tool call translation and forwarding

### Compatibility Tests

1. Backward compatibility with previous OpenCode versions (within range)
2. Forward compatibility testing with OpenCode beta/pre-release versions
3. Migration scenarios between OpenCode major versions
4. Mixed-version environments (multiple OpenCode installations)

## Notes

- This spec implements the **opencode-adapter** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- The Adapter must maintain a clear separation between:
  - **Absorption obligation**: Translating OpenCode changes to minimize impact on Daemon
  - **Isolation obligation**: Preventing OpenCode concept leakage (takes precedence)
- Version compatibility checking is critical for system stability; false positives (rejecting compatible versions) are preferred over false negatives (accepting incompatible versions).
- All translation logic should be designed for testability, with clear input/output specifications for each translation function.
