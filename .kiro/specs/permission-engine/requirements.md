# Requirements Document: Permission Engine

## Introduction

This specification defines the **Permission Engine** module for SpecForge V6. The Permission Engine is the central authorization component that enforces the three-layer permission model (hard rules, built-in policies, user policies) and ensures all permission decisions are traceable through event logging.

**Parent Specification**: This spec inherits from and implements architectural constraints defined in the parent spec: **[v6-architecture-overview](../v6-architecture-overview/requirements.md)**.

**Scope**: This is a **P0** specification, meaning its functionality is required for the V6.0 release.

## Inherited Architectural Properties

This specification inherits and must implement the following **Correctness Properties** from the parent V6 architecture specification:

### Property 3: Hard Rule Immutability
*For all* configuration layers L ∈ {builtin, user, project, runtime} and any rule R, if R attempts to relax any of the 9 Agent Constitution hard rules, THEN Permission Engine must reject loading R and report conflict in startup logs. No configuration combination can bypass hard rules.

**Validates: Requirements 30.3, 7.5, 7.6, 7.7, 7.8**

### Property 10: Permission Decision Traceability
*For all* Permission Engine decisions d (allow or deny), events.jsonl contains a unique event e where `e.action == "permission.evaluated"` and `e.payload` contains all six fields: `{ actor, action, resource, matched_rule, rule_layer, reason }`; given any deny result d, one can trace back to `matched_rule` and `rule_layer` through events.jsonl.

**Validates: Requirements 30.10, 7.3**

### Property 16: Bearer Token Enforcement
*For all* HTTP/SSE requests r arriving at Daemon Edge layer, if r does not carry valid `Authorization: Bearer <token>` (token matching handshake file token), THEN Daemon returns HTTP 401 and writes a `permission.denied` event to events.jsonl.

**Validates: Requirements 5.4, 5.5**

### Property 26: Remote Access Guard
*For all* requests r arriving in remote access mode (`bind=0.0.0.0 && requireAuth=true`), if r lacks valid long-term API key or r's source IP is not in whitelist, THEN Daemon rejects the request; for sensitive operations (delete WorkItem / permission change / config reset), even if r passes authentication, it must undergo two-step confirmation before proceeding.

**Validates: Requirements 16.3, 16.4, 16.5, 16.6**

### Property 28: Plugin Permission Gate
*For all* plugins p and current grant set grants, if `p.manifest.requires \ grants ≠ ∅` (i.e., there are undeclared requirements), THEN Plugin Loader rejects loading p; if p's source code contains prohibited sensitive API calls, Loader must also reject loading.

**Validates: Requirements 17.2, 17.3**

## Requirements

### Requirement 1: Three-Layer Permission Model Implementation

**User Story:** As a security decision-maker, I want V6's three-layer permission model from REQ-7 to be fully implemented, so that permission decisions are layered, non-overridable, and traceable.

#### Acceptance Criteria

1. THE Permission_Engine SHALL implement the three-layer permission model:
   - Layer 1: **Hard rules** (Agent Constitution 9 bottom lines), hardcoded in code.
   - Layer 2: **Built-in policies**, configuration files shipped with SpecForge, default agent role permissions (e.g., reviewer read-only).
   - Layer 3: **User policies**, user or project custom roles and rules.
2. THE Permission_Engine SHALL be centrally decided by Daemon, with OpenCode native permission as fallback layer.
3. THE Permission_Engine SHALL write an event log entry for every decision (allow/deny), containing six fields: actor, action, resource, matched_rule, rule_layer, reason.
4. THE Permission_Engine SHALL merge rules in this order:
   - Hard rules always override any configuration.
   - More specific rules override more general rules.
   - At same priority, deny overrides allow.
5. IF user configuration attempts to relax hard rules (e.g., allow bypassing Gate), THEN THE Permission_Engine SHALL reject loading that configuration and report conflict in startup logs.
6. WHEN Daemon starts and configuration loads successfully, THE Permission_Engine SHALL report any potential hard rule conflicts detected in startup logs, even if configuration doesn't actually relax hard rules.
7. IF Permission_Engine detects new hard rule conflicts after startup (e.g., hot-loaded configuration introduces conflict), THEN THE Permission_Engine SHALL report the conflict but continue running with already-loaded problematic configuration, without triggering shutdown.
8. THE Permission_Engine SHALL reference Agent Constitution's 9 bottom lines in Glossary (or reference specific document location), covering at least "must not bypass Gate" and "must not forge verification".

### Requirement 2: Remote Access Security Implementation

**User Story:** As a user wanting to drive SpecForge remotely via Telegram, I want V6 to provide complete spec creation and execution capabilities through OpenClaw, with mandatory security layers when remote access is enabled.

#### Acceptance Criteria

