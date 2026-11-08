# @specforge/service-management

Supporting library for independent Daemon/client lifecycle and Linux systemd user service management. Product authority: [SPS](../../docs/product-specification/specforge-product-specification.md).

Current direct lifecycle uses the installed short CLI:

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

OS service registration is Linux systemd --user only. Windows uses direct independent Daemon lifecycle; no NSSM or Windows/macOS OS-service registration is implied. The opencode-server group follows its actual supported service contract.

Shared owners provide handshake parsing, process/health identity checks, bounded startup/shutdown, reconnection and cleanup. Restart must prove the previous PID ended and a new healthy PID started. Plugin is a client and cannot own Daemon lifecycle.

Install with the [official installer](../../docs/user/install.md). Build/test from the repository root with the current workspace dependency order. Real platform lifecycle acceptance is separate from mocked unit coverage; retain failures and unsupported cases.
