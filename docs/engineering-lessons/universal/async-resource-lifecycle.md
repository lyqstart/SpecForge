---
id: async-resource-lifecycle
scope: universal
roles: [executor, reviewer, debugger, architect]
severity: high
tags: [async, promise, timer, resource-leak, testing]
created: 2026-05-16
updated: 2026-05-16
---

# 异步资源生命周期管理经验总结

> **来源**：SpecForge V6 opencode-adapter 模块测试进程无法退出问题的根因分析
> **适用范围**：所有涉及异步操作的项目（不限语言）
> **日期**：2026-05-16

---

## 一、架构层经验

### A1. 竞争资源的败者必须被显式清理（"败者清理原则"）

**问题抽象**：当多个异步操作竞争（如 `Promise.race`、`select`、`asyncio.wait(FIRST_COMPLETED)`），胜者被消费后，败者持有的资源（timer、连接、文件句柄）仍然存活，成为泄漏源。

**通用规则**：凡是"多选一"模式，必须在胜者确定后，显式取消/关闭所有败者。

**各语言示例**：

```typescript
// TypeScript/JavaScript — Promise.race
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!); // ← 败者 timer 必须清理
  }
}
```

```python
# Python — asyncio
async def with_timeout(coro, timeout_sec):
    task = asyncio.create_task(coro)
    try:
        return await asyncio.wait_for(task, timeout=timeout_sec)
    except asyncio.TimeoutError:
        task.cancel()  # ← 败者 task 必须取消
        raise
```

```go
// Go — select + context
func withTimeout(ctx context.Context, timeout time.Duration, fn func() error) error {
    ctx, cancel := context.WithTimeout(ctx, timeout)
    defer cancel() // ← 无论谁先完成，都释放 context 资源
    // ...
}
```

**约束条件**：适用于所有支持并发竞争的语言和运行时。

---

### A2. 无限循环必须有外部可达的终止条件（"终止可达性原则"）

**问题抽象**：`while(true)` 或 `while(condition)` 循环中，如果终止条件依赖外部信号（如事件到达、标志位翻转），那么该信号的触发路径必须是**无条件可达的**——不能依赖正常流程，必须在异常路径（finally/defer/cleanup）中也能触发。

**通用规则**：

1. 终止信号的触发必须放在 `finally`/`defer`/`__exit__` 中，确保异常时也能执行
2. 循环体内必须有超时兜底（防止信号永远不来）
3. 循环应该是"被动唤醒"而非"主动轮询"

**反模式 vs 正确模式**：

```typescript
// ❌ 反模式：轮询 + 终止条件依赖外部调用
while (index >= queue.length) {
  await new Promise(r => setTimeout(r, 50)); // 如果没人 abort，永远循环
}

// ✅ 正确：被动唤醒 + 超时兜底 + finally 保证清理
while (index >= queue.length) {
  if (signal.aborted) break;
  await Promise.race([
    new Promise<void>(r => { resolver = r; }),           // 被动唤醒
    new Promise<void>((_, rej) => setTimeout(rej, 30000)) // 30s 超时兜底
  ]);
}
```

```python
# Python 等价
while index >= len(queue):
    if cancel_event.is_set():
        break
    try:
        await asyncio.wait_for(new_item_event.wait(), timeout=30.0)
    except asyncio.TimeoutError:
        break  # 超时兜底
```

**约束条件**：
- "被动唤醒"模式要求语言支持 condition variable / event / channel 等同步原语
- 在不支持 async 的环境（如嵌入式 C），用信号量 + watchdog timer 替代

---

### A3. 轮询是反模式，优先用事件驱动（"推优于拉"）

**问题抽象**：用 `setTimeout` 循环轮询队列状态，本质是用 CPU 时间换响应延迟。它有三个固有缺陷：
1. 浪费 CPU（空转）
2. 引入延迟（最坏情况等一个轮询周期）
3. 阻止进程退出（timer 保持事件循环活跃）

**通用规则**：数据生产者应该主动通知消费者，而不是消费者反复询问。

