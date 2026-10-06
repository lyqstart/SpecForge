# @specforge/cli

Command Line Interface for SpecForge.

## Installation

```bash
# Install dependencies
bun install

# Build the CLI
bun run build

# Link for local development
npm link
```

## Usage

The CLI is the installed deployment and lifecycle entry point for the shared daemon:

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon stop
```

`start` launches the installed user-level `specforged` executable directly. `status` uses `/api/v1/healthz`, and `stop` uses the authenticated `/api/v1/admin/stop` endpoint. Omit `--detach` to keep the daemon in the foreground. The OpenCode Plugin remains a client and never owns this lifecycle.

```bash
# Manage workflows
specforge spec start --template my-template
specforge workflow status <id>
specforge workflow list

# Manage webhooks
specforge webhook register --url https://example.com/webhook --events "gate.*,permission.denied"
specforge webhook list

# Job management
specforge job <job-id>

# Utilities
specforge heal <work-item-id>
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

- `daemon` - Start, stop, and inspect the installed shared daemon
- `spec` - Manage specs
- `workflow` - Manage workflows
- `job` - Query async job status
- `webhook` - Manage webhooks
- `heal` - Trigger self-healing
- `config` - Show configuration

## Complete Removal Including User Data

To completely remove SpecForge including all user data, run the following commands in order:

1. npm uninstall -g @specforge/cli
2. rm -rf ~/.config/opencode/sf-user/

For Windows PowerShell, use:

1. npm uninstall -g @specforge/cli
2. Remove-Item -Recurse -Force $env:USERPROFILE\.config\opencode\sf-user

## Development

```bash
# Run tests
bun test

# Watch mode
bun test:watch

# Lint
bun run lint
```
