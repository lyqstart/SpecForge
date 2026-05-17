# Scope Gate CLI Tools

This document describes the CLI tools available in the `@specforge/scope-gate` package for managing and validating scope boundaries.

## Overview

The Scope Gate provides four CLI tools for development and operational tasks:

| Tool | Purpose |
|------|---------|
| `capability-list` | List all registered capabilities with scope tags |
| `feature-flag` | Manage feature flags for P1/P2 capabilities |
| `scope-context` | Inspect current scope context |
| `scope-validate` | Validate scope tags in code and specs |

## Prerequisites

All CLI tools require:
- Bun runtime (v1.0+)
- Access to the parent V6 architecture specification (REQ-25)

## Running CLI Tools

Run CLI tools using bun from the repository root:

```bash
bun run packages/scope-gate/bin/<tool-name>.ts [options]
```

---

## capability-list

Lists all registered capabilities with their scope tags (P0/P1/P2) and feature flag status.

### Synopsis

```bash
bun run packages/scope-gate/bin/capability-list.ts [options]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--scope <tag>` | `-s` | Filter by scope tag (p0, p1, p2) | All |
| `--output <format>` | `-o` | Output format (text, json) | text |
| `--help` | `-h` | Show help message | - |

### Examples

#### List all capabilities

```bash
bun run packages/scope-gate/bin/capability-list.ts
```

**Sample Output:**
```
=== Registered Capabilities ===

P0 Capabilities:
  daemon-core [✓ enabled]
  configuration [✓ enabled]
  permission-engine [✓ enabled]
  scope-gate [✓ enabled]

P1 Capabilities:
  workflow-runtime [✗ disabled]
  knowledge-graph [✗ disabled]

P2 Capabilities:
  multimodal [✗ disabled]
  self-healing [✗ disabled]

Summary: 8 capabilities (4 enabled, 4 disabled)
```

#### Filter by scope

```bash
# List only P0 capabilities
bun run packages/scope-gate/bin/capability-list.ts --scope p0

# Short form
bun run packages/scope-gate/bin/capability-list.ts -s p1
```

#### JSON output

```bash
bun run packages/scope-gate/bin/capability-list.ts --output json
```

**Sample JSON Output:**
```json
[
  {
    "id": "daemon-core",
    "displayName": "Daemon Core",
    "scopeTag": "p0",
    "flagName": "enable_daemon-core",
    "flagEnabled": true,
    "description": "Core daemon functionality",
    "dependencies": [],
    "entryPoints": ["start", "stop", "restart"]
  }
]
```

### Best Practices

- Use `capability-list --scope p0` to quickly verify P0 capabilities are loaded
- Use JSON output for integration with other tools (CI/CD, monitoring)
- Run after updating REQ-25 to verify capability registration

---

## feature-flag

Manages feature flags for enabling/disabling P1 and P2 capabilities.

### Synopsis

```bash
bun run packages/scope-gate/bin/feature-flag.ts <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `list` | Show all feature flags and their status |
| `enable <flag>` | Enable a specific feature flag |
| `disable <flag>` | Disable a specific feature flag |
| `toggle <flag>` | Toggle a feature flag on/off |
| `save [path]` | Save flags to a config file |
| `load [path]` | Load flags from a config file |
| `history` | Show flag change history |
| `reset` | Reset all flags to default state |
| `stats` | Show flag statistics |
| `register <cap-id>` | Register a capability with its scope tag |

### Options

| Option | Short | Description |
|--------|-------|-------------|
| `--scope <tag>` | `-s` | Scope tag for batch operations (p0, p1, p2) |
| `--output <format>` | `-o` | Output format (text, json) |
| `--config <path>` | `-c` | Path to config file for save/load |
| `--reason <text>` | `-r` | Reason for the change |
| `--user <id>` | `-u` | User performing the action |
| `--verbose` | `-v` | Show detailed information |
| `--help` | `-h` | Show help message |

### Examples

#### List all flags

```bash
bun run packages/scope-gate/bin/feature-flag.ts list

# With detailed info
bun run packages/scope-gate/bin/feature-flag.ts list --verbose

# JSON output
bun run packages/scope-gate/bin/feature-flag.ts list --output json
```

#### Enable/disable flags

```bash
# Enable a specific capability
bun run packages/scope-gate/bin/feature-flag.ts enable enable_workflow_runtime

# Disable a capability
bun run packages/scope-gate/bin/feature-flag.ts disable enable_workflow_runtime

