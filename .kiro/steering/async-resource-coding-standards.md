---
inclusion: always
---

# 异步资源编码规范（AI 必读）

**来源**：从 opencode-adapter 测试进程无法退出问题中提炼，适用于本项目所有模块。
**完整经验文档**：`docs/engineering-lessons/async-resource-lifecycle.md`
**要求**：AI 在编写或审查涉及异步操作的代码和测试时，必须遵守以下规则。

---

## 一、编写代码时的强制规则

### 规则 C1：Promise.race 必须在 finally 中清理败者 timer

❌ **禁止**：
```typescript
await Promise.race([
  new Promise(resolve => setTimeout(resolve, 50)),
  new Promise((_, reject) => setTimeout(reject, timeout)),
]);
```

✅ **必须**：
```typescript
let t1: ReturnType<typeof setTimeout>;
let t2: ReturnType<typeof setTimeout>;
try {
  await Promise.race([
    new Promise<void>(resolve => { t1 = setTimeout(resolve, 50); }),
    new Promise<void>((_, reject) => { t2 = setTimeout(() => reject(new Error(`操作超时（${timeout}ms）`)), timeout); }),
  ]);
} finally {
  clearTimeout(t1!);
  clearTimeout(t2!);
}
```

### 规则 C2：while 循环必须有外部可达的终止条件

❌ **禁止**：
```typescript
while (queue.length === 0) {
  await new Promise(r => setTimeout(r, 50)); // 如果没人 abort，永远循环
}
```

✅ **必须**：用事件通知替代轮询，并加超时兜底：
```typescript
while (queue.length === 0) {
  if (signal.aborted) return { done: true, value: undefined };
  await Promise.race([
    waitForNotify(),                                          // 被动唤醒
    new Promise<void>((_, r) => setTimeout(r, 30_000)),      // 30s 超时兜底
  ]);
}
```
终止信号（`signal.abort()` / `notify()`）的调用必须放在 `finally` 中，确保异常路径也能触发。

### 规则 C3：超时错误必须包含根因和行动建议

❌ **禁止**：
```typescript
throw new Error('Timeout');
throw new Error('操作超时');
```

✅ **必须**：
```typescript
throw new TimeoutError({
  operation: 'daemon.healthCheck',   // 哪个操作超时
  timeoutMs: 5000,                   // 等了多久
  attempts: 3,                       // 重试了几次
  lastError: err.message,            // 最后一次错误
  suggestion: '请检查 Daemon 是否启动（运行 specforge daemon start）', // 用户能做什么
});
```

可重试的操作（网络请求、RPC）必须先重试 N 次，耗尽后再报告，并在错误信息中说明"已重试 N 次"。

### 规则 C4：返回需要清理的资源时，必须提供 dispose 方法

凡是 API 返回订阅、连接、流等需要清理的资源，必须：
1. 提供对应的 `unsubscribe` / `close` / `dispose` 方法
2. 在 JSDoc 中注明调用者的清理责任
3. 提供检测当前活跃资源数量的方法（用于测试断言）

```typescript
/**
 * 订阅会话事件。
 * ⚠️ 调用者必须在使用完毕后调用 unsubscribeEvents(sessionId) 释放资源。
 */
subscribeEvents(sessionId: string): AsyncIterable<KernelEvent>;

/** 返回当前活跃订阅数量（用于测试断言资源已清理）*/
getActiveSubscriptionCount(): number;
```

---

## 二、编写测试时的强制规则

### 规则 T1：动态创建的资源必须用追踪列表清理

❌ **禁止**：
```typescript
afterEach(() => {
  adapter.unsubscribeEvents('test-session'); // 硬编码 ID，无法覆盖动态生成的 ID
});
```

✅ **必须**：
```typescript
const trackedSessions: string[] = [];

async function spawnTracked(params: SpawnAgentParams): Promise<string> {
  const { sessionId } = await adapter.spawnAgent(params);
  trackedSessions.push(sessionId);
  return sessionId;
}

afterEach(async () => {
  for (const id of trackedSessions) {
    adapter.unsubscribeEvents(id);
    await adapter.cancelSession(id, 'test cleanup');
  }
  trackedSessions.length = 0;
  // 断言无残留
  expect(adapter.getActiveSubscriptionCount()).toBe(0);
});
```

