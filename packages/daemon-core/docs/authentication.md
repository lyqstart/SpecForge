# Daemon authentication

Owners: [HTTPServer](../src/http/HTTPServer.ts), [handshake parser](../../service-management/src/types/handshake.ts) and shared user-level paths.

Daemon writes `<OpenCode config>/sf-user/runtime/handshake.json`. HandshakeFile uses independent `schema_version: "1.0"`:

| Fields | Meaning |
| --- | --- |
| pid, port | actual process and listening port |
| token | private bearer token; never publish |
| bound_to | bound address; local runtime is loopback |
| startedAt | epoch milliseconds |
| version | product release identity |
| serviceMode | actual service/ad-hoc mode |
| artifact_contract_versions.task_document | independent Task document protocol |

The parser rejects malformed/missing/incompatible fields. Use `specforge daemon status` and actual health; never generate or repair a handshake manually.

Only GET `/health` and GET `/api/v1/healthz` are public health routes. Other routes, including `/` and `/events`, require bearer authentication. Unauthenticated governance requests return HTTP 401 / `UNAUTHORIZED`. CORS preflight grants no governance permission.

Share necessary non-secret health fields and sanitized exact error codes, not tokens, complete handshakes or credentials. Health establishes process/version, not successful WI execution.

Authentication does not bypass project/WI identity, artifact contracts, permissions, valid approval, Gates or HardStops. Resolve their returned conditions through the appropriate controlled owner.
