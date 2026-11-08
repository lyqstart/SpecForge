# Current Daemon HTTP routes

Derived from [HTTPServer](../src/http/HTTPServer.ts) and the controlled HTTP tool registry. Regenerate with `bun scripts/render-daemon-http-reference.ts`; check with `--check`. Product authority remains [SPS](../../../docs/product-specification/specforge-product-specification.md).

Only GET /health and GET /api/v1/healthz are public. Every other listed endpoint requires bearer authentication from the private current handshake. Do not publish tokens or assume that authentication bypasses controlled handler permissions.

Registration is not implementation: event/query returns 501 / EVENT_QUERY_UNSUPPORTED; cas/store and cas/retrieve return 501 / CAS_API_UNSUPPORTED. They cannot be used as an independent query/CAS product API. Actual platform acceptance checks these refusals.

| Method | Exact route | Handler owner |
| --- | --- | --- |
| GET | `/` | `handleRoot` |
| POST | `/api/v1/admin/stop` | `handleAdminStop` |
| GET | `/api/v1/cas/retrieve` | `handleCasRetrieve` |
| POST | `/api/v1/cas/store` | `handleCasStore` |
| POST | `/api/v1/event/log` | `handleEventLog` |
| POST | `/api/v1/event/query` | `handleEventQuery` |
| GET | `/api/v1/healthz` | `handleHealthZ` |
| POST | `/api/v1/ingest/event` | `handleIngestEvent` |
| POST | `/api/v1/ingest/register` | `handleIngestRegister` |
| GET | `/api/v1/kernel/session` | `handleKernelSessionGet` |
| POST | `/api/v1/kernel/session/cancel` | `handleKernelSessionCancel` |
| POST | `/api/v1/kernel/session/prompt` | `handleKernelSessionPrompt` |
| POST | `/api/v1/kernel/session/spawn` | `handleKernelSessionSpawn` |
| POST | `/api/v1/project/ensure` | `handleProjectEnsure` |
| POST | `/api/v1/recovery/project-archive/restore` | `handleProjectArchiveRestore` |
| GET | `/api/v1/session/list` | `handleSessionList` |
| POST | `/api/v1/state/read` | `handleStateRead` |
| POST | `/api/v1/state/transition` | `handleStateTransition` |
| POST | `/api/v1/tool/invoke` | `handleToolInvoke` |
| POST | `/api/v1/v11/code-permission` | `handleV11CodePermission` |
| POST | `/api/v1/v11/decision` | `handleV11Decision` |
| POST | `/api/v1/v11/extension` | `handleV11Extension` |
| POST | `/api/v1/v11/gate/run` | `handleV11GateRun` |
| POST | `/api/v1/v11/handoff` | `handleV11Handoff` |
| POST | `/api/v1/v11/merge` | `handleV11Merge` |
| POST | `/api/v1/v11/rollback` | `handleV11Rollback` |
| POST | `/api/v1/v11/verification` | `handleV11Verification` |
| POST | `/api/v1/v11/work-item/create` | `handleV11WorkItemCreate` |
| POST | `/api/v1/v11/write-guard/bash` | `handleV11WriteGuardBash` |
| POST | `/api/v1/v11/write-guard/changed-files-audit` | `handleV11WriteGuardAudit` |
| POST | `/api/v1/v11/write-guard/check` | `handleV11WriteGuardCheck` |
| POST | `/api/v1/v11/write-guard/escaped-write` | `handleV11WriteGuardEscapedWrite` |
| POST | `/api/v1/v11/write-guard/native` | `unknown` |
| GET | `/events` | `handleSSE` |
| GET | `/health` | `handleHealth` |

This table is the exact registered route surface. Dynamic dispatch fallback does not establish an additional supported API. Legacy session/create, status, daemon/stop and standalone workflow routes must not be used as current operating examples. Use the installed short CLI for Daemon lifecycle.

Project Init and archive recovery retain their own controlled contracts; archive recovery is authenticated operator recovery, deliberately absent from Agent tool registries. Generic tool invocation must obey ToolDispatcher actor, artifact, permission, Gate and Runtime checks. Use the real tool schema rather than inventing request fields.

Response shapes vary by endpoint: common helpers use success/data or success/error plus requestId/timestamp; controlled tools return their own contracts. Public health is a direct health object. See [authentication](authentication.md) and [error handling](error-handling.md).
