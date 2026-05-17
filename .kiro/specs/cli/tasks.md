# Implementation Plan: CLI

## Overview

This implementation plan covers the development of the **Command Line Interface (CLI)** module for SpecForge V6. The CLI provides dual-mode access to the Daemon, supporting both interactive human usage and machine-friendly structured output for automation tools like OpenClaw.

**Implementation Language**: **TypeScript** (aligning with existing `.opencode/tools/` toolchain).

**Scope**: **P0** - Required for V6.0 release.

## Tasks

- [x] 1. Setup CLI Project Structure
  - [x] 1.1 Create CLI package directory structure
    - Create `packages/cli/` directory with standard Node.js/TypeScript project layout
    - Initialize package.json with dependencies (yargs/commander, chalk, axios/fetch, etc.)
    - Set up TypeScript configuration
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Implement basic CLI skeleton
    - Create main entry point (`src/cli.ts`)
    - Implement command parsing skeleton
    - Add `--help` and `--version` support
    - _Requirements: 1.1, 1.2_

- [x] 2. Implement Dual-Mode Output System
  - [ ] 2.1 Create ModeSwitch component
    - Implement mode detection (`--json` flag handling)
    - Create output formatter for interactive mode (colorful, human-readable)
    - Create output formatter for JSON mode (structured, no colors)
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Implement consistent error formatting
    - Interactive error formatting (colored, with hints)
    - JSON error formatting (structured error objects)
    - Error code definitions for machine consumption
    - _Requirements: 1.1, 1.2_

- [x] 3. Implement Authentication and Daemon Communication
  - [x] 3.1 Create AuthManager component
    - Read handshake file (`~/.specforge/runtime/daemon.sock.json`)
    - Validate Bearer Token
    - Generate Authorization headers
    - _Requirements: 1.1, 1.2_
  - [x] 3.2 Implement HTTP Client
    - HTTP/1.1 client for Daemon communication
    - SSE support for event streaming
    - Error handling for network issues
    - _Requirements: 1.1, 1.2_

- [x] 4. Implement Payload Size Thresholding (Property 17)
  - [x] 4.1 Create BlobHandler component
    - Detect content size (> 64 KiB threshold)
    - Convert large content to `blob://<sha256>` references
    - Resolve blob references for interactive display
    - _Requirements: 2.1, 2.2, 2.3, 2.4; Property 17_
  - [x] 4.2 Integrate blob handling with HTTP client
    - Automatic blob conversion on request
    - Automatic blob resolution on response
    - Transparent handling for users
    - _Requirements: 2.1, 2.2, 2.3, 2.4; Property 17_
  - [x] 4.3 Write property-based test for Property 17
    - **Property 17: Payload Size Thresholding**
    - **Validates: Requirements 5.6**
    - Generate random content of varying sizes
    - Verify >64 KiB content becomes blob references
    - Verify ≤64 KiB content remains inline
    - Iterations ≥ 100
    - _Requirements: 2.1, 2.2, 2.3, 2.4; Property 17_

- [x] 5. Implement Async Command System (Property 18)
  - [x] 5.1 Create JobTracker component
    - Generate unique jobIds for async commands
    - Track job status (pending, running, completed, etc.)
    - Implement `specforge job <id>` command
    - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5; Property 18_
  - [x] 5.2 Implement `--wait` flag support
    - Block until job reaches terminal state
    - Timeout handling
    - Progress indication (interactive mode only)
    - _Requirements: 1.4; Property 18_
  - [x] 5.3 Define terminal state set
    - Implement state validation
    - Ensure all async jobs end in {completed, failed, blocked, cancelled}
    - _Requirements: 3.5; Property 18_
  - [x] 5.4 Write property-based test for Property 18
    - **Property 18: Async Command Contract**
    - **Validates: Requirements 11.1, 11.3, 11.4**
    - Generate random async command sequences
    - Verify immediate jobId response
    - Verify job status query returns valid status
    - Verify `--wait` results in terminal state
    - Iterations ≥ 100
    - _Requirements: 1.3, 1.4, 3.1, 3.2, 3.3, 3.4, 3.5; Property 18_

- [x] 6. Implement Core Commands
  - [x] 6.1 Daemon management commands
    - `specforge daemon start --detach`
    - `specforge daemon stop`
    - `specforge daemon status`
    - `specforge daemon config --bind <addr> --require-auth`
    - _Requirements: 1.1, 1.2_
  - [x] 6.2 Workflow commands
    - `specforge spec start` (async)
    - `specforge workflow status <id>`
    - `specforge workflow list`
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 6.3 Webhook commands
    - `specforge webhook register --url <url> --events "<pattern>"`
    - `specforge webhook list`
    - `specforge webhook delete <id>`
    - _Requirements: 1.5_
  - [x] 6.4 Utility commands
    - `specforge heal <workItemId>`
    - `specforge config`
    - `specforge version`
    - _Requirements: 1.1, 1.2_

