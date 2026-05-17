---
inclusion: always
---

<!-- AUTO-GENERATED — 不要手动编辑，运行 `bun run scripts/lessons/render-kiro-steering.ts` 重新生成 -->
<!-- 源：docs/engineering-lessons/ — 改源文件再 rerun 适配器 -->

# 工程经验注入（AI 必读）

**生成日期**：2026-05-17  
**适配工具**：Kiro  
**当前项目**：specforge  
**注入条数**：3

本文件由经验库适配器自动生成，从 `docs/engineering-lessons/` 渲染而来。
要修改某条经验，编辑对应源文件后重新运行适配器；**禁止直接改本文件**。

---

## 通用经验（所有项目所有工具）

### [HIGH] async-resource-lifecycle

**源**：[docs/engineering-lessons/universal/async-resource-lifecycle.md](../../docs/engineering-lessons/universal/async-resource-lifecycle.md)  
**标签**：async, promise, timer, resource-leak, testing

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

---

### [HIGH] javascript-explicit-resource-management

**源**：[docs/engineering-lessons/universal/javascript-explicit-resource-management.md](../../docs/engineering-lessons/universal/javascript-explicit-resource-management.md)  
**标签**：javascript, typescript, resource-management, disposable, lifecycle, design-pattern, dispose

> **来源**：SpecForge V6 scope-gate 包 e2e 测试卡死事故的根因抽象。
> **适用范围**：所有 JavaScript / TypeScript 项目（不限运行时：Node.js / Bun / Deno / 浏览器）。
> **与 [async-resource-lifecycle](async-resource-lifecycle.md) 关系**：互补。本文聚焦"对象/类的设计如何让资源释放可靠"和"团队流程如何兜底"，对方聚焦"具体异步代码模式（Promise.race/while/超时）的正确写法"。

---

## 症状

### 典型场景 1：测试卡死

```
$ bun test tests/e2e/
✓ 5 files passed (30 tests)
[挂在这里 30 分钟+，不退出]
```

测试**逻辑全过了**，但进程不退出。orchestrator 派单的 sub-agent 永远拿不到返回。

### 典型场景 2：生产内存泄漏

```ts
// 看似无害的代码
async function handleRequest(req) {
  const audit = new AuditLogger('./logs');
  await audit.log(req);
  return response;
}
// 跑一天后内存暴涨：每个请求泄漏一个 setInterval
```

### 典型场景 3：开发感受

- 新手："我 `new` 完对象就不管了，垃圾回收不会处理吗？"
- 老手："要清理。但 5 个开发者里 3 个会忘。"
- 团队："review 抓不住，CI 不报错，等卡死才发现。"

---

## 根因

### 5 Whys（停在语言层）

```
事件：测试逻辑过了但 worker 进程不退出
Why 1：因为 Node.js 事件循环里有 setInterval 在响
Why 2：因为 AuditLogger 构造器里 setInterval 启动了，afterEach 没清理
Why 3：因为开发者 new 了对象就忘了——以为 GC 会处理
Why 4：因为 JavaScript 的 GC 只回收内存，不调你的清理代码（不像 C++/Rust 析构）
Why 5：因为 ECMAScript 规范从未定义对象销毁钩子，"对象生命周期"在 JS 里就只是"内存可达性"
                                                           ↑
                                              停在这一层（语言/规范层）
```

### 为什么这是结构性问题

各语言的资源销毁机制对比：

| 语言 | 销毁触发机制 | 谁来调 | 漏调后果 |
|------|------------|--------|---------|
| C++ | 析构函数 | 编译器自动（离开作用域） | 编译期定位 |
| Rust | `Drop` trait | 编译器自动（所有权移交） | 编译期定位 |
| C# | `IDisposable` + `using` | 语法糖自动 | lint 警告 |
| Java | `AutoCloseable` + try-with-resources | 语法糖自动 | lint 警告 |
| Python | `__exit__` + `with` | 语法糖自动 | lint 警告 |
| Go | `defer` | 显式但函数级保障 | go vet 警告 |
| **JavaScript** | **❌ 无** | **必须人手写** | **❌ 无任何提示** |

