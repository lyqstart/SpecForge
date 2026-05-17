# Configuration Best Practices

This document provides best practices for managing configuration in SpecForge V6.

**schema_version: 1.0**

---

## Table of Contents

1. [Configuration Organization](#configuration-organization)
2. [Sensitive Data Management](#sensitive-data-management)
3. [Environment-Specific Configuration](#environment-specific-configuration)
4. [Hot-Reload Best Practices](#hot-reload-best-practices)
5. [Performance Optimization](#performance-optimization)
6. [Security Considerations](#security-considerations)
7. [Troubleshooting](#troubleshooting)

---

## Configuration Organization

### Layer Usage Guidelines

| Layer | Use For | Avoid |
|-------|---------|-------|
| **Builtin** | System defaults, safe values | Secrets, environment-specific values |
| **User** | Personal preferences, API keys, tokens | Project-specific overrides |
| **Project** | Team-wide settings, shared config | Secrets, personal credentials |
| **Runtime** | Deployment overrides, CI/CD | Static configuration |

### Recommended File Structure

```
~/.specforge/
└── config/
    └── config.json          # User-level configuration

<project>/
├── .specforge/
│   └── config.json          # Project-level configuration
├── .env                     # Environment variables (not committed)
└── .env.example             # Template for environment variables
```

### Schema Version

Always include `schema_version` in your configuration files:

```json
{
  "schema_version": "1.0",
  "logLevel": "info"
}
```

This enables future migration support and helps the system detect configuration format changes.

---

## Sensitive Data Management

### Where to Store Sensitive Data

| Sensitive Data | Recommended Location | Reason |
|---------------|---------------------|--------|
| API keys | User-level (`~/.specforge/config.json`) | Never committed to repo |
| Tokens | User-level | Never committed to repo |
| Credentials | User-level | Never committed to repo |
| Project settings | Project-level | Can be shared with team |

### Never Commit Secrets

```bash
# WRONG - Add to .gitignore
# .specforge/config.json  <- This would expose secrets!

# CORRECT - Add to .gitignore
.env
.env.local
*.pem
key.json
credentials.json
```

### Using Environment Variables for Secrets

Instead of storing secrets in config files:

```bash
# In your shell
export SPECFORGE_API_KEYS_OPENAI="sk-..."

# In config (reference via environment)
# Note: The configuration module supports env var expansion
```

### Sensitive Field Protection

The configuration system automatically protects sensitive fields from project-level override:

```json
// Project-level config - THIS WILL BE BLOCKED
{
  "apiKeys": {
    "openai": "sk-project-key"  // ❌ REJECTED
  }
}
```

Always put sensitive data in user-level configuration.

---

## Environment-Specific Configuration

### Development vs Production

**User-level config** (`~/.specforge/config/config.json`):

```json
{
  "schema_version": "1.0",
  "logLevel": "debug",
  "cacheEnabled": true
}
```

**Project-level config** (`<project>/.specforge/config.json`):

```json
{
  "schema_version": "1.0",
  "logLevel": "error",
  "timeoutMs": 15000
}
```

The project-level settings override user settings for team consistency.

### Using Environment Variables for Deployment

```bash
# Production deployment
export SPECFORGE_LOG_LEVEL=error
export SPECFORGE_TIMEOUT_MS=15000
export SPECFORGE_CACHE_ENABLED=true
```

Runtime environment variables take highest priority, perfect for CI/CD pipelines.

### Hot-Reload per Environment

**Development** - Fast feedback:

```json
{
  "hotReload": {
    "enabled": true,
    "debounceMs": 50,
    "watchPaths": ["config/", "src/"]
  }
}
```

**Production** - Stability focused:

```json
{
  "hotReload": {
    "enabled": true,
    "debounceMs": 500,
    "watchPaths": []
  }
}
```

---

## Hot-Reload Best Practices

### Debounce Settings

| Use Case | debounceMs | Rationale |
|----------|------------|-----------|
| Local development | 50-100 | Fast feedback during editing |
| Team environment | 100-200 | Balance between responsiveness and stability |
| Production | 300-500 | Prevent rapid reloads from affecting stability |

### Watch Paths

Only watch directories that contain configuration:

```json
{
  "hotReload": {
    "enabled": true,
    "watchPaths": ["config/", ".specforge/", ".env"]
  }
}
```

Avoid watching entire project directories to prevent unnecessary reloads.

### Reload During Development

1. Make configuration changes
2. Save the file
3. New workflows automatically use new config
4. Running workflows complete with old config

This ensures your changes don't break work in progress.

---

## Performance Optimization

### Cache Settings

```json
{
  "cacheEnabled": true,
  "maxCacheSize": 1000
}
```

- `maxCacheSize`: Adjust based on number of concurrent workflows
- Cache stores merged configuration per workflow

### Lazy Loading

The configuration module loads layers on-demand. Avoid loading all layers at startup if not needed.

### Timeout Configuration

Set appropriate timeouts for your environment:

```json
{
  "timeoutMs": 30000  // 30 seconds default
}
```

- Development: 60-120 seconds (debugging may take longer)
- Production: 15-30 seconds (fail fast for better UX)

---

## Security Considerations

### 1. Protect Sensitive Fields

Never try to override sensitive fields at project level. The system will block it, but it's a security anti-pattern.

### 2. File Permissions

Ensure configuration files have appropriate permissions:

```bash
# User-level config should be readable only by user
chmod 600 ~/.specforge/config/config.json

# Project-level config can be readable by team
chmod 644 <project>/.specforge/config.json
```

### 3. No Secrets in Logs

The configuration system never logs sensitive field values. If you see secrets in logs, that's a bug - report it.

### 4. Environment Variable Security

```bash
# Don't print secrets in CI logs
# WRONG:
echo "API Key: $SPECFORGE_API_KEYS_OPENAI"

# CORRECT:
echo "API Key: ${SPECFORGE_API_KEYS_OPENAI:0:4}..."
```

---

## Troubleshooting

### Configuration Not Loading

**Symptom**: Configuration changes don't take effect

**Checklist**:
1. Is the file in the correct location?
   - User: `~/.specforge/config/config.json`
   - Project: `<project>/.specforge/config.json`
2. Is the JSON valid? (Use a JSON validator)
3. Is `schema_version` included?
4. Check logs for validation errors

### Sensitive Field Override Blocked

**Symptom**: Warning log about cross-layer write attempt

**Solution**: Move the sensitive field from project-level to user-level config

### Hot-Reload Not Working

**Checklist**:
1. Is `hotReload.enabled` set to `true`?
2. Are the `watchPaths` correct?
3. Check if file watcher has permissions
4. Try increasing `debounceMs` if reload is too frequent

### Merge Conflicts

**Symptom**: Unexpected configuration values

**Debug**:
```typescript
const sources = manager.getSources()
console.log('Configuration sources:', sources)
```

This shows which layer each value came from.

### Validation Errors

**Symptom**: Configuration load fails

**Check**:
```typescript
const errors = manager.validate()
errors.forEach(e => console.log(`${e.field}: ${e.message}`))
```

Detailed error messages include:
- Field name
- Error description
- Source layer
- File path (if applicable)

---

## Migration Guide

### Upgrading Configuration Schema

When schema version changes:

1. Backup your current configuration
2. Update `schema_version` field
3. Adjust configuration keys as needed
4. Test with `dry-run` mode

### Migrating from V5

If migrating from an older version:

1. Export old configuration
2. Map to new four-layer model
3. Place sensitive data in user-level
4. Update `schema_version` to `"1.0"`

---

## Related Documentation

- [Configuration Format](./configuration-format.md) - JSON schema and configuration structure
- [Examples](./examples.md) - Example configurations for different use cases