| 场景 | 轮询（❌） | 事件驱动（✅） |
|------|-----------|--------------|
| JS/TS 队列 | `setInterval` 检查 queue.length | `EventEmitter` / `Promise` resolve |
| Python 队列 | `while True: sleep(0.1)` | `asyncio.Queue.get()` |
| Go channel | `for { time.Sleep(...) }` | `<-ch` 阻塞等待 |
| 数据库变更 | 定时 SELECT | CDC / LISTEN-NOTIFY / Change Stream |

**约束条件**：
- 当生产者不可控（如第三方 API 无 webhook），轮询是唯一选择，但必须加超时和退出条件
- 实时性要求极高（<1ms）时，busy-wait 可能是合理的，但应限定在专用线程

---

### A4. 资源的创建者负责资源的销毁（"所有权原则"）

**问题抽象**：谁 `new` 了资源，谁就负责 `close`/`dispose`/`unsubscribe`。如果所有权转移，必须在 API 契约中明确。

**通用规则**：
- 函数内创建的资源，函数退出前必须释放（或显式转移所有权给调用者）
- 如果 API 返回一个需要清理的资源，文档/类型必须标注（如 `Disposable` 接口）

```typescript
// ✅ TypeScript：用 Disposable 接口标注所有权
interface EventSubscription extends Disposable {
  [Symbol.dispose](): void;
}

// 使用时：
using subscription = adapter.subscribeEvents(sessionId);
// 离开 using 作用域自动调用 [Symbol.dispose]()
```

```python
# Python：用 context manager 标注所有权
class EventSubscription:
    async def __aenter__(self): ...
    async def __aexit__(self, *args):
        await self.unsubscribe()  # 自动清理

async with adapter.subscribe_events(session_id) as stream:
    async for event in stream:
        ...
# 离开 with 自动清理
```

**约束条件**：
- TypeScript 的 `using` 语法需要 TS 5.2+
- Python 的 async context manager 需要 Python 3.10+
- 不支持 RAII/using 的语言，用 try/finally 手动保证

---

## 二、开发层经验

### D1. Promise.race / select 的败者泄漏（"竞态泄漏"）

**这属于什么问题？** 这是**资源竞态中的败者遗弃问题**。更高层抽象：

> 当系统从多个候选中选择一个结果时，未被选中的候选所持有的副作用（side effects）必须被回滚或清理。

这和数据库事务的"回滚"是同一个思想——只是应用在异步资源层面。

**检查清单**（代码审查时逐项核对）：

- [ ] `Promise.race` / `Promise.any` 中，每个 Promise 持有的 timer/connection/handle 是否在 finally 中清理？
- [ ] `select` 语句中，未命中的 channel 操作是否有 cancel 路径？
- [ ] `asyncio.wait(FIRST_COMPLETED)` 返回后，pending set 中的 task 是否被 cancel？
- [ ] HTTP 请求超时后，底层 socket 是否被关闭（而不是等 GC）？

---

### D2. 超时是兜底，但超时后必须告知根因（"超时透明原则"）

**问题抽象**：超时本身不是错误原因，它是"我不知道发生了什么，但等太久了"的信号。如果只告诉用户"超时了"，等于把排查成本转嫁给用户。

**通用规则**：

1. **超时错误必须包含上下文**：什么操作超时了、等了多久、可能的原因
2. **可重试的超时应自动重试**：网络请求、RPC 调用等瞬态故障
3. **不可重试的超时应给出行动建议**：配置调整、环境检查

```typescript
// ❌ 反模式
throw new Error('Timeout');

// ✅ 正确
throw new TimeoutError({
  operation: 'daemon.healthCheck',
  timeoutMs: 5000,
  attempts: 3,
  lastError: 'ECONNREFUSED 127.0.0.1:3000',
  suggestion: 'Daemon 可能未启动。运行 `specforge daemon start` 或检查端口 3000 是否被占用。',
});
```

**超时策略决策树**：