**关键洞察**：JS 不仅没有析构，连配套的工具链（lint / 类型系统 / IDE）历史上也没强制资源管理协议。`using` 语法直到 ES2023 才正式进入规范（TypeScript 5.2+ / Node 22+ 支持），生态远未铺开。

**结论**：JS 异步资源管理**没法靠语言机制保障**，必须靠**多层防护**——任何单点（开发者纪律、code review、测试断言）都会有漏网之鱼。

---

## 解决方案

### 核心命题

> JavaScript 里没有自动释放，只有显式释放。每个会创建异步资源的类都必须**默认安全 + Disposable 协议 + 自检 API + 测试断言清零**——四件套缺一不可。

### 四层防护体系

```
┌─────────────────────────────────────────────────────────────┐
│ 第 4 层：团队流程（兜底）                                   │
│   PR 模板 / Code review checklist / CI detectOpenHandles    │
├─────────────────────────────────────────────────────────────┤
│ 第 3 层：测试断言（早发现）                                 │
│   afterEach 强制 dispose + getActiveXxxCount() === 0        │
├─────────────────────────────────────────────────────────────┤
│ 第 2 层：API 设计（让正确做法简单）                         │
│   Disposable 协议 + Symbol.dispose + 默认安全 + using 语法  │
├─────────────────────────────────────────────────────────────┤
│ 第 1 层：架构原则（不埋雷）                                 │
│   构造器无副作用 + 所有权清晰 + 副作用可观测                │
└─────────────────────────────────────────────────────────────┘
```

任一层失守都不致命，但**四层都漏 = 必然事故**。

### 第 1 层：5 条架构原则

#### P1. 构造器不应该有副作用

`new X()` 的语义是"建一个对象"，不是"启动一个服务"。在构造器里启动后台任务 = 调用者根本不知道有东西要关。

❌ **反模式**：
```ts
class AuditLogger {
  constructor() {
    this.timer = setInterval(() => this.flush(), 1000);  // 调用者不知道有 timer
  }
}

new AuditLogger();  // 看着只是建对象，实际起了永动闹钟
```

✅ **正确**：
```ts
class AuditLogger {
  constructor() {
    // 构造器只赋值字段，不启动任何后台资源
  }
  start(): void {
    this.timer = setInterval(() => this.flush(), 1000);  // 显式启动
  }
}

const audit = new AuditLogger();
audit.start();  // 调用者知道自己启动了什么，自然记得关
```

#### P2. 资源对象必须实现统一的 Disposable 协议

```ts
interface Disposable {
  dispose(): void | Promise<void>;
  [Symbol.dispose]?(): void;            // 同步资源
  [Symbol.asyncDispose]?(): Promise<void>;  // 异步资源
}
```

**统一名字**：固定叫 `dispose`。**禁止**团队内 close / shutdown / destroy / cleanup / release 混用——搜索、IDE 跳转、lint 规则都靠这个名字工作。

#### P3. 所有权必须清晰

每个资源都有"谁负责销毁"的契约：
- **谁创建谁释放**（默认）
- 转移所有权时必须在 API 文档里写明 `// takes ownership of X`
- 嵌套资源**逆序释放**（A 创建 B，B 创建 C → 销毁顺序 C → B → A）

#### P4. 默认安全（fail-safe defaults）

不能保证调用者会释放的场景，**构造器默认不起后台资源**。

```ts
// ❌ 默认埋雷：忘了传选项就泄漏
constructor(opts?) {
  this.enableTimer = opts?.enableTimer ?? true;
}

// ✅ 默认安全：要主动开才有副作用
constructor(opts?) {
  this.enableTimer = opts?.enableTimer ?? false;
}
```

**判定标准**：如果"忘了释放"会泄漏，那就是埋雷；如果"忘了释放"无后果，那就是安全的。

#### P5. 副作用必须可观测

每个产生副作用的类都要有**自检 API**：

