---
name: superpowers-engineering-lessons
description: 工程经验库自动注入 — 把团队踩过的坑结构化注入所有 Agent，避免重复犯错
autoload: always
---

<!-- AUTO-GENERATED — 不要手动编辑，运行 `bun run scripts/lessons/render-opencode-skill.ts` 重新生成 -->
<!-- 源：docs/engineering-lessons/ — 改源文件再 rerun 适配器 -->

# 工程经验注入（AI 必读）

**生成日期**：2026-05-23  
**适配工具**：OpenCode  
**当前项目**：specforge  
**注入条数**：5

本文件由经验库适配器自动生成，从 `docs/engineering-lessons/` 渲染而来。
要修改某条经验，编辑对应源文件后重新运行适配器；**禁止直接改本文件**。

---

## 通用经验（所有项目所有工具）

### [HIGH] async-resource-lifecycle

**源**：docs/engineering-lessons/universal/async-resource-lifecycle.md  
**标签**：async, promise, timer, resource-leak, testing  
**适用角色**：executor, reviewer, debugger, architect

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

### [HIGH] host-environment-detection

**源**：docs/engineering-lessons/universal/host-environment-detection.md  
**标签**：host-profile, environment-scan, shell-detection, encoding, locale, cross-platform  
**适用角色**：executor, orchestrator, debugger, architect

> **来源**：SpecForge V6 中 agent 在不同机器上跑同一段命令出现完全不同结果（中文乱码、shell 不存在、工具找不到、路径分隔符错）的根因抽象。
> **适用范围**：所有需要在用户机器上执行命令、读写文件、调用外部工具的项目。
> **与 [shell-command-execution](shell-command-execution.md) 关系**：本文规定**怎么探测环境并写入档案**，对方规定**怎么按档案执行命令**。两者一起用：先探测、写档案，命令执行工具读档案后按档案规则跑。

---

## 症状

### 场景 1：同一段命令在不同机器表现不同

```
Agent 在开发者 A 的机器（Mac）写：
  grep -r "TODO" src/

复制到开发者 B 的机器（Windows）跑：
  → 'grep' 不是内部或外部命令
  
Agent 重写：
  Get-ChildItem src -Recurse | Select-String "TODO"

复制回开发者 A：
  → 'Get-ChildItem' command not found
```

### 场景 2：中文 Windows 用户的命令输出乱码

```
Agent 调用 bun run build：
  鉂?error TS2304: Cannot find name '锛佽妭鐐?

Agent 看不懂错误，反复重试，反复乱码。
```

### 场景 3：工具版本不匹配

```
Agent 写：
  bun test --bail

旧版 bun 不支持 --bail，报错。
但 agent 不知道用户装的是旧版，继续生成新语法的命令。
```

### 场景 4：时区导致 timestamp 比对失败

```
Agent 检查 cache 是否过期：
  if (cacheTime < Date.now() - 3600000) // 1 小时

但 agent 上次执行命令的 timestamp 是用户本地时间，
agent 当前推理用的是 UTC，差了 8 小时，永远判定为过期。
```

### 场景 5：找不到工具就直接装

```
Agent 发现 ripgrep 没装：
  npm install -g ripgrep

但其实用户已经通过 winget 装了 ripgrep，
agent 装了一份重复的，污染 PATH。
```

---

## 根因

### 一、Agent 不知道自己跑在哪

LLM 的训练数据偏向 Linux/Mac，默认假设：
- shell 是 bash
- PATH 里有 grep/find/cat/curl
- 编码是 UTF-8
- 路径用 `/` 分隔
- 时区是 UTC

但实际用户机器**几乎从来不满足所有假设**。

### 二、每次推理都靠猜，没有持久状态

Agent 在推理时不会主动跑 `uname` / `bun --version` 来探测——这要消耗 tool 调用回合，太昂贵。所以它**每次都按训练数据猜**，猜错就翻车，翻车就重试，重试还按训练数据再猜，**陷入死循环**。

### 三、shell 工具描述里没有环境信息

OpenCode 的 bash 工具描述只有"execute shell commands"，没说：
- 用什么 shell？
- 编码是？
- 哪些命令可用？
- 路径风格？

Agent 看到工具就**默认用 bash 风格**生成命令。

### 四、用户配置 PATH 不可预测

PATH 里有什么完全是用户决定的：
- 装了 git bash 的 Windows 用户有 Unix 化的 grep
- 装了 Cygwin 的可能有 Linux 风工具但行为奇怪
- 用 winget / scoop / chocolatey 装的工具路径各不相同
- macOS 用户可能用 brew 装的工具覆盖系统命令

### 五、工具版本差异隐藏 bug

`bun 1.2 vs 1.3` 部分 flag 不同；`git 2.20+` 才支持某些 subcommand；`pwsh 7.0 vs 7.4` 行为差异。Agent 不知道版本就盲目生成新语法。

---

## 解决方案

核心思路：**在系统启动时**（OpenCode 启动 / 工具首次调用）扫描宿主机环境，写入持久化档案，**所有 shell 命令执行时读档案决策**。

### 一、host-profile.json 数据模型

存储位置：`~/.specforge/host-profile.json`

完整结构（字段全必填，缺则走探测）：