```
操作超时了
├── 是瞬态故障吗？（网络抖动、锁竞争）
│   ├── 是 → 自动重试（指数退避，最多 N 次）
│   │       └── 重试耗尽 → 报告"重试 N 次后仍超时" + 最后一次错误详情
│   └── 否 → 直接报告
├── 用户能做什么？
│   ├── 能 → 给出具体行动建议
│   └── 不能 → 给出诊断信息（日志路径、状态快照）
└── 是否需要回滚？
    ├── 是 → 执行补偿操作（取消请求、释放锁、回滚事务）
    └── 否 → 仅报告
```

**约束条件**：
- 重试策略需要操作是幂等的（非幂等操作不能盲目重试）
- 超时时间应可配置（硬编码超时是技术债）

---

### D3. 动态 ID 的资源必须用动态追踪清理（"ID 追踪原则"）

**问题抽象**：当资源的标识符是运行时动态生成的（UUID、时间戳拼接、随机后缀），硬编码的清理逻辑无法覆盖所有实例。

**通用规则**：创建资源时，将其 ID 注册到一个集合中；清理时遍历集合释放所有资源。

```typescript
// ❌ 反模式：硬编码清理
afterEach(() => {
  adapter.unsubscribeEvents('test-session');  // 实际 ID 是 oc-intent-xxx-1747...
});

// ✅ 正确：追踪所有创建的资源
const createdResources: string[] = [];

function createTracked(adapter: OpenCodeAdapter, params: SpawnAgentParams) {
  const { sessionId } = await adapter.spawnAgent(params);
  createdResources.push(sessionId);
  return sessionId;
}

afterEach(() => {
  for (const id of createdResources) {
    adapter.unsubscribeEvents(id);
    adapter.cancelSession(id, 'test cleanup');
  }
  createdResources.length = 0;
});
```

**更高层抽象**：这是"资源注册表"模式（Resource Registry）。在生产代码中同样适用：

```typescript
class ResourceManager {
  private resources = new Map<string, Disposable>();

  register(id: string, resource: Disposable): void { this.resources.set(id, resource); }
  
  async disposeAll(): Promise<void> {
    for (const [id, resource] of this.resources) {
      try { resource[Symbol.dispose](); } 
      catch (e) { console.warn(`Failed to dispose ${id}:`, e); }
    }
    this.resources.clear();
  }
}
```

**约束条件**：
- 高并发场景下，注册表本身需要线程安全（ConcurrentHashMap / Mutex）
- 注册表不应持有强引用导致 GC 无法回收（考虑 WeakRef / WeakMap）

---

## 三、测试层经验

### T1. 测试的清理逻辑必须与创建逻辑对称（"对称清理原则"）

**问题抽象**：`beforeEach` 创建了什么，`afterEach` 就必须销毁什么。如果创建是动态的，清理也必须是动态的。

**通用规则**：

| 创建方式 | 清理方式 |
|----------|----------|
| 固定资源（单例） | `afterEach` 直接调用 `dispose()` |
| 动态资源（每次不同 ID） | 追踪列表 + `afterEach` 遍历清理 |
| 嵌套资源（A 创建 B，B 创建 C） | 逆序清理（C → B → A） |
| 全局状态污染（env vars、mock） | `afterEach` 恢复快照 |

**检查清单**：
- [ ] 每个 `beforeEach` 中的 `new` / `create` / `open` 是否在 `afterEach` 中有对应的 `dispose` / `destroy` / `close`？
- [ ] 如果测试中途抛异常，`afterEach` 是否仍能正确清理（不依赖测试体中的变量赋值）？
- [ ] mock 的 timer / fetch / fs 是否在 `afterEach` 中恢复？

---

### T2. 异步测试必须有超时兜底（"测试必终止原则"）

**问题抽象**：测试框架默认可能没有超时（或超时很长），一个卡住的异步操作会阻塞整个测试套件。

**通用规则**：

