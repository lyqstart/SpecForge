# @specforge/cli

Command Line Interface for SpecForge.

## Installation

```bash
# Install dependencies
bun install

# Build the CLI
bun run build

# The official user-level installer owns the released CLI and daemon binaries.
```

## Usage

The CLI is the installed deployment and lifecycle entry point for the shared daemon:

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

`start` launches the installed user-level `specforged` executable directly. `status` uses `/api/v1/healthz`; `stop` uses the authenticated `/api/v1/admin/stop` endpoint. `restart` waits for the old PID to exit and verifies the new PID's handshake and health before reporting success. Omit `--detach` to keep the daemon in the foreground. The OpenCode Plugin remains a client and never owns this lifecycle.

```bash
# Utilities
specforge config

# Options
specforge --help
specforge --version
specforge <command> --json  # Machine-friendly output
```

## Dual-Mode Output

The CLI supports two output modes:

1. **Interactive mode** (default): Colorful, human-readable output
2. **JSON mode** (`--json` flag): Machine-friendly structured output for automation

## Commands

- `daemon` - Start, stop, restart, and inspect the installed shared daemon
- `config` - Show configuration
- `doctor` - Inspect local installation and project status
- `services` - Manage supported OS services (Linux `systemd --user` registration only)
- `opencode-server` - Manage the OpenCode Server service

Historical `spec`, `workflow`, `job`, `webhook`, and third-party `plugin` command modules are not registered in the released CLI: their required Daemon routes are not part of the current contract.

## Uninstall

Use the official user-level installer's `uninstall` operation. It owns the release manifest and preserves user data according to its uninstall contract; npm-global removal and manual recursive deletion are not current deployment procedures.

## Development

```bash
# Run tests
bun test

# Watch mode
bun test:watch

# Lint
bun run lint
```
