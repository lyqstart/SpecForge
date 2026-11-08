# CLI and independent Daemon lifecycle

Install native CLI/Daemon with the [official installer](../../../docs/user/install.md).

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

Start reports readiness after actual health. Status uses shared runtime paths/handshake. Restart must terminate the old process and establish a new healthy process; stop verifies exit. Client launch alone does not establish readiness.

Use actual `specforge daemon <command> --help` options. Default local runtime binds loopback. Custom bind settings use supported deployment configuration.

Daemon owns `<OpenCode config>/sf-user/runtime/handshake.json`; clients use the [current parser](../../service-management/src/types/handshake.ts). Never publish its token, generate it manually or delete it to bypass a process mismatch.

Governance writes belong to authenticated controlled tools and StateManager/permission owners. Preserve exact errors and numeric exits.

Linux service registration uses `specforge services` and systemd user services. Windows uses direct independent Daemon lifecycle. Portable direct lifecycle does not imply NSSM or macOS service registration.
