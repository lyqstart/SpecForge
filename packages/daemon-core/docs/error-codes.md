# Current HTTP error-code reference

Generated from literal `errorBody` calls in [HTTPServer](../src/http/HTTPServer.ts). This finite list covers that helper's static codes. Controlled Tool/Runtime/verification owners have additional typed errors; absence from this table does not make an error unknown or retryable.

| Code | Producer method(s) |
| --- | --- |
| `ARCHIVE_RECOVERY_BLOCKED` | `handleProjectArchiveRestore` |
| `ARCHIVE_RECOVERY_INPUT_REQUIRED` | `handleProjectArchiveRestore` |
| `ARCHIVE_RECOVERY_UNAVAILABLE` | `handleProjectArchiveRestore` |
| `CAS_API_UNSUPPORTED` | `handleCasRetrieve`, `handleCasStore` |
| `DAEMON_SHUTDOWN_UNAVAILABLE` | `handleAdminStop` |
| `ESCAPED_WRITE_API_UNSUPPORTED` | `handleV11WriteGuardEscapedWrite` |
| `EVENT_LOGGER_UNAVAILABLE` | `handleEventLog` |
| `EVENT_QUERY_UNSUPPORTED` | `handleEventQuery` |
| `INIT_FAILED` | `handleProjectEnsure` |
| `INTERNAL_ERROR` | `handleEventLog`, `handleHandlerError`, `handleRequest`, `handleStateRead` |
| `INVALID_JSON` | `handleEventLog`, `handleEventQuery`, `handleIngestEvent`, `handleIngestRegister`, `handleKernelSessionCancel`, `handleKernelSessionPrompt`, `handleKernelSessionSpawn`, `handleProjectArchiveRestore`, `handleProjectEnsure`, `handleRequestWithBody`, `handleStateRead`, `handleStateTransition`, `handleToolInvoke`, `handleV11WriteGuardAudit`, `handleV11WriteGuardEscapedWrite` |
| `INVALID_KERNEL_REQUEST` | `handleKernelSessionCancel`, `handleKernelSessionGet`, `handleKernelSessionPrompt`, `handleKernelSessionSpawn` |
| `INVALID_NATIVE_TOOL_REQUEST` | `registerDefaultRoutes` |
| `KERNEL_SESSION_NOT_FOUND` | `handleKernelSessionGet` |
| `LLM_KERNEL_ERROR` | `handleKernelSessionCancel`, `handleKernelSessionGet`, `handleKernelSessionPrompt`, `handleKernelSessionSpawn` |
| `LLM_KERNEL_UNAVAILABLE` | `handleKernelSessionCancel`, `handleKernelSessionGet`, `handleKernelSessionPrompt`, `handleKernelSessionSpawn` |
| `MISSING_FIELDS` | `handleEventLog`, `handleStateRead`, `handleStateTransition` |
| `MISSING_PARAMS` | `handleV11WriteGuardCheck` |
| `MISSING_PROJECT_PATH` | `handleIngestRegister` |
| `MISSING_TOOL` | `handleToolInvoke` |
| `NOT_FOUND` | `handleApiEndpoint`, `handleRequestWithBody`, `handleStateRead` |
| `NOT_IMPLEMENTED` | `handleToolInvoke` |
| `PAYLOAD_TOO_LARGE` | `handleRequest`, `handleRequestWithBody` |
| `PERMISSION_DENIED` | `handleToolInvoke` |
| `PROJECT_CONTEXT_REQUIRED` | `handleStateRead`, `handleStateTransition`, `handleV11WriteGuardAudit` |
| `REGISTER_FAILED` | `handleIngestRegister` |
| `SESSION_REGISTRY_UNAVAILABLE` | `handleSessionList` |
| `TOOL_ERROR` | `handleToolInvoke` |
| `TRANSITION_REJECTED` | `handleStateTransition` |
| `UNKNOWN_TOOL` | `handleToolInvoke` |
| `WRITE_GUARD_UNAVAILABLE` | `handleV11WriteGuardCheck`, `registerDefaultRoutes` |

Preserve the exact code, numeric HTTP/command status, request identity, relevant release and sanitized details. A human message or transport success cannot replace a controlled result. Do not log tokens, credentials or raw configuration.

Authentication failures require the current Daemon/client owner; invalid input/schema requires correction through its artifact/configuration owner; permission/HardStop/Gate/verification failures retain their evidence and legal recovery conditions. Never edit truth sources, grant yourself permissions, fabricate receipts or retry a completed mutation. See [error handling](error-handling.md).

Regenerate with `bun scripts/render-daemon-http-reference.ts`; CI/test checking uses `--check`.