```ts
class AuditLogger {
  getActiveTimerCount(): number { ... }
  getActiveSubscriptionCount(): number { ... }
  isDisposed(): boolean { ... }
}
```

**为什么**：让"我以为清理了"在测试里立刻显形（`expect(x.getActiveTimerCount()).toBe(0)`），而不是等到生产环境内存爆了才发现。

### 第 2 层：6 条 JavaScript 专属规则

#### JS1. 构造器副作用黑名单

`constructor` 里**禁止**做以下事，除非通过显式 option 启用：

| 副作用 | 替代方案 |
|--------|---------|
| `setInterval` / 长期 `setTimeout` | 移到 `start()` / `dispose()` 配对 |
| 打开文件流（`fs.createReadStream`） | 工厂方法 + `await using` |
| 建立网络连接（`net.connect` / `WebSocket`） | 工厂方法 + 异步 `dispose` |
| 注册全局监听（`process.on` / `window.addEventListener`） | 显式 `attach()` / `detach()` |
| 启动子进程（`spawn` / `Worker`） | 显式 `start()` |
| 订阅事件总线（持续订阅） | 显式 `subscribe()` 返回 unsubscribe 函数 |

#### JS2. 实现 Symbol.dispose / Symbol.asyncDispose

让调用者能用 `using` / `await using` 语法（TS 5.2+ / Node 22+）：

```ts
class AuditLogger implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
  async dispose(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }
}

// 使用方
{
  await using audit = new AuditLogger({ enableTimer: true });
  await audit.log(...);
}  // ← 离开作用域自动调 [Symbol.asyncDispose]()
```

**这是 JS 当前最接近 C++/Rust 的写法**。没实现 = 调用者只能手写 try/finally，错误率飙升。

#### JS3. 配对启动/销毁，不要"半开"状态

```ts
// ❌ 半开：start 和 dispose 不对称
class Foo {
  start() { this.timer = setInterval(...); }
  // 没有 dispose
}

// ✅ 对称配对
class Foo {
  start() { this.timer = setInterval(...); this.started = true; }
  dispose() {
    if (!this.started) return;            // 幂等
    clearInterval(this.timer);
    this.started = false;
  }
}
```

#### JS4. unref() 是优化不是依赖

`timer.unref()` 在 Node 子进程 / vitest worker 里**经常失效**。当作"如果生效更好"看待，**正确性必须靠显式 `clearInterval`**。

```ts
// ❌ 不能依赖
this.timer = setInterval(...).unref();  // worker 子进程里 unref 可能不生效

// ✅ 显式清理
this.timer = setInterval(...);
// dispose 里：
clearInterval(this.timer);
this.timer = undefined;
```

#### JS5. 测试 afterEach 必须断言资源清零

```ts
afterEach(() => {
  audit?.dispose();
  expect(audit?.getActiveTimerCount() ?? 0).toBe(0);  // ← 这一行必加
});
```

让漏调 dispose **第一次发生时就红**，不等卡死。

#### JS6. 准备好"开放句柄诊断"工具，排查卡死时立刻用

各测试框架的诊断机制：

