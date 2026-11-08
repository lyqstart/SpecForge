# Thin Plugin and Daemon boundary

The first-party global Thin Plugin is installed at the OpenCode user configuration root by the [official installer](../../../docs/user/install.md). It has one export and connects to the independent Daemon.

```bash
specforge daemon start --detach
specforge daemon status
```

Restart OpenCode to load updated Agent/Tool/Skill/Plugin files. Restart Daemon explicitly with `specforge daemon restart`; stop with `specforge daemon stop`. Plugin startup, shutdown, reload and idle time do not own Daemon lifecycle.

Plugin reads the shared private handshake and forwards authenticated requests to controlled owners. It must not simulate state transitions, Gates, verification success or recovery. Offline/mismatched runtime remains a failure until actual readiness.

Real kernel/provider sessions and responses supply model execution evidence. Missing capability fields remain unknown. Tool schemas, Agent descriptions or locally constructed adapters do not prove actual execution.

D18 `sf_safe_bash` stays read-only containment. D23 plan/run/evidence owns formal execution, independent grants and profile checks. No platform/process-limit bypass is permitted.

See [authentication](authentication.md) and [CLI lifecycle](cli-integration.md). Installation sources are under [setup/userlevel-opencode](../../../setup/userlevel-opencode/).
