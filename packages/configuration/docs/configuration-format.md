# Configuration Format Documentation

This document describes the JSON schema and configuration structure for the SpecForge V6 Configuration Subsystem.

**schema_version: 1.0**

---

## Table of Contents

1. [Overview](#overview)
2. [Four-Layer Configuration Model](#four-layer-configuration-model)
3. [JSON Schema](#json-schema)
4. [Configuration Layers](#configuration-layers)
5. [Sensitive Fields](#sensitive-fields)
6. [Hot-Reload Behavior](#hot-reload-behavior)

---

## Overview

The Configuration Subsystem manages configuration through a four-layer model:

1. **Builtin** (Layer 1) - Default values from code
2. **User** (Layer 2) - User-level overrides in `~/.specforge/config/`
3. **Project** (Layer 3) - Project-level overrides in `<project>/.specforge/`
4. **Runtime** (Layer 4) - CLI flags / environment variables

Configuration values are merged in order, with later layers overriding earlier ones.

---

## Four-Layer Configuration Model

### Merge Rules

| Type | Behavior |
|------|----------|
| Simple values | Later layer overrides earlier layer |
| Objects | Deep merge (recursive) |
| Arrays | Replace (not concatenate) |

### Layer Priority (Lowest to Highest)

```
builtin → user → project → runtime
```

---

## JSON Schema

### Root Configuration Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "SpecForge Configuration",
  "type": "object",
  "properties": {
    "schema_version": {
      "type": "string",
      "description": "Configuration schema version for migration support",
      "default": "1.0"
    },
    "logLevel": {
      "type": "string",
      "enum": ["debug", "info", "warn", "error"],
      "default": "info"
    },
    "cacheEnabled": {
      "type": "boolean",
      "default": true
    },
    "maxCacheSize": {
      "type": "number",
      "minimum": 1,
      "default": 1000
    },
    "timeoutMs": {
      "type": "number",
      "minimum": 1000,
      "default": 30000
    },
    "hotReload": {
      "$ref": "#/definitions/HotReloadConfig"
    },
    "apiKeys": {
      "$ref": "#/definitions/ApiKeys",
      "description": "API keys for external services - SENSITIVE, cannot be overridden at project level"
    },
    "tokens": {
      "$ref": "#/definitions/Tokens",
      "description": "Authentication tokens - SENSITIVE, cannot be overridden at project level"
    },
    "providerCredentials": {
      "$ref": "#/definitions/ProviderCredentials",
      "description": "Provider credentials - SENSITIVE, cannot be overridden at project level"
    }
  },
  "definitions": {
    "HotReloadConfig": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "default": true
        },
        "debounceMs": {
          "type": "number",
          "minimum": 0,
          "default": 100
        },
        "watchPaths": {
          "type": "array",
          "items": { "type": "string" },
          "default": []
        }
      }
    },
    "ApiKeys": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "description": "API keys for external services"
    },
    "Tokens": {
      "type": "object",
      "properties": {
        "bearerTokens": {
          "type": "array",
          "items": { "type": "string" }
        },
        "accessToken": { "type": "string" },
        "refreshToken": { "type": "string" }
      }
    },
    "ProviderCredentials": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "apiKey": { "type": "string" },
          "apiSecret": { "type": "string" },
          "region": { "type": "string" }
        }
      }
    }
  }
}
```

---

## Configuration Layers

### Layer 1: Builtin (Code Defaults)

Default values are hardcoded in `packages/configuration/src/constants.ts`:

```typescript
export const DEFAULT_CONFIG = {
  logLevel: 'info',
  cacheEnabled: true,
  maxCacheSize: 1000,
  timeoutMs: 30000,
  hotReload: {
    enabled: true,
    debounceMs: 100,
    watchPaths: [],
  },
  sensitiveFields: [
    'apiKeys',
    'tokens',
    'secrets',
    'credentials',
    'passwords',
    'auth',
    'bearerTokens',
    'providerCredentials',
  ],
}
```

**File**: Builtin values are not loaded from files; they are code constants.

### Layer 2: User-Level Configuration

Location: `~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "debug",
  "hotReload": {
    "enabled": true,
    "debounceMs": 200
  },
  "apiKeys": {
    "openai": "sk-user-openai-key"
  }
}
```

### Layer 3: Project-Level Configuration

Location: `<project>/.specforge/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "warn",
  "timeoutMs": 60000,
  "hotReload": {
    "enabled": true,
    "watchPaths": [".env", "config/"]
  }
}
```

**Security Note**: Project-level configuration **cannot** override sensitive fields. See [Sensitive Fields](#sensitive-fields).

### Layer 4: Runtime Configuration

Runtime configuration comes from:
- CLI flags
- Environment variables (prefix: `SPECFORGE_`)

**Environment Variable Mapping**:

| Config Key | Environment Variable |
|------------|---------------------|
| `logLevel` | `SPECFORGE_LOG_LEVEL` |
| `cacheEnabled` | `SPECFORGE_CACHE_ENABLED` |
| `maxCacheSize` | `SPECFORGE_MAX_CACHE_SIZE` |
| `timeoutMs` | `SPECFORGE_TIMEOUT_MS` |
| `hotReload.enabled` | `SPECFORGE_HOT_RELOAD_ENABLED` |
| `hotReload.debounceMs` | `SPECFORGE_HOT_RELOAD_DEBOUNCE_MS` |

**Example**:
```bash
# Set log level via environment variable
export SPECFORGE_LOG_LEVEL=debug

