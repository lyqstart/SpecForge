# Installation and Setup Guide

## Prerequisites

### Required Software

- **Node.js**: Version 18 or higher
- **Bun**: Recommended (for development and testing)
- **OpenCode**: Version 1.14 or higher

### System Requirements

- Operating System: Windows 10+, macOS 12+, or Linux
- Memory: 4GB RAM minimum
- Disk Space: 100MB for package installation

## Installation

### From Workspace (Development)

```bash
# Install dependencies
bun install

# Build the package
cd packages/opencode-adapter
bun run build
```

### From npm (Production)

```bash
npm install @specforge/opencode-adapter
# or
bun add @specforge/opencode-adapter
```

## Version Compatibility

| Adapter Version | OpenCode Version | Node.js | Notes |
|-----------------|------------------|---------|-------|
| 1.0.0           | ^1.14            | 18+     | Initial release |

### Upgrading OpenCode

When upgrading OpenCode to a new major version:

1. Check the adapter's `compatibleKernelRange` in your config
2. Upgrade the adapter to a compatible version
3. Test your integration before deploying to production

## Configuration

### Basic Configuration

```typescript
import { OpenCodeAdapter, loadConfig } from '@specforge/opencode-adapter';

// Load configuration from environment or file
const config = await loadConfig();

// Create adapter
const adapter = new OpenCodeAdapter({
  version: '1.0.0',
  compatibleKernelRange: 'opencode ^1.14',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCODE_ADAPTER_VERSION` | Adapter version | 1.0.0 |
| `OPENCODE_KERNEL_RANGE` | Compatible OpenCode range | opencode ^1.14 |
| `OPENCODE_PLUGIN_ENDPOINT` | Thin Plugin endpoint | http://localhost:3001 |

### Configuration File

Create `opencode-adapter.config.json` in your project root:

```json
{
  "version": "1.0.0",
  "compatibleKernelRange": "opencode ^1.14",
  "translation": {
    "strictMode": true,
    "logUntranslated": false
  },
  "compatibility": {
    "checkOnStartup": true,
    "allowOverride": false
  },
  "integration": {
    "thinPluginEndpoint": "http://localhost:3001",
    "reconnectAttempts": 3,
    "reconnectDelayMs": 1000
  }
}
```

## Troubleshooting

### Version Mismatch Errors

**Error**: `Adapter version mismatch: OpenCode version X is not compatible with adapter range Y`

**Solution**:
1. Check your OpenCode version: `opencode --version`
2. Upgrade or downgrade OpenCode to match the adapter's compatible range
3. Or update the adapter to a version that supports your OpenCode version

### Connection Errors

**Error**: `Failed to connect to Thin Plugin`

**Solution**:
1. Ensure Thin Plugin is running
2. Check the `thinPluginEndpoint` configuration
3. Verify network connectivity

### Session Binding Errors

**Error**: `Failed to bind session: spawnIntentId not found`

**Solution**:
1. Ensure the session was created via `spawnAgent` first
2. Check that the spawnIntentId matches
3. Verify the Thin Plugin is reporting events correctly

## Upgrade Procedures

### Upgrading the Adapter

1. Update your dependency:
   ```bash
   npm install @specforge/opencode-adapter@latest
   ```

2. Check for breaking changes in the CHANGELOG

3. Test your integration

4. Deploy to production

### Downgrading the Adapter

If you encounter compatibility issues:

1. Check the version compatibility table
2. Install a compatible version:
   ```bash
   npm install @specforge/opencode-adapter@1.0.0
   ```

3. Test thoroughly before deploying

## Testing Your Installation

```typescript
import { OpenCodeAdapter, VersionChecker } from '@specforge/opencode-adapter';

// Test version compatibility
const checker = new VersionChecker();
const result = checker.check('opencode ^1.14', '1.14.0');

if (result.status === 'compatible') {
  console.log('Version check passed!');
  
  // Test adapter creation
  const adapter = new OpenCodeAdapter({
    version: '1.0.0',
    compatibleKernelRange: 'opencode ^1.14',
  });
  
  console.log('Adapter created successfully');
}
```

## Support

For issues and questions:
- GitHub Issues: https://github.com/specforge/specforge/issues
- Documentation: https://specforge.dev/docs