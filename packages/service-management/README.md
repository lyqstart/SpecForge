# @specforge/service-management

Service Management subsystem for SpecForge V6 - OS service lifecycle management for daemon and opencode-server.

## Overview

This package provides cross-platform service management capabilities:
- **Linux**: systemd --user unit management
- **Windows**: NSSM (Non-Sucking Service Manager) integration

## Features

- Service install/uninstall/start/stop/restart/status
- Cross-platform abstraction (systemd/NSSM)
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

- [Requirements](../.kiro/specs/service-management/requirements.md)
- [Design](../.kiro/specs/service-management/design.md)
- [Tasks](../.kiro/specs/service-management/tasks.md)