```json
{
  "schema_version": "1.0",
  "scanned_at": "2026-05-19T10:30:00.000Z",
  "scanner_version": "6.0.0",
  
  "os": {
    "platform": "win32",
    "release": "10.0.26100",
    "version": "Windows 11 Pro 24H2",
    "arch": "x64",
    "totalmem_gb": 32,
    "cpu_count": 16
  },
  
  "locale": {
    "system_lang": "zh-CN",
    "console_codepage": 936,
    "encoding": "UTF-8",
    "timezone": "Asia/Shanghai",
    "tz_offset_minutes": 480,
    "datetime_now": "2026-05-19T10:30:00.000Z"
  },
  
  "shells": [
    {
      "name": "pwsh",
      "path": "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      "version": "7.5.0",
      "default_encoding": "UTF-8",
      "available": true,
      "preferred": true
    },
    {
      "name": "powershell",
      "path": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "version": "5.1.26100.2152",
      "default_encoding": "UTF-16-LE",
      "needs_encoding_fix": true,
      "available": true,
      "preferred": false
    },
    {
      "name": "cmd",
      "path": "C:\\Windows\\System32\\cmd.exe",
      "version": "10.0.26100.2152",
      "default_encoding": "GBK",
      "needs_encoding_fix": true,
      "available": true,
      "preferred": false
    },
    {
      "name": "bash",
      "path": null,
      "version": null,
      "available": false,
      "preferred": false,
      "note": "Windows 上未安装 bash（git bash / WSL 都没装）"
    }
  ],
  
  "tools": {
    "git": { "available": true, "version": "2.45.0", "path": "C:\\Program Files\\Git\\cmd\\git.exe" },
    "bun": { "available": true, "version": "1.3.11", "path": "C:\\Users\\luo\\.bun\\bin\\bun.exe" },
    "node": { "available": true, "version": "22.5.1", "path": "C:\\Program Files\\nodejs\\node.exe" },
    "npm": { "available": true, "version": "10.8.0", "path": "C:\\Program Files\\nodejs\\npm.cmd" },
    "pnpm": { "available": false, "version": null, "path": null },
    "yarn": { "available": false, "version": null, "path": null },
    "rg": { "available": true, "version": "14.1.0", "path": "C:\\Users\\luo\\scoop\\shims\\rg.exe" },
    "curl": { "available": true, "version": "8.4.0", "path": "C:\\Windows\\System32\\curl.exe" },
    "wget": { "available": false, "version": null, "path": null },
    "python": { "available": true, "version": "3.12.4", "path": "C:\\Python312\\python.exe" },
    "docker": { "available": false, "version": null, "path": null }
  },
  
  "shell_rules": {
    "preferred_shell": "pwsh",
    "max_command_length": 32767,
    "encoding_setup_command": "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "path_separator": "\\",
    "path_quote_required_for_spaces": true,
    "supports_glob_in_shell": false,
    "ci_mode": false
  },
  
  "user": {
    "username": "luo",
    "home_dir": "C:\\Users\\luo",
    "shell_history_file": "C:\\Users\\luo\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt"
  },
  
  "specforge": {
    "install_root": "C:\\Users\\luo\\.specforge",
    "logs_dir": "C:\\Users\\luo\\.specforge\\logs"
  }
}
```

### 二、扫描时机

**触发点 1：OpenCode 启动（plugin 自动）**

`.opencode/plugins/sf_specforge.ts` 在加载时检查 `~/.specforge/host-profile.json`：
- 不存在 → 完整扫描
- 存在但 `scanned_at` 超过 30 天 → 重新扫描
- 存在且新鲜 → 直接读取

**触发点 2：sf_safe_bash 首次调用**

工具自身也做兜底——如果 plugin 没初始化（用户禁用了 plugin），首次调用工具时同步触发扫描。

**触发点 3：用户手动触发**

```bash
specforge env scan
specforge env scan --force   # 忽略缓存
specforge env show           # 只显示，不扫描
```

**触发点 4：检测到环境变化**

某些信号说明环境变了，需要重新扫描：
- 上次扫描在不同机器（hostname 变化）
- 关键工具突然报"找不到"（PATH 变了或工具卸载）
- shell 报版本不一致（pwsh 升级）

### 三、扫描逻辑

#### OS 信息（最简单）

```typescript
const os = await import('node:os')
const profile = {
  platform: os.platform(),  // 'win32' | 'darwin' | 'linux'
  release: os.release(),
  arch: os.arch(),
  totalmem_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
  cpu_count: os.cpus().length
}
```

#### Locale 信息

Windows：
```typescript
// 系统语言
const lang = process.env.LANG || (await spawn('powershell', '-Command', '(Get-Culture).Name'))
// 控制台代码页
const codepage = (await spawn('cmd', '/c', 'chcp')).match(/(\d+)/)?.[1]
// 时区
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
const offset = -new Date().getTimezoneOffset()
```

macOS / Linux：
```typescript
const lang = process.env.LANG || process.env.LC_ALL
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
```

#### Shell 探测

```typescript
const candidates = process.platform === 'win32'
  ? ['pwsh', 'powershell', 'cmd', 'bash']
  : process.platform === 'darwin'
  ? ['zsh', 'bash', 'sh']
  : ['bash', 'zsh', 'sh', 'dash']

for (const shell of candidates) {
  const path = await which(shell)              // 找绝对路径
  const version = await getShellVersion(shell, path)  // 跑 -Version 或 --version
  const encoding = inferDefaultEncoding(shell, path)  // pwsh=UTF-8, powershell=UTF-16LE, cmd=GBK
  
  shells.push({ name: shell, path, version, default_encoding: encoding, available: !!path })
}

// 标记 preferred
const preferOrder = process.platform === 'win32' ? ['pwsh', 'powershell', 'cmd'] : ...
for (const name of preferOrder) {
  const found = shells.find(s => s.name === name && s.available)
  if (found) { found.preferred = true; break }
}
```

#### 工具探测

```typescript
const tools = ['git', 'bun', 'node', 'npm', 'pnpm', 'yarn', 'rg', 'curl', 'wget', 'python', 'docker', 'jq']

for (const tool of tools) {
  const path = await which(tool)
  if (path) {
    const version = await spawn(path, '--version')
    profile.tools[tool] = { available: true, version: extractVersion(version), path }
  } else {
    profile.tools[tool] = { available: false, version: null, path: null }
  }
}
```

每个工具用 `--version` 拿版本（多数工具支持，bun/node/npm/git 都支持），用 `which`/`where` 拿绝对路径。

#### CI 检测

```typescript
const ci_mode = !!(
  process.env.CI ||
  process.env.GITHUB_ACTIONS ||
  process.env.GITLAB_CI ||
  process.env.CIRCLECI ||
  process.env.TRAVIS ||
  process.env.JENKINS_HOME
)
```

CI 环境特殊：
- 通常没有交互式 pwsh
- 多半 UTF-8（CI 服务器）
- 工具集相对干净
- 应该用更短的 timeout（CI 任务通常有自己的超时）

### 四、扫描脚本必须满足的约束

#### 1. 探测命令必须有超时

每个 spawn 限制在 5 秒内完成。某个命令卡住不能拖累整个扫描。

```typescript
const result = await Promise.race([
  spawn(cmd, args),
  new Promise((_, rej) => setTimeout(() => rej(new Error('PROBE_TIMEOUT')), 5000))
])
```

