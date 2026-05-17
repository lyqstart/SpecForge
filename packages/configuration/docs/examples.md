# Configuration Examples

This document provides comprehensive usage examples for the SpecForge V6 Configuration Subsystem, covering CLI configuration, programmatic API, and hot-reload scenarios.

**schema_version: 1.0**

---

## Table of Contents

1. [CLI Configuration Examples](#cli-configuration-examples)
   - [Environment Variables](#environment-variables)
   - [CLI Flags](#cli-flags)
   - [Priority and Precedence](#priority-and-precedence)
2. [Programmatic API Examples](#programmatic-api-examples)
   - [Basic Usage](#basic-usage)
   - [Layer Access and Source Tracking](#layer-access-and-source-tracking)
   - [Value Interpolation](#value-interpolation)
3. [Hot-Reload Scenarios](#hot-reload-scenarios)
   - [File Watcher Integration](#file-watcher-integration)
   - [Handling Reload Events](#handling-reload-events)
   - [Per-Workflow Configuration](#per-workflow-configuration)
4. [Basic Configuration](#basic-configuration)
5. [Development Environment](#development-environment)
6. [Production Environment](#production-environment)
7. [API Keys Setup](#api-keys-setup)
8. [Sensitive Fields Protection](#sensitive-fields-protection-examples)

---

## CLI Configuration Examples

### Environment Variables

The Configuration Subsystem supports setting configuration values via environment variables. All configuration keys can be set using the `SPECFORGE_` prefix with uppercase letters and underscores.

**Syntax**: `SPECFORGE_<CONFIG_KEY>` or `SPECFORGE_<PARENT_KEY>_<CHILD_KEY>`

**Example**:
```bash
# Set log level
export SPECFORGE_LOG_LEVEL=debug

# Enable/disable cache
export SPECFORGE_CACHE_ENABLED=true

# Set cache size
export SPECFORGE_MAX_CACHE_SIZE=500

# Set timeout in milliseconds
export SPECFORGE_TIMEOUT_MS=60000

# Configure hot-reload
export SPECFORGE_HOT_RELOAD_ENABLED=true
export SPECFORGE_HOT_RELOAD_DEBOUNCE_MS=250
```

**Environment Variable Mapping Table**:

| Configuration Key | Environment Variable |
|------------------|---------------------|
| `logLevel` | `SPECFORGE_LOG_LEVEL` |
| `cacheEnabled` | `SPECFORGE_CACHE_ENABLED` |
| `maxCacheSize` | `SPECFORGE_MAX_CACHE_SIZE` |
| `timeoutMs` | `SPECFORGE_TIMEOUT_MS` |
| `hotReload.enabled` | `SPECFORGE_HOT_RELOAD_ENABLED` |
| `hotReload.debounceMs` | `SPECFORGE_HOT_RELOAD_DEBOUNCE_MS` |
| `hotReload.watchPaths` | `SPECFORGE_HOT_RELOAD_WATCH_PATHS` (comma-separated) |

### CLI Flags

When using the SpecForge CLI, you can pass configuration flags directly:

```bash
# Basic usage
specforge --log-level=debug run my-workflow

# With timeout
specforge --timeout-ms=60000 run my-workflow

# Disable hot-reload
specforge --hot-reload-enabled=false run my-workflow

# Multiple flags
specforge --log-level=debug --cache-enabled=true --max-cache-size=500 run my-workflow
```

### Priority and Precedence

The four-layer configuration system applies the following priority (highest to lowest):

```
runtime (CLI/env) > project > user > builtin
```

**Example**: Given the following configuration sources:

**~/.specforge/config/config.json** (User):
```json
{
  "schema_version": "1.0",
  "logLevel": "info"
}
```

**<project>/.specforge/config.json** (Project):
```json
{
  "schema_version": "1.0",
  "logLevel": "debug"
}
```

**Runtime override**:
```bash
export SPECFORGE_LOG_LEVEL=error
```

**Final merged result**: `logLevel` will be `"error"` because runtime has highest priority.

---

## Programmatic API Examples

### Basic Usage

```typescript
import { ConfigManager } from '@specforge/configuration'

// Initialize configuration manager
const manager = new ConfigManager()

// Load all configuration layers
await manager.loadConfig()

// Get a configuration value
const logLevel = manager.get('logLevel')

// Get with type safety
const timeout = manager.get<number>('timeoutMs')

// Get all merged configuration
const merged = manager.getMerged()
console.log('Merged config:', merged)
```

### Layer Access and Source Tracking

```typescript
import { ConfigManager, ConfigAccess } from '@specforge/configuration'

const manager = new ConfigManager()
await manager.loadConfig()

// Get configuration access API
const access = manager.getAccess()

// Get value with source tracking
const result = access.get('logLevel')
console.log(`logLevel = ${result.value}, source = ${result.source}`)
// Output: logLevel = debug, source = user

// Get all sources
const sources = access.getSources()
console.log('Configuration sources:', sources)
// Output: { logLevel: 'user', cacheEnabled: 'builtin', timeoutMs: 'project', ... }

// Get value from specific layer only
const projectOnly = access.get('timeoutMs', { layer: 'project' })

// Check if path exists
if (access.has('hotReload.enabled')) {
  console.log('Hot-reload is configured')
}
```

### Value Interpolation

The configuration system supports environment variable interpolation in configuration values:

```typescript
import { ConfigManager, ConfigAccess } from '@specforge/configuration'

const manager = new ConfigManager()
await manager.loadConfig()

const access = manager.getAccess()

// Set an environment variable for testing
process.env.MY_API_KEY = 'test-key-123'

// Get and interpolate value (for values containing ${VAR} or $VAR)
const interpolated = access.getAndInterpolate('someConfigWithEnvVar')
// If someConfigWithEnvVar = "api-key-${MY_API_KEY}", result will be "api-key-test-key-123"

// Direct interpolation method
const result = access.interpolate('Prefix-${MY_API_KEY}-Suffix')
// result = "Prefix-test-key-123-Suffix"
```

---

## Hot-Reload Scenarios

### File Watcher Integration

```typescript
import { ConfigManager, HotReloadManager } from '@specforge/configuration'

// Create configuration manager with hot-reload enabled
const manager = new ConfigManager({
  hotReload: {
    enabled: true,
    debounceMs: 100,
    watchPaths: ['config/', '.specforge/', '.env']
  }
})

// Load initial configuration
await manager.loadConfig()

// Start watching for changes
await manager.startWatcher()

// ... your application runs ...

// When done, stop the watcher
await manager.stopWatcher()
```

**Watch Multiple Paths**:
```typescript
const manager = new ConfigManager({
  hotReload: {
    enabled: true,
    debounceMs: 250,
    watchPaths: [
      '.env',
      'config/',
      'src/config/',
      'settings.json'
    ]
  }
})
```

### Handling Reload Events

```typescript
import { ConfigManager, ReloadEvent } from '@specforge/configuration'

const manager = new ConfigManager({
  hotReload: {
    enabled: true,
    debounceMs: 100,
    watchPaths: ['config/']
  }
})

await manager.loadConfig()

// Register callback for reload events
manager.on('reload', async (event: ReloadEvent) => {
  console.log('Configuration reloaded!')
  console.log(`  Event ID: ${event.eventId}`)
  console.log(`  Timestamp: ${new Date(event.timestamp).toISOString()}`)
  console.log(`  Trigger: ${event.trigger}`)
  console.log(`  Layers changed: ${event.layersChanged.join(', ')}`)
  
  // Get the updated configuration
  const newConfig = manager.getMerged()
  console.log(`  New logLevel: ${newConfig.logLevel}`)
})

// You can also listen to specific triggers
manager.on('file-watcher', async (event) => {
  console.log('Config file changed externally')
})

manager.on('cli-command', async (event) => {
  console.log('Config reloaded via CLI')
})
```

**Manual Reload**:
```typescript
// Trigger reload programmatically
const result = await manager.reload('api-call')

if (result.success) {
  console.log(`Reload successful: ${result.eventId}`)
} else {
  console.error(`Reload failed: ${result.error}`)
}
```

### Per-Workflow Configuration

The hot-reload system enforces activation boundaries - new configurations apply only to workflows starting after the reload time.

```typescript
import { ConfigManager } from '@specforge/configuration'

const manager = new ConfigManager({
  hotReload: {
    enabled: true,
    debounceMs: 100,
    watchPaths: ['config/']
  }
})

await manager.loadConfig()

// Simulate workflow start
const workflowId = 'workflow-123'
const startTime = Date.now()

// Create a snapshot for this workflow
// This captures the config state at workflow start time
manager.snapshotForWorkflow(workflowId, startTime)

// Get config for a specific work item
// Returns old config if startTime <= reloadTime, new config otherwise
const workItemId = 'workitem-456'
const workItemConfig = manager.getConfigForWorkItem(workItemId, startTime)

// Access the config
console.log('Work item config:', workItemConfig.merged)
console.log('Config sources:', workItemConfig.sources)

// Get last reload time
const lastReload = manager.getLastReloadTime()
console.log(`Last reload: ${lastReload ? new Date(lastReload).toISOString() : 'never'}`)

// Check if reload is pending
if (manager.isReloadPending()) {
  console.log('Reload pending...')
}

// Get reload history
const events = manager.getReloadEvents()
console.log('Reload events:', events)
```

**Activation Boundary Example**:
```typescript
// Scenario: Config reload happens at time T=1000
// Work item A starts at T=500 (before reload)
// Work item B starts at T=1500 (after reload)

const hotReloadManager = manager.getHotReloadManager()

// Simulate reload at T=1000
await manager.loadConfig() // Initial load
// ... time passes ...

// At T=1000, config file changes
await manager.reload('file-watcher')

// Work item A (started at T=500) should get OLD config
const workItemA = hotReloadManager.getConfigForWorkItem('workitem-A', 500)
// Returns config from before reload

// Work item B (started at T=1500) should get NEW config  
const workItemB = hotReloadManager.getConfigForWorkItem('workitem-B', 1500)
// Returns config from after reload
```

**Cache Management**:
```typescript
import { HotReloadManager } from '@specforge/configuration'

const hotReloadManager = new HotReloadManager({
  enabled: true,
  debounceMs: 100,
  watchPaths: ['config/'],
  maxCacheSize: 100,      // Max 100 work items cached
  cacheTTLMs: 3600000,    // 1 hour TTL
  enableLRU: true         // Enable LRU eviction
})

// Get cache statistics
const stats = hotReloadManager.getCacheStats()
console.log(`Cache size: ${stats.size}/${stats.maxSize}`)
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`)
console.log(`Evictions: ${stats.evictions}`)
console.log(`Memory: ${(stats.totalMemoryBytes / 1024).toFixed(2)} KB`)

// Configure cache at runtime
hotReloadManager.configureCache(200, 7200000, true)
// maxSize: 200, TTL: 2 hours, LRU: enabled

// Perform manual cache maintenance
hotReloadManager.performCacheMaintenance()

// Check if cache is full
if (hotReloadManager.isCacheFull()) {
  console.log('Cache is full, consider increasing maxCacheSize')
}

// Clear snapshot when workflow completes
hotReloadManager.clearWorkItemSnapshot('workitem-123')
```

---

## Basic Configuration

### Minimal User Config

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0"
}
```

This uses all builtin defaults.

### Basic with Log Level

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "debug"
}
```

---

## Development Environment

### User-Level Development Config

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "debug",
  "cacheEnabled": true,
  "maxCacheSize": 500,
  "timeoutMs": 60000,
  "hotReload": {
    "enabled": true,
    "debounceMs": 200,
    "watchPaths": [".env", "config/", "src/"]
  }
}
```

### Project-Level Config (Development)

`<project>/.specforge/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "debug",
  "timeoutMs": 120000,
  "hotReload": {
    "enabled": true,
    "debounceMs": 100,
    "watchPaths": [".env.local", "config/"]
  }
}
```

### Merged Result (Development)

When merged, the development configuration resolves to:

```json
{
  "logLevel": "debug",
  "cacheEnabled": true,
  "maxCacheSize": 500,
  "timeoutMs": 120000,
  "hotReload": {
    "enabled": true,
    "debounceMs": 100,
    "watchPaths": [".env.local", "config/"]
  }
}
```

---

## Production Environment

### User-Level Production Config

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "warn",
  "cacheEnabled": true,
  "maxCacheSize": 2000,
  "timeoutMs": 30000,
  "hotReload": {
    "enabled": true,
    "debounceMs": 500,
    "watchPaths": []
  }
}
```

### Project-Level Production Config

`<project>/.specforge/config.json`

```json
{
  "schema_version": "1.0",
  "logLevel": "error",
  "timeoutMs": 15000
}
```

### Merged Result (Production)

```json
{
  "logLevel": "error",
  "cacheEnabled": true,
  "maxCacheSize": 2000,
  "timeoutMs": 15000,
  "hotReload": {
    "enabled": true,
    "debounceMs": 500,
    "watchPaths": []
  }
}
```

---

## Hot-Reload Configuration

### Watch Multiple Paths

```json
{
  "schema_version": "1.0",
  "hotReload": {
    "enabled": true,
    "debounceMs": 250,
    "watchPaths": [
      ".env",
      "config/",
      "src/config/",
      "settings.json"
    ]
  }
}
```

### Disable Hot-Reload

```json
{
  "schema_version": "1.0",
  "hotReload": {
    "enabled": false
  }
}
```

### Fast Debounce for Development

```json
{
  "schema_version": "1.0",
  "hotReload": {
    "enabled": true,
    "debounceMs": 50,
    "watchPaths": ["config/"]
  }
}
```

---

## API Keys Setup

### User-Level API Keys (Recommended)

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "apiKeys": {
    "openai": "sk-...",
    "anthropic": "sk-ant-...",
    "github": "ghp_..."
  }
}
```

### Provider Credentials

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "providerCredentials": {
    "aws": {
      "apiKey": "AKIA...",
      "apiSecret": "...",
      "region": "us-east-1"
    },
    "azure": {
      "apiKey": "...",
      "apiSecret": "..."
    }
  }
}
```

### Tokens Configuration

`~/.specforge/config/config.json`

```json
{
  "schema_version": "1.0",
  "tokens": {
    "bearerTokens": ["token1", "token2"],
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

## Sensitive Fields Protection Examples

### Attempting Project-Level Override (Blocked)

**Project config** (`<project>/.specforge/config.json`):
```json
{
  "schema_version": "1.0",
  "apiKeys": {
    "openai": "sk-project-override"
  }
}
```

**Result**: This override is **rejected**. A warning is logged:
```
[WARN] Cross-layer write attempt blocked: apiKeys cannot be overridden at project level
```

The `apiKeys` value from user-level or builtin is used instead.

### Nested Sensitive Fields

Sensitive field protection works with nested paths using dot notation:

```json
{
  "providerCredentials": {
    "aws": {
      "apiSecret": "blocked-at-project-level"
    }
  }
}
```

Any field starting with a sensitive field prefix is protected.

---

## Related Documentation

- [Configuration Format](./configuration-format.md) - JSON schema and configuration structure
- [Best Practices](./best-practices.md) - Best practices for configuration management