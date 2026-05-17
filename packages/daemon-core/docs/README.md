# Daemon Core API Documentation

Welcome to the Daemon Core API documentation. This section covers all public APIs, endpoints, event schemas, and error codes for the SpecForge V6 Daemon Core module.

## Table of Contents

- [HTTP Endpoints](./http-endpoints.md)
- [Event Schema](./event-schema.md)
- [Error Codes](./error-codes.md)
- [Authentication](./authentication.md)
- [CLI Integration](./cli-integration.md)
- [Thin Plugin Integration](./thin-plugin-integration.md)
- [Error Handling](./error-handling.md)

## Overview

The Daemon Core is the central process and **Single Source of Truth** for the entire V6 architecture. It provides:

- HTTP/1.1 + SSE communication protocol
- Event Bus for cross-layer communication
- Session Registry with pending/active/history states
- Project isolation via path-based namespacing
- WAL (Write-Ahead Log) for crash recovery

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

## Related Documentation

- [Requirements](../requirements.md)
- [Design](../design.md)
- [Development Guide](../DEVELOPMENT.md)