参考 [async-resource-lifecycle.md A1](async-resource-lifecycle.md) 的败者清理原则——超时后必须 kill 子进程。

#### 2. 扫描必须并行

10 个工具串行扫描（每个 1-2 秒）= 20 秒。并行 = 2 秒。

```typescript
const probes = tools.map(tool => probeTool(tool))
const results = await Promise.allSettled(probes)
```

用 `allSettled` 不用 `all`，单个失败不影响其他。

#### 3. 失败工具不抛错，标记为 available: false

某个工具不存在不是错——是有效信息。`spawn` 返回 ENOENT 时标记不可用。

#### 4. 写入文件必须原子

```typescript
const tmpPath = profilePath + '.tmp.' + crypto.randomUUID()
await fs.writeFile(tmpPath, JSON.stringify(profile, null, 2))
await fs.rename(tmpPath, profilePath)
```

避免扫描中途崩溃留下残缺文件。

#### 5. 扫描日志写到 stderr

```typescript
console.error('[host-profile] scanning OS info...')
console.error('[host-profile] probing shells: pwsh, powershell, cmd...')
console.error('[host-profile] probing tools: git, bun, node...')
console.error('[host-profile] saved to ~/.specforge/host-profile.json (47 entries)')
```

写 stderr 不污染 stdout，方便调用方区分扫描日志和实际命令输出。

### 五、敏感信息保护

host-profile **不应**包含敏感信息：

❌ **禁止**记录：
- 用户密码 / API key（即使在 PATH 里发现）
- 私钥路径（不扫描 `.ssh/id_rsa` 等）
- 数据库连接字符串
- 公司内部域名 / IP

✅ **可以**记录：
- 用户名（os.userInfo().username）
- home 目录路径
- 已安装的开源工具列表和版本
- 公开的环境变量（PATH、LANG、TZ）

### 六、agent 怎么用 host-profile

#### 方式 1：注入到 system prompt（推荐）

在 OpenCode AGENTS.md 用变量引用：

```markdown
## 当前宿主机环境

操作系统：{host.os.platform} {host.os.version}
首选 shell：{host.shell_rules.preferred_shell}
系统语言：{host.locale.system_lang}
时区：{host.locale.timezone}

可用工具：{host.tools.available_list}
不可用工具：{host.tools.unavailable_list}

执行命令时必须遵守上述环境特征。
不要尝试调用 unavailable_list 中的工具。
路径分隔符使用 {host.shell_rules.path_separator}。
```

OpenCode 加载 AGENTS.md 时，把 `{host.xxx}` 替换为 host-profile 的实际值。

#### 方式 2：sf_safe_bash 工具内部使用（必做）

工具自身读 host-profile 决定：
- 用哪个 shell spawn
- 是否注入编码设置
- 是否拦截 unavailable 工具的命令
- 路径标准化怎么做

#### 方式 3：sf_doctor 工具暴露（建议）

```typescript
// .opencode/tools/sf_doctor.ts 增加查询能力
sf_doctor(check: 'host')
  → 返回 host-profile 摘要给 agent
```

Agent 怀疑环境问题时主动调用查询。

---

## 错误场景与降级

### 1. host-profile.json 不存在

工具首次调用时同步扫描（首次会慢 2-3 秒），扫描完写入。

### 2. host-profile.json 解析失败（损坏）

立即重新扫描，覆盖文件。

### 3. 探测某个工具时该工具卡死（罕见）

每个探测有 5 秒超时，超时标记 `available: false` 并加 note：`"探测超时，标记为不可用"`。

### 4. 用户手动改了 host-profile.json 后命令出错

工具发现命令实际行为和档案不一致（比如档案说有 git，实际报 ENOENT）：
- 单次失败 → 不重扫描（可能是临时问题）
- 连续 3 次同类工具 ENOENT → 标记档案过期，下次启动强制重扫

### 5. 用户在容器里跑（虽然你说很少）

CI 检测会触发，标记 `ci_mode: true`，但扫描照常进行。容器特殊路径（`/proc/1/cgroup` 包含 docker）可以加额外字段 `os.runtime: 'container'`，但 V6.0 不做。

---

## 预防机制

### 项目层

#### 步骤 1（必做）：实现扫描脚本

`scripts/lessons/scan-host-profile.ts`，按本文规则实现。

CLI 入口：
```bash
bun run scripts/scan-host-profile.ts            # 增量扫描（30 天缓存）
bun run scripts/scan-host-profile.ts --force    # 强制扫描
bun run scripts/scan-host-profile.ts --show     # 只打印当前档案
```

#### 步骤 2（必做）：plugin 启动钩子

修改 `.opencode/plugins/sf_specforge.ts`，启动时检查并触发扫描：

```typescript
async function ensureHostProfile() {
  const profilePath = join(homedir(), '.specforge', 'host-profile.json')
  
  if (!await exists(profilePath)) {
    await runHostScan()
    return
  }
  
  const profile = JSON.parse(await readFile(profilePath, 'utf-8'))
  const ageMs = Date.now() - new Date(profile.scanned_at).getTime()
  if (ageMs > 30 * 24 * 60 * 60 * 1000) {
    await runHostScan()
  }
}
```

#### 步骤 3（必做）：sf_safe_bash 读档案

工具自身在 execute() 开头读档案，决策 shell / 编码 / 工具可用性。档案不可读则降级到内置默认值（pwsh 优先 + UTF-8）。

#### 步骤 4（推荐）：sf_doctor 增加 host 检查

```bash
specforge doctor host    # 显示当前档案 + 检查关键工具
```

输出形如：
```
✅ OS: win32 (Windows 11 Pro 24H2)
✅ Locale: zh-CN, UTF-8, Asia/Shanghai
✅ Preferred shell: pwsh 7.5.0
✅ Required tools:
   ✅ git 2.45.0
   ✅ bun 1.3.11
   ✅ node 22.5.1
⚠️  Optional tools:
   ❌ python (not found)
   ❌ docker (not found)
```

#### 步骤 5（推荐）：CI 自动跑 scan

`.github/workflows/*.yml` 加：
```yaml
- name: Scan host profile
  run: bun run scripts/scan-host-profile.ts --force
- name: Show profile
  run: cat ~/.specforge/host-profile.json
```

CI 日志能看到每次跑的环境，调试 CI 问题时有据可查。

### 工具层

让 sf_safe_bash 在拦截规则里使用档案：

