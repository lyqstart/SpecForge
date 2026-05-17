# Implementation Plan: Permission Engine

## Overview

This implementation plan covers the development of the **Permission Engine** module for SpecForge V6. The Permission Engine is the central authorization component that enforces the three-layer permission model and ensures all permission decisions are traceable.

**Parent Specification**: This plan implements requirements and architectural constraints from **[v6-architecture-overview](../v6-architecture-overview/)**.

**Scope**: **P0** - Required for V6.0 release.

**Inherited Correctness Properties**:
- Property 3: Hard Rule Immutability
- Property 10: Permission Decision Traceability
- Property 16: Bearer Token Enforcement
- Property 26: Remote Access Guard
- Property 28: Plugin Permission Gate

## Tasks

### Phase 1: Foundation
- [x] 1.1 Set up project structure and build configuration
  - Create TypeScript project with proper tsconfig
  - Set up build scripts (tsc, maybe esbuild)
  - Configure linting (ESLint) and formatting (Prettier)
  - _Requirements: All_

- [x] 1.2 Implement Agent Constitution hard rules
  - Define 9 hard rules as TypeScript constants
  - Implement rule evaluation logic
  - Create conflict detection mechanism
  - _Requirements: 1.1, 1.2, Property 3_

- [x] 1.3 Implement permission event logging
  - Define `permission.evaluated` event schema
  - Implement event writer with all six required fields
  - Integrate with Daemon's events.jsonl WAL
  - _Requirements: 1.3, Property 10_

### Phase 2: Three-Layer Permission Model
- [x] 2.1 Implement built-in policy loader
  - Load default agent role permissions from config files
  - Support JSON/YAML policy formats
  - Validate policy schema
  - _Requirements: 1.1_

- [x] 2.2 Implement user policy loader
  - Load user/project custom rules
  - Support hot-reloading of user policies
  - Detect and report hard rule conflicts
  - _Requirements: 1.5, 1.6, 1.7_

- [x] 2.3 Implement rule merging engine
  - Three-layer precedence (hard > built-in > user)
  - Specificity-based rule resolution
  - Deny-overrides-allow at same specificity
  - _Requirements: 1.4_

### Phase 3: Authentication & Authorization
- [x] 3.1 Implement Bearer Token validation
  - Validate `Authorization: Bearer <token>` headers
  - Return HTTP 401 for invalid/missing tokens
  - Log `permission.denied` events for auth failures
  - _Requirements: 2.4, 2.5, Property 16_

- [x] 3.2 Implement remote access security
  - Long-term API key management
  - IP whitelist enforcement
  - Two-step confirmation for sensitive operations
  - User binding for OpenClaw requests
  - _Requirements: 2.1-2.6, Property 26_

- [x] 3.3 Implement Policy Enforcement Point (PEP)
  - Extract request context (actor, action, resource)
  - Route requests to Policy Decision Point (PDP)
  - Return appropriate HTTP responses
  - _Requirements: All_

### Phase 4: Plugin Permission System
- [x] 4.1 Implement plugin requirement validation
  - Parse plugin manifest `requires` field
  - Compare with granted permission set
  - Reject plugins with unauthorized requirements
  - _Requirements: 3.2, Property 28_

- [x] 4.2 Implement static API checks
  - Source code scanning for prohibited APIs
  - Detect direct `child_process.exec` calls
  - Detect filesystem out-of-bounds access
  - Detect undeclared network access
  - _Requirements: 3.3, Property 28_

- [x] 4.3 Integrate with Plugin Loader
  - Provide permission validation API
  - Return detailed rejection reasons
  - Log plugin load denial events
  - _Requirements: 3.2, 3.3_

### Phase 5: Property-Based Testing
- [x] 5.1 Implement Property 3 test: Hard Rule Immutability
  - Generate random configuration attempts to relax hard rules
  - Assert Permission Engine rejects all attempts
  - Verify hard rules remain unchanged
  - **Validates: Property 3, Requirements 30.3, 7.5-7.8**
  - _Iterations: ≥ 1000 (security-critical)_

- [x] 5.2 Implement Property 10 test: Permission Decision Traceability
  - Generate random (actor, action, resource) tuples
  - For each permission decision, verify complete event logging
  - Assert events contain all six required fields
  - **Validates: Property 10, Requirements 30.10, 7.3**
  - _Iterations: ≥ 100_

- [x] 5.3 Implement Property 16 test: Bearer Token Enforcement
  - Generate HTTP requests with valid/invalid/missing tokens
  - Assert 401 responses for invalid/missing tokens
  - Verify `permission.denied` events are logged
  - **Validates: Property 16, Requirements 5.4, 5.5**
  - _Iterations: ≥ 100_

- [x] 5.4 Implement Property 26 test: Remote Access Guard
  - Generate remote mode requests with/without API keys, IP restrictions
  - Assert enforcement of API keys, IP whitelists, two-step confirmation
  - Verify sensitive operations require extra confirmation
  - **Validates: Property 26, Requirements 16.3-16.6**
  - _Iterations: ≥ 100_

- [x] 5.5 Implement Property 28 test: Plugin Permission Gate
  - Generate plugin manifests with various `requires` sets
  - Generate plugin source code with/without prohibited APIs
  - Assert loading rejection for unauthorized requirements and prohibited APIs
  - **Validates: Property 28, Requirements 17.2, 17.3**
  - _Iterations: ≥ 100_

### Phase 6: Integration & Validation
- [x] 6.1 Integrate with Daemon Core
  - Connect to Daemon's HTTP/SSE server
  - Integrate with Session Registry for actor identity
  - Coordinate with Event Bus for event logging
  - _Requirements: All_

- [x] 6.2 End-to-end testing
  - Complete permission flow tests
  - Remote access integration tests
  - Plugin loading integration tests
  - Crash recovery tests
  - _Requirements: All_

- [x] 6.3 Performance validation
  - Permission decision latency measurements
  - Event logging overhead measurements
  - Rule loading and caching performance
  - _Requirements: 3.1 (performance threshold)_

## Notes

- All property-based tests must use `fast-check` library
- Test iterations: ≥ 100 for most properties, ≥ 1000 for security-critical properties
- All tests must be deterministic and reproducible
- Error handling must follow parent spec's error classification and response contracts
- All persistent data must include `schema_version` field
- Implementation must be compatible with Bun and Node.js LTS
