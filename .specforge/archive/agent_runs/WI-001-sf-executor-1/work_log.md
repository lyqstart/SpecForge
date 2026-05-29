# Work Log — WI-001 / TASK-1

## Task Summary

**Task**: TASK-1 — Daemon HTTP Server 基础框架  
**Work Item**: WI-001  
**Run ID**: WI-001-sf-executor-1  
**Executor**: sf-executor  

增强现有 Daemon HTTP Server 基础框架，包含以下 6 个功能模块：

1. `/health` 端点（无需认证，返回 uptime）
2. 路由分发器（支持精确匹配 + 前缀匹配，RouteHandler 接口）
3. SSE 长连接完整实现（EventBus 订阅 + 心跳 + 客户端清理）
4. `ApiResponse` / `ApiError` / `DaemonError` 统一类型
5. 全局错误处理（uncaughtException / unhandledRejection）
6. 空闲超时机制（非 detached 模式 30s 自动退出）

## Files Read (for context)

| File | Description |
|------|-------------|
| `src/http/HTTPServer.ts` | 原始 225 行 HTTP Server 骨架 |
| `src/types.ts` | 现有类型定义（86 行） |
| `src/daemon/DaemonConfig.ts` | 配置管理（idleTimeout, isDetached） |
| `src/event-bus/EventBus.ts` | 事件总线实现（subscribe/unsubscribe API） |
| `src/cas/ContentAddressableStorage.ts` | CAS 存储实现 |
| `tsconfig.json` | TypeScript 严格模式配置 |
| `tests/unit/http.test.ts` | HTTP 认证测试（6 tests） |
| `src/types.test.ts` | 类型测试（6 tests） |

## Execution Process

### Step 1: Read and analyze existing code

Read all 6 source files + 2 test files to understand:
- Existing HTTP Server skeleton structure (constructor, start/stop, body parsing, auth)
- Event types and how they're imported
- DaemonConfig properties (idleTimeoutMs, isDetached)
- EventBus subscribe/unsubscribe API signature
- tsconfig strict mode settings (noUncheckedIndexedAccess, useUnknownInCatchVariables, etc.)

### Step 2: Edit `src/types.ts`

Added after `RepairResult`:

- `ApiResponse<T>` — Standard API response envelope (success, data, error, requestId, timestamp)
- `ApiError` — Error shape (code, message, statusCode, details)
- `DaemonError` class — Error with statusCode, code, message for structured HTTP error handling

### Step 3: Rewrite `src/http/HTTPServer.ts`

Full enhancement from 225 lines → 653 lines, preserving backward compatibility.

**Key changes:**

1. **Router** (`exactRoutes` + `prefixRoutes` maps):
   - `addExactRoute()` — exact path matching (`/health`, `/events`, `/`)
   - `addPrefixRoute()` — prefix matching (`/api/v1/state/`, `/api/v1/event/`, etc.)
   - `matchRoute()` — tries exact match first, then prefix match
   - All 6 API prefix groups registered (state, event, workflow, blob, tool, ingest)
   - `RouteHandler` interface + `RouteMatch` exported types

2. **/health endpoint**:
   - Public (no auth required, checked via `isPublicEndpoint`)
   - Returns `{ status: "ok", service: "daemon-core", version: "1.0.0", uptime: <seconds> }`

3. **CORS**:
   - OPTIONS preflight returns 204 with CORS headers
   - All responses include `Access-Control-Allow-Origin: *`

4. **Request body JSON parsing**:
   - Validates JSON for POST/PUT/PATCH with `application/json` Content-Type
   - Invalid JSON → 400 `INVALID_JSON` error

5. **Unified response format**:
   - `successBody()` / `errorBody()` helpers producing ApiResponse format
   - `sendJsonResponse()` with CORS headers
   - 404 for unmatched routes with standard error format

6. **SSE implementation**:
   - `handleSSE()` sets SSE headers, sends initial `connected` event
   - Manages client list in `sseClients` Map
   - `ensureSseSubscription()` — subscribes to EventBus `*` pattern
   - `ensureHeartbeat()` — sends `:heartbeat\n\n` every 30s
   - Client disconnect cleanup via `req.on('close')`
   - Auto-unsubscribe when last client disconnects

7. **Global error handling**:
   - `installGlobalErrorHandlers()` — `process.on('uncaughtException')` + `process.on('unhandledRejection')`
   - `uninstallGlobalErrorHandlers()` — cleanup on `stop()`
   - `handleHandlerError()` — DaemonError → statusCode, Error → 500, unknown → 500
   - `sendFatalErrorToSse()` — broadcast fatal errors to all SSE clients

8. **Idle timeout**:
   - `refreshIdleTimeout()` — reset on each request, skip if detached
   - `clearIdleTimeout()` — cleanup in `stop()`
   - Auto-shutdown with `process.exit(0)` after graceful `stop()`
   - Uses `DaemonConfig.getIdleTimeoutMs()` (30s) and `isDetached()`

9. **Backward compatibility preserved**:
   - Existing auth tests (401, 200, permission denied events, 413 payload) all pass unchanged
   - `broadcastEvent()` public API preserved
   - CAS oversized payload handling preserved

### Step 4: Verification

| Check | Result |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | ✅ Passed (0 errors) |
| `tests/unit/http.test.ts` (6 tests) | ✅ All 6 passed |
| `src/http/HTTPServer.test.ts` (3 tests) | ✅ All 3 passed |
| `src/types.test.ts` (6 tests) | ✅ All 6 passed |

All 15 tests pass with zero failures.

## Files Changed

| File | Lines | Type |
|------|-------|------|
| `packages/daemon-core/src/types.ts` | 86 → 123 (+37 lines) | Added `ApiResponse`, `ApiError`, `DaemonError` |
| `packages/daemon-core/src/http/HTTPServer.ts` | 225 → 653 (+428 lines) | Full enhancement |

## Verification Results

```json
[
  { "command": "tsc --noEmit", "passed": true },
  { "command": "vitest run tests/unit/http.test.ts", "passed": true },
  { "command": "vitest run src/types.test.ts", "passed": true },
  { "command": "vitest run src/http/HTTPServer.test.ts", "passed": true }
]
```

## Tool Usage Statistics

- **read**: 9 calls (6 source files + 2 test files + 1 index.ts)
- **edit**: 2 calls (1 for types.ts, 1 for HTTPServer.ts)
- **bash**: 6 calls (tsc compilation, vitest runs)
- **write**: 1 call (this work_log)