# Or use CLI flags (if supported)
specforge --log-level=debug --timeout-ms=60000
```

---

## Sensitive Fields

The following fields are classified as sensitive and **cannot be overridden at project level**:

| Field | Description |
|-------|-------------|
| `apiKeys` | API keys for external services |
| `tokens` | Authentication tokens |
| `secrets` | Secret values |
| `credentials` | Service credentials |
| `passwords` | Passwords |
| `auth` | Authentication data |
| `bearerTokens` | Bearer tokens |
| `providerCredentials` | Provider-specific credentials |

### Protection Mechanism

When project-level configuration attempts to override a sensitive field:

1. The override is **rejected**
2. A security event is logged with `WARN` level
3. The value from user-level or builtin is used instead
4. An error is returned to the caller

**Example**:
```json
// Project-level config (REJECTED)
{
  "apiKeys": {
    "openai": "sk-project-override"
  }
}
```

Log output:
```
[WARN] Cross-layer write attempt blocked: apiKeys cannot be overridden at project level
```

---

## Hot-Reload Behavior

### Activation Boundary

The configuration system implements a strict activation boundary (Property 19):

- New configuration values apply to **workflows/work items with start time > reload time (t)**
- Workflows/work items with **start time ≤ t** maintain their old configuration values
- Running work items are **never affected** by configuration changes

### Reload Triggers

Configuration can be reloaded via:

1. **File system watcher**: Monitors config files for changes
2. **CLI command**: Explicit reload command
3. **API call**: Programmatic reload

### Reload Event Flow

```
User modifies config file
       ↓
File watcher detects change
       ↓
Debounce period (default: 100ms)
       ↓
Reload event recorded with timestamp t
       ↓
New workflows starting after t get new config
Running workflows keep old config until completion
```

### Configuration Reload Events

Each reload event is recorded with:

```typescript
interface ReloadEvent {
  eventId: string        // Unique event identifier
  timestamp: number      // Unix timestamp when reload occurred
  trigger: 'file-watcher' | 'cli-command' | 'api-call'
  layersChanged: ConfigLayerType[]  // Which layers were reloaded
  activationBoundary: number  // Time t from Property 19
}
```

---

## Schema Versioning

All configuration files should include a `schema_version` field:

```json
{
  "schema_version": "1.0",
  ...
}
```

The default schema version is `1.0`. This field enables future migration support.

---

## Default Values

| Key | Default | Type |
|-----|---------|------|
| `schema_version` | `"1.0"` | string |
| `logLevel` | `"info"` | string |
| `cacheEnabled` | `true` | boolean |
| `maxCacheSize` | `1000` | number |
| `timeoutMs` | `30000` | number |
| `hotReload.enabled` | `true` | boolean |
| `hotReload.debounceMs` | `100` | number |
| `hotReload.watchPaths` | `[]` | array |

---

## Validation

Configuration is validated at load time:

- Schema validation (type checking, required fields)
- Sensitive field detection
- Schema version compatibility

Invalid configurations are rejected with detailed error messages:

```json
{
  "field": "logLevel",
  "message": "Invalid log level: 'tracing'. Must be one of: debug, info, warn, error",
  "layer": "user"
}
```

---

## Related Documentation

- [Examples](./examples.md) - Example configurations for different use cases
- [Best Practices](./best-practices.md) - Best practices for configuration management