| 测试框架 | 机制 | 配置/命令 | 是否常驻 |
|---------|------|----------|---------|
| **Jest** | 配置选项 | `--detectOpenHandles` flag 或 CLI 参数 | 可常驻（性能开销小） |
| **Vitest** | 内置 reporter | `--reporter=hanging-process` 或 `reporters: ['default', 'hanging-process']` | ⚠️ 不建议常驻（[官方警告](https://main.vitest.dev/guide/reporters#hanging-process-reporter) 资源开销大），仅排查时启用 |
| **Mocha** | 配置选项 | `mocha --check-leaks` | 可常驻 |
| **Node Test Runner** | 内置 | 自动检查（无需配置）| 默认开启 |

**重点**：
- **Vitest 没有 `detectOpenHandles` 这个配置选项**——这是 Jest 的 API。Vitest 用 reporter 机制：[hanging-process reporter](https://main.vitest.dev/guide/reporters#hanging-process-reporter)
- Vitest 卡死的真正兜底是 **`testTimeout` + `pool: 'forks'`** 组合：单测超时强杀 fork → 整个测试套件不会被一个泄漏拖垮

**Vitest 排查卡死的标准操作**：

```bash
# 看具体哪些 handle 没关
bun test --reporter=hanging-process

# 或者临时改 vitest.config.ts
test: {
  reporters: ['default', 'hanging-process'],
}
```

输出形如：
```
✓ 30 tests passed
⚠️  Hanging processes detected:
  Timer (setInterval) at packages/scope-gate/src/audit-logger.ts:133:24
  FileHandle at packages/scope-gate/src/audit-logger-optimized.ts:200:15
```

**为什么不建议常驻**：
1. 官方明确说 resource-intensive
2. 你已经有最强兜底（`pool: 'forks'` + `testTimeout`），单文件卡死不会拖垮全局
3. 真正的根治在代码层（默认安全 + Disposable 协议），reporter 只是排查工具

**推荐做法**：
- 在 `vitest.config.ts` 顶部加注释指引："如何排查卡死：临时加 `--reporter=hanging-process`"
- CI / 本地常态跑时不加 reporter（依赖 testTimeout + forks 兜底）
- 出现卡死症状时，开发者照注释指引启用 reporter 定位泄漏点

### 第 3 层：5 条反模式（看到立刻警惕）

| # | 反模式 | 表现 | 修法 |
|---|-------|------|------|
| **AP1** | 构造器起后台 timer | `new X()` 后冒出 setInterval | 移到 `start()` 或 opt-in |
| **AP2** | 默认 `enableXxx: true` | 默认值埋雷 | 改 `false`，opt-in |
| **AP3** | dispose 改名 close/destroy/shutdown | 团队内不统一 | 统一叫 `dispose` |
| **AP4** | 没有 `getActiveXxxCount` | 测试无法验证清零 | 强制加 |
| **AP5** | 测试用真实 setTimeout 等 | 测试慢 + 不确定 | 用 fake timer（[async-resource-lifecycle T3](async-resource-lifecycle.md#t3)）|

### 第 4 层：决策树（碰到新场景照着走）

```
我在写一个新 class
       │
       ▼
持有异步资源吗？（timer / handle / connection / subscription）
       │
   ┌───┴───┐
   否      是
   │       │
   ▼       ▼
普通 class  实现 Disposable 协议（dispose + Symbol.dispose）
            │
            ▼
        构造器要不要默认启动后台资源？
            │
       ┌────┴─────┐
       │          │
       ▼          ▼
 进程级单例    短生命周期/测试场景频繁创建
 (daemon等)        │
       │           ▼
       ▼      默认 false，opt-in
 默认启动 OK   （要求调用者主动开 enableXxx: true）
       │
       ▼
   加 getActive*Count() 自检 API
       │
       ▼
   JSDoc 标注"调用者必须 dispose"
       │
       ▼
   测试时 afterEach 必含：
     1. 调 dispose
     2. expect(getActive*Count()).toBe(0)
```

---

## 预防机制

### 项目层落地（按优先级）

#### 步骤 1（必做）：审查所有 class 的 constructor

用 grep 扫"构造器埋雷"模式：

```bash
# 找构造器内的副作用调用
grep -rn "constructor" packages/*/src/ -A 30 | grep -E "setInterval|setTimeout|createReadStream|\.on\(|spawn|connect"
```

每条命中记录到 `docs/audit/constructor-side-effects.md`，逐条评估是否要改 opt-in。

#### 步骤 2（必做）：统一 Disposable 协议

加一个共享类型文件 `packages/types/src/disposable.ts`：

```ts
export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface AsyncDisposable extends Disposable {
  [Symbol.asyncDispose](): Promise<void>;
}
```

所有持有资源的类都 `implements Disposable` / `AsyncDisposable`。

#### 步骤 3（必做）：改默认值

把所有 `enableXxx: true` 默认值翻成 `false`。生产代码里**显式开**：

```ts
// 找所有
grep -rn "enableTimer\s*\?\?\s*true" packages/*/src/

// 改为
this.enableTimer = options?.enableTimer ?? false;

// 生产代码显式打开
const audit = new AuditLogger('./logs', actor, { enableTimer: true });
```

#### 步骤 4（必做）：测试配置加最后防线

每个包的 `vitest.config.ts` 都加：

```ts
test: {
  testTimeout: 10000,        // 单测最多 10s
  hookTimeout: 5000,
  teardownTimeout: 3000,
  pool: 'forks',             // 进程隔离（一个泄漏不影响别的）

  // 排查卡死时，临时启用 hanging-process reporter（见下方注释）
  // reporters: ['default', 'hanging-process'],
}
```

**Vitest 注**：`hanging-process` reporter 官方警告 resource-intensive，**不建议常驻**。
正确做法：`pool: 'forks'` + `testTimeout` 是常态兜底（一个文件卡死不拖垮全局），
出现卡死症状时再临时启用 `--reporter=hanging-process` 定位泄漏点。

**Jest 用户**：上面 `reporters` 那行替换为 `detectOpenHandles: true`，可常驻（性能开销小）。

#### 步骤 5（推荐）：自检 API 强制化

任何持有资源的类必须实现 `getActiveXxxCount()`，CI 加 lint 规则检查：

```js
// .eslintrc 自定义规则伪代码
'specforge/disposable-must-have-getter': {
  paths: ['packages/*/src/**/*.ts'],
  classes_implementing: 'Disposable',
  required_method: /^getActive[A-Z]\w+Count$/,
}
```

#### 步骤 6（推荐）：CI 排查机制

**Jest 项目**：
```yaml
- name: Test with handle leak detection
  run: jest --detectOpenHandles
```

**Vitest 项目**：常态 CI 不加 hanging-process reporter（资源开销大）；
但加 **OS 级 timeout 兜底**：
```yaml
- name: Run tests
  timeout-minutes: 10              # ← 整个 step 最多 10 分钟，防卡死
  run: bun test
```
出现卡死时，开发者本地用 `bun test --reporter=hanging-process` 定位。

#### 步骤 7（推荐）：PR 模板四问

新建 `class` 持有资源的 PR，模板必填：

```markdown
## 异步资源四问（持有 timer/handle/connection 的类必填）
1. 这个类创建什么异步资源？
2. 谁负责释放？（在哪个调用点）
3. 什么时机释放？（生命周期事件）
4. 测试如何验证已释放？（哪个 afterEach + 哪个断言）
```

### Steering 注入

在 `.kiro/steering/` 注入这条经验后，AI 派单 / 写代码时会主动遵循。本文档由经验库适配器自动同步到 `.kiro/steering/lessons-injected.md`。

### 派单 prompt 强化

orchestrator 派 sub-agent 写新 class 时，prompt 顶部应包含：

```
## 异步资源硬规则（违反 = 任务失败）

如果你要写的 class 持有 timer/handle/connection，必须：
1. 不在 constructor 里启动后台资源（用 start() 配对）
2. 实现 dispose() + Symbol.dispose
3. 加 getActiveXxxCount() 自检 API
4. 写测试时 afterEach 必含 dispose + 断言清零
```

由 `bun run scripts/lessons/render-prompt-block.ts --tags=javascript,resource-management,disposable` 生成。

---

## 相关错误

同根因可能撞到的其他症状：

| 症状 | lesson |
|------|--------|
| `bun test` 跑完不退出 | 本文 |
| Promise.race 后败者 timer 泄漏 | [async-resource-lifecycle](async-resource-lifecycle.md) A1 / D1 |
| while 循环依赖外部信号无超时兜底 | [async-resource-lifecycle](async-resource-lifecycle.md) A2 |
| 测试用 setTimeout 轮询慢且不稳 | [async-resource-lifecycle](async-resource-lifecycle.md) T3 |
| 异步流测试中途异常没清理 | [async-resource-lifecycle](async-resource-lifecycle.md) T1 |
| 派 sub-agent 跑测试卡死无反馈 | [kiro/execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) |

**判断本文 vs async-resource-lifecycle 的标准**：
- 你在**写新类**、决定 API 形态、设计构造器 → 本文（架构层）
- 你在**写具体异步代码**（Promise.race / while / 超时） → async-resource-lifecycle（代码层）

两者**不重叠不矛盾**：本文给出"对象层契约"，async-resource-lifecycle 给出"代码层模式"。

---

## 参考

- ECMAScript Explicit Resource Management 提案：https://github.com/tc39/proposal-explicit-resource-management
- TypeScript 5.2 `using` 语法：https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/#using-declarations-and-explicit-resource-management
- 本仓库 SpecForge V6 scope-gate 包 e2e 测试卡死事故（2026-05-17 修复）
- 互补经验：[async-resource-lifecycle.md](async-resource-lifecycle.md)

---

## Kiro 工具专属经验

### [HIGH] kiro-execute-pwsh-constraints

**源**：[docs/engineering-lessons/ai-tools/kiro/execute-pwsh-constraints.md](../../docs/engineering-lessons/ai-tools/kiro/execute-pwsh-constraints.md)  
**标签**：shell, command-execution, kiro-tool

## 症状

sub-agent 跑命令时频繁遇到以下错误，且**无论重试多少次都失败**：

| 错误命令 | 错误现象 |
|---------|---------|
| `cd packages/cli && bun run build` | "The 'cd' command is not supported and will fail" |
| `cat << EOF\n...\nEOF` | 命令解析失败 / 多行被截断 |
| `python -c "import x;\nx.foo()"` | 多行内联报错 |
| `grep "!important" file.css` | bash 历史扩展把 `!important` 吃了 |
| `find . -name '*.ts'` | 工具规则禁用，应该用 `file_search` |
| `cat foo.txt` | 工具规则禁用，应该用 `read_file` |

sub-agent 看到错误后，常见错误反应：
- 把命令拆成两步重试（仍然失败）
- 改用其他写法绕（可能踩到下一个约束）
- 误判为"环境有问题"，浪费回合数

## 根因

Kiro 的 `execute_pwsh` 工具**不是直接调用系统 PowerShell**，而是 Kiro 主进程内的**受控壳**。它有以下硬约束（写在工具描述里，但 sub-agent 容易忽视）：

1. **禁用 `cd` 命令**——Kiro 用工具参数 `cwd` 指定工作目录，让 cd 容易和 cwd 冲突，索性禁用
2. **禁用 heredoc**（`cat << EOF`）——多行重定向解析复杂，禁用避免 race
3. **单行限制**——内联解释器（`python -c` / `node -e` / `bash -c`）只能单行，多行需要写成临时脚本文件
4. **bash 历史扩展生效**——双引号字符串里的 `!` 会被 history expansion 处理，要用单引号或转义
5. **工具替代优先**——能用专用工具（`read_file` / `file_search` / `grep_search` / `fs_write`）就**禁止**用对应的 shell 命令（`cat` / `find` / `grep` / `mkdir`）
6. **默认无 hard timeout**——长跑命令会一直挂住，必须显式 timeout 或外层 `Start-Job + Wait-Job -Timeout`

## 解决方案

### 替代规则速查表

| 错误用法 | 正确用法 |
|---------|---------|
| `cd <dir> && <cmd>` | `execute_pwsh(command="<cmd>", cwd="<dir>")` |
| `cat foo.txt` | `read_file(path="foo.txt")` |
| `find . -name '*.ts'` | `file_search(query="*.ts")` |
| `grep "pattern" file.txt` | `grep_search(query="pattern", includePattern="file.txt")` |
| `mkdir -p dir/sub` | `fs_write(path="dir/sub/.gitkeep", text="")`（或工具自动创目录） |
| `echo "content" > file` | `fs_write(path="file", text="content")` |
| `cat << EOF\n...\nEOF` | 写到临时文件用 `fs_write`，再 `bun run` 临时文件 |
| `python -c "import x\nx()"` | 多行写到 `tmp.py`，再 `python tmp.py` |
| `grep "!important"` | `grep "'!important'"`（单引号包裹） |
| `bun test path/to/file.test.ts`（裸跑） | 见下方"长跑命令必须 timeout" |

### 长跑命令必须 OS 级 timeout

任何可能跑 ≥ 1 分钟的命令（特别是 `bun test`），必须用 PowerShell `Start-Job + Wait-Job` 包裹，避免卡死整个 orchestrator：

✅ 正确写法：
```powershell
$job = Start-Job -ScriptBlock { Set-Location $using:PWD; bun test packages/foo/tests/bar.test.ts 2>&1 }
if (Wait-Job $job -Timeout 90) {
  Receive-Job $job
  Remove-Job $job
} else {
  Stop-Job $job
  Receive-Job $job
  Remove-Job $job -Force
  Write-Host "STILL_HUNG_AFTER_90s"
  exit 1
}
```

❌ 错误写法：
```bash
bun test packages/foo/tests/bar.test.ts   # 没有 timeout 包裹，可能卡死数小时
```

### 工作目录的正确传递

`execute_pwsh` 工具有专门的 `cwd` 参数。**永远用它**，不要在 command 里 `cd`：

✅ 正确：
```
execute_pwsh(
  command: "bun run build",
  cwd: "d:\\code\\temp\\SpecForge\\packages\\cli"
)
```

❌ 错误：
```
execute_pwsh(
  command: "cd packages/cli && bun run build"
)
```

注意：`cwd` 需要的是**相对仓库根**或**绝对路径**，不是相对当前 cwd。

## 预防机制

### 在 Kiro 注入点（适配器自动生成）

经验库适配器 `scripts/lessons/render-kiro-steering.ts` 应把这条经验渲染到 `.kiro/steering/lessons-injected.md`，使 Kiro 主 agent 和 sub-agent 都能在每次会话开头看到。

### 在 Kiro steering 手工注入（短期）

在 `.kiro/steering/v6-development-workflow.md` 的"禁止事项"小节加：

```
- ❌ 禁止在 execute_pwsh 的 command 里使用 cd（用 cwd 参数）
- ❌ 禁止用 cat/find/grep/mkdir 等系统命令（用 read_file/file_search/grep_search/fs_write）
- ❌ 禁止裸跑 bun test（要 Start-Job + Wait-Job -Timeout 90 包裹）
```

### 在派单 prompt 里强调

orchestrator 派 sub-agent 时，prompt 里包含一段：

```
## 命令执行规则（Kiro execute_pwsh 受控壳）

不要在 command 里用 cd，用 cwd 参数。
不要用 cat/find/grep/mkdir，用专用工具（read_file/file_search/grep_search/fs_write）。
不要裸跑 bun test，用 Start-Job + Wait-Job -Timeout 90 包裹。
```

### 错误反馈闭环

sub-agent 看到 `cd is not supported` / `command not allowed` 这类错误时**必须立刻停下报告**，不要换写法重试——重试常常踩另一个约束。

## 相关错误

同一受控壳约束派生出来的其他典型错误：

- **"failed to spawn process"**——多半是工具替代规则没遵守（用了被禁的 shell 命令）
- **"command timeout"**——长跑命令没 OS 级 timeout 包裹
- **"output truncated"**——多行 inline 命令被截
- **"unexpected token '!'"**——双引号 + `!` 触发 history expansion
- **"Move-Item: cannot find path"**——cd 失败了但下一步基于"已经 cd"的假设

## 参考

- Kiro `execute_pwsh` 工具的完整描述（含所有 ⚠️ Rules）见会话开头的工具定义
- `Start-Job + Wait-Job` 的完整模板见本文"长跑命令必须 OS 级 timeout"小节
- 资源泄漏导致 `bun test` 卡死的根因，见 [universal/async-resource-lifecycle.md](../../universal/async-resource-lifecycle.md)

---