```typescript
// 拒绝调用不可用工具
if (command starts with toolName && !profile.tools[toolName].available) {
  return reject({
    rule: 'tool-not-available',
    suggestion: `${toolName} 在当前机器未安装。host-profile.json 显示该工具不可用。`
  })
}
```

---

## 相关错误

| 症状 | 解决参考 |
|------|---------|
| 中文输出乱码 | [shell-command-execution](shell-command-execution.md) "编码强制 UTF-8" |
| 找不到 grep / find / cat | 本文 + [shell-command-execution](shell-command-execution.md) "命令重写规则" |
| Mac/Win 命令风格不一致 | 本文（host-profile 区分平台）+ [shell-command-execution](shell-command-execution.md) "Shell 选择优先级" |
| 工具版本太旧不支持新 flag | 本文（host-profile 记录版本，agent 看 prompt 知道版本，避免用新 flag） |
| timestamp 时区不一致 | 本文（host-profile.locale.timezone）|

---

## 参考

- 互补经验：[shell-command-execution](shell-command-execution.md) — 规定如何按档案执行命令
- 扫描脚本：`scripts/lessons/scan-host-profile.ts`
- 配置文件：`~/.specforge/host-profile.json`
- 自动触发：`.opencode/plugins/sf_specforge.ts` 启动钩子
- 用户工具：`specforge env scan` / `specforge doctor host`

---

### [HIGH] javascript-explicit-resource-management

**源**：docs/engineering-lessons/universal/javascript-explicit-resource-management.md  
**标签**：javascript, typescript, resource-management, disposable, lifecycle, design-pattern, dispose  
**适用角色**：executor, reviewer, debugger, architect

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

### [HIGH] shell-command-execution

**源**：docs/engineering-lessons/universal/shell-command-execution.md  
**标签**：shell, command-execution, cross-platform, encoding, timeout, security  
**适用角色**：executor, orchestrator, debugger, architect

> **来源**：SpecForge V6 中 agent 调用 shell 频繁出错（cd 不被支持、命令卡死、中文乱码、找不到工具）的根因抽象。
> **适用范围**：所有需要 AI agent 执行 shell 命令的项目，不限工具（Kiro / OpenCode / Cursor / Cline / Codex 等）。
> **与 [kiro-execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) 关系**：本文是更上层的通用规则；Kiro 那篇是具体工具实现层的约束。本文给出"应该怎么设计 shell 工具"，对方给出"碰到 Kiro 的工具该怎么用"。
> **与 [host-environment-detection](host-environment-detection.md) 关系**：本文规定**怎么执行命令**，对方规定**怎么探测环境**。两者一起用：先探测、写入档案，本工具读档案后按档案执行。

---

## 症状

### 场景 1：跨平台命令翻车

```
Agent 在 Mac 上写命令：grep "TODO" src/
搬到 Windows 跑 → "grep is not recognized"
```

```
Agent 在 Linux 写：rm -rf node_modules/
搬到 Windows pwsh 跑 → 部分目录删不掉（占用句柄）
```

### 场景 2：中文输出乱码

```powershell
# Windows PowerShell 5.1（默认 GBK 编码）
PS> bun run build
鉂?error: cannot find module 'D:\项目\src\index.ts'
锛堟枃鏈ㄥ嚭浜?GBK ？UTF-8 杞崲澶辫触锛?
```

### 场景 3：命令卡死整条会话

```
Agent 调用 bash("bun test packages/foo")
↓
foo 包有资源泄漏，bun test 不退出
↓
bash 工具死等子进程
↓
Agent 死等 bash 工具
↓
[30 分钟过去，对话框转圈，没动静]
```

### 场景 4：危险命令意外执行

```
Agent 帮用户清理 logs：
  rm -rf ~/.specforge/logs/*

但 ~ 解析失败返回空字符串：
  rm -rf /logs/*
  
执行成功，agent 报告"清理完成"，但用户其实丢了系统文件。
```

### 场景 5：路径有空格直接断命令

```
Agent 在 "C:\Program Files\项目" 下跑：
  cmd: bun run build
  cwd: C:\Program Files\项目

shell 报错：'Files\项目' 不是内部或外部命令
```

---

## 根因

### 一、跨平台 shell 不一致是结构性问题

不同平台默认 shell 完全不同，工具集也不一样：

| 平台 | 默认 shell | 默认编码 | 系统命令风格 | 路径分隔符 |
|------|-----------|---------|------------|----------|
| Windows 7-10 | cmd / powershell.exe (5.1) | GBK / CP936（中文 Windows） | 私有 cmdlet | `\` |
| Windows 11 (有 pwsh) | pwsh.exe (7+) | UTF-8 | cmdlet + Unix 化 | `\` 或 `/` |
| macOS | zsh | UTF-8 | BSD 风 | `/` |
| Linux | bash / dash | UTF-8 | GNU 风 | `/` |

**Agent 不知道自己跑在哪个平台**——它在生成命令时用训练数据里最常见的写法（多半是 bash），到了其他平台必然翻车。

### 二、shell 工具默认无 hard timeout

OpenCode 内置 bash、Kiro 的 execute_pwsh、Cursor 的 terminal——它们的 spawn 子进程都是**无限等**子进程退出。一个卡死的 `bun test` 会让 agent 等到天荒地老。Agent 上下文里看不到"正在等什么"，**用户也无法知道发生了什么**，只能强制中断。

### 三、AI 训练数据偏向 Linux

Agent 默认生成的命令是 GNU 风：`grep`、`find`、`cat`、`mkdir -p`、`cp -r`。这些在 Windows cmd 上根本没有，pwsh 上有别名但行为不完全相同。

### 四、命令是字符串拼接，路径含特殊字符直接炸

shell 命令本质是字符串，路径含空格 / 中文 / 引号 / `&` / `|` / `$` 都可能导致解析错误。Agent 拼字符串时几乎从不正确转义。

### 五、缺少机器档案，每次靠猜

Agent 不知道：
- pwsh 装了没？版本多少？
- bun 在哪？git 在哪？
- 系统语言是中文还是英文？时区是？
- 命令行最大长度限制？

每次都猜，猜错就翻车。

---

## 解决方案

核心思路：**把 shell 执行变成"读档案 + 规则引擎 + 强制超时"的工程问题**，而不是依赖 LLM 自己写对。

### 一、统一执行入口（sf_safe_bash 工具）

所有 shell 命令必须通过统一工具执行，**禁止 agent 直接用底层 bash**。这个工具负责：

1. 读取宿主机档案（host-profile）
2. 规则引擎检查命令
3. 选择正确的 shell（Windows 优先 pwsh）
4. 注入编码设置（强制 UTF-8）
5. spawn 子进程（带 OS 级 hard timeout）
6. 返回结构化结果（含诊断 hint）
7. 写审计日志

**Agent 永远只看到这一个工具**，复杂度被工具吃掉。

### 二、Shell 选择优先级（必须遵守）

| 平台 | 优先级 | 理由 |
|------|--------|------|
| Windows | **pwsh > powershell > cmd** | pwsh 默认 UTF-8，无中文乱码；powershell 5.1 GBK 编码会乱；cmd 命令贫弱 |
| macOS | **zsh > bash** | macOS Catalina+ 默认 zsh；bash 是后备 |
| Linux | **bash > sh** | bash 兼容性好；sh 在不同发行版指向不同实现，行为差异大 |

**强制规则**：sf_safe_bash 启动子进程前，按 host-profile 的 `shells[]` 顺序找第一个可用的。如果 Windows 上没装 pwsh，给用户**警告但不拒绝**，自动降级到 powershell.exe（同时加 GBK→UTF-8 编码转换）。

### 三、编码强制 UTF-8

#### Windows pwsh（推荐）

pwsh 默认就是 UTF-8，不需要额外配置。

#### Windows powershell.exe（降级方案）

每次 spawn 时**前置注入**编码设置：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null
```

