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

The current CLI daemon subcommands are legacy client placeholders, not supported daemon lifecycle entry points. They attempt HTTP calls to an already running daemon and do not spawn the daemon process. Start daemon-core from the repository instead:

```bash
bun run packages/daemon-core/src/index.ts
```

Do not use `specforge daemon start`, `specforge daemon status`, `specforge daemon stop`, or `--detach` for the current deployment.

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

- `daemon` - Legacy client placeholders; not supported for daemon process lifecycle
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
