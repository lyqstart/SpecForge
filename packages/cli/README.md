# @specforge/cli

Command Line Interface for SpecForge V6.

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

```bash
# Start daemon
specforge daemon start
specforge daemon start --detach

# Check daemon status
specforge daemon status

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

- `daemon` - Manage the SpecForge daemon (start, stop, status, config)
- `spec` - Manage specs
- `workflow` - Manage workflows
- `job` - Query async job status
- `webhook` - Manage webhooks
- `heal` - Trigger self-healing
- `config` - Show configuration

## Complete Removal Including User Data

To completely remove SpecForge including all user data, run the following commands in order:

1. npm uninstall -g @specforge/cli
2. rm -rf ~/.specforge/

For Windows PowerShell, use:

1. npm uninstall -g @specforge/cli
2. Remove-Item -Recurse -Force $env:USERPROFILE\.specforge

## Development

```bash
# Run tests
bun test

# Watch mode
bun test:watch

# Lint
bun run lint
```