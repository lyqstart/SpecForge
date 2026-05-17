# @specforge/daemon-core

Daemon Core module for SpecForge V6 - Central process and Single Source of Truth

## Overview

The Daemon Core serves as the central process and **Single Source of Truth** for the entire V6 architecture. It handles HTTP/SSE communication, Event Bus, Session Registry, and Project Manager.

## Features

- Single instance enforcement per machine
- HTTP/1.1 + SSE communication protocol
- Event Bus for cross-layer communication
- Session Registry with pending/active/history states
- Project isolation via path-based namespacing
- WAL (Write-Ahead Log) for crash recovery
- Bearer Token authentication

## Installation

```bash
cd packages/daemon-core
bun install
```

## API Documentation

See the [API Documentation](./docs/README.md) for detailed information on:
- [HTTP Endpoints](./docs/http-endpoints.md)
- [Event Schema](./docs/event-schema.md)
- [Error Codes](./docs/error-codes.md)
- [Authentication](./docs/authentication.md)

## Quick Start

### Starting the Daemon

```bash
# Start as thin plugin (auto-exit on idle)
bun run src/index.ts

# Start in detached mode (persistent)
bun run src/index.ts --detach
```

### Connecting Clients

1. Read the handshake file at `~/.specforge/runtime/daemon.sock.json`
2. Use the `port` to connect to the HTTP server
3. Include `Authorization: Bearer <token>` header in all requests

```bash
# Example request
curl -H "Authorization: Bearer <token>" http://127.0.0.1:<port>/
```

## Development

### Build

```bash
bun run build
```

### Watch Mode

```bash
bun run watch
```

### Lint

```bash
bun run lint
bun run lint:fix
```

### Format

```bash
bun run format
bun run format:check
```

### Test

```bash
bun run test
bun run test:watch
bun run test:coverage
```

## Project Structure

```
daemon-core/
├── src/              # Source code
�?  ├── daemon/       # Daemon process lifecycle
�?  ├── http/         # HTTP/SSE server
�?  ├── event-bus/    # Event Bus implementation
�?  ├── session/      # Session Registry
�?  ├── project/      # Project Manager
�?  ├── state/        # State Manager (WAL + state.json)
�?  └── recovery/     # Recovery Subsystem
├── tests/            # Test files
�?  ├── unit/         # Unit tests
�?  └── property/     # Property-based tests
├── dist/             # Build output
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Architecture

See [design.md](./design.md) for detailed architecture documentation.

## Requirements

See [requirements.md](./requirements.md) for detailed requirements documentation.

## License

MIT