1. THE Permission_Engine SHALL enforce that Daemon binds to 127.0.0.1 by default, not exposed externally.
2. WHEN user executes `specforge daemon config --bind 0.0.0.0 --require-auth`, THE Permission_Engine SHALL explicitly enable remote access mode.
3. WHERE remote access mode is enabled, THE Permission_Engine SHALL enforce long-term API keys (distinct from local Bearer Token), and support IP whitelists.
4. WHERE remote access mode is enabled, THE Permission_Engine SHALL enforce two-step confirmation for sensitive operations (delete work item, permission changes, config reset).
5. THE Permission_Engine SHALL support "user binding mechanism": requests from OpenClaw must bind to a registered SpecForge user identity.
6. THE Permission_Engine SHALL include "OpenClaw end-to-end complete spec creation and execution" as release must-pass item in quality threshold (REQ-27).

### Requirement 3: Plugin Sandbox Permission Implementation

**User Story:** As a security auditor, I want third-party plugins to not arbitrarily access system resources, with V6.0 using static checks and permission declarations as fallback, and V6.x adding runtime isolation.

#### Acceptance Criteria

1. THE Permission_Engine SHALL implement V6.0 plugin sandbox strategy:
   - Static checks (prohibit sensitive API calls).
   - Permission declarations (`requires: ["filesystem.read", ...]`).
2. THE Permission_Engine SHALL read plugin's `requires` field during loading, compare with user grants; IF permissions not granted, THEN THE Permission_Engine SHALL reject loading.
3. THE Permission_Engine SHALL perform static checks on plugin source code, prohibiting sensitive APIs: direct `child_process.exec`, `fs` out-of-bounds paths, undeclared network access.
4. THE Permission_Engine SHALL declare that subprocess isolation + resource limits + filesystem whitelist belong to V6.x (P2), not implemented in V6.0.

## Glossary

- **Permission Engine**: Authorization decision component within Daemon. Input (actor, action, resource, context) → Output (allow/deny + reason). All decisions written to event logs.
- **Agent Constitution**: 9 bottom-line hard rules for agents hardcoded in code (must not bypass Gate, must not forge verification, etc.), cannot be overridden by any configuration.
- **Hard Rules / Built-in Policies / User Policies**: Three layers of Permission Engine permissions. Hard rules = code constants; built-in policies = SpecForge built-in configuration files; user policies = user/project configuration files.
- **Bearer Token**: Authentication token in `Authorization: Bearer <token>` header, used for local Daemon communication, distinct from remote API keys.
- **Remote Access Mode**: Daemon mode where it binds to 0.0.0.0 and requires long-term API keys + IP whitelists for external access.
- **Plugin Sandbox**: Security mechanism restricting plugin access to system resources, using static checks and permission declarations in V6.0.
- **Permission Decision Event**: Event written to events.jsonl for each permission decision, containing actor, action, resource, matched_rule, rule_layer, reason fields.
- **Rule Layer**: Which permission layer a rule belongs to (hard/built-in/user), used for conflict resolution and traceability.

## Testing Strategy

### Property-Based Tests

This specification must implement the following property-based tests corresponding to the inherited Correctness Properties:

1. **Property 3 Test**: Verify hard rule immutability - no configuration can override hard rules
2. **Property 10 Test**: Verify permission decision traceability - all decisions produce complete event logs
3. **Property 16 Test**: Verify Bearer Token enforcement - unauthorized requests get HTTP 401 and permission.denied events
4. **Property 26 Test**: Verify remote access guard - remote mode requires API keys, IP whitelists, and two-step confirmation for sensitive ops
5. **Property 28 Test**: Verify plugin permission gate - plugins with undeclared requirements or prohibited APIs are rejected

### Unit Tests

1. Three-layer permission model tests (hard rule precedence, rule merging, conflict detection)
2. Permission decision event logging tests (complete field coverage, event schema validation)
3. Remote access security tests (API key validation, IP whitelisting, two-step confirmation)
4. Plugin permission tests (requires field validation, static API checks)
5. Configuration loading tests (hard rule conflict detection, hot-load conflict reporting)

### Integration Tests

1. End-to-end permission decision flow (request → permission check → event logging)
2. Remote access mode integration (OpenClaw requests with API keys)
3. Plugin loading integration (permission validation, static checks)
4. Cross-module integration with Daemon Core (Bearer Token validation)
5. Cross-module integration with Plugin Loader (permission gate coordination)

## Notes

- This spec implements the **permission-engine** module as defined in the parent V6 architecture specification.
- All Correctness Properties inherited from the parent spec must be implemented as property-based tests in this spec's tasks.
- The implementation must adhere to the **P0** scope boundary: only functionality required for V6.0 release.
- Error handling must follow the error classification and response contracts defined in the parent spec's Error Handling section.
- All persistent files must include `schema_version` field for future migration support.
- Agent Constitution 9 bottom lines must be explicitly documented or referenced.