1. **框架级超时**：在配置文件中设置全局 `testTimeout`
2. **单测级超时**：对已知慢操作单独设置更长超时
3. **进程级隔离**：用 `pool: 'forks'` 确保单个测试文件卡住不影响其他

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 10000,     // 单测最多 10 秒
    hookTimeout: 5000,      // setup/teardown 最多 5 秒
    teardownTimeout: 3000,  // 清理阶段最多 3 秒
    pool: 'forks',          // 进程隔离（最后防线）
  },
});
```

```python
# pytest
@pytest.mark.timeout(10)
async def test_event_stream():
    ...
```

**约束条件**：
- `pool: 'forks'` 会增加测试启动开销（每个文件一个进程），适合 CI 不适合开发时快速反馈
- Property-Based Testing 可能需要更长超时（迭代次数多）

---

### T3. 测试中的 timer 应该用 fake timer（"时间可控原则"）

**问题抽象**：真实 `setTimeout`/`setInterval` 让测试变慢且不确定。50ms 的轮询在测试中累积成秒级延迟。

**通用规则**：

1. 测试中涉及时间的逻辑，用 fake timer 控制时间流逝
2. 需要真实异步行为时（如测试真实网络），用真实 timer 但加超时保护
3. 不要在 fake timer 和真实 timer 之间混用（会导致死锁）

```typescript
// ✅ Vitest fake timer
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('should timeout after 5s', async () => {
  const promise = adapter.startSession();
  vi.advanceTimersByTime(5000);
  await expect(promise).rejects.toThrow('Timeout');
});
```

**约束条件**：
- Fake timer 不适用于测试真实 I/O（网络、文件系统）
- 某些库内部使用 `Date.now()` 而非 `setTimeout`，需要同时 mock `Date`
- Python 中用 `freezegun` 或 `time-machine`；Go 中用 `clock` 接口注入

---

### T4. 测试不应依赖进程退出来判断通过（"显式断言原则"）

**问题抽象**：如果测试"通过"的标志是"进程正常退出"，那么资源泄漏会被掩盖——测试看起来全绿，但进程卡住。

**通用规则**：

1. 每个测试必须有显式的 `expect` / `assert` 断言
2. 测试套件结束后应检查是否有未清理的资源（leak detection）
3. CI 中加进程超时（如 GitHub Actions 的 `timeout-minutes`）

```typescript
// ✅ Vitest leak detection（实验性）
export default defineConfig({
  test: {
    detectOpenHandles: true,  // 检测未关闭的句柄
  },
});
```

```python
# pytest-asyncio leak detection
@pytest.fixture(autouse=True)
async def check_no_pending_tasks():
    yield
    # 测试结束后检查是否有未完成的 task
    pending = [t for t in asyncio.all_tasks() if not t.done()]
    assert len(pending) <= 1, f"Leaked tasks: {pending}"
```

---

## 四、跨层经验

### X1. 资源生命周期的四个阶段必须完整（"CARU 原则"）

任何资源（连接、timer、文件句柄、订阅）都有四个阶段：

| 阶段 | 英文 | 必须保证 |
|------|------|----------|
| **C**reate | 创建 | 创建成功后立即注册到清理列表 |
| **A**cquire | 获取/使用 | 使用期间异常不能跳过释放 |
| **R**elease | 释放 | 必须在 finally/defer/using 中执行 |
| **U**nregister | 注销 | 从注册表中移除，允许 GC 回收 |

**检查方法**：对每个资源类型，画出它的 CARU 路径。如果任何一个阶段在异常路径上被跳过，就是 bug。

---

### X2. 副作用的可观测性（"副作用必须可检测"）

**问题抽象**：如果一个操作产生了副作用（创建 timer、打开连接、注册回调），但没有提供检测该副作用是否存在的手段，那么泄漏就无法被发现。

**通用规则**：

1. 每个产生副作用的 API 应提供对应的"检查"API
2. 测试中应在清理后断言"无残留"

```typescript
// ✅ 提供检查 API
class OpenCodeAdapter {
  getActiveSubscriptionCount(): number { return this.eventControllers.size; }
  getActiveTimerCount(): number { return this.pendingTimers.size; }
  getPendingSessionCount(): number { return this.sessions.size; }
}