把这段写进每次 spawn 的命令前缀。

#### Windows cmd（最后选择）

```cmd
chcp 65001 > nul
```

#### macOS / Linux

设置环境变量：

```bash
LC_ALL=en_US.UTF-8
LANG=en_US.UTF-8
```

在 spawn 时通过 `env` 字段传入，不污染父进程环境。

### 四、危险命令黑名单（必须代码层强制）

下列命令**直接拒绝执行**，不论 agent 怎么解释：

| 命令模式 | 拦截原因 |
|---------|---------|
| `rm -rf /` / `rm -rf /*` | 删根目录 |
| `rm -rf ~` / `rm -rf $HOME` | 删用户主目录 |
| `Remove-Item -Recurse -Force C:\` | Windows 等价 |
| `format <drive>` | 格式化磁盘 |
| `dd if=... of=/dev/sd*` | 写设备 |
| `> /dev/sd*` | 重定向到设备 |
| `mkfs` / `fdisk` | 格式化 / 分区 |
| `chmod -R 777 /` | 全局权限破坏 |
| `:(){ :\|:& };:` | fork bomb |
| `curl ... \| sh` / `wget ... \| bash` | 下载执行不可信代码 |
| `sudo ` 开头的命令 | 提权（默认拒绝，用户级别命令不应需要 sudo） |
| `git push --force` 到 main / master / dev 分支 | 强制推主分支（默认拒绝） |
| `git reset --hard` 含 `origin/` 的远程引用 | 重置到远程分支会丢本地工作 |

**拦截后返回**：
```json
{
  "success": false,
  "rejected": true,
  "reason": "DANGEROUS_COMMAND",
  "rule": "rm-rf-root",
  "explanation": "命令模式 'rm -rf /' 在危险命令黑名单中，工具拒绝执行。",
  "originalCommand": "rm -rf /tmp",
  "suggestion": "如果你确实想清理临时文件，请明确指定路径并不带 -rf 通配符。"
}
```

### 五、命令重写规则（替代 GNU 命令）

Agent 经常生成 GNU 风命令，工具应**直接拒绝**并给出建议（不是自动改写——避免改错），让 agent 用专用工具：

| Agent 生成 | 工具响应 |
|-----------|---------|
| `cat foo.txt` | 拒绝，建议用 `read_file` |
| `find . -name "*.ts"` | 拒绝，建议用 `file_search` |
| `grep "pattern" file` | 拒绝，建议用 `grep_search` |
| `mkdir -p dir/sub` | 拒绝，建议用 `fs_write`（写文件时自动建目录）|
| `echo "x" > file` | 拒绝，建议用 `fs_write` |
| `cd <dir> && <cmd>` | 拒绝，建议用 `cwd` 参数 |
| `cat << EOF\n...\nEOF`（heredoc） | 拒绝，建议写临时文件再调用 |
| `<lang> -c "<multi-line>"` | 拒绝，建议写临时脚本文件 |

### 六、长跑命令的强制超时包装

任何**已知会跑超过 30 秒**的命令必须有 OS 级 timeout：

#### Windows pwsh

```powershell
$job = Start-Job -ScriptBlock { Set-Location $using:PWD; <ORIGINAL_COMMAND> 2>&1 }
if (Wait-Job $job -Timeout <TIMEOUT_SECONDS>) {
  Receive-Job $job
  Remove-Job $job
} else {
  Stop-Job $job
  Receive-Job $job
  Remove-Job $job -Force
  Write-Host "TIMEOUT_AFTER_<TIMEOUT_SECONDS>s"
  exit 1
}
```

#### macOS / Linux

```bash
timeout <TIMEOUT_SECONDS> bash -c '<ORIGINAL_COMMAND>'
# 退出码 124 = 超时被 SIGTERM
# 退出码 137 = SIGKILL（双保险）
```

#### sf_safe_bash 内部双层超时

```
工具级 hard timeout（process.kill SIGKILL）：必返回，agent 不死等
   ┌──────────────────────────────────────┐
   │ shell 级 timeout（Start-Job/timeout） │   ← 比工具级短 5-10 秒
   │   ┌──────────────────────────────────┐│
   │   │ 命令本身（bun test / npm install） ││
   │   └──────────────────────────────────┘│
   └──────────────────────────────────────┘
