# Daemon operating references

Derived references for the independent SpecForge Daemon. Authority: [Product Specification](../../../docs/product-specification/specforge-product-specification.md).

Use the [official installer](../../../docs/user/install.md), then:

```bash
specforge daemon start --detach
specforge daemon status
specforge daemon restart
specforge daemon stop
```

Daemon owns authoritative project state, controlled tools, permission/write guards and workflow closure. CLI and Thin Plugin are clients. Closing/restarting OpenCode does not stop/restart Daemon.

- [CLI lifecycle](cli-integration.md)
- [Thin Plugin boundary](thin-plugin-integration.md)
- [Authentication](authentication.md)
- [HTTP routes](http-endpoints.md)
- [Error handling](error-handling.md)
- [Error codes](error-codes.md)
- [Event ownership](event-schema.md)

Follow runtime-returned recovery conditions. Do not manufacture a handshake, edit project state, suppress HardStops or rerun a closed WI to repair installation.
