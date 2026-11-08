# Current Daemon error handling

The [HTTP server](../src/http/HTTPServer.ts), controlled ToolDispatcher handlers, StateManager and verification owners define their actual response contracts. [Static HTTP helper codes](error-codes.md) cover one finite surface; tool-specific errors remain owned by their tool schemas/handlers.

Common HTTP helpers produce either `{success:true,data,requestId,timestamp}` or `{success:false,error:{code,message,details?},requestId,timestamp}`. Health responses and controlled tool results have their own shapes; transport HTTP 200 does not turn a failed/blocked tool result into success.

Preserve exact error codes, numeric exit/HTTP status, relevant release/process/project/WI identity and sanitized owner details. Human text and suggested actions do not prove root cause, completed execution or successful recovery.

Authentication/handshake failures: use `specforge daemon status` and the current installed client/runtime owners. Never publish or manufacture handshake tokens. Connection failure does not authorize Plugin lifecycle control.

Input/schema/configuration failures: correct the artifact through its controlled owner. Unknown persistent schema blocks registration and is not silently migrated. Preserve original bytes and errors.

Permission, Write Guard, Gate, approval, verification or HardStop failures: stop the affected operation, reread authoritative state, keep the original failure and follow the returned recovery conditions. D18 read-only containment cannot execute formal tests; D23 plan/run uses independent grants and approved Windows x64 single-process scope. Unsupported platforms and not-executed attempts must remain explicit failures/statuses.

Retry only when the owning operation proves it is legal/idempotent. Do not duplicate a completed mutation, reopen closed work, grant yourself permission, edit events/state, lower Gates or substitute logs/Agent claims for evidence.

For lifecycle timeout diagnostics, retain operation and configured budget. Background observation failure cannot advance governance state. Startup/stop/restart and installed byte verification must be checked from actual processes and official installer receipts.
