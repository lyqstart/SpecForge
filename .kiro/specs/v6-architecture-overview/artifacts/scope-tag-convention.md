# Scope Tag Convention for V6 Downstream Specs

## Purpose

This document defines the **scope tag metadata convention** for all downstream specifications (specs) in the V6 architecture. The convention ensures that each spec explicitly declares its development scope (P0, P1, or P2) as defined in **REQ-25: V6.0 开发范围边界（P0 / P1 / P2）**.

## Convention

### 1. Scope Tag Field

Every downstream spec's `.config.kiro` file **MUST** contain a `scopeTag` field with one of the following values:

```json
{
  "scopeTag": "p0"  // or "p1" or "p2"
}
```

### 2. Valid Values

- **`"p0"`**: The spec implements functionality that is **required for V6.0 release** (27 items listed in REQ-25.1).
- **`"p1"`**: The spec implements functionality scheduled for **V6.1 release** (15 items listed in REQ-25.2).
- **`"p2"`**: The spec implements functionality scheduled for **V6.x release** (items listed in REQ-25.3).

### 3. Semantic Constraints

1. **Scope Boundary Enforcement** (REQ-25.4): When a capability is explicitly listed as P1 or P2 in REQ-25, it **MUST NOT** be delivered in V6.0. The `scopeTag` enables static verification of this constraint.

2. **Property 15: Scope Boundary**: For all capabilities marked as P1 or P2, these capabilities **MUST be absent** from V6.0 official exports, clean build, dynamic registries, installer assets, release manifest and runtime entry points. Dead code, default-off configuration and feature flags do not satisfy this property.

3. **Consistency Requirement**: The `scopeTag` value must be consistent with the spec's declared capabilities relative to the REQ-25 lists.

### 4. Example `.config.kiro` Files

#### P0 Spec (V6.0 Required)
```json
{
  "specId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "workflowType": "requirements-first",
  "specType": "feature",
  "scopeTag": "p0"
}
```

#### P1 Spec (V6.1)
```json
{
  "specId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "workflowType": "requirements-first",
  "specType": "feature",
  "scopeTag": "p1"
}
```

#### P2 Spec (V6.x)
```json
{
  "specId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "workflowType": "requirements-first",
  "specType": "feature",
  "scopeTag": "p2"
}
```

### 5. Validation Rules

1. **Presence Check**: Every downstream spec must have a `scopeTag` field in its `.config.kiro` file.
2. **Value Validation**: The `scopeTag` value must be exactly one of: `"p0"`, `"p1"`, or `"p2"` (case-sensitive).
3. **Scope Consistency**: The spec's implementation scope must match its declared `scopeTag` relative to REQ-25 lists.
4. **V6.0 Release Constraint**: Specs with `scopeTag: "p1"` or `scopeTag: "p2"` must be excluded from the official V6.0 artifact surfaces (enforced by Property 15); no runtime feature flag may promote them.

### 6. Tooling Support

The `artifacts/scope_boundary_verifier.ts` (Task 5.3) will:
- Read all `.kiro/specs/*/.config.kiro` files
- Validate each spec's `scopeTag` field
- Cross-reference with REQ-25 lists
- Report violations with error code: `"v6_scope_boundary_violation"`

### 7. Migration Path

For existing specs without a `scopeTag` field:
1. Determine the spec's scope based on REQ-25 classification
2. Add the appropriate `scopeTag` field to `.config.kiro`
3. Update any dependent tooling to respect the scope boundary

### 8. Related Requirements and Properties

- **REQ-25.4**: "WHEN 某项被明确列入 P1 或 P2，THE V6_0_Scope SHALL 禁止在 V6.0 交付该项"
- **Property 15**: Scope Boundary property (Validates: Requirements 30.15, 25.4)
- **REQ-30.15**: Scope Boundary Property (architecture consistency property)

### 9. Change Management

Any change to a spec's `scopeTag` value must be accompanied by:
1. Update to REQ-25 lists (if scope classification changes)
2. Verification that the new scope aligns with implementation capabilities
3. Update to any dependent scope boundary validation tooling

---

**Last Updated**: [Date of document creation]  
**Schema Version**: 1.0  
**Validates**: Requirements 25.4, Property 15