```

**内层短于外层**，让最具体的错误先返回。

### 七、自动包装规则

某些命令工具**自动**加超时包装（agent 不需要记）：

| 命令模式 | 自动包装 |
|---------|---------|
| `bun test` | 90 秒 timeout（Start-Job） |
| `bun run test` | 90 秒 timeout |
| `npm test` / `pnpm test` / `yarn test` | 90 秒 timeout |
| `npm install` / `pnpm install` | 5 分钟 timeout |
| `bun install` | 3 分钟 timeout |
| `bun run build` / `npm run build` | 3 分钟 timeout |
| `cargo build` / `cargo test` | 5 分钟 timeout |
| `git clone` | 5 分钟 timeout |
| `docker build` | 10 分钟 timeout |

任何在工具的 `args.timeoutMs` 显式指定的 timeout 优先于自动包装。

### 八、stdout/stderr 必须分离

**禁止合并到 stdout**（即不要 `2>&1`），原因：
- agent 需要区分"警告但成功"vs"真失败"
- 编译器警告通常在 stderr，错误也在 stderr，但是用 exitCode === 0 区分

工具返回结构必须分开：

```json
{
  "stdout": "Built 5 files in 1.2s\n",
  "stderr": "warning: deprecated API\n",
  "exitCode": 0,
  "durationMs": 1200
}
```

### 九、退出码语义统一

| exitCode | 含义 | agent 该做什么 |
|----------|------|--------------|
| 0 | 成功 | 继续 |
| 1 | 通用错误 | 看 stderr 决定怎么修 |
| 2 | 误用（参数错误） | 检查命令语法 |
| 124 | 超时（Linux timeout 命令） | 检查是否资源泄漏，加 Start-Job |
| 126 | 命令找不到（不可执行） | 检查工具是否在 PATH |
| 127 | 命令找不到 | 同上 |
| 130 | Ctrl+C 中断 | 通常是用户主动终止 |
| 137 | SIGKILL（被强杀） | 内存超限或工具级 timeout 触发 |
| -1 / null | 子进程异常死亡（spawn 失败） | 工具级问题，检查 spawn 参数 |

工具返回时**不**改写 exitCode，原样传给 agent，agent 看 hint 字段决定怎么办。

### 十、路径处理跨平台规则

#### 必须做的

1. **路径含空格强制引号**：
   ```powershell
   bun build --out 'C:\Program Files\out'  # ✅
   bun build --out C:\Program Files\out    # ❌ 断成两个参数
   ```

2. **使用 `cwd` 参数而不是 `cd <dir>`**：
   ```
   sf_safe_bash(command="bun build", cwd="C:\\Program Files\\项目")
   ```

3. **避免反斜杠转义陷阱**：
   - pwsh：双引号字符串里反斜杠**不**转义（`"C:\foo\bar"` OK）
   - bash：双引号字符串里反斜杠**会**转义（必须 `"C:\\foo\\bar"`）
   - **建议**：传给工具时统一用 `\` 或 `/`，由工具内部处理

4. **`~` 解析必须在工具层做**：
   ```typescript
   if (cwd.startsWith('~')) {
     cwd = path.join(os.homedir(), cwd.slice(1));
   }
   ```
   不要把 `~` 传给 shell，因为 cmd 不识别。

#### 必须拒绝的

- 包含未转义的 `$VAR` 或 `${VAR}`（除非显式声明使用环境变量）
- 包含未转义的 `\`` 反引号
- 包含未匹配的引号
- 路径出现 `..` 试图逃出工作目录（除非显式 allow）

### 十一、并发执行规则

| 维度 | 规则 |
|------|------|
| 不同 agent 之间 | 完全独立，**默认无并发限制**（每个调用独立子进程） |
| 同一 agent 内顺序调用 | 串行执行（agent 在 LLM 推理时一次出一个 tool_call） |
| 同一 agent 内 task 派多个 subagent | subagent 内部各自调用 sf_safe_bash，**真正并发** |
| **重命令并发限制** | 全局 semaphore，最多 N 个同时跑。N 默认 = CPU 核数 |

**重命令清单**：`bun install`、`npm install`、`pnpm install`、`bun run build`、`bun test`、`cargo build` —— 这些会大量占 CPU/磁盘 IO，并发跑会互相拖垮。

### 十二、命令审计日志

每次 sf_safe_bash 调用**异步**追加一行 JSON 到 `~/.specforge/logs/shell-history.jsonl`：

```json
{
  "schema_version": "1.0",
  "ts": "2026-05-19T10:30:45.123Z",
  "agent": "sf-executor",
  "session_id": "WI-001-sf-executor-3",
  "command": "bun test packages/cli/tests/foo.test.ts",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "exitCode": 0,
  "durationMs": 2300,
  "rejected": false,
  "timeout": false,
  "stdout_size": 1024,
  "stderr_size": 0
}
```

**好处**：
- 调试时能看到"agent 跑过哪些命令"
- 性能分析（哪个命令最慢）
- 审计敏感操作

**异步写入**：不阻塞主流程，写失败仅打 warning 不影响命令执行。

---

## 错误返回格式（agent 必须能看懂）

所有 sf_safe_bash 返回的 JSON 都遵守同一 schema：

### 字段定义

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | true = exitCode 0 且未被拦截；false = 失败 |
| `exitCode` | number \| null | 子进程退出码 |
| `stdout` | string | 标准输出（截断到 4KB，超长部分写文件并给路径） |
| `stderr` | string | 标准错误（同上） |
| `durationMs` | number | 执行耗时 |
| `command` | string | 实际执行的命令（含自动包装） |
| `cwd` | string | 实际工作目录 |
| `shell` | string | 使用的 shell 名 |
| `rejected` | boolean | true = 被规则引擎拒绝（未真正执行） |
| `timeout` | boolean | true = 超时被强杀 |
| `rule` | string | rejected=true 时填命中的规则 ID |
| `suggestion` | string | rejected/timeout 时填可操作建议 |
| `hint` | string | 排错提示（不一定有，但失败时尽量给） |

### 典型返回

**正常成功**：
```json
{
  "success": true,
  "exitCode": 0,
  "stdout": "Built 5 files\n",
  "stderr": "",
  "durationMs": 1234,
  "command": "bun run build",
  "cwd": "D:\\code\\temp\\SpecForge\\packages\\cli",
  "shell": "pwsh",
  "rejected": false,
  "timeout": false
}
```

**业务失败**：
```json
{
  "success": false,
  "exitCode": 1,
  "stdout": "",
  "stderr": "TypeError: Cannot read property 'foo' of undefined\n",
  "durationMs": 450,
  "command": "bun test packages/cli/tests/foo.test.ts",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "rejected": false,
  "timeout": false,
  "hint": "测试失败。检查 stderr 中的错误堆栈。"
}
```

