# Event ownership and schema domains

These are distinct producer contracts:

| Surface | Owner | Meaning |
| --- | --- | --- |
| authoritative workflow events and projections | Daemon StateManager/project runtime owner | legal state facts, replay/recovery and controlled transitions |
| HTTP/EventBus/SSE messages | HTTP server and event-bus contracts | transport and subscription observations |
| neutral diagnostic records/payloads | Daemon observability recorder | trace/category/phase and sanitized diagnostics |
| public shared Event types | observability/types | library event contract; not a declaration that every log has this shape |

Use the actual producer's schema, timestamp unit and path resolver. Do not assume all timestamps are epoch milliseconds, monotonic nanoseconds or globally comparable. Product release version, handshake schema, observation-record schema and artifact contracts have separate identities.

Source references: [StateManager](../src/state/StateManager.ts), [HTTP routes](http-endpoints.md), [EventBus](../src/event-bus/EventBus.ts), [recorder](../src/observability/observability-recorder.ts), [shared event types](../../observability/src/types/index.ts).

Observability does not establish a second authoritative workflow WAL. Logs may reference state facts but cannot advance state or manufacture Gate/Permission/Verification/Merge/Close evidence. Preserve failure and HardStop events.

Read controlled state and owner artifacts for current WI status. SSE delivery or a logged Agent statement does not prove model execution, command execution or a successful state transition. Keep tokens/credentials out of ordinary logs and exported traces.
