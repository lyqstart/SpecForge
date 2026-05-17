# @specforge/configuration

SpecForge V6 Configuration Subsystem

Manages four-layer configuration merging with deterministic behavior and sensitive field protection.

## Installation

```bash
bun add @specforge/configuration
```

## Usage

```typescript
import { ConfigManager } from '@specforge/configuration'

const manager = new ConfigManager()
await manager.loadConfig()

const value = manager.get('some.key')
```

## Configuration Layers

1. **Builtin**: Default values from code
2. **User**: User-level overrides in `~/.specforge/config/`
3. **Project**: Project-level overrides in `<project>/.specforge/config/`
4. **Runtime**: CLI/env overrides

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Lint
bun run lint

# Format
bun run format

# Test
bun run test

# Test with coverage
bun run test:coverage
```

## License

MIT