**超时**：
```json
{
  "success": false,
  "exitCode": null,
  "stdout": "PASS tests/foo.test.ts (5/30)\n",
  "stderr": "",
  "durationMs": 90000,
  "command": "bun test packages/cli",
  "cwd": "D:\\code\\temp\\SpecForge",
  "shell": "pwsh",
  "rejected": false,
  "timeout": true,
  "timeoutMs": 90000,
  "hint": "命令在 90 秒内未完成已被 SIGKILL 强制终止。可能原因：(1) 测试代码有异步资源泄漏导致进程不退出 (2) 死锁 (3) 网络请求挂起。建议：检查 vitest.config.ts 是否含 pool: 'forks'；如有泄漏问题参见 docs/engineering-lessons/universal/javascript-explicit-resource-management.md。"
}
```

**规则拒绝**：
```json
{
  "success": false,
  "exitCode": null,
  "stdout": "",
  "stderr": "",
  "durationMs": 0,
  "command": "cd packages/cli && bun run build",
  "cwd": null,
  "shell": null,
  "rejected": true,
  "rule": "no-cd-in-command",
  "suggestion": "请用 cwd 参数：sf_safe_bash(command='bun run build', cwd='packages/cli')。"
}
```

**危险命令拦截**：
```json
{
  "success": false,
  "rejected": true,
  "rule": "dangerous-rm-rf",
  "explanation": "命令模式 'rm -rf' 配合 '/' 或 '~' 在危险命令黑名单中。",
  "originalCommand": "rm -rf ~/some-dir",
  "suggestion": "如果你确实要删除该目录，请使用绝对路径并加 --confirm 参数（暂未实现，需要先在工具层批准这条命令）。"
}
```

---

## 预防机制

### 项目层

#### 步骤 1（必做）：实现 sf_safe_bash 工具

按本文规则实现 `.opencode/tools/sf_safe_bash.ts`，包含：
- host-profile 读取
- 规则引擎（危险命令、命令重写、heredoc 拦截、cd 拦截）
- shell 选择（pwsh 优先）
- 编码注入（UTF-8）
- 双层 timeout
- 结构化返回
- 审计日志

#### 步骤 2（必做）：禁用所有 agent 的 bash 权限

每个 agent.md 改：
```yaml
permission:
  bash: deny      # ← 禁用 OpenCode 内置 bash
  # sf_safe_bash 是自定义工具，默认所有 agent 可用，不需要显式列出
```

唯一例外：sf_safe_bash 工具自身实现里 spawn 子进程时**不**走 OpenCode bash，所以这个限制不影响功能。

#### 步骤 3（必做）：注入硬规则到 OpenCode AGENTS.md

在 `~/.config/opencode/AGENTS.md` 加一段：

```markdown
## Shell 命令执行硬规则

执行任何 shell 命令必须使用 sf_safe_bash 工具。

绝对禁止：
- 试图找别的方式执行 shell（OpenCode 内置 bash 已禁用）
- 在命令里使用 cd（用 cwd 参数）
- 使用 cat/find/grep/mkdir 系统命令（用对应专用工具）
- 裸跑 bun test / npm install 等长跑命令（工具会自动包装超时）

工具返回 JSON，含 success/exitCode/stdout/stderr/hint。
失败时看 hint 字段决定下一步。
被 rejected 时按 suggestion 字段调整后重试。
```

#### 步骤 4（推荐）：审计 agent prompt 是否有"用 cd"等错误示例

```bash
grep -rn "cd\s\+.*&&\|cd\s\+.*;" .opencode/agents/ .kiro/steering/
```

发现就改成 cwd 参数示例。

### 工具层

工具自身的代码层强制规则比 prompt 注入更可靠：

- 危险命令黑名单 → 代码层匹配（regex）
- 命令重写建议 → 代码层匹配
- timeout → 代码层 race
- 编码 → 代码层 spawn 时注入

prompt 是辅助提醒，**真正不让 agent 翻车的是代码**。

---

## 相关错误

同根因可能撞到的其他症状：

| 症状 | 解决参考 |
|------|---------|
| Kiro execute_pwsh 报"cd is not supported" | [kiro-execute-pwsh-constraints](../ai-tools/kiro/execute-pwsh-constraints.md) |
| `bun test` 卡死不返回 | 本文 + [async-resource-lifecycle](async-resource-lifecycle.md) D2 |
| 中文输出乱码 | 本文"编码强制 UTF-8" |
| 找不到 git/bun 等命令 | 本文 + [host-environment-detection](host-environment-detection.md) |
| 路径有空格命令断开 | 本文"路径处理跨平台规则" |
| 跨平台 grep/find 不工作 | 本文"命令重写规则" |
| 命令产生大量输出导致上下文炸 | stdout/stderr 截断到 4KB（本文返回字段） |

---

## 参考

- 互补经验：[host-environment-detection](host-environment-detection.md) — 规定如何探测和写入 host-profile
- 互补经验：[async-resource-lifecycle](async-resource-lifecycle.md) — 资源泄漏导致 bun test 卡死的根因
- 工具实现：`.opencode/tools/sf_safe_bash.ts`
- 配置文件：`~/.specforge/host-profile.json`、`~/.specforge/shell-config.json`
- 审计日志：`~/.specforge/logs/shell-history.jsonl`

---

## OpenCode 工具专属经验

### [HIGH] opencode-custom-tool-self-contained

**源**：docs/engineering-lessons/ai-tools/opencode/custom-tool-self-contained.md  
**标签**：opencode, custom-tool, plugin, import, deployment, self-contained  
**适用角色**：executor, architect

## 症状

安装 SpecForge 后，OpenCode 所有 agent（包括内置 Build/Plan）全部卡死——发消息后无任何回复，底部一直转圈。

卸载 SpecForge（删除 `~/.config/opencode/tools/` 目录）后立即恢复正常。

## 根因

`~/.config/opencode/tools/lib/sf_safe_bash_core.ts` 文件中有如下 import：

```typescript
// ❌ 指向仓库目录，部署后路径断裂
import type { HostProfile } from "../../../scripts/lib/host-profile/types"
import { loadHostProfile } from "../../../scripts/lib/host-profile/scanner"
```

