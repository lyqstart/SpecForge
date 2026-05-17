# SpecForge CLI Command Reference

**Version**: 0.1.0  
**Last Updated**: 2026-05-16

This document provides a comprehensive reference for all SpecForge CLI commands implemented in Phase 1-9. The CLI supports both interactive (human-friendly) and machine-friendly (`--json`) output modes.

## Table of Contents

1. [Global Options](#global-options)
2. [Daemon Management](#daemon-management)
3. [Workflow Management](#workflow-management)
4. [Job Management](#job-management)
5. [Webhook Management](#webhook-management)
6. [Utility Commands](#utility-commands)
7. [Output Formats](#output-formats)
8. [Common Errors and Troubleshooting](#common-errors-and-troubleshooting)
9. [Examples](#examples)

---

## Global Options

All SpecForge CLI commands support the following global options:

### `--json` / `-j`

Output in JSON format (machine-friendly, no colors or interactive prompts).

```bash
specforge <command> --json
specforge <command> -j
```

**Default**: `false` (interactive mode)

**Example**:
```bash
$ specforge daemon status --json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 3600000,
  "message": "Daemon is running normally"
}
```

### `--verbose` / `-v`

Enable verbose output with additional debugging information.

```bash
specforge <command> --verbose
specforge <command> -v
```

**Default**: `false`

### `--help` / `-h`

Display help information for a command.

```bash
specforge --help
specforge <command> --help
specforge <command> <subcommand> --help
```

### `--version` / `-V`

Display the CLI version.

```bash
specforge --version
specforge -V
```

---

## Daemon Management

Manage the SpecForge daemon process.

### `specforge daemon start`

Start the SpecForge daemon.

**Syntax**:
```bash
specforge daemon start [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--detach` / `-d` | boolean | `false` | Run daemon in background (detach from terminal) |
| `--bind` | string | `127.0.0.1` | Bind address for daemon HTTP server |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Start daemon in foreground (interactive mode)
$ specforge daemon start
✓ Daemon started successfully

# Start daemon in background
$ specforge daemon start --detach
✓ Daemon started in background
PID: 12345

# Start daemon on specific address
$ specforge daemon start --bind 0.0.0.0

# Start daemon and output JSON
$ specforge daemon start --json
{
  "success": true,
  "message": "Daemon started successfully",
  "pid": 12345
}
```

**Error Handling**:
- If daemon is already running, returns error: `Daemon already running on port 3847`
- If port is in use, returns error: `Port 3847 is already in use`

---

### `specforge daemon stop`

Stop the running SpecForge daemon.

**Syntax**:
```bash
specforge daemon stop [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Stop daemon (interactive mode)
$ specforge daemon stop
✓ Daemon stopped successfully

# Stop daemon and output JSON
$ specforge daemon stop --json
{
  "success": true,
  "message": "Daemon stopped successfully"
}
```

**Error Handling**:
- If daemon is not running, returns error: `Daemon is not running`
- If stop fails, returns error with details

---

### `specforge daemon status`

Check the health and status of the SpecForge daemon.

**Syntax**:
```bash
specforge daemon status [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Check daemon status (interactive mode)
$ specforge daemon status
✓ Daemon Status: healthy
Version: 0.1.0
Uptime: 2h 15m
Message: Daemon is running normally

# Check daemon status (JSON mode)
$ specforge daemon status --json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 8100000,
  "message": "Daemon is running normally"
}
```

**Status Values**:
- `healthy` - Daemon is running normally
- `unhealthy` - Daemon is running but experiencing issues
- `starting` - Daemon is starting up
- `stopped` - Daemon is not running

**Error Handling**:
- If daemon is unreachable, returns error: `Daemon unreachable`
- Includes suggestion: `Is the Daemon running? Try 'specforge daemon start'`

---

### `specforge daemon config`

Configure daemon settings (not yet implemented).

**Syntax**:
```bash
specforge daemon config [OPTIONS]
```

**Options**:

| Option | Type | Description |
|--------|------|-------------|
| `--bind` | string | Bind address for daemon |
| `--require-auth` | boolean | Require authentication (default: true) |

**Status**: ⚠️ Not yet implemented

---

## Workflow Management

Manage specs and workflows.

### `specforge spec start`

Start a new spec (asynchronous operation).

**Syntax**:
```bash
specforge spec start [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--template` / `-t` | string | - | Spec template to use |
| `--wait` / `-w` | boolean | `false` | Wait for spec to complete |
| `--timeout` | number | `300` | Timeout in seconds for `--wait` |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Start a new spec (returns immediately with jobId)
$ specforge spec start --template feature
Job created: job-abc123def456
Command: spec start
Status: pending

Use "specforge job job-abc123def456" to check status.
Use "specforge job job-abc123def456 --wait" to wait for completion.

# Start spec and wait for completion
$ specforge spec start --template feature --wait
Job: job-abc123def456
Command: spec start
Status: completed
Created: 5/16/2026, 10:30:45 AM
Updated: 5/16/2026, 10:35:50 AM
Result: {"specId": "spec-xyz789", "name": "New Feature Spec"}

# Start spec in JSON mode
$ specforge spec start --template feature --json
{
  "jobId": "job-abc123def456",
  "status": "pending",
  "command": "spec start"
}
```

**Async Contract**:
- Immediate response contains `jobId` and `status: "pending"`
- Use `specforge job <jobId>` to query status
- Use `--wait` to block until completion
- Terminal states: `completed`, `failed`, `blocked`, `cancelled`

---

### `specforge workflow start`

Start a new workflow (asynchronous operation).

**Syntax**:
```bash
specforge workflow start [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--spec` / `-s` | string | **required** | Spec to run |
| `--wait` / `-w` | boolean | `false` | Wait for workflow to complete |
| `--timeout` | number | `600` | Timeout in seconds for `--wait` |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Start a workflow
$ specforge workflow start --spec my-spec
Job created: job-def789ghi012
Command: workflow start
Status: pending

# Start workflow and wait for completion
$ specforge workflow start --spec my-spec --wait --timeout 900
Job: job-def789ghi012
Command: workflow start
Status: completed
Result: {"workflowId": "wf-123", "tasksCompleted": 42}

# Start workflow in JSON mode
$ specforge workflow start --spec my-spec --json
{
  "jobId": "job-def789ghi012",
  "status": "pending",
  "command": "workflow start"
}
```

---

### `specforge workflow status <id>`

Get the status of a workflow.

**Syntax**:
```bash
specforge workflow status <id> [OPTIONS]
```

**Arguments**:

| Argument | Type | Description |
|----------|------|-------------|
| `<id>` | string | Workflow ID |

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--wait` / `-w` | boolean | `false` | Wait for workflow to complete |
| `--timeout` | number | `600` | Timeout in seconds for `--wait` |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Get workflow status
$ specforge workflow status wf-123
Job: wf-123
Command: workflow status
Status: running
Created: 5/16/2026, 10:30:45 AM
Updated: 5/16/2026, 10:32:15 AM

# Wait for workflow to complete
$ specforge workflow status wf-123 --wait
Job: wf-123
Command: workflow status
Status: completed
Result: {"tasksCompleted": 42, "duration": 125000}
```

---

### `specforge workflow list`

List all workflows.

**Syntax**:
```bash
specforge workflow list [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# List workflows (interactive mode)
$ specforge workflow list
Found 3 workflow(s):

Job: wf-001
Command: workflow start
Status: completed
Created: 5/16/2026, 10:00:00 AM
Updated: 5/16/2026, 10:05:30 AM
---
Job: wf-002
Command: workflow start
Status: running
Created: 5/16/2026, 10:15:00 AM
Updated: 5/16/2026, 10:20:15 AM
---

# List workflows (JSON mode)
$ specforge workflow list --json
[
  {
    "jobId": "wf-001",
    "status": "completed",
    "command": "workflow start",
    "createdAt": 1715857200000,
    "updatedAt": 1715857530000
  },
  ...
]
```

---

## Job Management

Manage asynchronous jobs and their status.

### `specforge job <id>`

Get the status of a specific job.

**Syntax**:
```bash
specforge job <id> [OPTIONS]
```

**Arguments**:

| Argument | Type | Description |
|----------|------|-------------|
| `<id>` | string | Job ID |

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--wait` / `-w` | boolean | `false` | Wait for job to complete |
| `--timeout` | number | `300` | Timeout in seconds for `--wait` |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Get job status
$ specforge job job-abc123def456
Job: job-abc123def456
Command: spec start
Status: running
Created: 5/16/2026, 10:30:45 AM
Updated: 5/16/2026, 10:31:15 AM

# Wait for job to complete
$ specforge job job-abc123def456 --wait
Job: job-abc123def456
Command: spec start
Status: completed
Created: 5/16/2026, 10:30:45 AM
Updated: 5/16/2026, 10:35:50 AM
Result: {"specId": "spec-xyz789"}

# Get job status in JSON mode
$ specforge job job-abc123def456 --json
{
  "jobId": "job-abc123def456",
  "status": "running",
  "command": "spec start",
  "createdAt": 1715857845000,
  "updatedAt": 1715857875000
}
```

**Job Status Values**:
- `pending` - Job is queued, waiting to start
- `running` - Job is currently executing
- `completed` - Job completed successfully
- `failed` - Job failed with error
- `blocked` - Job is blocked (e.g., waiting for healing)
- `cancelled` - Job was cancelled by user

---

### `specforge job list`

List all jobs with optional filtering.

**Syntax**:
```bash
specforge job list [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--status` | string | - | Filter by status (pending, running, completed, failed, blocked, cancelled) |
| `--limit` | number | `50` | Limit number of results |
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# List all jobs
$ specforge job list
Found 5 job(s):

Job: job-001
Status: completed
...

# List only running jobs
$ specforge job list --status running
Found 2 job(s):

Job: job-002
Status: running
...

# List jobs in JSON mode
$ specforge job list --json
[
  {
    "jobId": "job-001",
    "status": "completed",
    "command": "spec start",
    "createdAt": 1715857200000,
    "updatedAt": 1715857530000
  },
  ...
]
```

---

## Webhook Management

Manage webhooks for event notifications.

### `specforge webhook register`

Register a new webhook endpoint.

**Syntax**:
```bash
specforge webhook register --url <url> --events <pattern> [OPTIONS]
```

**Options**:

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `--url` | string | **yes** | Webhook URL (must be HTTPS in production) |
| `--events` | string | **yes** | Event patterns to subscribe (comma-separated) |
| `--json` | boolean | - | Output in JSON format |

**Event Patterns**:
- `gate.*` - All gate events
- `workflow.completed` - Workflow completion
- `workflow.failed` - Workflow failure
- `permission.denied` - Permission denied events
- `*` - All events

**Examples**:

```bash
# Register a webhook
$ specforge webhook register --url https://example.com/webhook --events "gate.*,workflow.completed"
✓ Webhook registered successfully

Webhook Details:
  ID:     webhook-abc123
  URL:    https://example.com/webhook
  Events: gate.*, workflow.completed
  Status: Active

Use "specforge webhook delete webhook-abc123" to remove this webhook.

# Register webhook in JSON mode
$ specforge webhook register --url https://example.com/webhook --events "gate.*" --json
{
  "success": true,
  "webhook": {
    "id": "webhook-abc123",
    "url": "https://example.com/webhook",
    "events": ["gate.*"],
    "active": true,
    "createdAt": 1715857845000
  },
  "message": "Webhook registered successfully"
}
```

**Error Handling**:
- If URL is invalid: `Invalid webhook URL`
- If no events specified: `At least one event pattern is required`
- If webhook already exists: `Webhook already registered for this URL`

---

### `specforge webhook list`

List all registered webhooks.

**Syntax**:
```bash
specforge webhook list [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# List webhooks (interactive mode)
$ specforge webhook list
Found 2 webhook(s):

✓ Webhook: webhook-abc123
  URL:    https://example.com/webhook
  Events: gate.*, workflow.completed
  Created: 5/16/2026, 10:30:45 AM
  Last Triggered: 5/16/2026, 10:35:20 AM

✓ Webhook: webhook-def456
  URL:    https://api.example.com/events
  Events: workflow.*
  Created: 5/15/2026, 09:15:30 AM

Use "specforge webhook delete <id>" to remove a webhook.

# List webhooks (JSON mode)
$ specforge webhook list --json
{
  "webhooks": [
    {
      "id": "webhook-abc123",
      "url": "https://example.com/webhook",
      "events": ["gate.*", "workflow.completed"],
      "active": true,
      "createdAt": 1715857845000,
      "lastTriggeredAt": 1715857920000
    },
    ...
  ],
  "total": 2
}
```

---

### `specforge webhook delete <id>`

Delete a registered webhook.

**Syntax**:
```bash
specforge webhook delete <id> [OPTIONS]
```

**Arguments**:

| Argument | Type | Description |
|----------|------|-------------|
| `<id>` | string | Webhook ID |

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Delete a webhook
$ specforge webhook delete webhook-abc123
✓ Webhook deleted successfully

# Delete webhook in JSON mode
$ specforge webhook delete webhook-abc123 --json
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

**Error Handling**:
- If webhook not found: `Webhook not found: webhook-abc123`
- If deletion fails: `Failed to delete webhook`

---

## Utility Commands

Miscellaneous utility commands.

### `specforge heal <workItemId>`

Trigger self-healing for a work item.

**Syntax**:
```bash
specforge heal <workItemId> [OPTIONS]
```

**Arguments**:

| Argument | Type | Description |
|----------|------|-------------|
| `<workItemId>` | string | Work item ID to heal |

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Trigger healing
$ specforge heal work-item-123
✓ Healing triggered successfully
Healing ID: heal-abc123def456

Use "specforge job heal-abc123def456" to monitor progress.

# Trigger healing in JSON mode
$ specforge heal work-item-123 --json
{
  "workItemId": "work-item-123",
  "healingId": "heal-abc123def456",
  "success": true,
  "message": "Healing triggered successfully"
}
```

---

### `specforge config`

Show current CLI configuration.

**Syntax**:
```bash
specforge config [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Show configuration (interactive mode)
$ specforge config
SpecForge CLI Configuration

Daemon:
  Host: 127.0.0.1
  Port: 3847
  Authenticated: Yes

CLI:
  Version: 0.1.0
  Config Directory: /home/user/.specforge
  Runtime Directory: /home/user/.specforge/runtime

System:
  Platform: linux (x64)
  Home Directory: /home/user

# Show configuration (JSON mode)
$ specforge config --json
{
  "daemon": {
    "host": "127.0.0.1",
    "port": 3847,
    "authenticated": true
  },
  "cli": {
    "version": "0.1.0",
    "configDir": "/home/user/.specforge",
    "runtimeDir": "/home/user/.specforge/runtime"
  },
  "system": {
    "platform": "linux",
    "arch": "x64",
    "homeDir": "/home/user"
  }
}
```

---

### `specforge version`

Show CLI version information.

**Syntax**:
```bash
specforge version [OPTIONS]
```

**Options**:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output in JSON format |

**Examples**:

```bash
# Show version (interactive mode)
$ specforge version
SpecForge CLI v0.1.0
Platform: linux (x64)

# Show version (JSON mode)
$ specforge version --json
{
  "version": "0.1.0",
  "platform": "linux",
  "arch": "x64"
}
```

---

## Output Formats

### Interactive Mode (Default)

Human-friendly output with colors, formatting, and helpful hints.

**Characteristics**:
- Colored output (✓ for success, ✗ for errors)
- Formatted tables and lists
- Helpful hints and suggestions
- Progress indicators for long operations
- No JSON escaping

**Example**:
```
$ specforge daemon status
✓ Daemon Status: healthy
Version: 0.1.0
Uptime: 2h 15m
Message: Daemon is running normally
```

### JSON Mode (`--json`)

Machine-friendly structured output suitable for automation and tool integration.

**Characteristics**:
- Valid JSON output
- No colors or formatting
- No interactive prompts
- Suitable for parsing by scripts and tools
- Consistent structure across commands

**Example**:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime": 8100000,
  "message": "Daemon is running normally"
}
```

### Error Output

**Interactive Mode**:
```
Error: Daemon unreachable
  Hint: Is the Daemon running? Try 'specforge daemon start'
```

**JSON Mode**:
```json
{
  "error": "daemon_unreachable",
  "message": "Daemon unreachable",
  "hint": "Is the Daemon running? Try 'specforge daemon start'"
}
```

---

## Common Errors and Troubleshooting

### Daemon Unreachable

**Error Message**:
```
Error: Daemon unreachable
Hint: Is the Daemon running? Try 'specforge daemon start'
```

**Causes**:
- Daemon is not running
- Daemon is running on a different port
- Network connectivity issue

**Solutions**:
1. Check if daemon is running: `specforge daemon status`
2. Start daemon: `specforge daemon start`
3. Check if port 3847 is in use: `netstat -an | grep 3847`
4. Try connecting to a different host: `specforge daemon status --host <host>`

---

### Invalid Input

**Error Message**:
```
Error: Invalid input
Message: <specific error details>
Hint: <helpful suggestion>
```

**Common Cases**:
- Missing required arguments
- Invalid option values
- Malformed event patterns

**Solutions**:
1. Check command syntax: `specforge <command> --help`
2. Verify all required arguments are provided
3. Check option values match expected format

---

### Job Not Found

**Error Message**:
```
Error: Job not found
Message: Job with ID 'job-xyz' not found
```

**Causes**:
- Job ID is incorrect
- Job has expired (older than retention period)
- Job was deleted

**Solutions**:
1. Verify job ID: `specforge job list`
2. Check job status: `specforge job <id>`
3. List recent jobs: `specforge job list --limit 100`

---

### Webhook Registration Failed

**Error Message**:
```
Error: Webhook registration failed
Message: Invalid webhook URL
```

**Causes**:
- URL is not valid HTTPS
- URL is not reachable
- URL is already registered

**Solutions**:
1. Verify URL is valid HTTPS: `https://example.com/webhook`
2. Test URL accessibility: `curl -I https://example.com/webhook`
3. Check existing webhooks: `specforge webhook list`

---

### Authentication Failed

**Error Message**:
```
Error: Authentication failed
Message: Invalid or missing authentication token
```

**Causes**:
- Daemon token is invalid
- Handshake file is corrupted
- Daemon was restarted

**Solutions**:
1. Restart daemon: `specforge daemon stop && specforge daemon start`
2. Check handshake file: `cat ~/.specforge/runtime/daemon.sock.json`
3. Verify daemon is running: `specforge daemon status`

---

## Examples

### Example 1: Start a Workflow and Wait for Completion

```bash
# Start workflow
$ specforge workflow start --spec my-feature-spec --wait --timeout 900

# Output
Job: job-abc123def456
Command: workflow start
Status: completed
Created: 5/16/2026, 10:30:45 AM
Updated: 5/16/2026, 10:45:30 AM
Result: {
  "workflowId": "wf-123",
  "tasksCompleted": 42,
  "duration": 900000
}
```

### Example 2: Monitor Multiple Jobs

```bash
# List all running jobs
$ specforge job list --status running

# Check specific job status
$ specforge job job-abc123def456

# Wait for job to complete
$ specforge job job-abc123def456 --wait
```

### Example 3: Setup Webhook for Event Notifications

```bash
# Register webhook for gate events
$ specforge webhook register \
  --url https://api.example.com/events \
  --events "gate.*,workflow.completed"

# List registered webhooks
$ specforge webhook list

# Delete webhook when no longer needed
$ specforge webhook delete webhook-abc123
```

### Example 4: Automate with JSON Output

```bash
# Get daemon status in JSON
$ specforge daemon status --json | jq '.status'
"healthy"

# List jobs and filter by status
$ specforge job list --json | jq '.[] | select(.status == "failed")'

# Parse workflow result
$ specforge workflow status wf-123 --json | jq '.result'
```

### Example 5: Troubleshoot Daemon Issues

```bash
# Check daemon status
$ specforge daemon status

# View configuration
$ specforge config

# Restart daemon
$ specforge daemon stop
$ specforge daemon start

# Check daemon logs (if available)
$ tail -f ~/.specforge/runtime/daemon.log
```

---

## Command Dependency Graph

```
specforge
├── daemon
│   ├── start
│   ├── stop
│   ├── status
│   └── config
├── spec
│   └── start (async)
├── workflow
│   ├── start (async)
│   ├── status
│   └── list
├── job
│   ├── <id> (query status)
│   └── list
├── webhook
│   ├── register
│   ├── list
│   └── delete
├── heal (async)
├── config
├── version
└── help
```

---

## Async Command Contract

All asynchronous commands follow a consistent contract:

### Immediate Response (without `--wait`)

```json
{
  "jobId": "job-abc123def456",
  "status": "pending",
  "command": "spec start"
}
```

### Status Query

```bash
$ specforge job <jobId>
```

### Wait for Completion

```bash
$ specforge job <jobId> --wait
```

### Terminal States

- `completed` - Job completed successfully
- `failed` - Job failed with error
- `blocked` - Job is blocked (e.g., waiting for healing)
- `cancelled` - Job was cancelled by user

---

## Supported Output Formats

### `--json` Mode

All commands support `--json` flag for machine-friendly output:

```bash
specforge <command> --json
```

**Guarantees**:
- Valid JSON output
- No colors or ANSI escape sequences
- No interactive prompts
- Consistent structure across versions
- Suitable for parsing by scripts and tools

### Interactive Mode (Default)

Default mode with human-friendly output:

```bash
specforge <command>
```

**Features**:
- Colored output
- Formatted tables and lists
- Helpful hints and suggestions
- Progress indicators
- Interactive prompts (where applicable)

---

## Configuration Files

### Daemon Handshake File

Location: `~/.specforge/runtime/daemon.sock.json`

Contains daemon connection information:

```json
{
  "pid": 12345,
  "port": 3847,
  "token": "sk-...",
  "schema_version": "1.0",
  "bound_to": "127.0.0.1"
}
```

### CLI Configuration

Location: `~/.specforge/config.json`

User-specific CLI settings (if applicable).

---

## Platform Support

The CLI is tested and supported on:

- **Linux** (x64, ARM64)
- **macOS** (x64, ARM64)
- **Windows** (x64)

---

## Version History

### v0.1.0 (Current)

- Initial CLI implementation
- Daemon management commands
- Workflow management commands
- Job tracking and status queries
- Webhook management
- Utility commands
- Dual-mode output (interactive and JSON)

---

## Related Documentation

- [CLI Design Document](../cli/design.md)
- [CLI Requirements](../cli/requirements.md)
- [Daemon API Reference](../daemon/api-reference.md)
- [OpenClaw Integration Guide](../integration/openclaw.md)

---

## Support and Feedback

For issues, questions, or feedback:

1. Check this command reference
2. Run `specforge <command> --help` for command-specific help
3. Check daemon logs: `~/.specforge/runtime/daemon.log`
4. Report issues with: `specforge --version` and error details

---

**Last Updated**: 2026-05-16  
**Maintained By**: SpecForge Development Team