- [x] 7. Implement Testing Infrastructure
  - [x] 7.1 Unit test framework setup
    - Configure Jest/Vitest for CLI testing
    - Mock Daemon HTTP responses
    - Test both interactive and JSON modes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1-2.4, 3.1-3.5_
  - [x] 7.2 Integration test setup
    - Test with actual Daemon (when available)
    - End-to-end command execution tests
    - Async command lifecycle tests
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1-2.4, 3.1-3.5_
  - [x] 7.3 Property-based test setup
    - Configure fast-check for property testing
    - Implement generators for CLI test data
    - Run property tests as part of CI
    - _Requirements: Property 17, Property 18_

- [x] 8. Implement Error Handling and User Experience
  - [x] 8.1 Comprehensive error handling
    - Network errors (Daemon unreachable)
    - Authentication errors
    - Validation errors
    - Async job errors
    - _Requirements: 1.1, 1.2_
  - [x] 8.2 User-friendly help system
    - Command-specific help
    - Examples for each command
    - Interactive mode hints and suggestions
    - _Requirements: 1.1, 1.2_
  - [x] 8.3 Progress indicators
    - Spinner for async operations (interactive mode only)
    - Progress bars for long operations
    - Status updates for `--wait` mode
    - _Requirements: 1.4_

- [x] 9. Performance and Optimization
  - [x] 9.1 Blob handling optimization
    - Stream large content instead of loading entirely into memory
    - Parallel blob resolution where possible
    - Cache resolved blobs for interactive mode
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 9.2 Async job polling optimization
    - Exponential backoff for job status polling
    - Smart polling based on job type and expected duration
    - Batch status queries where possible
    - _Requirements: 1.3, 1.4_

- [x] 10. Documentation and Examples
  - [x] 10.1 Command reference documentation
    - Auto-generated from command definitions
    - Examples for each command
    - Error code reference
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 10.2 OpenClaw integration guide
    - Using CLI in machine-friendly mode
    - Webhook setup for event monitoring
    - Error handling for automation
    - _Requirements: 1.6_
  - [x] 10.3 Installation and setup guide
    - CLI installation instructions
    - First-time setup walkthrough
    - Troubleshooting common issues
    - _Requirements: 1.1, 1.2_

- [x] 11. Final Integration and Validation
  - [x] 11.1 Integration with Daemon
    - End-to-end testing with actual Daemon
    - Authentication flow validation
    - Async command flow validation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1-2.4, 3.1-3.5_
  - [x] 11.2 Property validation
    - Run Property 17 and 18 tests with integrated system
    - Verify no regressions in property compliance
    - _Requirements: Property 17, Property 18_
  - [x] 11.3 Performance validation
    - Measure command execution times
    - Verify blob handling performance
    - Validate async job tracking performance
    - _Requirements: 2.1-2.4, 3.1-3.5_
  - [x] 11.4 Cross-platform validation
    - Test on Windows, macOS, Linux
    - Verify consistent behavior across platforms
    - Platform-specific issue resolution
    - _Requirements: 1.1, 1.2_

## Notes

- All commands must support both interactive and `--json` modes
- Error handling must be consistent across modes
- Blob handling must be transparent to users
- Async commands must follow the defined contract
- Property-based tests are required for Properties 17 and 18
- Integration with Daemon is critical for end-to-end functionality
- OpenClaw integration requires stable machine-friendly output

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "7.1", "7.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["4.1", "4.2", "5.1", "5.2", "5.3"] },
    { "id": 3, "tasks": ["4.3", "5.4", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 4, "tasks": ["7.2", "8.1", "8.2", "8.3"] },
    { "id": 5, "tasks": ["9.1", "9.2", "10.1", "10.2", "10.3"] },
    { "id": 6, "tasks": ["11.1", "11.2", "11.3", "11.4"] }
  ]
}
```

## Testing Requirements

### Property-Based Tests (Required)
1. **Property 17 Test**: Payload size thresholding verification
2. **Property 18 Test**: Async command contract verification

### Unit Tests (Required for all components)
1. ModeSwitch tests
2. AuthManager tests  
3. HTTP Client tests
4. BlobHandler tests
5. JobTracker tests
6. OutputFormatter tests
7. Command parser tests

### Integration Tests (Required)
1. End-to-end command execution
2. Async command lifecycle
3. Blob handling with CAS
4. Error scenario handling
5. Cross-platform compatibility

### Performance Tests (Recommended)
1. Command parsing performance
2. Blob conversion performance
3. Async job tracking performance
4. Memory usage with large content