这些相对路径在开发仓库（`D:\code\temp\SpecForge\.opencode\tools\lib\`）里是有效的，但部署到 `C:\Users\luo\.config\opencode\tools\lib\` 后，`../../../scripts/` 指向了不存在的路径。

**OpenCode 加载自定义工具时的行为**：
1. 扫描 `~/.config/opencode/tools/` 目录下所有 `.ts` 文件
2. 尝试解析每个文件的 import 链
3. 如果 import 解析失败 → **整个工具加载系统崩溃**
4. 崩溃后 LLM 的 function calling 机制失效 → 所有 agent 卡死

**关键发现**：不是只有调用该工具时才出问题——**工具文件存在就会被加载**，import 失败会影响所有 agent。

## 解决方案

### 规则：自定义工具的所有 import 必须限制在 `tools/` 目录内

✅ **正确**：只 import 同目录或子目录的文件
```typescript
// tools/lib/sf_safe_bash_core.ts
import type { SafeBashArgs } from "./sf_safe_bash_types"     // ✅ 同目录
import { applyRules } from "./sf_safe_bash_rules"            // ✅ 同目录
import { executeCommand } from "./sf_safe_bash_executor"     // ✅ 同目录
```

❌ **错误**：import 跨出 tools/ 目录
```typescript
// tools/lib/sf_safe_bash_core.ts
import type { HostProfile } from "../../../scripts/lib/host-profile/types"  // ❌ 跨目录
import { scanHostProfile } from "../../../scripts/lib/host-profile/scanner" // ❌ 跨目录
```

### 如果需要外部模块的类型或逻辑

**方案 A（推荐）：内联**

把需要的类型和函数直接写在工具的 lib 文件里：

```typescript
// 不 import 外部文件，直接内联类型定义
interface HostProfile {
  os: { platform: string; ... }
  shells: Array<{ name: string; path: string | null; ... }>
  shell_rules: { preferred_shell: string | null; ... }
  ...
}

// 不 import 外部函数，直接内联加载逻辑
async function loadHostProfile(): Promise<HostProfile | null> {
  const profilePath = path.join(os.homedir(), ".specforge", "host-profile.json")
  try {
    return JSON.parse(await fs.readFile(profilePath, "utf-8"))
  } catch { return null }
}
```

**方案 B：运行时动态读取**

如果逻辑太复杂不适合内联，改成运行时读取 JSON 配置文件（不在 import 阶段依赖外部代码）：

```typescript
// 运行时读取，不在 import 阶段解析
const config = JSON.parse(await fs.readFile("~/.specforge/host-profile.json", "utf-8"))
```

**方案 C：只 import node: 内置模块**

```typescript
import * as os from "node:os"       // ✅ Node 内置
import * as path from "node:path"   // ✅ Node 内置
import * as fs from "node:fs/promises" // ✅ Node 内置
import { spawn } from "node:child_process" // ✅ Node 内置
```

### 允许的 import 范围

| import 来源 | 是否允许 | 说明 |
|------------|---------|------|
| `node:*` 内置模块 | ✅ | fs, path, os, child_process 等 |
| `@opencode-ai/plugin` | ✅ | OpenCode SDK（运行时提供） |
| 同目录 `./xxx` | ✅ | tools/lib/ 内部互相引用 |
| 父目录 `../xxx`（仍在 tools/ 内） | ✅ | tools/sf_safe_bash.ts import tools/lib/xxx |
| 跨出 tools/ 的 `../../xxx` | ❌ | 部署后路径断裂 |
| npm 包（非 node: 前缀） | ⚠️ | 需要确认 OpenCode 运行时有该包 |

## 预防机制

### 开发时检查

在安装器（`sf-installer.ts`）部署 tools 文件前，加一个检查：

```typescript
// 检查所有 tools 文件是否有跨目录 import
const toolFiles = glob("tools/**/*.ts")
for (const file of toolFiles) {
  const content = readFileSync(file, "utf-8")
  if (/from\s+["']\.\.\/\.\.\/\.\./.test(content)) {
    throw new Error(`${file} 有跨目录 import，部署后会断裂！`)
  }
}
```

### CI 检查

```bash
# 检查 .opencode/tools/ 下是否有跨出 tools 目录的 import
grep -rn 'from.*\.\./\.\./\.\.' .opencode/tools/ && echo "ERROR: 跨目录 import" && exit 1
```

### 安装器 registry.ts 注释

在 `SHARED_COMPONENT_REGISTRY` 的 tools 部分加注释：

```typescript
// ⚠️ 所有 tools/*.ts 和 tools/lib/*.ts 必须完全自包含
// 禁止 import 跨出 tools/ 目录的文件（部署后路径会断裂）
// 详见 docs/engineering-lessons/ai-tools/opencode/custom-tool-self-contained.md
```

## 相关错误

| 症状 | 原因 |
|------|------|
| 安装 SpecForge 后所有 agent 卡死 | tools/ 下有跨目录 import |
| 只有特定工具调用时卡死 | 该工具的 import 在运行时才解析失败 |
| OpenCode 启动慢（>10s） | tools/ 下文件太多或 import 链太深 |
| 把 CLI 校验脚本放进 `.opencode/tools/` 导致 OpenCode 启动卡死 | tools/ 下任何 .ts 都会被 import 注册为 tool；如果文件顶层 `main()` + `process.exit()`，import 时立刻把 OpenCode 进程杀掉。CLI 脚本应放 `scripts/`，或加 `import.meta.main` 守卫（前者优先） |

## 参考

- OpenCode 自定义工具文档：https://docs.opencode.ai/docs/custom-tools
- 本次事故排查过程：SpecForge V6.0 sf_safe_bash 部署后 OpenCode 卡死（2026-05-20）
- 互补经验：[shell-command-execution](../../universal/shell-command-execution.md)

---

## 经验速查表

| # | ID | Severity | 一句话 |
|---|-----|----------|--------|
| 1 | opencode-custom-tool-self-contained | HIGH | OpenCode 自定义工具必须完全自包含（禁止跨目录 import） |
| 2 | async-resource-lifecycle | HIGH | 异步资源生命周期管理经验总结 |
| 3 | host-environment-detection | HIGH | 宿主机环境探测与 host-profile 规范 |
| 4 | javascript-explicit-resource-management | HIGH | JavaScript 显式资源管理（4 层防护体系） |
| 5 | shell-command-execution | HIGH | Shell 命令执行规范（跨平台 + 安全 + 可观测） |
