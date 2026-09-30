# Requirements Document: Scope Gate

## Introduction

This specification defines the current-release **Scope Gate** as a deterministic release validator. It enforces the P0/P1/P2 and module-classification decisions from the parent V6 product authority by comparing the approved release set with actual exports, build outputs, dynamic registries, installer assets and release manifest.

**Parent authority**: [V6 requirements](../v6-architecture-overview/requirements.md), [V6 design](../v6-architecture-overview/design.md), especially REQ-25, REQ-27, REQ-31 and Property 15.

**Classification / current status**: stable target `CURRENT_RELEASE_SUPPORTING`; current implementation remains `BUILT_NOT_ENABLED` until a formal build/release gate consumes it and the duplicate scope sources are removed.

The Scope Gate enforces an already-approved release boundary; it does not define product scope and does not run in the business Runtime path. P1/P2 and other unapproved capabilities cannot be present as disabled production code and cannot be enabled through environment, configuration, permission override or runtime feature flag.

## Inherited Architectural Property

### Property 15: Release-set exclusion

*For every* capability marked P1/P2 or otherwise excluded from the V6.0 current release, no official export, clean-build output, dynamic registry entry, installer asset, release-manifest entry or runtime entry point may contain that capability. Identical authority and artifact inputs must produce an identical verdict.

**Validates**: REQ-25, REQ-27, REQ-30.15, REQ-31.

## Requirements

### Requirement 1: Authoritative release-set input

**User Story:** As a release maintainer, I want one reproducible release-set input so that source presence or stale metadata cannot silently enable a capability.

#### Acceptance Criteria

1. THE Scope_Gate SHALL consume the V6 requirements/design classification and the frozen module disposition matrix.
2. THE Scope_Gate SHALL reject missing, malformed, ambiguous or mutually inconsistent authority inputs.
3. THE Scope_Gate SHALL NOT infer enablement from package existence, passing package-local tests, default-off configuration or historical deployment residue.
4. THE Scope_Gate SHALL report each authority conflict with its source path and stable capability/module identifier.

### Requirement 2: Artifact and dependency validation

**User Story:** As a release maintainer, I want the shipped artifact to contain exactly the approved modules so that built-not-enabled and legacy-only content cannot leak into production.

#### Acceptance Criteria

1. THE Scope_Gate SHALL compare the approved release set with package exports, clean-build files, dynamic registries, installer inputs and release manifest entries.
2. WHEN a P1/P2, `BUILT_NOT_ENABLED` or `LEGACY_ONLY` capability appears in any current artifact surface, THE Scope_Gate SHALL fail the release with `SCOPE_BOUNDARY_VIOLATION`.
3. WHEN a required `CURRENT_RELEASE_CORE` or `CURRENT_RELEASE_SUPPORTING` artifact or dependency is absent, THE Scope_Gate SHALL fail the release and identify the missing producer/consumer edge.
4. THE Scope_Gate SHALL validate that current P0/core paths do not depend on excluded capabilities.
5. THE Scope_Gate SHALL fail closed when a dynamic registry, generated output or installer manifest cannot be enumerated completely.

### Requirement 3: No runtime bypass

**User Story:** As a product owner, I want the release boundary to be immutable at runtime so that an environment or configuration change cannot turn an unshipped capability into product behavior.

#### Acceptance Criteria

1. THE Scope_Gate SHALL NOT expose a runtime API, environment variable, configuration key or permission override that enables P1/P2 or otherwise excluded capabilities.
2. THE release validation SHALL reject any current artifact that contains such an enablement path, even when its default value is false.
3. Runtime attempts to address an excluded capability through a stale or externally supplied identifier SHALL return `CAPABILITY_UNAVAILABLE` without loading the implementation.
4. Scope-boundary failure SHALL block stable tagging, publishing and installation-manifest acceptance.

## Glossary

- **Approved Release Set**: the modules, workflows, handlers and assets explicitly enabled by the current V6 authority and frozen disposition matrix.
- **Artifact Surface**: exports, clean-build outputs, registries, installer assets, release manifest and runtime entry points.
- **Scope Gate**: the release-time validator that compares the Approved Release Set with Artifact Surfaces.
- **Scope Boundary Violation**: any excluded item present in the artifact, any required item absent, or any unapproved dependency/enablement path.
- **P0 / P1 / P2**: current, later and future capability classifications defined by the parent V6 specification.

## Testing Strategy

1. Property test: identical authority/artifact sets produce identical verdicts.
2. Property test: inserting any excluded capability into any artifact surface always fails.
3. Property test: removing any required current artifact or dependency always fails.
4. Negative tests: environment/config/permission feature-flag bypasses are detected and rejected.
5. Integration test: the formal release precheck consumes clean-build outputs, registries, installer inputs and the release manifest.

## Historical implementation note

Earlier Scope Gate requirements treated P1/P2 as default-off runtime capabilities and allowed feature-flag enablement. That contract is superseded by V6 REQ-25/REQ-31 and is retained only in Git history and existing ERR/test evidence. Step 6 must adjust or remove those implementation consumers; they are not current acceptance evidence.
