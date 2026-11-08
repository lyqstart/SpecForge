# Current read-only Daemon examples

These repository development examples use the shared current handshake parser, verify actual process/version health before credentials, and query only implemented read routes. They do not create sessions/WIs, stop Daemon, invoke models, write project state or establish workflow acceptance.

From the repository root, prepare dependencies/build and the official installation as described in [install](../../../docs/user/install.md). Start the independently installed Daemon with `specforge daemon start --detach`; inspect it with `specforge daemon status`.

```bash
bun packages/daemon-core/examples/01-cli-integration.ts
bun packages/daemon-core/examples/02-thin-plugin-integration.ts
bun packages/daemon-core/examples/03-error-handling.ts
```

01 reports non-secret health identity. 02 reports only the authenticated session count. 03 verifies an unauthenticated GET is refused with 401 / UNAUTHORIZED. None prints a token or copies a complete handshake. They respect the current OpenCode configuration root.

Actual Thin Plugin integration is owned by the installed first-party Plugin and Daemon. Kernel/provider metadata and real execution need their own evidence. Current [HTTP reference](../docs/http-endpoints.md) and [authentication](../docs/authentication.md) define these routes.

The original session/create/status/daemon-stop recipes and token-printing examples are preserved in the audit archive as historical evidence, not current operating instructions.
