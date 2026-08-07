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

From the repository root:

```bash
bun run packages/daemon-core/src/index.ts
```

Or from `packages/daemon-core`:

```bash
bun run src/index.ts
```

The current implementation runs in the foreground. Keep the terminal open and press `Ctrl+C` to stop it. `--detach` is not implemented, and `--no-foreground` is marked as future support. Use an operating-system service manager to supervise the same foreground command for persistent operation.

A successful startup writes the handshake file and logs `Daemon Core started on port <port>`.

### Connecting Clients and Health Check

1. Read the handshake file at `~/.config/opencode/sf-user/runtime/handshake.json`.
2. Use its `port` for the HTTP server.
3. Check the public health endpoint:

```bash
curl http://127.0.0.1:<port>/api/v1/healthz
```

All non-public API requests require `Authorization: Bearer <token>` using the token from the handshake file.

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