// 测试中断言无残留
afterEach(() => {
  expect(adapter.getActiveSubscriptionCount()).toBe(0);
  expect(adapter.getActiveTimerCount()).toBe(0);
});
```

---

### X3. 防御性超时的层次结构（"超时洋葱模型"）

超时应该分层设置，内层超时 < 外层超时，确保内层先触发并给出精确错误：

```
┌─────────────────────────────────────────────┐
│ 进程级超时（CI timeout: 10 min）             │  ← 最后防线，kill 进程
│  ┌─────────────────────────────────────────┐ │
│  │ 测试框架超时（testTimeout: 30s）         │ │  ← 单测超时，报告失败
│  │  ┌─────────────────────────────────────┐│ │
│  │  │ 业务操作超时（communicationTimeout: 5s）│ │  ← 精确错误信息
│  │  │  ┌─────────────────────────────────┐││ │
│  │  │  │ 网络请求超时（fetchTimeout: 3s）  │││ │  ← 最内层，可重试
│  │  │  └─────────────────────────────────┘││ │
│  │  └─────────────────────────────────────┘│ │
│  └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**规则**：
- 内层超时应该比外层短，这样内层先触发，能给出更精确的错误信息
- 如果内层超时被吞掉（catch 后不 rethrow），外层超时就成了唯一信号，错误信息会退化为"不知道哪里超时了"

---

## 五、经验速查表

| 编号 | 分类 | 一句话 | 检查方法 |
|------|------|--------|----------|
| A1 | 架构 | 竞争的败者必须被清理 | 搜索 `Promise.race`/`select`，检查 finally |
| A2 | 架构 | 无限循环的终止条件必须在 finally 中可达 | 搜索 `while(true)`/`while(!done)`，检查退出路径 |
| A3 | 架构 | 推优于拉，避免轮询 | 搜索 `setTimeout` + `while`，替换为事件通知 |
| A4 | 架构 | 创建者负责销毁 | 检查每个 `new`/`open` 是否有对应 `close`/`dispose` |
| D1 | 开发 | Promise.race 败者泄漏 = 事务未回滚 | Code review checklist |
| D2 | 开发 | 超时必须告知根因 + 行动建议 | 搜索 `throw.*[Tt]imeout`，检查 message 内容 |
| D3 | 开发 | 动态 ID 资源用注册表追踪 | 检查 cleanup 逻辑是否覆盖所有动态创建的实例 |
| T1 | 测试 | 清理必须与创建对称 | 对比 beforeEach 和 afterEach 的操作 |
| T2 | 测试 | 异步测试必须有超时 | 检查 vitest/jest/pytest 配置 |
| T3 | 测试 | 用 fake timer 控制时间 | 搜索真实 `setTimeout` 在测试中的使用 |
| T4 | 测试 | 不依赖进程退出判断通过 | 开启 `detectOpenHandles` |
| X1 | 跨层 | CARU 四阶段完整 | 对每个资源类型画生命周期图 |
| X2 | 跨层 | 副作用必须可检测 | 检查是否有 `getActiveXxxCount()` 类 API |
| X3 | 跨层 | 超时分层，内层先触发 | 检查超时值：内层 < 外层 |

---

## 六、本次问题的修复清单

基于以上经验，opencode-adapter 需要修复：

1. **A1**：`startOpenCodeSession` 和 `deliverPromptToSession` 中 `Promise.race` 的败者 timer 加 `clearTimeout`
2. **A2 + A3**：`createEventStream` 的 polling 改为事件驱动（notify 模式）
3. **D3 + T1**：`SubscribeEvents.test.ts` 的 `afterEach` 改为动态追踪清理
4. **T2**：`vitest.config.ts` 加 `testTimeout: 10000`
5. **X2**：`OpenCodeAdapter` 加 `getActiveSubscriptionCount()` 方法，测试中断言为 0