# Enable with reason
bun run packages/scope-gate/bin/feature-flag.ts enable enable_workflow_runtime --reason "Enabling for testing"
```

#### Batch operations by scope

```bash
# Enable all P1 capabilities
bun run packages/scope-gate/bin/feature-flag.ts enable --scope p1

# Disable all P2 capabilities
bun run packages/scope-gate/bin/feature-flag.ts disable --scope p2
```

#### Master flags

The system supports master flags for bulk operations:

```bash
# Enable all P1 capabilities
bun run packages/scope-gate/bin/feature-flag.ts enable enable_all_p1

# Enable all P2 capabilities
bun run packages/scope-gate/bin/feature-flag.ts enable enable_all_p2

# Enable both P1 and P2
bun run packages/scope-gate/bin/feature-flag.ts enable enable_all_p1p2
```

#### Save and load configuration

```bash
# Save current flags to default location (scope-gate-flags.json)
bun run packages/scope-gate/bin/feature-flag.ts save

# Save to custom path
bun run packages/scope-gate/bin/feature-flag.ts save --config ./my-flags.json

# Load flags from file
bun run packages/scope-gate/bin/feature-flag.ts load --config ./my-flags.json
```

#### View history and statistics

```bash
# Show change history
bun run packages/scope-gate/bin/feature-flag.ts history

# Show statistics
bun run packages/scope-gate/bin/feature-flag.ts stats
```

**Sample Stats Output:**
```
=== Feature Flag Statistics ===

Total Flags:    12
Enabled:        4
Disabled:       8
P1 Flags:       6
P2 Flags:       4
History Size:   15
```

#### Reset flags

```bash
# Reset all flags to default (P1/P2 disabled in v6.0)
bun run packages/scope-gate/bin/feature-flag.ts reset
```

### Flag Naming Convention

- **Master flags**: `enable_all_p1`, `enable_all_p2`, `enable_all_p1p2`
- **Per-capability flags**: `enable_<capabilityId>`

Flag names are case-insensitive (stored as lowercase).

### Best Practices

- Always specify `--reason` when enabling/disabling flags for audit purposes
- Use `--user` to track who made the change
- Save configuration before major changes: `feature-flag.ts save`
- Use batch operations (`--scope p1`) for environment setup
- Review history periodically to track flag changes

---

## scope-context

Inspects and displays the current scope context, including release branch, environment, and enabled feature flags.

### Synopsis

```bash
bun run packages/scope-gate/bin/scope-context.ts [options]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--output <format>` | `-o` | Output format (text, json) | text |
| `--verbose` | `-v` | Show detailed information | false |
| `--help` | `-h` | Show help message | - |

### Examples

#### Inspect current scope context

```bash
bun run packages/scope-gate/bin/scope-context.ts
```

**Sample Output:**
```
=== Scope Context Inspection ===

Scope Context:
  Release Branch: v6.0
  Environment:    production
  Current Tag:    P0

Feature Flags:
  Total: 12 (4 enabled, 8 disabled)
  Enabled: enable_daemon-core, enable_configuration, enable_permission-engine, enable_scope-gate

Capabilities:
  P0: 4
  P1: 4
  P2: 4
  Total: 12

Inspected at: 2024-01-15T10:30:00.000Z
```

#### Detailed output

```bash
bun run packages/scope-gate/bin/scope-context.ts --verbose
```

#### JSON output

```bash
bun run packages/scope-gate/bin/scope-context.ts --output json
```

**Sample JSON Output:**
```json
{
  "scopeContext": {
    "releaseBranch": "v6.0",
    "environment": "production",
    "scopeTag": "p0"
  },
  "featureFlags": {
    "enabled": ["enable_daemon-core", "enable_configuration"],
    "disabled": ["enable_workflow-runtime", "enable_knowledge-graph"],
    "total": 12
  },
  "capabilities": {
    "p0": 4,
    "p1": 4,
    "p2": 4,
    "total": 12
  },
  "inspectionTime": "2024-01-15T10:30:00.000Z",
  "sourceInfo": {
    "parentSpecPath": "/path/to/REQ-25.md",
    "capabilitiesLoaded": true
  }
}
```

### Environment Variables

`scope-context` respects the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SCOPEGATE_RELEASE_BRANCH` | Release branch (v6.0, v6.1, development) | v6.0 |
| `SCOPEGATE_ENVIRONMENT` | Environment (production, staging, development, test) | production |
| `NODE_ENV` | Node environment (used as fallback) | - |

### Best Practices

