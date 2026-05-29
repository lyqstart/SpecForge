# Work Log — TASK-1: HTTPServer.handleOpenCodeEvent sessionId merge

## 任务摘要
修改 HTTPServer.ts 的 handleOpenCodeEvent 方法，将函数参数 sessionId 合并进传递给 SessionRegistry 的 payload 中。

## 执行结果
- **修改文件**: HTTPServer.ts 第 1139 行（1 行改动）
- **新建测试**: http-server-handleOpenCodeEvent.test.ts（5 个场景全部通过）
- **验证命令**: `npx vitest run tests/unit/http-server-handleOpenCodeEvent.test.ts` → 5/5 passed

## 核心改动
```ts
// Before:
payload,
// After:
{ ...payload, sessionId: payload.sessionId ?? sessionId },
```
