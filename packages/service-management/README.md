# @specforge/service-management

Service Management subsystem for SpecForge - OS service lifecycle management for daemon and opencode-server.

## Overview

This package provides cross-platform service management capabilities:
- **Linux**: systemd --user unit management

## Features

- Service install/uninstall/start/stop/restart/status
- Linux systemd user-service abstraction
- Service lifecycle orchestration with dependency management
- Graceful shutdown handling
- Environment pre-check before installation

## Installation

This package is part of the SpecForge monorepo and is managed via workspaces:

```bash
bun install
```

## Development

```bash
# Build
bun run build

# Test
bun test

# Watch mode
bun test:watch
```

## Documentation

- [Current Product Specification](../../docs/product-specification/specforge-product-specification.md)
- [Authority Registry](../../docs/product-specification/authority-registry.md)
- Historical Kiro material: `docs/archive/kiro/specs/service-management/`