- Run before deploying to verify the current scope context
- Use JSON output for integration with deployment scripts
- Use `--verbose` when debugging scope-related issues
- Check `SCOPEGATE_RELEASE_BRANCH` environment variable in CI/CD pipelines

---

## scope-validate

Validates scope tags in the SpecForge repository, including code dependencies and spec scope tags.

### Synopsis

```bash
bun run packages/scope-gate/bin/scope-validate.ts [options]
```

### Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--path <path>` | `-p` | Path to validate | Current directory |
| `--output <format>` | `-o` | Output format (text, json) | text |
| `--help` | `-h` | Show help message | - |

### Examples

#### Validate current directory

```bash
bun run packages/scope-gate/bin/scope-validate.ts
```

#### Validate a specific package

```bash
# Validate a specific package
bun run packages/scope-gate/bin/scope-validate.ts --path ./packages/daemon-core

# Short form
bun run packages/scope-gate/bin/scope-validate.ts -p ./packages/permission-engine
```

#### JSON output

```bash
bun run packages/scope-gate/bin/scope-validate.ts --output json
```

**Sample JSON Output:**
```json
{
  "codebasePath": "/path/to/packages",
  "specsPath": "/path/to/.kiro/specs",
  "codeDependencies": [],
  "specScopeTags": [],
  "featureFlagGuards": [],
  "summary": {
    "totalErrors": 0,
    "totalWarnings": 0,
    "totalInfos": 0
  }
}
```

### Validation Checks

The validator performs three types of checks:

1. **Code Dependencies**: Detects P0 code depending on P1/P2 capabilities
2. **Spec Scope Tags**: Validates `.config.kiro` files have correct `scopeTag`
3. **Feature Flag Guards**: Ensures P1/P2 entry points are properly guarded

### Exit Codes

| Code | Description |
|------|-------------|
| 0 | Validation passed (no errors) |
| 1 | Validation failed (errors found) |

### Best Practices

- Run in CI/CD pipelines before merging PRs
- Validate after adding new capabilities to ensure proper scope tagging
- Use `--output json` for automated processing
- Run on specific packages during development: `scope-validate.ts -p ./packages/my-package`

---

## Common Workflows

### Development Workflow: Enable P1 for Testing

```bash
# 1. Check current context
bun run packages/scope-gate/bin/scope-context.ts

# 2. Enable P1 capabilities
bun run packages/scope-gate/bin/feature-flag.ts enable --scope p1 --reason "Development testing"

# 3. Verify capabilities are now available
bun run packages/scope-gate/bin/capability-list.ts --scope p1

# 4. After testing, disable P1 capabilities
bun run packages/scope-gate/bin/feature-flag.ts disable --scope p1 --reason "Testing complete"
```

### CI/CD Workflow: Pre-deployment Validation

```bash
# 1. Validate scope tags in codebase
bun run packages/scope-gate/bin/scope-validate.ts --path ./packages

# 2. Check current scope context
bun run packages/scope-gate/bin/scope-context.ts

# 3. Ensure only expected flags are enabled
bun run packages/scope-gate/bin/feature-flag.ts list
```

### Audit Workflow: Review Flag Changes

```bash
# 1. View flag change history
bun run packages/scope-gate/bin/feature-flag.ts history

# 2. View current statistics
bun run packages/scope-gate/bin/feature-flag.ts stats

# 3. Export current configuration
bun run packages/scope-gate/bin/feature-flag.ts save --config ./audit-flags.json
```

---

## Troubleshooting

### "Parent spec not found" warning

Ensure the parent V6 architecture specification exists at:
```
<repo-root>/.kiro/specs/v6-architecture-overview/requirements.md
```

### "No capabilities found"

This indicates REQ-25 could not be parsed. Check that the parent specification contains a properly formatted REQ-25 section.

### Validation fails with errors

Review the validation output to identify:
- P0 code depending on P1/P2 (redesign or add feature flag guard)
- Missing scope tags in `.config.kiro` files
- Missing feature flag guards on P1/P2 entry points

### Feature flag not working

1. Verify the flag is registered: `feature-flag.ts list`
2. Check the flag name matches exactly (case-insensitive)
3. Ensure you're in the correct release branch context
4. Review the audit history: `feature-flag.ts history`

---

## Related Documentation

- [API Documentation](./api.md) - Full API reference
- [Design Document](../.kiro/specs/scope-gate/design.md) - Architecture and design decisions
- [Requirements](../.kiro/specs/scope-gate/requirements.md) - Module requirements