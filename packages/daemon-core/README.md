# @specforge/daemon-core

Current independent Daemon and owner of controlled project state, permissions, tools, Gates, audit and recovery. Authority: [Product Specification](../../docs/product-specification/specforge-product-specification.md).

Install the prepared current native release with the [official installer](../../docs/user/install.md), then:

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

CLI and first-party global Thin Plugin are clients. Plugin/OpenCode lifecycle cannot start, stop or replace Daemon. A running process and successful health response prove process readiness, not successful WI execution.

Current handshake/path contracts are shared by clients. Only `/health` and `/api/v1/healthz` are public health routes; other endpoints require authentication and controlled handler checks. Keep tokens out of logs and reports.

Project Init, StateManager, Code Permission, Write Guard, Gate, Merge/Audit/Close and recovery owners retain their respective authority. Neutral diagnostics do not create another workflow WAL. Unsupported persistent schemas fail closed.

See [operating/API references](docs/README.md), [development](DEVELOPMENT.md), [entry](src/index.ts) and [tests](tests/). Older V6/Kiro documents remain historical evidence.

For repository development, install frozen dependencies and build from the root through the current twelve-workspace entry. Source foreground launch is a development action in an explicitly owned configuration directory; it is not an alternative user installation procedure.
