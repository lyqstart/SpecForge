# @specforge/opencode-adapter

OpenCode Adapter module for SpecForge - Implements LLMKernelAdapter interface for OpenCode.

## Overview

The OpenCode Adapter is the LLM Kernel adapter layer that isolates OpenCode-specific concepts and behaviors, providing a clean abstraction interface to the Daemon Core while absorbing OpenCode version changes.

## Requirements

Capability discovery reads the connected host provider metadata. A capability
value of `null` means unknown, not unsupported; consumers must require `=== true`
before selecting a capability. `jsonOutput` describes constrained JSON support.
The current `/provider` response does not report that field or streaming support,
so both remain unknown. Missing required model metadata and disconnected hosts
fail discovery. This follows SPS §10.2; model names are not capability evidence.

- Node.js 18+
- Bun (recommended) or Node.js LTS

## Installation

```bash
# From workspace
bun add @specforge/opencode-adapter

# Or from npm (when published)
npm install @specforge/opencode-adapter
```

## Usage

```typescript
import { OpenCodeAdapter, VersionChecker } from '@specforge/opencode-adapter';

// Create adapter instance
const adapter = new OpenCodeAdapter({
  compatibleKernelRange: 'opencode ^1.14',
  version: '1.0.0',
});

// Check version compatibility
const checker = new VersionChecker();
const result = checker.check('opencode ^1.14', '1.14.0');

if (result.status === 'compatible') {
  // Spawn an agent
  const { sessionId } = await adapter.spawnAgent({
    agentRole: 'dev',
    spawnIntentId: 'my-intent-123',
    model: 'claude-sonnet-4-20250514',
  });
  
  console.log('Session started:', sessionId);
}
```

## API

### Core Methods

- `spawnAgent(params)` - Start a new OpenCode agent session
- `getSession(sessionId)` - Get session information
- `cancelSession(sessionId, reason)` - Cancel a running session
- `sendPrompt(sessionId, message)` - Send a prompt to a session
- `subscribeEvents(sessionId)` - Subscribe to session events (async iterable)
- `getCapabilities(model)` - Get model capabilities

### Configuration

```typescript
interface OpenCodeAdapterConfig {
  version: string;
  compatibleKernelRange: string;
  translation?: {
    strictMode: boolean;
    logUntranslated: boolean;
  };
  compatibility?: {
    checkOnStartup: boolean;
    allowOverride: boolean;
  };
  integration?: {
    thinPluginEndpoint: string;
    reconnectAttempts: number;
    reconnectDelayMs: number;
  };
}
```

## Version Compatibility

| Adapter Version | OpenCode Version |
|-----------------|------------------|
| 1.0.0           | opencode ^1.14   |

## License

MIT
