# Requirements Document: CLI

## Introduction

This specification defines the **Command Line Interface (CLI)** module for SpecForge V6. The CLI provides dual-mode access to the Daemon, supporting both human-friendly interactive usage and machine-friendly structured output for integration with tools like OpenClaw.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 17: Payload Size Thresholding
*For all* individual content items c in request or response bodies, if `|c| > 64 KiB`, THEN that content must appear in HTTP body as `blob://<sha256>` reference, not inline raw bytes; i.e., the body must not simultaneously carry `> 64 KiB` of raw data.

**Validates: Requirements 5.6**

### Property 18: Async Command Contract
*For all* CLI commands cmd marked as asynchronous, in `--json` mode the immediate response output of `cmd` must contain `{ jobId: string, status: "pending" }` and be valid JSON parseable; there must exist a `specforge job <jobId>` query endpoint returning current status; when `cmd --wait --json` ends, the output job status must be ∈ terminal state set {completed, failed, blocked, cancelled}.

**Validates: Requirements 11.1, 11.3, 11.4**

## Requirements

### Requirement 1: CLI Dual-Mode Implementation

**User Story:** As a human user and OpenClaw/robot integrator, I want the CLI to support both "interactive, colorful" and "machine-friendly, structured" modes, so that both humans and automation tools can effectively use SpecForge.

#### Acceptance Criteria

1. THE CLI SHALL support `--json` parameter for every command, outputting a single JSON object or JSON array without color escape sequences or interactive prompts.
2. WHEN user does not specify `--json`, THE CLI SHALL default to colorful interactive output.
3. WHERE a command is asynchronous (e.g., "create spec", "execute workflow"), THE CLI SHALL support immediate return of `jobId` and allow status query via `specforge job <id>`.
4. THE CLI SHALL support `--wait` parameter for asynchronous commands; `--wait` will block until job completes and return final state JSON.
5. THE CLI SHALL support `specforge webhook register --url <url> --events "<pattern>"` command for subscribing to events (e.g., `gate.*`).
6. THE CLI SHALL NOT directly integrate Telegram; Telegram/WhatsApp/Discord scenarios must be handled by OpenClaw calling the CLI.

### Requirement 2: Payload Size Threshold Implementation

**User Story:** As a system architect, I want the CLI to enforce payload size thresholds from REQ-5.6, so that large content is properly handled via CAS blob references.

#### Acceptance Criteria

1. THE CLI SHALL detect when request or response body items exceed 64 KiB.
2. WHEN content > 64 KiB is detected, THE CLI SHALL automatically convert it to `blob://<sha256>` reference format.
3. THE CLI SHALL handle blob references transparently for users, automatically fetching blob content when needed for human-readable output.
4. THE CLI SHALL ensure that HTTP bodies never contain > 64 KiB of inline raw data.

### Requirement 3: Async Command Contract Implementation

**User Story:** As an automation tool developer, I want the CLI to provide consistent asynchronous command contracts, so that I can reliably integrate with SpecForge programmatically.

#### Acceptance Criteria

1. THE CLI SHALL mark appropriate commands as asynchronous (e.g., spec creation, workflow execution).
2. FOR asynchronous commands in `--json` mode, THE CLI SHALL output `{ jobId: string, status: "pending" }` as immediate response.
3. THE CLI SHALL implement `specforge job <jobId>` command that returns current job status in consistent JSON format.
4. WHEN `--wait` flag is used with `--json`, THE CLI SHALL block until job reaches terminal state and output final state JSON.
5. THE CLI SHALL define terminal state set as {completed, failed, blocked, cancelled} and ensure all async jobs end in one of these states.

## Glossary

- **CLI**: Command Line Interface for SpecForge V6, providing access to Daemon functionality.
- **Dual-mode**: Support for both interactive human usage and machine-friendly structured output.
- **`--json`**: CLI flag that forces structured JSON output without colors or interactive prompts.
- **`--wait`**: CLI flag that blocks until asynchronous job completes.
- **`jobId`**: Unique identifier for asynchronous operations, used to query status.
- **OpenClaw**: Open-source gateway that bridges instant messaging platforms (Telegram, WhatsApp, Discord) to local AI agents.
- **Blob reference**: `blob://<sha256>` format for referencing large content stored in CAS.
- **Asynchronous command**: CLI command that returns immediately with jobId, with actual operation continuing in background.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 17 Test**: Verify payload size thresholding (content > 64 KiB becomes blob reference)
2. **Property 18 Test**: Verify async command contract (immediate jobId, status query, terminal states)

### Unit Tests

1. CLI dual-mode output tests (interactive vs JSON)
2. Async command handling tests (jobId generation, status query)
3. Payload size detection and blob reference conversion tests
4. Webhook registration command tests
5. Error handling tests for malformed commands

### Integration Tests

1. End-to-end CLI communication with Daemon
2. Async command lifecycle tests (start, query, completion)
3. Blob reference handling integration with CAS
4. OpenClaw integration scenarios (machine-friendly mode)
5. Cross-platform compatibility tests

## Notes

- This spec implements the **cli** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- The CLI must be compatible with the Daemon's HTTP/SSE protocol and authentication mechanism.
- Machine-friendly mode (`--json`) is critical for OpenClaw and other automation tool integration.