### 规则 T2：涉及异步流的测试必须用 try/finally 保证清理

```typescript
it('should receive events', async () => {
  const sessionId = await spawnTracked({ agentRole: 'dev', spawnIntentId: 'test' });
  const stream = adapter.subscribeEvents(sessionId);
  const it = stream[Symbol.asyncIterator]();
  try {
    await adapter.simulateEvent(sessionId, 'session.start', {});
    const result = await it.next();
    expect(result.value?.type).toBe('session.started');
  } finally {
    adapter.unsubscribeEvents(sessionId); // 无论成功失败都清理
  }
});
```

### 规则 T3：vitest.config.ts 必须设置超时与进程隔离

每个模块的 `vitest.config.ts` 必须包含：
```typescript
test: {
  testTimeout: 10000,    // 单测最多 10 秒
  hookTimeout: 5000,     // setup/teardown 最多 5 秒
  teardownTimeout: 3000, // 清理阶段最多 3 秒
  // 进程隔离防卡死兜底（关键）：
  // - pool: 'forks' 让每个测试文件跑在独立子进程
  // - 单文件资源泄漏不会拖垮整个 `bun test` / `vitest run`
  // - testTimeout 触发后框架会强杀 fork，给资源泄漏一个最后防线
  // - 没有这一行 → 一个泄漏的 timer 能让整个 bun test 卡 N 小时（实际事故见 docs/engineering-lessons/async-resource-lifecycle.md F1）
  pool: 'forks',
}
```

**这是最后一道防线**：即便代码再违反 A1/A2/A3，单文件卡死最多影响一个 fork，不会拖垮整个 `bun test`。**禁止省略 `pool: 'forks'`**。

### 规则 T4：涉及 timer 的测试必须使用 fake timer

```typescript
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('should timeout', async () => {
  const p = adapter.startSession();
  await vi.advanceTimersByTimeAsync(5001);
  await expect(p).rejects.toThrow('超时');
});
```

---

## 三、代码审查检查清单

AI 在审查代码时，必须逐项检查：

**源码审查**：
- [ ] 所有 `Promise.race` 是否在 `finally` 中 `clearTimeout` 了所有 timer？
- [ ] 所有 `while` 循环是否有外部可达的终止条件（不依赖正常流程）？
- [ ] 是否有 `setTimeout` + `while` 的轮询组合？（应替换为事件通知）
- [ ] 超时错误是否包含：操作名、等待时长、重试次数、最后错误、行动建议？
- [ ] 返回需要清理的资源的 API 是否有 JSDoc 注明清理责任？

**测试审查**：
- [ ] `afterEach` 的清理是否覆盖了所有动态创建的资源（不是硬编码 ID）？
- [ ] 涉及异步流的测试是否有 `try/finally` 保护？
- [ ] `vitest.config.ts` 是否设置了 `testTimeout` **和 `pool: 'forks'`**？
- [ ] 涉及 timer 的测试是否使用了 `vi.useFakeTimers()`？
- [ ] 测试结束后是否断言了 `getActiveXxxCount() === 0`？

---

## 四、违规示例速查

| 代码模式 | 违反规则 | 修复方向 |
|----------|----------|----------|
| `Promise.race([..., new Promise(r => setTimeout(r, N))])` 无 finally | C1 | 加 finally + clearTimeout |
| `while(q.length === 0) { await sleep(50) }` | C2 | 改为事件通知 + 超时兜底 |
| `throw new Error('Timeout')` | C3 | 加 operation/timeoutMs/suggestion |
| `afterEach(() => cleanup('hardcoded-id'))` | T1 | 改为追踪列表 |
| `vitest.config.ts` 无 `testTimeout` 或 `pool: 'forks'` | T3 | 加超时配置 + 进程隔离 |
| 测试中真实 `setTimeout` 等待 | T4 | 改用 fake timer |
| 在已知有违规历史的包里跑测试 | 工作流 | 必须用 OS 级超时包裹（PowerShell `Start-Job + Wait-Job -Timeout`），见 v6-development-workflow.md |
